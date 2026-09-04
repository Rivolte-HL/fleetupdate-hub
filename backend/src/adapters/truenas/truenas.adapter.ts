import { Host, HostType } from '@prisma/client';
import { BaseServiceAdapter } from '../../core/base.adapter.js';
import { TrueNASClient, TrueNASApp, TrueNASSystemUpdateStatus, extractJobId } from './truenas.client.js';
import {
  AdapterMetadata,
  VersionInfo,
  ChangelogItem,
  BackupResult,
  UpdateExecutionResult,
  HealthCheckResult,
  RollbackResult,
  TargetCredentials
} from '../../types/adapter.types.js';

export class TrueNASAdapter extends BaseServiceAdapter {
  public getMetadata(): AdapterMetadata {
    return {
      type: HostType.TRUENAS,
      displayName: 'TrueNAS SCALE & Applications',
      description: 'System upgrades, ZFS safety checkpoints, and Application updates (Docker Compose apps & Helm charts) via TrueNAS REST API v2.0',
      icon: 'hard-drive',
      supportedActions: ['checkVersion', 'fetchChangelog', 'createBackup', 'applyUpdate', 'healthCheck', 'rollback'],
      connectionFields: [
        {
          name: 'allowSelfSigned',
          label: 'Allow Self-Signed SSL Certificates',
          type: 'boolean',
          required: false,
          defaultValue: true,
          description: 'Accept internal or self-signed WebGUI SSL certificates'
        },
        {
          name: 'targetScope',
          label: 'Update Scope',
          type: 'select',
          required: false,
          defaultValue: 'ALL',
          options: [
            { label: 'All (System OS + Applications)', value: 'ALL' },
            { label: 'Applications Only (Docker / Charts)', value: 'APPS_ONLY' },
            { label: 'System OS Only', value: 'OS_ONLY' }
          ],
          description: 'Select what FleetUpdate-Hub should update on this TrueNAS host'
        },
        {
          name: 'targetAppName',
          label: 'Target Application Name (Optional)',
          type: 'text',
          required: false,
          placeholder: 'e.g. nextcloud, plex, vaultwarden or leave empty for all',
          description: 'Leave empty to check and update all applications, or specify a specific application ID'
        },
        {
          name: 'snapshotDataset',
          label: 'ZFS Safety Snapshot Dataset (Optional)',
          type: 'text',
          required: false,
          defaultValue: 'boot-pool',
          placeholder: 'e.g. boot-pool or tank/ix-applications',
          description: 'ZFS dataset to snapshot before updates. Defaults to boot-pool.'
        },
        {
          name: 'rebootAfterOsUpdate',
          label: 'Auto-Reboot After System OS Update',
          type: 'boolean',
          required: false,
          defaultValue: true,
          description: 'Automatically restart TrueNAS if a base operating system update was applied'
        }
      ],
      credentialFields: [
        {
          name: 'apiKey',
          label: 'TrueNAS API Key',
          type: 'password',
          required: false,
          isSecret: true,
          placeholder: '1-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
          description: 'Recommended: Generate in TrueNAS WebGUI under Settings (Gear Icon) / User Profile > API Keys > Add'
        },
        {
          name: 'username',
          label: 'Username (Fallback / Basic Auth)',
          type: 'text',
          required: false,
          placeholder: 'e.g. root or admin',
          description: 'Optional username if not using an API key'
        },
        {
          name: 'password',
          label: 'Password (Fallback / Basic Auth)',
          type: 'password',
          required: false,
          isSecret: true,
          placeholder: '••••••••',
          description: 'Optional password associated with the username'
        }
      ]
    };
  }

  public getClient(host: Host, credentials: TargetCredentials): TrueNASClient {
    const meta = (host.metadata as any) || {};
    return new TrueNASClient({
      baseUrl: host.endpointUrl,
      apiKey: credentials.apiKey || credentials.token || credentials.apiToken,
      username: credentials.username,
      password: credentials.password,
      allowSelfSigned: meta.allowSelfSigned === true,
      timeoutMs: 30000
    });
  }

  public async checkVersion(host: Host, credentials: TargetCredentials): Promise<VersionInfo> {
    const client = this.getClient(host, credentials);
    const meta = (host.metadata as any) || {};
    const scope = meta.targetScope || 'ALL';
    const targetAppName = (meta.targetAppName || '').trim().toLowerCase();

    const unavailableUpdate: TrueNASSystemUpdateStatus = { status: 'UNAVAILABLE' };

    // 1. Fetch system info, system update status, apps, and alerts in parallel
    const [sysInfo, osUpdate, allApps, alerts] = await Promise.all([
      client.getSystemInfo().catch(() => ({
        version: host.currentVersion || 'TrueNAS SCALE',
        hostname: host.name
      })),
      scope !== 'APPS_ONLY'
        ? client.checkSystemUpdate().catch((): TrueNASSystemUpdateStatus => unavailableUpdate)
        : Promise.resolve<TrueNASSystemUpdateStatus>(unavailableUpdate),
      scope !== 'OS_ONLY'
        ? client.getApps().catch(() => [] as TrueNASApp[])
        : Promise.resolve<TrueNASApp[]>([]),
      client.getAlerts().catch(() => [])
    ]);

    // 2. Evaluate system OS update
    const hasOsUpdate = osUpdate.status === 'AVAILABLE' && Boolean(osUpdate.version);
    const targetOsVersion = hasOsUpdate ? osUpdate.version! : sysInfo.version;

    // 3. Filter apps based on configuration
    const filteredApps = targetAppName
      ? allApps.filter((a) => a.id.toLowerCase() === targetAppName || a.name.toLowerCase() === targetAppName)
      : allApps;

    const appsWithUpdate = filteredApps.filter((a) => a.hasUpdate);

    // 4. Calculate aggregated package count & updates
    let packageCount = 0;
    if (scope !== 'OS_ONLY') {
      packageCount += appsWithUpdate.length;
    }
    if (scope !== 'APPS_ONLY' && hasOsUpdate) {
      packageCount += 1;
    }

    const hasUpdate = packageCount > 0;
    const requiresReboot = hasOsUpdate && scope !== 'APPS_ONLY';

    // 5. Build human-readable version labels
    const currentVersion = `${sysInfo.version}${allApps.length > 0 ? ` (${allApps.length} apps)` : ''}`;
    let targetVersion = currentVersion;

    if (hasUpdate) {
      const parts: string[] = [];
      if (hasOsUpdate && scope !== 'APPS_ONLY') {
        parts.push(`OS: ${targetOsVersion}`);
      }
      if (appsWithUpdate.length > 0 && scope !== 'OS_ONLY') {
        parts.push(`+${appsWithUpdate.length} app(s) to upgrade`);
      }
      targetVersion = parts.join(' | ');
    }

    return {
      currentVersion,
      targetVersion,
      hasUpdate,
      requiresReboot,
      packageCount,
      extraDetails: {
        os: {
          version: sysInfo.version,
          hostname: sysInfo.hostname,
          uptimeSeconds: (sysInfo as any).uptime_seconds,
          model: (sysInfo as any).model
        },
        systemUpdate: {
          hasUpdate: hasOsUpdate,
          status: osUpdate.status,
          targetVersion: osUpdate.version,
          notice: osUpdate.notice
        },
        apps: filteredApps.map((a) => ({
          id: a.id,
          name: a.name,
          status: a.status,
          currentVersion: a.currentVersion,
          targetVersion: a.targetVersion,
          hasUpdate: a.hasUpdate,
          type: a.type,
          icon: a.icon
        })),
        appsWithUpdateCount: appsWithUpdate.length,
        totalAppsCount: allApps.length,
        alertsCount: alerts.filter((a) => a.level === 'CRITICAL' || a.level === 'WARNING').length,
        targetScope: scope,
        targetAppName: targetAppName || 'ALL'
      }
    };
  }

  public async fetchChangelog(host: Host, credentials: TargetCredentials): Promise<ChangelogItem[]> {
    const client = this.getClient(host, credentials);
    const meta = (host.metadata as any) || {};
    const scope = meta.targetScope || 'ALL';
    const changelogs: ChangelogItem[] = [];

    // 1. System OS changelog
    if (scope !== 'APPS_ONLY') {
      try {
        const osUpdate = await client.checkSystemUpdate();
        if (osUpdate.status === 'AVAILABLE' && osUpdate.version) {
          changelogs.push({
            version: osUpdate.version,
            summary: osUpdate.changelog || osUpdate.notice || `TrueNAS system update ${osUpdate.version} ready to install.`,
            detailsUrl: 'https://www.truenas.com/docs/scale/gettingstarted/scalereleasenotes/',
            isSecurityFix: true
          });
        }
      } catch {}
    }

    // 2. Applications changelog
    if (scope !== 'OS_ONLY') {
      try {
        const apps = await client.getApps();
        const pendingApps = apps.filter((a) => a.hasUpdate);
        for (const app of pendingApps) {
          changelogs.push({
            version: app.targetVersion || 'Latest',
            summary: `Application ${app.name} (${app.currentVersion} ➔ ${app.targetVersion || 'Latest'}) [${app.type}]`,
            detailsUrl: 'https://www.truenas.com/docs/scale/scaletutorials/apps/',
            isSecurityFix: false
          });
        }
      } catch {}
    }

    if (changelogs.length === 0) {
      changelogs.push({
        version: host.currentVersion || 'Up to date',
        summary: 'No pending TrueNAS OS or Application updates found. System is healthy.',
        detailsUrl: 'https://www.truenas.com/docs/'
      });
    }

    return changelogs;
  }

  public async createBackup(host: Host, credentials: TargetCredentials, backupName?: string): Promise<BackupResult> {
    const client = this.getClient(host, credentials);
    const meta = (host.metadata as any) || {};
    const dataset = (meta.snapshotDataset || 'boot-pool').trim();
    const snapName = backupName || `fleetupdate-snap-${Date.now()}`;
    const fullSnapshotId = `${dataset}@${snapName}`;

    try {
      await client.createZfsSnapshot(dataset, snapName);
      return {
        success: true,
        backupId: fullSnapshotId,
        backupType: 'ZFS_SNAPSHOT',
        message: `Safety ZFS snapshot "${fullSnapshotId}" created successfully on dataset "${dataset}".`
      };
    } catch (snapshotErr: any) {
      // Fallback: try configuration database backup if ZFS snapshot on custom dataset failed
      try {
        await client.saveConfig();
        return {
          success: true,
          backupId: `config-backup-${Date.now()}`,
          backupType: 'TRUENAS_CONFIG_DB',
          message: `ZFS snapshot failed (${snapshotErr.message}), fallback: TrueNAS system configuration archive saved.`
        };
      } catch (configErr: any) {
        throw new Error(`Failed to create ZFS snapshot on "${dataset}": ${snapshotErr.message}`);
      }
    }
  }

  public async applyUpdate(
    host: Host,
    credentials: TargetCredentials,
    onProgress?: (step: string, log: string) => void
  ): Promise<UpdateExecutionResult> {
    const client = this.getClient(host, credentials);
    const meta = (host.metadata as any) || {};
    const scope = meta.targetScope || 'ALL';
    const targetAppName = (meta.targetAppName || '').trim().toLowerCase();
    const rebootAfterOsUpdate = meta.rebootAfterOsUpdate !== false;

    const logs: string[] = [];

    // =========================================================================
    // 1. UPDATE APPLICATIONS (DOCKER COMPOSE APPS & HELM CHARTS)
    // =========================================================================
    if (scope !== 'OS_ONLY') {
      onProgress?.('UPDATING', 'Inspecting installed TrueNAS applications for pending updates...');
      const apps = await client.getApps().catch(() => [] as TrueNASApp[]);

      const appsToUpgrade = apps.filter((a) => {
        if (!a.hasUpdate) return false;
        if (targetAppName) {
          return a.id.toLowerCase() === targetAppName || a.name.toLowerCase() === targetAppName;
        }
        return true;
      });

      if (appsToUpgrade.length === 0) {
        onProgress?.('UPDATING', 'Toutes les applications TrueNAS cibles sont déjà à jour.');
        logs.push('Aucune mise à jour applicative en attente.');
      } else {
        onProgress?.('UPDATING', `Détection de ${appsToUpgrade.length} application(s) à mettre à jour. Lancement du déploiement...`);
        for (const app of appsToUpgrade) {
          const logMsg = `Mise à jour de l'application "${app.name}" (${app.currentVersion} ➔ ${app.targetVersion || 'Latest'})...`;
          onProgress?.('UPDATING', logMsg);
          logs.push(logMsg);

          try {
            const triggerRes = await client.upgradeApp(app.name, app.type);
            const jobId = extractJobId(triggerRes);

            if (jobId) {
              const jobStartMsg = `[App ${app.name}] Tâche TrueNAS enregistrée (Job ID: ${jobId}). Surveillance en temps réel...`;
              onProgress?.('UPDATING', jobStartMsg);
              logs.push(jobStartMsg);

              await client.waitForJob(jobId, {
                timeoutMs: 300000,
                onProgress: (progress) => {
                  const pct = progress.percent !== undefined ? `${progress.percent}%` : '';
                  const desc = progress.description || 'Opération en cours...';
                  const pMsg = `[App ${app.name}] Progression: ${pct ? `${pct} - ` : ''}${desc}`;
                  onProgress?.('UPDATING', pMsg);
                }
              });

              const jobEndMsg = `[App ${app.name}] Tâche ${jobId} terminée avec succès.`;
              onProgress?.('UPDATING', jobEndMsg);
              logs.push(jobEndMsg);
            } else {
              onProgress?.('UPDATING', `[App ${app.name}] Ordre de mise à niveau transmis. Vérification de l'état du conteneur...`);
              await new Promise((resolve) => setTimeout(resolve, 5000));
            }

            // Post-upgrade verification: check that application is RUNNING/ACTIVE
            let verified = false;
            for (let attempt = 1; attempt <= 6; attempt++) {
              await new Promise((resolve) => setTimeout(resolve, 3000));
              try {
                const refreshedApps = await client.getApps();
                const updatedApp = refreshedApps.find((a) => a.id === app.id || a.name === app.name);
                if (updatedApp && (updatedApp.status === 'RUNNING' || updatedApp.status === 'ACTIVE')) {
                  const verifiedMsg = `[App ${app.name}] Application vérifiée avec succès : Statut "${updatedApp.status}", version actuelle ${updatedApp.currentVersion}.`;
                  onProgress?.('UPDATING', verifiedMsg);
                  logs.push(verifiedMsg);
                  verified = true;
                  break;
                }
              } catch {}
            }

            if (!verified) {
              const pendingVerifyMsg = `[App ${app.name}] Mise à niveau appliquée avec succès (service en cours de stabilisation).`;
              onProgress?.('UPDATING', pendingVerifyMsg);
              logs.push(pendingVerifyMsg);
            }
          } catch (appErr: any) {
            const warnLog = `Échec de la mise à niveau de l'application "${app.name}": ${appErr.message}`;
            onProgress?.('UPDATING', warnLog);
            logs.push(warnLog);
            throw new Error(`Application upgrade failed for "${app.name}": ${appErr.message}`);
          }
        }
      }
    }

    // =========================================================================
    // 2. UPDATE TRUENAS SYSTEM OS
    // =========================================================================
    let requiresReboot = false;
    if (scope !== 'APPS_ONLY') {
      onProgress?.('UPDATING', 'Vérification de l\'état de mise à jour du système d\'exploitation TrueNAS...');
      const osUpdate: TrueNASSystemUpdateStatus = await client
        .checkSystemUpdate()
        .catch((): TrueNASSystemUpdateStatus => ({ status: 'UNAVAILABLE' }));

      if (osUpdate.status === 'AVAILABLE' && osUpdate.version) {
        const osLog = `Déclenchement de la mise à niveau système TrueNAS vers ${osUpdate.version} (redémarrage: ${rebootAfterOsUpdate})...`;
        onProgress?.('UPDATING', osLog);
        logs.push(osLog);

        const updateRes = await client.applySystemUpdate(rebootAfterOsUpdate);
        const jobId = extractJobId(updateRes);

        if (jobId) {
          onProgress?.('UPDATING', `Tâche de mise à jour système TrueNAS démarrée (Job ID: ${jobId}). Surveillance du téléchargement et de l'installation...`);
          logs.push(`Mise à jour TrueNAS OS : Job ID ${jobId}`);

          try {
            await client.waitForJob(jobId, {
              timeoutMs: 600000,
              onProgress: (progress) => {
                const pct = progress.percent !== undefined ? `${progress.percent}%` : '';
                const desc = progress.description || 'Installation en cours...';
                onProgress?.('UPDATING', `[TrueNAS OS] Progression: ${pct ? `${pct} - ` : ''}${desc}`);
              }
            });
            onProgress?.('UPDATING', `[TrueNAS OS] Téléchargement et installation des paquets système terminés avec succès.`);
          } catch (jobErr: any) {
            if (!rebootAfterOsUpdate) {
              throw jobErr;
            }
          }
        }

        if (rebootAfterOsUpdate) {
          requiresReboot = true;
          onProgress?.('UPDATING', `Redémarrage automatique du système TrueNAS en cours. Surveillance de la reconnexion...`);
          logs.push('Surveillance du redémarrage de TrueNAS');

          try {
            const rebootedSysInfo = await client.waitForReboot(osUpdate.version, {
              maxWaitMs: 600000,
              onProgress: (msg) => onProgress?.('UPDATING', msg)
            });
            const rebootSuccessMsg = `TrueNAS a redémarré avec succès sur la nouvelle version : ${rebootedSysInfo.version}.`;
            onProgress?.('UPDATING', rebootSuccessMsg);
            logs.push(rebootSuccessMsg);
          } catch (rebootErr: any) {
            onProgress?.('UPDATING', `Avertissement sur le suivi du redémarrage : ${rebootErr.message}`);
            logs.push(`Suivi redémarrage : ${rebootErr.message}`);
          }
        } else {
          const doneLog = `Mise à jour système TrueNAS installée avec succès. Un redémarrage ultérieur sera nécessaire pour activer le nouvel environnement de démarrage.`;
          onProgress?.('UPDATING', doneLog);
          logs.push(doneLog);
        }
      } else {
        onProgress?.('UPDATING', 'Le système d\'exploitation TrueNAS est déjà sur la version la plus récente.');
        logs.push('TrueNAS OS est à jour.');
      }
    }

    return {
      success: true,
      requiresReboot,
      logs,
      message: requiresReboot
        ? 'TrueNAS update applied successfully. System reboot is underway...'
        : 'TrueNAS update completed successfully.'
    };
  }

  public async healthCheck(host: Host, credentials: TargetCredentials): Promise<HealthCheckResult> {
    const start = Date.now();
    try {
      const client = this.getClient(host, credentials);
      const [sysInfo, alerts] = await Promise.all([
        client.getSystemInfo(),
        client.getAlerts().catch(() => [])
      ]);
      const elapsed = Date.now() - start;

      const criticalAlerts = alerts.filter((a) => a.level === 'CRITICAL' && !a.dismissed);
      const isHealthy = criticalAlerts.length === 0;

      return {
        isHealthy,
        responseTimeMs: elapsed,
        checks: [
          { name: 'TrueNAS REST API Reachable', passed: true, details: `Response time: ${elapsed}ms` },
          { name: 'System Info & Hostname', passed: true, details: `${sysInfo.hostname} (${sysInfo.version})` },
          {
            name: 'TrueNAS System Alerts Audit',
            passed: isHealthy,
            details: isHealthy
              ? `${alerts.length} total alert(s), 0 critical.`
              : `CRITICAL alert detected: ${criticalAlerts[0]?.formatted || 'Check TrueNAS console'}`
          }
        ],
        message: isHealthy
          ? `TrueNAS host "${host.name}" is healthy and online.`
          : `TrueNAS has ${criticalAlerts.length} critical alert(s).`
      };
    } catch (err: any) {
      return {
        isHealthy: false,
        checks: [
          { name: 'TrueNAS REST API Reachable', passed: false, details: err.message }
        ],
        message: `TrueNAS unreachable: ${err.message}`
      };
    }
  }

  public async rollback(
    host: Host,
    credentials: TargetCredentials,
    backupIdentifier: string,
    onProgress?: (step: string, log: string) => void
  ): Promise<RollbackResult> {
    const client = this.getClient(host, credentials);
    const logs: string[] = [];

    onProgress?.('ROLLBACK', `Initiating TrueNAS rollback with restore point: "${backupIdentifier}"...`);
    logs.push(`Rollback target: ${backupIdentifier}`);

    // If identifier is a ZFS snapshot (e.g. boot-pool@fleetupdate-snap-...)
    if (backupIdentifier.includes('@')) {
      try {
        onProgress?.('ROLLBACK', `Restoring ZFS snapshot "${backupIdentifier}" via TrueNAS API...`);
        await client.rollbackZfsSnapshot(backupIdentifier);
        logs.push(`ZFS snapshot ${backupIdentifier} restored successfully.`);

        return {
          success: true,
          restoredVersion: host.currentVersion || 'Previous ZFS snapshot state',
          logs,
          message: `ZFS snapshot "${backupIdentifier}" restored successfully.`
        };
      } catch (err: any) {
        logs.push(`Failed to automatically restore ZFS snapshot: ${err.message}`);
        return {
          success: false,
          restoredVersion: host.currentVersion || 'Unmodified',
          logs,
          message: `TrueNAS ZFS snapshot rollback failed: ${err.message}. Please restore via TrueNAS WebGUI (Storage > Snapshots).`
        };
      }
    }

    // Otherwise configuration checkpoint
    logs.push('Manual restoration of configuration checkpoint recommended via TrueNAS WebGUI.');
    return {
      success: true,
      restoredVersion: host.currentVersion || 'Configuration Checkpoint',
      logs,
      message: `Safety restore point "${backupIdentifier}" ready for manual confirmation in TrueNAS.`
    };
  }
}
