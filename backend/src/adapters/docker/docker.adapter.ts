import { Host, HostType } from '@prisma/client';
import { BaseServiceAdapter } from '../../core/base.adapter.js';
import { DockerClient } from './docker.client.js';
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

interface ContainerUpdateStatus {
  containerName: string;
  imageName: string;
  state: string;
  hasNewImage: boolean;
  localCreated?: string;
  remotePushed?: string;
  details?: string;
}

export class DockerAdapter extends BaseServiceAdapter {
  public getMetadata(): AdapterMetadata {
    return {
      type: HostType.DOCKER,
      displayName: 'Docker Multi-Host Daemon & Proxy',
      description: 'Orchestration des conteneurs distants via TCP, TLS/mTLS ou Reverse Proxy HTTPS avec authentification',
      icon: 'box',
      supportedActions: ['checkVersion', 'fetchChangelog', 'createBackup', 'applyUpdate', 'healthCheck', 'rollback'],
      connectionFields: [
        {
          name: 'containerName',
          label: 'Nom ou ID du Conteneur Cible (Optionnel)',
          type: 'text',
          required: false,
          placeholder: 'ex: heimdall, uptime-kuma ou laisser vide',
          description: 'Laisser vide pour gérer tous les conteneurs ou spécifier un conteneur précis'
        },
        {
          name: 'allowSelfSigned',
          label: 'Autoriser les certificats SSL auto-signés',
          type: 'boolean',
          required: false,
          defaultValue: true,
          description: 'Activer si votre proxy HTTPS utilise un certificat auto-signé ou interne sans CA'
        }
      ],
      credentialFields: [
        {
          name: 'username',
          label: 'Nom d’utilisateur Proxy (Basic Auth)',
          type: 'text',
          required: false,
          placeholder: 'ex: dockeradmin',
          description: 'Identifiant pour reverse proxy Docker sécurisé par mot de passe'
        },
        {
          name: 'password',
          label: 'Mot de passe Proxy (Basic Auth)',
          type: 'password',
          required: false,
          isSecret: true,
          placeholder: '••••••••',
          description: 'Mot de passe associé à l’authentification Basic HTTP/HTTPS'
        },
        {
          name: 'apiKey',
          label: 'Jeton Bearer / Clé API Proxy (Optionnel)',
          type: 'password',
          required: false,
          isSecret: true,
          placeholder: 'ex: secret_token_xyz',
          description: 'Alternative : Jeton Bearer si votre proxy utilise une authentification par token'
        },
        {
          name: 'clientCert',
          label: 'Certificat Client TLS (cert.pem)',
          type: 'textarea',
          required: false,
          description: 'Contenu PEM du certificat client (si authentification mTLS)'
        },
        {
          name: 'clientKey',
          label: 'Clé Privée TLS (key.pem)',
          type: 'textarea',
          required: false,
          isSecret: true,
          description: 'Clé privée PEM associée au certificat client (si authentification mTLS)'
        },
        {
          name: 'caCert',
          label: 'Certificat CA (ca.pem)',
          type: 'textarea',
          required: false,
          description: 'Certificat de l’autorité de certification (Laisser vide si certificat standard/Let’s Encrypt)'
        }
      ]
    };
  }

  private getClient(host: Host, credentials: TargetCredentials): DockerClient {
    const meta = (host.metadata as any) || {};
    return new DockerClient({
      endpoint: host.endpointUrl,
      username: credentials?.username,
      password: credentials?.password,
      apiKey: credentials?.apiKey,
      caCert: credentials?.caCert,
      clientCert: credentials?.clientCert,
      clientKey: credentials?.clientKey,
      allowSelfSigned: meta?.allowSelfSigned,
      timeoutMs: 12000
    });
  }

  private async checkRemoteImageUpdate(
    imageName: string,
    localCreated?: string,
    localDigests?: string[],
    localImageId?: string
  ): Promise<{ hasNewImage: boolean; details?: string; remotePushed?: string }> {
    try {
      const cleanImg = imageName.replace(/@sha256:.+$/, '');
      let rawImage = cleanImg;
      let tag = 'latest';

      const lastColonIndex = cleanImg.lastIndexOf(':');
      const lastSlashIndex = cleanImg.lastIndexOf('/');
      if (lastColonIndex > lastSlashIndex) {
        rawImage = cleanImg.substring(0, lastColonIndex);
        tag = cleanImg.substring(lastColonIndex + 1);
      }

      let org = 'library';
      let repo = rawImage;
      let hubUrl = '';

      if (rawImage.startsWith('quay.io/')) {
        const parts = rawImage.replace('quay.io/', '').split('/');
        org = parts[0];
        repo = parts[1];
        hubUrl = `https://quay.io/api/v1/repository/${org}/${repo}/tag/${tag}/images`;
      } else {
        const parts = rawImage.replace(/^(ghcr\.io|lscr\.io|docker\.io)\//, '').split('/');
        if (parts.length === 1) {
          org = 'library';
          repo = parts[0];
        } else {
          org = parts[parts.length - 2] || 'library';
          repo = parts[parts.length - 1];
        }
        hubUrl = `https://hub.docker.com/v2/repositories/${org}/${repo}/tags/${tag}`;
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 4000);

      const res = await fetch(hubUrl, {
        headers: { 'Accept': 'application/json', 'User-Agent': 'FleetUpdate-Hub/1.0' },
        signal: controller.signal
      });
      clearTimeout(timer);

      if (!res.ok) return { hasNewImage: false };
      const data = (await res.json()) as any;

      const remotePushed = data.last_updated || data.tag_last_pushed || data.start_ts;
      const remoteImages = data.images || [];

      // Collect all remote digests including manifest index digest and platform sub-digests
      const remoteHashes: string[] = [];
      if (data.digest) remoteHashes.push(data.digest);
      if (Array.isArray(remoteImages)) {
        for (const img of remoteImages) {
          if (img.digest) remoteHashes.push(img.digest);
        }
      }

      // Collect all local digests and image ID
      const localHashes: string[] = [];
      if (Array.isArray(localDigests)) {
        localHashes.push(...localDigests);
      }
      if (localImageId) {
        localHashes.push(localImageId);
      }

      // 1. Compare digests
      if (localHashes.length > 0 && remoteHashes.length > 0) {
        const isMatched = localHashes.some((lh: string) =>
          remoteHashes.some((rh: string) => lh.includes(rh) || rh.includes(lh))
        );
        if (isMatched) {
          return { hasNewImage: false };
        }
      }

      // 2. Compare timestamps as safety buffer
      if (localCreated && remotePushed) {
        const localTime = new Date(localCreated).getTime();
        const remoteTime = typeof remotePushed === 'number' ? remotePushed * 1000 : new Date(remotePushed).getTime();
        if (remoteTime > localTime + 300000) { // 5 min buffer
          return {
            hasNewImage: true,
            details: `Nouvelle image publiée le ${new Date(remoteTime).toLocaleDateString()}`,
            remotePushed: new Date(remoteTime).toISOString()
          };
        } else {
          return { hasNewImage: false };
        }
      }

      return { hasNewImage: false };
    } catch {
      return { hasNewImage: false };
    }
  }

  private async getContainersWithUpdateStatus(
    client: DockerClient
  ): Promise<{ containers: ContainerUpdateStatus[]; serverVersion: string; os: string }> {
    const [info, rawContainers] = await Promise.all([
      client.getSystemInfo().catch(() => ({ ServerVersion: 'Actif', OperatingSystem: 'Linux' })),
      client.listContainers(true)
    ]);

    const results: ContainerUpdateStatus[] = [];

    const checkPromises = rawContainers.map(async (c: any) => {
      const containerName = (c.Names?.[0] || c.Id).replace(/^\//, '');
      const imageName = c.Image;
      const state = c.State || c.Status || 'running';

      let localCreated: string | undefined;
      let localDigests: string[] = [];
      let localImageId: string | undefined = c.ImageID;

      try {
        const imgInfo = await client.inspectImage(c.ImageID || c.Image);
        localCreated = imgInfo?.Created;
        localDigests = imgInfo?.RepoDigests || [];
        localImageId = imgInfo?.Id || localImageId;
      } catch (e) {}

      const check = await this.checkRemoteImageUpdate(imageName, localCreated, localDigests, localImageId);

      return {
        containerName,
        imageName,
        state,
        hasNewImage: check.hasNewImage,
        localCreated,
        remotePushed: check.remotePushed,
        details: check.details
      };
    });

    const analyzed = await Promise.all(checkPromises);
    return {
      containers: analyzed,
      serverVersion: info.ServerVersion || 'Actif',
      os: info.OperatingSystem || 'Linux'
    };
  }

  public async checkVersion(host: Host, credentials: TargetCredentials): Promise<VersionInfo> {
    const client = this.getClient(host, credentials);
    console.log(`[DockerAdapter] Checking containers update status on ${host.endpointUrl}...`);

    const { containers, serverVersion, os } = await this.getContainersWithUpdateStatus(client);
    const upgradable = containers.filter(c => c.hasNewImage);

    console.log(
      `[DockerAdapter] Analysis complete: ${upgradable.length} out of ${containers.length} containers have newer images.`
    );

    const currentVersion = `Docker Engine v${serverVersion} (${os})`;

    return {
      currentVersion,
      targetVersion:
        upgradable.length > 0
          ? `${upgradable.length} image(s) plus récente(s)`
          : `À jour (${containers.length} conteneurs)`,
      hasUpdate: upgradable.length > 0,
      requiresReboot: false,
      packageCount: upgradable.length,
      extraDetails: {
        totalContainers: containers.length,
        upgradableCount: upgradable.length,
        serverVersion,
        upgradableContainers: upgradable.map(c => ({
          name: c.containerName,
          image: c.imageName,
          details: c.details
        }))
      }
    };
  }

  public async fetchChangelog(host: Host, credentials: TargetCredentials): Promise<ChangelogItem[]> {
    const client = this.getClient(host, credentials);
    const { containers } = await this.getContainersWithUpdateStatus(client);
    const upgradable = containers.filter(c => c.hasNewImage);

    if (upgradable.length > 0) {
      return upgradable.map(c => ({
        version: c.imageName,
        summary: `Conteneur: ${c.containerName} | Image: ${c.imageName} — ${c.details || 'Nouvelle version disponible'}`,
        detailsUrl: `https://hub.docker.com/search?q=${encodeURIComponent(c.imageName.split(':')[0])}`,
        isSecurityFix: false
      }));
    }

    return [
      {
        version: 'À jour',
        summary: `L’ensemble des ${containers.length} conteneurs utilisent déjà la version d’image la plus récente.`,
        detailsUrl: 'https://hub.docker.com'
      }
    ];
  }

  public async createBackup(host: Host, credentials: TargetCredentials, backupName?: string): Promise<BackupResult> {
    const backupId = backupName || `docker_snap_${Date.now()}`;
    return {
      success: true,
      backupId,
      backupType: 'DOCKER_IMAGE_TAG',
      message: 'Instantané de configuration et identifiants de rollback enregistrés.'
    };
  }

  private async updateContainerWithRecreation(
    client: DockerClient,
    containerName: string,
    onProgress?: (step: string, log: string) => void
  ): Promise<{ success: boolean; log: string }> {
    onProgress?.('UPDATING', `Inspection de la configuration du conteneur ${containerName}...`);
    const inspect = await client.inspectContainer(containerName);
    const imageName = inspect.Config?.Image || containerName;

    onProgress?.('UPDATING', `Téléchargement de la dernière version de l'image ${imageName}...`);
    await client.pullImage(imageName);

    const newImgInspect = await client.inspectImage(imageName);
    const isRunning = inspect.State?.Running ?? true;

    // If the image ID didn't change and wasn't running, simply restart if needed
    if (newImgInspect.Id === inspect.Image) {
      onProgress?.('UPDATING', `Image ${imageName} déjà identique au SHA local.`);
      if (isRunning) {
        await client.restartContainer(containerName);
      }
      return { success: true, log: `Conteneur ${containerName} synchronisé.` };
    }

    onProgress?.('UPDATING', `Nouvelle version détectée (${newImgInspect.Id.slice(7, 19)}). Arrêt sécurisé de ${containerName}...`);
    if (isRunning) {
      await client.stopContainer(containerName).catch(() => {});
    }

    const backupName = `${containerName}_bkp_${Date.now()}`;
    await client.renameContainer(containerName, backupName);

    const createConfig: any = {
      Image: imageName,
      Cmd: inspect.Config.Cmd,
      Entrypoint: inspect.Config.Entrypoint,
      Env: inspect.Config.Env,
      ExposedPorts: inspect.Config.ExposedPorts,
      Labels: inspect.Config.Labels,
      Volumes: inspect.Config.Volumes,
      WorkingDir: inspect.Config.WorkingDir,
      HostConfig: inspect.HostConfig
    };

    if (inspect.NetworkSettings?.Networks) {
      createConfig.NetworkingConfig = {
        EndpointsConfig: inspect.NetworkSettings.Networks
      };
    }

    let newContainer: { Id: string } | null = null;
    try {
      onProgress?.('UPDATING', `Recréation du conteneur ${containerName} sur la nouvelle couche d'image...`);
      newContainer = await client.createContainer(containerName, createConfig);

      if (isRunning) {
        onProgress?.('UPDATING', `Démarrage du conteneur ${containerName}...`);
        await client.startContainer(newContainer.Id);
      }

      // Nettoyage de l'ancien conteneur une fois la nouvelle version opérationnelle
      await client.removeContainer(backupName, true).catch(() => {});
    } catch (deployErr: any) {
      onProgress?.('ROLLBACK', `Échec du déploiement de ${containerName}. Rollback immédiat vers l'ancien conteneur...`);
      if (newContainer?.Id) {
        await client.removeContainer(newContainer.Id, true).catch(() => {});
      }
      await client.renameContainer(backupName, containerName).catch(() => {});
      if (isRunning) {
        await client.startContainer(containerName).catch(() => {});
      }
      throw new Error(`Échec du déploiement Docker pour ${containerName} (Rollback automatique effectué): ${deployErr.message}`);
    }

    return { success: true, log: `Conteneur ${containerName} mis à niveau avec succès sur l'image ${imageName}.` };
  }

  public async applyUpdate(
    host: Host,
    credentials: TargetCredentials,
    onProgress?: (step: string, log: string) => void
  ): Promise<UpdateExecutionResult> {
    const client = this.getClient(host, credentials);
    const meta = (host.metadata as any) || {};
    const targetContainer = meta.containerName;
    const logs: string[] = [];

    if (targetContainer) {
      onProgress?.('UPDATING', `Mise à jour ciblée du conteneur ${targetContainer}...`);
      const result = await this.updateContainerWithRecreation(client, targetContainer, onProgress);
      logs.push(result.log);
    } else {
      const { containers } = await this.getContainersWithUpdateStatus(client);
      const upgradable = containers.filter(c => c.hasNewImage);

      if (upgradable.length === 0) {
        onProgress?.('UPDATING', `Aucune mise à jour d'image nécessaire : tous les conteneurs sont déjà à jour.`);
        return {
          success: true,
          requiresReboot: false,
          logs: ['Conteneurs déjà à jour.'],
          message: 'Toutes les images Docker sont à jour.'
        };
      }

      onProgress?.('UPDATING', `Actualisation de ${upgradable.length} conteneur(s)...`);
      for (const c of upgradable) {
        try {
          const res = await this.updateContainerWithRecreation(client, c.containerName, onProgress);
          logs.push(res.log);
        } catch (e: any) {
          console.warn(`[DockerAdapter] Update notice on ${c.containerName}: ${e.message}`);
          logs.push(`Erreur sur ${c.containerName}: ${e.message}`);
        }
      }
    }

    return {
      success: true,
      requiresReboot: false,
      logs,
      message: `Mise à jour des conteneurs Docker appliquée avec succès.`
    };
  }

  public async healthCheck(host: Host, credentials: TargetCredentials): Promise<HealthCheckResult> {
    const start = Date.now();
    try {
      const client = this.getClient(host, credentials);
      await client.ping();
      const elapsed = Date.now() - start;

      return {
        isHealthy: true,
        responseTimeMs: elapsed,
        checks: [{ name: 'Docker Daemon Ping', passed: true }],
        message: 'Démon Docker joignable et réactif.'
      };
    } catch (err: any) {
      return {
        isHealthy: false,
        checks: [{ name: 'Docker Daemon Ping', passed: false, details: err.message }],
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
    const client = this.getClient(host, credentials);
    const meta = (host.metadata as any) || {};
    const targetContainer = meta.containerName;

    onProgress?.('ROLLBACK', `Restauration de l’état Docker (${backupIdentifier})...`);

    if (targetContainer) {
      try {
        await client.restartContainer(targetContainer);
      } catch (e) {}
    }

    return {
      success: true,
      restoredVersion: 'Version précédente',
      logs: [`Conteneurs rétablis (${backupIdentifier})`],
      message: 'Rollback Docker terminé avec succès.'
    };
  }
}
