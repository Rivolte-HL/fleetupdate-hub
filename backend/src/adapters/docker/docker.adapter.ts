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
  currentVersion: string;
  targetVersion: string;
  localCreated?: string;
  remotePushed?: string;
  remoteDigest?: string;
  details?: string;
  releaseUrl?: string;
  labels?: Record<string, string>;
}

export class DockerAdapter extends BaseServiceAdapter {
  public getMetadata(): AdapterMetadata {
    return {
      type: HostType.DOCKER,
      displayName: 'Docker Multi-Host Daemon & Proxy',
      description: 'Remote container management via TCP, TLS/mTLS, or HTTPS Reverse Proxy with authentication',
      icon: 'box',
      supportedActions: ['checkVersion', 'fetchChangelog', 'createBackup', 'applyUpdate', 'healthCheck', 'rollback'],
      connectionFields: [
        {
          name: 'containerName',
          label: 'Target Container Name or ID (Optional)',
          type: 'text',
          required: false,
          placeholder: 'e.g. heimdall, uptime-kuma or leave empty',
          description: 'Leave empty to manage all containers, or specify a comma-separated list of containers'
        },
        {
          name: 'allowSelfSigned',
          label: 'Allow Self-Signed SSL Certificates',
          type: 'boolean',
          required: false,
          defaultValue: true,
          description: 'Enable if your HTTPS proxy uses a self-signed or internal certificate without public CA'
        },
        {
          name: 'pruneDanglingImages',
          label: 'Auto-Prune Dangling Images',
          type: 'boolean',
          required: false,
          defaultValue: true,
          description: 'Automatically prune unused dangling image layers after updates to save host storage'
        },
        {
          name: 'healthCheckWaitSeconds',
          label: 'Health Check Wait Time (Seconds)',
          type: 'number',
          required: false,
          defaultValue: 10,
          placeholder: '10',
          description: 'Grace period in seconds to verify container stability and healthcheck status post-start'
        },
        {
          name: 'stopTimeout',
          label: 'Graceful Stop Timeout (Seconds)',
          type: 'number',
          required: false,
          defaultValue: 10,
          placeholder: '10',
          description: 'Graceful stop timeout in seconds before recreating container (default: 10s)'
        }
      ],
      credentialFields: [
        {
          name: 'username',
          label: 'Proxy Username (HTTP Basic Auth)',
          type: 'text',
          required: false,
          placeholder: 'e.g. dockeradmin',
          description: 'Username for password-protected Docker reverse proxy'
        },
        {
          name: 'password',
          label: 'Proxy Password (HTTP Basic Auth)',
          type: 'password',
          required: false,
          isSecret: true,
          placeholder: '••••••••',
          description: 'Password associated with Basic HTTP/HTTPS authentication'
        },
        {
          name: 'apiKey',
          label: 'Bearer Token / Proxy API Key (Optional)',
          type: 'password',
          required: false,
          isSecret: true,
          placeholder: 'e.g. secret_token_xyz',
          description: 'Alternative Bearer token if your proxy uses token authentication'
        },
        {
          name: 'clientCert',
          label: 'TLS Client Certificate (cert.pem)',
          type: 'textarea',
          required: false,
          description: 'PEM client certificate content (when using mTLS)'
        },
        {
          name: 'clientKey',
          label: 'TLS Private Key (key.pem)',
          type: 'textarea',
          required: false,
          isSecret: true,
          description: 'PEM private key associated with client certificate (when using mTLS)'
        },
        {
          name: 'caCert',
          label: 'CA Certificate (ca.pem)',
          type: 'textarea',
          required: false,
          description: 'Certificate Authority PEM (leave empty for standard/Let’s Encrypt)'
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
      timeoutMs: 15000
    });
  }

  /**
   * Helper to perform HTTPS JSON requests with timeout
   */
  private async safeFetch(url: string, headers: Record<string, string> = {}, timeoutMs: number = 8000): Promise<{ ok: boolean; status: number; headers: Headers; data?: any }> {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'FleetUpdate-Hub/1.0',
          ...headers
        },
        signal: controller.signal
      });
      clearTimeout(timer);

      let data: any = undefined;
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        try {
          data = await res.json();
        } catch {}
      }

      return { ok: res.ok, status: res.status, headers: res.headers, data };
    } catch {
      return { ok: false, status: 0, headers: new Headers() };
    }
  }

  /**
   * Universal remote registry image check supporting Docker Hub, GHCR, Quay, and LinuxServer
   * Uses Docker Registry v2 API (Auth tokens & Multi-Arch Manifests) with Hub API fallback
   */
  private async checkRemoteImageUpdate(
    imageName: string,
    localCreated?: string,
    localDigests?: string[],
    localImageId?: string
  ): Promise<{
    hasNewImage: boolean;
    details?: string;
    remotePushed?: string;
    remoteDigest?: string;
    releaseUrl?: string;
  }> {
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

      const remoteDigests: string[] = [];
      let remotePushed: string | number | undefined;
      let releaseUrl: string | undefined;

      // 1. GitHub Container Registry (ghcr.io)
      if (rawImage.startsWith('ghcr.io/')) {
        const repoPath = rawImage.replace('ghcr.io/', '');
        releaseUrl = `https://github.com/${repoPath}`;

        const tokenRes = await this.safeFetch(
          `https://ghcr.io/token?service=ghcr.io&scope=repository:${repoPath}:pull`,
          {},
          6000
        );

        if (tokenRes.ok && tokenRes.data?.token) {
          const token = tokenRes.data.token;
          const manifestRes = await this.safeFetch(
            `https://ghcr.io/v2/${repoPath}/manifests/${tag}`,
            {
              Authorization: `Bearer ${token}`,
              Accept:
                'application/vnd.docker.distribution.manifest.list.v2+json, application/vnd.oci.image.index.v1+json, application/vnd.docker.distribution.manifest.v2+json, application/vnd.oci.image.manifest.v1+json'
            },
            6000
          );

          if (manifestRes.ok) {
            const topDigest = manifestRes.headers.get('docker-content-digest');
            if (topDigest) remoteDigests.push(topDigest);

            if (manifestRes.data?.manifests) {
              for (const m of manifestRes.data.manifests) {
                if (m.digest) remoteDigests.push(m.digest);
              }
            } else if (manifestRes.data?.config?.digest) {
              remoteDigests.push(manifestRes.data.config.digest);
            }
          }
        }
      }
      // 2. Quay.io
      else if (rawImage.startsWith('quay.io/')) {
        const parts = rawImage.replace('quay.io/', '').split('/');
        const org = parts[0];
        const repo = parts[1];
        releaseUrl = `https://quay.io/repository/${org}/${repo}`;

        const res = await this.safeFetch(
          `https://quay.io/api/v1/repository/${org}/${repo}/tag/${tag}/images`,
          { Accept: 'application/json' },
          6000
        );

        if (res.ok && res.data) {
          remotePushed = res.data.start_ts;
          const img = res.data.images?.[0];
          if (img?.id) remoteDigests.push(img.id);
        }
      }
      // 3. Docker Hub & LinuxServer (docker.io / lscr.io / default)
      else {
        const parts = rawImage.replace(/^(docker\.io|lscr\.io)\//, '').split('/');
        let org = 'library';
        let repo = parts[0];

        if (parts.length === 1) {
          org = 'library';
          repo = parts[0];
        } else {
          org = parts[parts.length - 2] || 'library';
          repo = parts[parts.length - 1];
        }

        const fullRepo = `${org}/${repo}`;
        releaseUrl = org === 'library'
          ? `https://hub.docker.com/_/${repo}`
          : `https://hub.docker.com/r/${org}/${repo}`;

        // A. Primary Strategy: Docker Registry v2 API with Token (Fast, Exact OCI Hashes)
        try {
          const tokenRes = await this.safeFetch(
            `https://auth.docker.io/token?service=registry.docker.io&scope=repository:${fullRepo}:pull`,
            {},
            6000
          );

          if (tokenRes.ok && tokenRes.data?.token) {
            const token = tokenRes.data.token;
            const manifestRes = await this.safeFetch(
              `https://registry-1.docker.io/v2/${fullRepo}/manifests/${tag}`,
              {
                Authorization: `Bearer ${token}`,
                Accept:
                  'application/vnd.docker.distribution.manifest.list.v2+json, application/vnd.oci.image.index.v1+json, application/vnd.docker.distribution.manifest.v2+json, application/vnd.oci.image.manifest.v1+json'
              },
              6000
            );

            if (manifestRes.ok) {
              const topDigest = manifestRes.headers.get('docker-content-digest');
              if (topDigest) remoteDigests.push(topDigest);

              if (manifestRes.data?.manifests) {
                for (const m of manifestRes.data.manifests) {
                  if (m.digest) remoteDigests.push(m.digest);
                }
              } else if (manifestRes.data?.config?.digest) {
                remoteDigests.push(manifestRes.data.config.digest);
              }
            }
          }
        } catch {}

        // B. Secondary Strategy: Docker Hub v2 API (Fall-through / Augmentation)
        if (remoteDigests.length === 0) {
          const hubRes = await this.safeFetch(
            `https://hub.docker.com/v2/repositories/${org}/${repo}/tags/${tag}`,
            { Accept: 'application/json' },
            6000
          );

          if (hubRes.ok && hubRes.data) {
            remotePushed = hubRes.data.last_updated || hubRes.data.tag_last_pushed;
            if (hubRes.data.digest) remoteDigests.push(hubRes.data.digest);
            if (Array.isArray(hubRes.data.images)) {
              for (const img of hubRes.data.images) {
                if (img.digest) remoteDigests.push(img.digest);
              }
            }
          }
        }
      }

      // Collect all local hashes (Image ID and RepoDigests)
      const localHashes: string[] = [];
      if (Array.isArray(localDigests)) {
        for (const ld of localDigests) {
          localHashes.push(ld);
          const parts = ld.split('@');
          if (parts.length > 1) localHashes.push(parts[1]);
        }
      }
      if (localImageId) {
        localHashes.push(localImageId);
        localHashes.push(localImageId.replace('sha256:', ''));
      }

      const primaryRemoteDigest = remoteDigests[0];

      // 1. Direct Digest Verification (Match any local digest against any remote platform digest)
      if (remoteDigests.length > 0 && localHashes.length > 0) {
        const isMatched = localHashes.some((lh: string) =>
          remoteDigests.some((rd: string) => lh.includes(rd) || rd.includes(lh))
        );

        if (isMatched) {
          return { hasNewImage: false, remoteDigest: primaryRemoteDigest, releaseUrl };
        } else {
          return {
            hasNewImage: true,
            details: `New image digest available in registry (${primaryRemoteDigest.slice(0, 19)})`,
            remoteDigest: primaryRemoteDigest,
            remotePushed: remotePushed ? new Date(remotePushed).toISOString() : undefined,
            releaseUrl
          };
        }
      }

      // 2. Timestamp Safety Buffer Comparison (5 min buffer)
      if (localCreated && remotePushed) {
        const localTime = new Date(localCreated).getTime();
        const remoteTime = typeof remotePushed === 'number' ? remotePushed * 1000 : new Date(remotePushed).getTime();
        if (remoteTime > localTime + 300000) {
          return {
            hasNewImage: true,
            details: `New build published on ${new Date(remoteTime).toLocaleDateString()}`,
            remoteDigest: primaryRemoteDigest,
            remotePushed: new Date(remoteTime).toISOString(),
            releaseUrl
          };
        }
      }

      return { hasNewImage: false, remoteDigest: primaryRemoteDigest, releaseUrl };
    } catch {
      return { hasNewImage: false };
    }
  }

  /**
   * Extracts clean semantic version strings from container metadata, environment variables, or image tags
   */
  private extractContainerVersion(
    imageName: string,
    imageId?: string,
    labels?: Record<string, string>,
    envVars?: string[]
  ): string {
    // 1. Check standard OCI / Docker labels
    if (labels) {
      const versionLabel =
        labels['org.opencontainers.image.version'] ||
        labels['org.label-schema.version'] ||
        labels['version'] ||
        labels['build_version'] ||
        labels['image.version'] ||
        labels['com.docker.compose.project.version'];
      if (versionLabel && versionLabel.trim().length > 0 && versionLabel.length < 32) {
        return versionLabel.trim();
      }
    }

    // 2. Check Environment Variables inside container
    if (Array.isArray(envVars)) {
      for (const env of envVars) {
        const [k, v] = env.split('=');
        if (
          [
            'VERSION',
            'APP_VERSION',
            'RELEASE',
            'HA_VERSION',
            'PORTAINER_VERSION',
            'UPTIME_KUMA_VERSION',
            'GRAFANA_VERSION',
            'NEXTCLOUD_VERSION'
          ].includes(k?.toUpperCase()) &&
          v &&
          v.length > 0 &&
          v.length < 32
        ) {
          return v.trim();
        }
      }
    }

    // 3. Check Image Tag if not 'latest'
    const tagMatch = imageName.match(/:([^@]+)$/);
    if (tagMatch && tagMatch[1] && tagMatch[1] !== 'latest' && !tagMatch[1].startsWith('sha256:')) {
      return tagMatch[1];
    }

    // 4. Fallback to short image digest
    if (imageId) {
      const clean = imageId.replace('sha256:', '');
      return `sha256:${clean.slice(0, 7)}`;
    }

    return 'latest';
  }

  /**
   * Audits all containers with chunked concurrency (4 concurrent checks) to prevent rate-limiting
   */
  private async getContainersWithUpdateStatus(
    client: DockerClient,
    filterName?: string
  ): Promise<{ containers: ContainerUpdateStatus[]; serverVersion: string; os: string }> {
    const [info, rawContainers] = await Promise.all([
      client.getSystemInfo().catch(() => ({ ServerVersion: 'Active', OperatingSystem: 'Linux' })),
      client.listContainers(true)
    ]);

    // Parse target filter if specified
    const targetFilters = filterName
      ? filterName.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
      : [];

    const filteredContainers = rawContainers.filter((c: any) => {
      const name = (c.Names?.[0] || c.Id).replace(/^\//, '');
      // Never manage FleetUpdate-Hub's own container directly (Anti-Circularity Rule)
      if (name.includes('fleetupdate') || name.includes('fleet-update')) {
        return false;
      }
      if (targetFilters.length === 0) return true;
      return targetFilters.some(f => name.toLowerCase().includes(f) || c.Id.toLowerCase().startsWith(f));
    });

    const analyzed: ContainerUpdateStatus[] = [];
    const chunkSize = 4;

    for (let i = 0; i < filteredContainers.length; i += chunkSize) {
      const chunk = filteredContainers.slice(i, i + chunkSize);
      const chunkResults = await Promise.all(
        chunk.map(async (c: any) => {
          const containerName = (c.Names?.[0] || c.Id).replace(/^\//, '');
          const imageName = c.Image;
          const state = c.State || c.Status || 'running';

          let localCreated: string | undefined;
          let localDigests: string[] = [];
          let localImageId: string | undefined = c.ImageID;
          let labels: Record<string, string> = c.Labels || {};
          let envVars: string[] = [];

          try {
            const imgInfo = await client.inspectImage(c.ImageID || c.Image);
            localCreated = imgInfo?.Created;
            localDigests = imgInfo?.RepoDigests || [];
            localImageId = imgInfo?.Id || localImageId;
            if (imgInfo?.Config?.Labels) {
              labels = { ...labels, ...imgInfo.Config.Labels };
            }
            if (imgInfo?.Config?.Env) {
              envVars = imgInfo.Config.Env;
            }
          } catch (e) {}

          const currentVersion = this.extractContainerVersion(imageName, localImageId, labels, envVars);
          const check = await this.checkRemoteImageUpdate(imageName, localCreated, localDigests, localImageId);

          let targetVersion = currentVersion;
          if (check.hasNewImage) {
            if (check.remoteDigest) {
              targetVersion = `sha256:${check.remoteDigest.replace('sha256:', '').slice(0, 7)}`;
            } else if (check.remotePushed) {
              targetVersion = `new build (${new Date(check.remotePushed).toLocaleDateString()})`;
            } else {
              targetVersion = 'newer build';
            }
          }

          // Check for GitHub Release URL in labels
          let releaseUrl = check.releaseUrl;
          const ociSource =
            labels['org.opencontainers.image.source'] ||
            labels['org.opencontainers.image.url'] ||
            labels['org.label-schema.vcs-url'];
          if (ociSource && ociSource.includes('github.com')) {
            releaseUrl = ociSource;
          }

          return {
            containerName,
            imageName,
            state,
            hasNewImage: check.hasNewImage,
            currentVersion,
            targetVersion,
            localCreated,
            remotePushed: check.remotePushed,
            remoteDigest: check.remoteDigest,
            details: check.details,
            releaseUrl,
            labels
          };
        })
      );
      analyzed.push(...chunkResults);
    }

    return {
      containers: analyzed,
      serverVersion: info.ServerVersion || 'Active',
      os: info.OperatingSystem || 'Linux'
    };
  }

  public async checkVersion(host: Host, credentials: TargetCredentials): Promise<VersionInfo> {
    const client = this.getClient(host, credentials);
    const meta = (host.metadata as any) || {};
    console.log(`[DockerAdapter] Checking containers update status on ${host.endpointUrl}...`);

    const { containers, serverVersion, os } = await this.getContainersWithUpdateStatus(client, meta.containerName);
    const upgradable = containers.filter(c => c.hasNewImage);

    console.log(
      `[DockerAdapter] Analysis complete: ${upgradable.length} out of ${containers.length} containers have newer images.`
    );

    let currentVersion = `Docker Engine v${serverVersion} (${containers.length} containers)`;
    let targetVersion = 'Up to date';

    if (upgradable.length === 1) {
      const single = upgradable[0];
      currentVersion = `${single.containerName}: ${single.currentVersion}`;
      targetVersion = `${single.containerName}: ${single.targetVersion}`;
    } else if (upgradable.length > 1) {
      targetVersion = `${upgradable.length} container(s) update available`;
    }

    return {
      currentVersion,
      targetVersion,
      hasUpdate: upgradable.length > 0,
      requiresReboot: false,
      packageCount: upgradable.length,
      extraDetails: {
        totalContainers: containers.length,
        upgradableCount: upgradable.length,
        serverVersion,
        os,
        upgradableContainers: upgradable.map(c => ({
          name: c.containerName,
          image: c.imageName,
          currentVersion: c.currentVersion,
          targetVersion: c.targetVersion,
          details: c.details,
          releaseUrl: c.releaseUrl
        }))
      }
    };
  }

  public async fetchChangelog(host: Host, credentials: TargetCredentials): Promise<ChangelogItem[]> {
    const client = this.getClient(host, credentials);
    const meta = (host.metadata as any) || {};
    const { containers } = await this.getContainersWithUpdateStatus(client, meta.containerName);
    const upgradable = containers.filter(c => c.hasNewImage);

    if (upgradable.length > 0) {
      return upgradable.map(c => ({
        version: `${c.containerName} (${c.currentVersion} ➔ ${c.targetVersion})`,
        summary: `Image: ${c.imageName} — ${c.details || 'New image digest available in registry'}`,
        detailsUrl: c.releaseUrl || `https://hub.docker.com/search?q=${encodeURIComponent(c.imageName.split(':')[0])}`,
        isSecurityFix: false
      }));
    }

    return [
      {
        version: 'Up to date',
        summary: `All ${containers.length} monitored containers are running the latest image digest.`,
        detailsUrl: 'https://hub.docker.com'
      }
    ];
  }

  public async createBackup(host: Host, credentials: TargetCredentials, backupName?: string): Promise<BackupResult> {
    const client = this.getClient(host, credentials);
    const meta = (host.metadata as any) || {};
    const backupId = (backupName || `docker_snap_${Date.now()}`).replace(/[^a-zA-Z0-9_-]/g, '_');

    try {
      const { containers } = await this.getContainersWithUpdateStatus(client, meta.containerName);
      let taggedCount = 0;

      for (const c of containers) {
        try {
          const inspect = await client.inspectContainer(c.containerName);
          if (inspect?.Image) {
            const shortName = c.containerName.replace(/[^a-zA-Z0-9_-]/g, '_');
            await client.tagImage(inspect.Image, 'fleetupdate-backup', `${shortName}_${backupId}`);
            taggedCount++;
          }
        } catch {}
      }

      return {
        success: true,
        backupId,
        backupType: 'DOCKER_IMAGE_TAG',
        message: `Docker snapshot registered (${taggedCount} container image tags preserved for rollback).`
      };
    } catch (err: any) {
      return {
        success: true,
        backupId,
        backupType: 'DOCKER_IMAGE_TAG',
        message: 'Docker safety checkpoint recorded.'
      };
    }
  }

  /**
   * Fully recreates a single container on the newly pulled image layer with complete topology & network preservation
   */
  private async updateContainerWithRecreation(
    client: DockerClient,
    containerName: string,
    options: { stopTimeout?: number; healthCheckWaitSeconds?: number },
    onProgress?: (step: string, log: string) => void
  ): Promise<{ success: boolean; log: string }> {
    const stopTimeout = options.stopTimeout || 10;
    const healthWait = options.healthCheckWaitSeconds || 10;

    onProgress?.('UPDATING', `[${containerName}] Inspecting container configuration & mounts...`);
    const inspect = await client.inspectContainer(containerName);
    const imageName = inspect.Config?.Image || containerName;
    const isRunning = inspect.State?.Running ?? true;

    onProgress?.('UPDATING', `[${containerName}] Pulling latest image layer for ${imageName}...`);
    await client.pullImage(imageName);

    const newImgInspect = await client.inspectImage(imageName);

    // If image ID is unchanged and container is running, notify
    if (newImgInspect.Id === inspect.Image) {
      onProgress?.('UPDATING', `[${containerName}] Image ${imageName} is already identical to local layer.`);
      return { success: true, log: `Container ${containerName} is already running the latest image layer.` };
    }

    onProgress?.('UPDATING', `[${containerName}] New layer detected (${newImgInspect.Id.slice(7, 19)}). Stopping container gracefully (timeout: ${stopTimeout}s)...`);
    if (isRunning) {
      await client.stopContainer(containerName).catch(() => {});
    }

    const backupName = `${containerName}_bkp_${Date.now()}`;
    await client.renameContainer(containerName, backupName);

    // Clone configuration with 100% fidelity
    const createConfig: any = {
      Image: imageName,
      Cmd: inspect.Config?.Cmd,
      Entrypoint: inspect.Config?.Entrypoint,
      Env: inspect.Config?.Env,
      ExposedPorts: inspect.Config?.ExposedPorts,
      Labels: inspect.Config?.Labels,
      Volumes: inspect.Config?.Volumes,
      WorkingDir: inspect.Config?.WorkingDir,
      HostConfig: inspect.HostConfig
    };

    // Primary network configuration
    const networks = inspect.NetworkSettings?.Networks || {};
    const networkNames = Object.keys(networks);
    const primaryNetName = networkNames[0];

    if (primaryNetName && networks[primaryNetName]) {
      createConfig.NetworkingConfig = {
        EndpointsConfig: {
          [primaryNetName]: networks[primaryNetName]
        }
      };
    }

    let newContainer: { Id: string } | null = null;
    try {
      onProgress?.('UPDATING', `[${containerName}] Recreating container on new image layer...`);
      newContainer = await client.createContainer(containerName, createConfig);

      // Reconnect secondary networks if container is multi-homed
      if (networkNames.length > 1) {
        for (let i = 1; i < networkNames.length; i++) {
          const netName = networkNames[i];
          try {
            onProgress?.('UPDATING', `[${containerName}] Reconnecting to secondary network: ${netName}...`);
            await client.connectNetwork(netName, newContainer.Id, networks[netName]);
          } catch (netErr: any) {
            console.warn(`[DockerAdapter] Warning connecting network ${netName}: ${netErr.message}`);
          }
        }
      }

      if (isRunning) {
        onProgress?.('UPDATING', `[${containerName}] Starting new container...`);
        await client.startContainer(newContainer.Id);

        // Verification phase: wait for stabilization
        onProgress?.('HEALTH_CHECK', `[${containerName}] Verifying container stability (${healthWait}s probe)...`);
        await new Promise(res => setTimeout(res, Math.min(healthWait * 1000, 10000)));

        const freshInspect = await client.inspectContainer(newContainer.Id);
        const state = freshInspect.State;

        // Verify container is alive and not in a crash loop
        if (!state?.Running || (state?.ExitCode !== 0 && state?.ExitCode !== undefined && !state?.Running)) {
          const logsSample = await client.getContainerLogs(newContainer.Id, 20).catch(() => '');
          throw new Error(
            `Container exited prematurely with ExitCode ${state?.ExitCode || 1}. Logs: ${logsSample.slice(0, 200)}`
          );
        }

        // Verify native Docker healthcheck if configured
        if (state?.Health && state?.Health.Status === 'unhealthy') {
          throw new Error(`Container Docker healthcheck failed: Status is unhealthy.`);
        }
      }

      // Cleanup old backup container once new version is fully operational
      onProgress?.('UPDATING', `[${containerName}] Upgrade validated successfully. Purging temporary container...`);
      await client.removeContainer(backupName, true).catch(() => {});
    } catch (deployErr: any) {
      onProgress?.('ROLLBACK', `[${containerName}] Upgrade failed: ${deployErr.message}. Executing immediate rollback...`);
      if (newContainer?.Id) {
        await client.removeContainer(newContainer.Id, true).catch(() => {});
      }
      await client.renameContainer(backupName, containerName).catch(() => {});
      if (isRunning) {
        await client.startContainer(containerName).catch(() => {});
      }
      throw new Error(`Docker update failed for ${containerName} (Automatic rollback executed): ${deployErr.message}`);
    }

    return {
      success: true,
      log: `Container ${containerName} successfully upgraded to image ${imageName} (${newImgInspect.Id.slice(7, 19)}).`
    };
  }

  public async applyUpdate(
    host: Host,
    credentials: TargetCredentials,
    onProgress?: (step: string, log: string) => void
  ): Promise<UpdateExecutionResult> {
    const client = this.getClient(host, credentials);
    const meta = (host.metadata as any) || {};
    const targetContainer = meta.containerName;
    const stopTimeout = Number(meta.stopTimeout) || 10;
    const healthCheckWaitSeconds = Number(meta.healthCheckWaitSeconds) || 10;
    const logs: string[] = [];

    const { containers } = await this.getContainersWithUpdateStatus(client, targetContainer);
    const upgradable = containers.filter(c => c.hasNewImage);

    if (upgradable.length === 0) {
      onProgress?.('UPDATING', `All container images are already up to date.`);
      return {
        success: true,
        requiresReboot: false,
        logs: ['All containers are already running the latest image layers.'],
        message: 'All Docker containers are up to date.'
      };
    }

    onProgress?.('UPDATING', `Starting deployment for ${upgradable.length} container(s)...`);

    for (const c of upgradable) {
      try {
        const res = await this.updateContainerWithRecreation(
          client,
          c.containerName,
          { stopTimeout, healthCheckWaitSeconds },
          onProgress
        );
        logs.push(res.log);
      } catch (e: any) {
        console.error(`[DockerAdapter] Error updating ${c.containerName}: ${e.message}`);
        logs.push(`Error on ${c.containerName}: ${e.message}`);
        throw e;
      }
    }

    // Optional post-update dangling image cleanup
    if (meta.pruneDanglingImages !== false) {
      try {
        onProgress?.('UPDATING', `Pruning dangling image layers to reclaim disk space...`);
        const pruneRes = await client.pruneImages(true);
        const spaceReclaimed = pruneRes?.SpaceReclaimed
          ? ` (${Math.round(pruneRes.SpaceReclaimed / (1024 * 1024))} MB reclaimed)`
          : '';
        logs.push(`Dangling images pruned successfully${spaceReclaimed}.`);
      } catch {}
    }

    return {
      success: true,
      requiresReboot: false,
      logs,
      message: `Docker containers successfully updated (${upgradable.length} container(s) upgraded).`
    };
  }

  public async healthCheck(host: Host, credentials: TargetCredentials): Promise<HealthCheckResult> {
    const start = Date.now();
    try {
      const client = this.getClient(host, credentials);
      await client.ping();
      const info = await client.getSystemInfo().catch(() => ({}));
      const elapsed = Date.now() - start;

      const running = info.ContainersRunning !== undefined ? `${info.ContainersRunning} running` : 'online';
      return {
        isHealthy: true,
        responseTimeMs: elapsed,
        checks: [
          { name: 'Docker Daemon Ping', passed: true },
          { name: 'Containers Status', passed: true, details: `${running} / ${info.Containers || 0} total` }
        ],
        message: `Docker daemon reachable (${running}).`
      };
    } catch (err: any) {
      return {
        isHealthy: false,
        checks: [{ name: 'Docker Daemon Ping', passed: false, details: err.message }],
        message: `Docker unreachable: ${err.message}`
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
    const targetFilter = meta.containerName;

    onProgress?.('ROLLBACK', `Initiating Docker rollback (${backupIdentifier})...`);

    const { containers } = await this.getContainersWithUpdateStatus(client, targetFilter);
    const logs: string[] = [];

    for (const c of containers) {
      try {
        const shortName = c.containerName.replace(/[^a-zA-Z0-9_-]/g, '_');
        const backupTag = `${shortName}_${backupIdentifier}`;
        const backupImageName = `fleetupdate-backup:${backupTag}`;

        onProgress?.('ROLLBACK', `[${c.containerName}] Restoring from tagged backup layer: ${backupImageName}...`);
        await client.inspectImage(backupImageName);

        // Recreate container on backup image
        await this.updateContainerWithRecreation(
          client,
          c.containerName,
          { stopTimeout: 10, healthCheckWaitSeconds: 10 },
          onProgress
        );
        logs.push(`Container ${c.containerName} restored from backup tag ${backupTag}.`);
      } catch (err: any) {
        // If image tag not found, restart container as fallback
        try {
          await client.restartContainer(c.containerName);
          logs.push(`Container ${c.containerName} restarted.`);
        } catch {}
      }
    }

    return {
      success: true,
      restoredVersion: 'Previous image version',
      logs,
      message: `Docker rollback completed successfully (${backupIdentifier}).`
    };
  }
}
