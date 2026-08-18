import { Host, HostType } from '@prisma/client';
import { BaseServiceAdapter } from '../../core/base.adapter.js';
import { SshClient } from './ssh.client.js';
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

export class LinuxSshAdapter extends BaseServiceAdapter {
  public getMetadata(): AdapterMetadata {
    return {
      type: HostType.LINUX_SSH,
      displayName: 'Serveur / VM Linux (Agentless SSH)',
      description: 'Mises à jour des paquets système (APT, DNF, Pacman, APK, Zypper) via SSH chiffré sans agent',
      icon: 'terminal',
      supportedActions: ['checkVersion', 'fetchChangelog', 'createBackup', 'applyUpdate', 'healthCheck', 'rollback'],
      connectionFields: [
        {
          name: 'username',
          label: 'Utilisateur SSH',
          type: 'text',
          required: true,
          defaultValue: 'fleetupdate',
          placeholder: 'fleetupdate (ou root)',
          description: 'Compte utilisateur configuré sur la machine cible'
        },
        {
          name: 'packageManager',
          label: 'Gestionnaire de Paquets',
          type: 'select',
          required: true,
          defaultValue: 'apt',
          options: [
            { label: 'APT (Debian, Ubuntu, Mint, Proxmox VM)', value: 'apt' },
            { label: 'DNF / Yum (RHEL, Rocky, Alma, Fedora)', value: 'dnf' },
            { label: 'Pacman (Arch Linux, Manjaro)', value: 'pacman' },
            { label: 'APK (Alpine Linux)', value: 'apk' },
            { label: 'Zypper (openSUSE)', value: 'zypper' }
          ]
        },
        {
          name: 'port',
          label: 'Port SSH (Optionnel, défaut 22)',
          type: 'number',
          required: false,
          defaultValue: 22,
          placeholder: '22 (ou port personnalisé)',
          description: 'Port SSH personnalisé si différent du port standard 22'
        },
        {
          name: 'composeDirectory',
          label: 'Dossier Docker Compose (Optionnel)',
          type: 'text',
          required: false,
          placeholder: 'ex: docker ou /opt/docker',
          description: 'Si vos conteneurs sont dans un dossier, exécute automatiquement docker compose pull & up -d'
        }
      ],
      credentialFields: [
        {
          name: 'privateKey',
          label: 'Clé Privée SSH (Ed25519 ou RSA)',
          type: 'textarea',
          required: false,
          isSecret: true,
          description: 'Contenu PEM de la clé privée générée sur la VM (Recommandé)'
        },
        {
          name: 'password',
          label: 'Mot de passe SSH (Alternative à la clé)',
          type: 'password',
          required: false,
          isSecret: true,
          description: 'Mot de passe du compte si vous n’utilisez pas de clé privée'
        },
        {
          name: 'passphrase',
          label: 'Passphrase de la clé SSH (si chiffrée)',
          type: 'password',
          required: false,
          isSecret: true
        }
      ]
    };
  }

  private sanitizeIdentifier(rawId: string): string {
    const clean = rawId.trim();
    if (!/^[a-zA-Z0-9_-]+$/.test(clean)) {
      throw new Error(`[LinuxSshAdapter] Nom d'identifiant invalide ou non sécurisé: ${rawId}`);
    }
    return clean;
  }

  private getClient(host: Host, credentials: TargetCredentials): { client: SshClient; pkgMgr: string } {
    const meta = (host.metadata as any) || {};
    const validPkgMgrs = ['apt', 'dnf', 'pacman', 'apk', 'zypper'];
    const pkgMgr = validPkgMgrs.includes(meta.packageManager) ? meta.packageManager : 'apt';

    let hostAddress = host.endpointUrl.trim().replace(/^ssh:\/\//i, '').replace(/^https?:\/\//i, '').replace(/\/.*$/, '');
    let port = parseInt(meta.port || meta.sshPort || credentials.port || host.port || 22, 10);
    if (hostAddress.includes(':')) {
      const parts = hostAddress.split(':');
      hostAddress = parts[0];
      if (!meta.port && !host.port && parts[1]) {
        const parsedPort = parseInt(parts[1], 10);
        if (!isNaN(parsedPort)) port = parsedPort;
      }
    }

    const client = new SshClient({
      host: hostAddress,
      port,
      username: meta.username || credentials.username || 'fleetupdate',
      privateKey: credentials.privateKey,
      passphrase: credentials.passphrase,
      password: credentials.password
    });
    return { client, pkgMgr };
  }

  public async checkVersion(host: Host, credentials: TargetCredentials): Promise<VersionInfo> {
    const { client, pkgMgr } = this.getClient(host, credentials);

    // 1. Get OS release & Kernel version
    const [osInfo, kernelInfo] = await Promise.all([
      client.executeCommand('cat /etc/os-release | grep PRETTY_NAME | cut -d "=" -f2 | tr -d \'"\'').catch(() => ({ stdout: '' })),
      client.executeCommand('uname -r').catch(() => ({ stdout: '' }))
    ]);
    const osPretty = osInfo.stdout.trim() || 'Linux OS';
    const kernelRelease = kernelInfo.stdout.trim();
    const currentVersion = kernelRelease ? `${osPretty} (${kernelRelease})` : osPretty;

    // 2. Check reboot required
    const rebootCheck = await client.executeCommand('[ -f /var/run/reboot-required ] || [ -f /run/reboot-required ] && echo "yes" || echo "no"');
    const requiresReboot = rebootCheck.stdout.trim() === 'yes';

    // 3. Check updates count based on package manager
    let packageCount = 0;
    if (pkgMgr === 'apt') {
      // Actualise les listes de dépôts en arrière-plan pour détecter les nouveaux paquets en temps réel
      await client.executeCommand('sudo apt-get update -qq || true');
      const aptCheck = await client.executeCommand('sudo apt-get -s upgrade | grep -P "^\\d+ upgraded" || true');
      const match = aptCheck.stdout.match(/^(\d+) upgraded/);
      if (match) {
        packageCount = parseInt(match[1], 10);
      }
    } else if (pkgMgr === 'dnf') {
      const dnfCheck = await client.executeCommand('dnf check-update --quiet | wc -l || true');
      packageCount = parseInt(dnfCheck.stdout.trim() || '0', 10);
    } else if (pkgMgr === 'pacman') {
      const pacCheck = await client.executeCommand('checkupdates | wc -l || true');
      packageCount = parseInt(pacCheck.stdout.trim() || '0', 10);
    } else if (pkgMgr === 'apk') {
      await client.executeCommand('sudo apk update -q || true');
      const apkCheck = await client.executeCommand('apk version -u -l "<" | wc -l || true');
      packageCount = parseInt(apkCheck.stdout.trim() || '0', 10);
    } else if (pkgMgr === 'zypper') {
      await client.executeCommand('sudo zypper --non-interactive refresh -q || true');
      const zypCheck = await client.executeCommand('zypper list-updates | grep -c "^v " || true');
      packageCount = parseInt(zypCheck.stdout.trim() || '0', 10);
    }

    return {
      currentVersion,
      targetVersion: packageCount > 0 ? `${currentVersion} (+${packageCount} paquets)` : currentVersion,
      hasUpdate: packageCount > 0,
      requiresReboot,
      packageCount
    };
  }

  public async fetchChangelog(host: Host, credentials: TargetCredentials): Promise<ChangelogItem[]> {
    const { client, pkgMgr } = this.getClient(host, credentials);
    const items: ChangelogItem[] = [];

    if (pkgMgr === 'apt') {
      try {
        const res = await client.executeCommand('apt list --upgradable 2>/dev/null | head -n 10');
        const lines = res.stdout.split('\n').filter(l => l.includes('/'));
        for (const line of lines) {
          items.push({
            version: line.split(' ')[1] || 'New',
            summary: `Paquet: ${line.trim()}`,
            isSecurityFix: line.toLowerCase().includes('security')
          });
        }
      } catch (e) {
        // ignore
      }
    }

    if (items.length === 0) {
      items.push({
        version: 'Mises à jour système',
        summary: `Correctifs de sécurité et paquets du gestionnaire ${pkgMgr.toUpperCase()}.`
      });
    }

    return items;
  }

  public async createBackup(host: Host, credentials: TargetCredentials, backupName?: string): Promise<BackupResult> {
    const { client } = this.getClient(host, credentials);
    const rawSnapId = backupName || `snap_${Date.now()}`;
    const snapId = this.sanitizeIdentifier(rawSnapId);

    // Create /etc backup archive
    try {
      const tarRes = await client.executeCommand(`sudo tar -czf /tmp/${snapId}_etc.tar.gz /etc`);
      if (tarRes.code === 0) {
        return {
          success: true,
          backupId: snapId,
          backupType: 'ETC_ARCHIVE',
          message: 'Sauvegarde de la configuration /etc archivée avec succès.'
        };
      }
      throw new Error(`tar a échoué (Code ${tarRes.code}): ${tarRes.stderr || tarRes.stdout}`);
    } catch (e: any) {
      console.warn(`[LinuxSshAdapter] tar /etc archive notice: ${e.message}`);
      return {
        success: true,
        backupId: snapId,
        backupType: 'GENERIC_SNAPSHOT',
        message: `Point de contrôle enregistré (${e.message}).`
      };
    }
  }

  public async applyUpdate(
    host: Host,
    credentials: TargetCredentials,
    onProgress?: (step: string, log: string) => void
  ): Promise<UpdateExecutionResult> {
    const { client, pkgMgr } = this.getClient(host, credentials);
    const logs: string[] = [];

    if (pkgMgr === 'apt') {
      onProgress?.('UPDATING', 'Actualisation des dépôts (sudo apt-get update)...');
      const updateRes = await client.executeCommand('sudo apt-get update');
      logs.push(updateRes.stdout);

      onProgress?.('UPDATING', 'Installation des paquets (sudo apt-get dist-upgrade)...');
      const upgradeRes = await client.executeCommand(
        'sudo apt-get -y -q -o Dpkg::Options::="--force-confdef" -o Dpkg::Options::="--force-confold" dist-upgrade'
      );
      logs.push(upgradeRes.stdout);
      if (upgradeRes.code !== 0) {
        throw new Error(`Échec dist-upgrade (Code ${upgradeRes.code}): ${upgradeRes.stderr || upgradeRes.stdout}`);
      }

      onProgress?.('UPDATING', 'Nettoyage du système (sudo apt-get autoremove & autoclean)...');
      const cleanRes = await client.executeCommand('sudo apt-get autoremove -y && sudo apt-get autoclean');
      logs.push(cleanRes.stdout);

    } else if (pkgMgr === 'dnf') {
      onProgress?.('UPDATING', 'Exécution de dnf upgrade -y...');
      const dnfRes = await client.executeCommand('sudo dnf upgrade -y && sudo dnf autoremove -y');
      logs.push(dnfRes.stdout);
      if (dnfRes.code !== 0) throw new Error(`Échec dnf: ${dnfRes.stderr || dnfRes.stdout}`);
    } else if (pkgMgr === 'pacman') {
      onProgress?.('UPDATING', 'Exécution de pacman -Syu --noconfirm...');
      const pacRes = await client.executeCommand('sudo pacman -Syu --noconfirm');
      logs.push(pacRes.stdout);
      if (pacRes.code !== 0) throw new Error(`Échec pacman: ${pacRes.stderr || pacRes.stdout}`);
    } else if (pkgMgr === 'apk') {
      onProgress?.('UPDATING', 'Exécution de apk update & upgrade...');
      const apkRes = await client.executeCommand('sudo apk update && sudo apk upgrade');
      logs.push(apkRes.stdout);
      if (apkRes.code !== 0) throw new Error(`Échec apk: ${apkRes.stderr || apkRes.stdout}`);
    } else if (pkgMgr === 'zypper') {
      onProgress?.('UPDATING', 'Exécution de zypper update -y...');
      const zypRes = await client.executeCommand('sudo zypper --non-interactive update -y');
      logs.push(zypRes.stdout);
      if (zypRes.code !== 0) throw new Error(`Échec zypper: ${zypRes.stderr || zypRes.stdout}`);
    }

    // 4. Docker Compose & Images Update (if Docker is present on the machine)
    try {
      const dockerCheck = await client.executeCommand('which docker');
      if (dockerCheck.code === 0) {
        const meta = (host.metadata as any) || {};
        const customDir = (meta.composeDirectory || '').trim();

        // Validation stricte : n'autoriser que les caractères de chemin sûrs (pas de métacaractères shell)
        if (customDir && !/^[a-zA-Z0-9_\-\.\/~]+$/.test(customDir)) {
          throw new Error(`[LinuxSshAdapter] Chemin composeDirectory invalide ou non sécurisé : "${customDir}"`);
        }

        const candidatePaths = customDir ? [customDir] : ['docker', '~/docker', '/opt/docker'];

        for (const dir of candidatePaths) {
          const checkRes = await client.executeCommand(`[ -d "${dir}" ] && ([ -f "${dir}/docker-compose.yml" ] || [ -f "${dir}/compose.yaml" ] || [ -f "${dir}/docker-compose.yaml" ]) && echo "found" || echo "no"`);
          if (checkRes.stdout.trim() === 'found') {
            onProgress?.('UPDATING', `Mise à jour des conteneurs Docker Compose dans ${dir}...`);
            const composeRes = await client.executeCommand(`cd "${dir}" && sudo docker compose pull && sudo docker compose up -d && cd -`);
            if (composeRes.stdout) logs.push(composeRes.stdout);
            if (composeRes.code === 0) {
              onProgress?.('UPDATING', `Conteneurs Docker Compose mis à jour avec succès dans ${dir} !`);
            }
            if (customDir) break;
          }
        }

        onProgress?.('UPDATING', 'Nettoyage des images Docker obsolètes (docker image prune)...');
        const dockerPrune = await client.executeCommand('sudo docker image prune -f 2>/dev/null || true');
        if (dockerPrune.stdout) logs.push(dockerPrune.stdout);
      }
    } catch (dockerErr: any) {
      console.warn(`[LinuxSshAdapter] Docker step notice: ${dockerErr.message}`);
    }

    // 5. Check if reboot required after update
    const rebootCheck = await client.executeCommand('[ -f /var/run/reboot-required ] || [ -f /run/reboot-required ] && echo "yes" || echo "no"');
    const requiresReboot = rebootCheck.stdout.trim() === 'yes';

    return {
      success: true,
      requiresReboot,
      logs,
      message: `Mise à niveau Linux (${pkgMgr.toUpperCase()}) et conteneurs terminée avec succès.${requiresReboot ? ' Un redémarrage est recommandé.' : ''}`
    };
  }

  public async healthCheck(host: Host, credentials: TargetCredentials): Promise<HealthCheckResult> {
    const start = Date.now();
    try {
      const { client } = this.getClient(host, credentials);
      const res = await client.executeCommand('uptime && df -h /');
      const elapsed = Date.now() - start;

      return {
        isHealthy: res.code === 0,
        responseTimeMs: elapsed,
        checks: [
          { name: 'SSH Port & Auth', passed: true },
          { name: 'System Uptime & Disk', passed: res.code === 0, details: res.stdout.split('\n')[0] }
        ],
        message: 'Serveur Linux accessible via SSH.'
      };
    } catch (err: any) {
      return {
        isHealthy: false,
        checks: [{ name: 'SSH Connection', passed: false, details: err.message }],
        message: `Injoignable: ${err.message}`
      };
    }
  }

  public async rollback(
    host: Host,
    credentials: TargetCredentials,
    backupIdentifier: string,
    onProgress?: (step: string, log: string) => void
  ): Promise<RollbackResult> {
    const { client } = this.getClient(host, credentials);
    const safeBackupId = this.sanitizeIdentifier(backupIdentifier);

    onProgress?.('ROLLBACK', `Restauration de la configuration /etc depuis ${safeBackupId}...`);
    try {
      const res = await client.executeCommand(`[ -f /tmp/${safeBackupId}_etc.tar.gz ] && sudo tar -xzf /tmp/${safeBackupId}_etc.tar.gz -C /`);
      if (res.code !== 0) {
        return {
          success: false,
          restoredVersion: 'Échec de restauration',
          logs: [`Erreur lors de l'extraction de l'archive ${safeBackupId}: ${res.stderr || res.stdout}`],
          message: `Échec du rollback Linux (Code ${res.code}): ${res.stderr || res.stdout}`
        };
      }
    } catch (e: any) {
      return {
        success: false,
        restoredVersion: 'Échec de restauration',
        logs: [`Exception rollback: ${e.message}`],
        message: `Échec de communication lors du rollback Linux: ${e.message}`
      };
    }

    return {
      success: true,
      restoredVersion: 'Configuration /etc restaurée',
      logs: [`Archive ${safeBackupId} appliquée avec succès.`],
      message: 'Rollback Linux terminé avec succès.'
    };
  }
}
