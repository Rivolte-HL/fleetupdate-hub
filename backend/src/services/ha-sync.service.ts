import { Host, HostType } from '@prisma/client';
import WebSocket from 'ws';
import { prisma } from '../core/prisma.client.js';
import { NotificationService } from '../core/notification.service.js';
import { HomeAssistantClient } from '../adapters/home-assistant/home-assistant.client.js';
import { UpdatesService } from './updates.service.js';
import { Logger } from '../core/logger.js';

const logger = new Logger('HaSyncService');

/**
 * Home Assistant Update Entity Feature Flags (mirrors HA core UpdateEntityFeature)
 * SUPPORT_INSTALL = 1 (Affiche le bouton natif 'Installer' / 'Mettre à jour')
 * SUPPORT_SPECIFIC_VERSION = 2
 * SUPPORT_PROGRESS = 4 (Affiche la barre de progression en temps réel)
 * SUPPORT_BACKUP = 8 (Affiche l'option 'Créer une sauvegarde avant l'installation')
 * SUPPORT_RELEASE_NOTES = 16 (Affiche le changelog)
 */
const HA_UPDATE_FEATURES = 1 | 4 | 8; // 13: Install + Progress + Backup

export class HomeAssistantSyncService {
  private static instance: HomeAssistantSyncService;
  private watcherTimer: NodeJS.Timeout | null = null;
  private isPolling: boolean = false;
  private cooldowns: Map<string, number> = new Map(); // hostId -> timestamp ms
  private mockConn: { client: HomeAssistantClient; config: any } | null = null;
  private wsClient: WebSocket | null = null;
  private wsReconnectTimer: NodeJS.Timeout | null = null;

  public static getInstance(): HomeAssistantSyncService {
    if (!HomeAssistantSyncService.instance) {
      HomeAssistantSyncService.instance = new HomeAssistantSyncService();
    }
    return HomeAssistantSyncService.instance;
  }

  /**
   * For unit testing: allows injecting a mock client & configuration
   */
  public setMockConnection(mock: { client: HomeAssistantClient; config: any } | null): void {
    this.mockConn = mock;
  }

  /**
   * Helper to generate clean, normalized Home Assistant entity slugs
   */
  public slugify(name: string): string {
    return name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'unnamed';
  }

  /**
   * Resolves the real brand logo (entity_picture) and fallback MDI icon for a host
   * by analyzing adapterType, hostname, and service signatures.
   */
  public getVisualsForHost(host: Host): { icon: string; entityPicture: string } {
    const nameLower = (host.name || '').toLowerCase();
    const type = host.adapterType;

    // 1. Proxmox Backup Server (PBS)
    if (
      type === HostType.PROXMOX_BACKUP_SERVER ||
      nameLower.includes('backup server') ||
      nameLower.includes('backup serveur') ||
      nameLower.includes('pbs')
    ) {
      return {
        icon: 'mdi:shield-sync',
        entityPicture: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/proxmox-backup-server.png'
      };
    }

    // 2. Proxmox VE (PVE)
    if (
      type === HostType.PROXMOX ||
      nameLower.includes('proxmox') ||
      nameLower.includes('pve')
    ) {
      return {
        icon: 'mdi:server',
        entityPicture: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/proxmox.png'
      };
    }

    // 3. TrueNAS
    if (
      type === HostType.TRUENAS ||
      nameLower.includes('truenas') ||
      nameLower.includes('freenas')
    ) {
      return {
        icon: 'mdi:nas',
        entityPicture: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/truenas.png'
      };
    }

    // 4. OPNsense Firewall
    if (
      type === HostType.OPNSENSE ||
      nameLower.includes('opnsense')
    ) {
      return {
        icon: 'mdi:security-network',
        entityPicture: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/opnsense.png'
      };
    }

    // 5. pfSense Firewall
    if (nameLower.includes('pfsense')) {
      return {
        icon: 'mdi:security-network',
        entityPicture: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/pfsense.png'
      };
    }

    // 6. Docker & Container Platforms
    if (
      type === HostType.DOCKER ||
      nameLower.includes('docker')
    ) {
      return {
        icon: 'mdi:docker',
        entityPicture: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/docker.png'
      };
    }

    if (nameLower.includes('portainer')) {
      return {
        icon: 'mdi:docker',
        entityPicture: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/portainer.png'
      };
    }

    // 7. Home Assistant
    if (
      type === HostType.HOME_ASSISTANT ||
      nameLower.includes('home assistant') ||
      nameLower.includes('homeassistant') ||
      nameLower.includes('hass')
    ) {
      return {
        icon: 'mdi:home-assistant',
        entityPicture: 'https://brands.home-assistant.io/_/homeassistant/icon.png'
      };
    }

    // 8. Ollama AI Engine
    if (nameLower.includes('ollama')) {
      return {
        icon: 'mdi:robot',
        entityPicture: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/ollama.png'
      };
    }

    // 9. UniFi / Ubiquiti
    if (nameLower.includes('unifi') || nameLower.includes('ubiquiti')) {
      return {
        icon: 'mdi:ubiquiti',
        entityPicture: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/unifi.png'
      };
    }

    // 10. Downloads & Media Managers (qBittorrent, Transmission, etc.)
    if (
      nameLower.includes('téléchargement') ||
      nameLower.includes('telechargement') ||
      nameLower.includes('download') ||
      nameLower.includes('torrent') ||
      nameLower.includes('qbittorrent')
    ) {
      return {
        icon: 'mdi:download-network',
        entityPicture: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/qbittorrent.png'
      };
    }
    if (nameLower.includes('transmission')) {
      return {
        icon: 'mdi:download-network',
        entityPicture: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/transmission.png'
      };
    }

    // 11. AdBlock & DNS
    if (nameLower.includes('pihole') || nameLower.includes('pi-hole')) {
      return {
        icon: 'mdi:pi-hole',
        entityPicture: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/pi-hole.png'
      };
    }
    if (nameLower.includes('adguard')) {
      return {
        icon: 'mdi:shield-check',
        entityPicture: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/adguard-home.png'
      };
    }

    // 12. Media Streaming (Plex, Jellyfin)
    if (nameLower.includes('plex')) {
      return {
        icon: 'mdi:plex',
        entityPicture: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/plex.png'
      };
    }
    if (nameLower.includes('jellyfin')) {
      return {
        icon: 'mdi:filmstrip',
        entityPicture: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/jellyfin.png'
      };
    }

    // 13. Cloud & Storage
    if (nameLower.includes('nextcloud')) {
      return {
        icon: 'mdi:cloud',
        entityPicture: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/nextcloud.png'
      };
    }
    if (nameLower.includes('synology')) {
      return {
        icon: 'mdi:nas',
        entityPicture: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/synology.png'
      };
    }

    // 14. Reverse Proxy & Networking
    if (nameLower.includes('nginx') || nameLower.includes('npm')) {
      return {
        icon: 'mdi:server-network',
        entityPicture: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/nginx-proxy-manager.png'
      };
    }
    if (nameLower.includes('traefik')) {
      return {
        icon: 'mdi:server-network',
        entityPicture: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/traefik.png'
      };
    }
    if (nameLower.includes('wireguard')) {
      return {
        icon: 'mdi:vpn',
        entityPicture: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/wireguard.png'
      };
    }
    if (nameLower.includes('tailscale')) {
      return {
        icon: 'mdi:vpn',
        entityPicture: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/tailscale.png'
      };
    }

    // 15. Linux distributions
    if (nameLower.includes('ubuntu')) {
      return {
        icon: 'mdi:ubuntu',
        entityPicture: 'https://brands.home-assistant.io/_/ubuntu/icon.png'
      };
    }
    if (nameLower.includes('debian') || nameLower.includes('dmz') || nameLower.includes('linux')) {
      return {
        icon: 'mdi:debian',
        entityPicture: 'https://brands.home-assistant.io/_/debian/icon.png'
      };
    }

    // Default Linux / Server fallback
    return {
      icon: 'mdi:server-network',
      entityPicture: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/linux.png'
    };
  }

  /**
   * Resolves appropriate MDI icon based on host type
   */
  private getIconForType(type: HostType): string {
    switch (type) {
      case HostType.PROXMOX:
      case HostType.PROXMOX_BACKUP_SERVER:
        return 'mdi:server';
      case HostType.TRUENAS:
        return 'mdi:nas';
      case HostType.OPNSENSE:
        return 'mdi:shield-check';
      case HostType.DOCKER:
        return 'mdi:docker';
      case HostType.LINUX_SSH:
        return 'mdi:linux';
      case HostType.HOME_ASSISTANT:
        return 'mdi:home-assistant';
      default:
        return 'mdi:server-network';
    }
  }

  /**
   * Obtains an authenticated HomeAssistantClient instance if configured & enabled
   */
  private async getClient(): Promise<{ client: HomeAssistantClient; config: any } | null> {
    if (this.mockConn !== null) {
      return this.mockConn;
    }

    try {
      const notifConfig = await NotificationService.getConfigAsync();
      const ha = notifConfig?.homeAssistant;

      if (!ha || !ha.enabled || !ha.url || !ha.token) {
        return null;
      }

      if (ha.syncEntitiesEnabled === false) {
        return null;
      }

      const client = new HomeAssistantClient({
        baseUrl: ha.url,
        accessToken: ha.token,
        timeoutMs: 8000
      });

      return { client, config: ha };
    } catch (err: any) {
      logger.warn(`Failed to resolve Home Assistant configuration: ${err.message}`);
      return null;
    }
  }

  /**
   * Publishes or updates the state of a single host in Home Assistant as a 100% native UpdateEntity
   */
  public async syncHostState(host: Host): Promise<void> {
    const conn = await this.getClient();
    if (!conn) return;

    const { client } = conn;
    const slug = this.slugify(host.name);
    const updateEntityId = `update.fleetupdate_${slug}`;
    const legacyTriggerId = `input_boolean.fleetupdate_update_${slug}`;

    const hasUpdate = (host.availableUpdatesCount || 0) > 0;
    const visuals = this.getVisualsForHost(host);

    try {
      // 1. Native Home Assistant Update Entity (with SUPPORT_INSTALL & SUPPORT_BACKUP)
      await client.setEntityState(updateEntityId, hasUpdate ? 'on' : 'off', {
        friendly_name: host.name,
        installed_version: host.currentVersion || 'Non détectée',
        latest_version: hasUpdate
          ? (host.targetVersion || 'Mise à jour disponible')
          : (host.currentVersion || 'À jour'),
        title: `${host.name} (${host.adapterType})`,
        release_summary: hasUpdate
          ? `${host.availableUpdatesCount} paquet(s) / composant(s) à mettre à jour`
          : 'Système entièrement à jour',
        in_progress: false,
        auto_update: false,
        supported_features: HA_UPDATE_FEATURES,
        icon: visuals.icon,
        entity_picture: visuals.entityPicture,
        fleetupdate_host_id: host.id,
        adapter_type: host.adapterType,
        is_online: host.isOnline,
        last_check: host.lastCheckAt ? host.lastCheckAt.toISOString() : null
      });

      // 2. Automatically remove legacy input_boolean helper to keep Home Assistant lightweight & clean!
      await client.removeEntityState(legacyTriggerId).catch(() => {});

      logger.info(`Synchronized native update entity in Home Assistant for ${host.name} (${updateEntityId})`);
    } catch (err: any) {
      logger.warn(`Could not sync host ${host.name} to Home Assistant: ${err.message}`);
    }
  }

  /**
   * Synchronizes all hosts currently registered in the database
   */
  public async syncAllHosts(): Promise<void> {
    const conn = await this.getClient();
    if (!conn) return;

    try {
      const hosts = await prisma.host.findMany();
      logger.info(`Publishing ${hosts.length} native update entities to Home Assistant...`);

      for (const host of hosts) {
        await this.syncHostState(host);
      }
    } catch (err: any) {
      logger.error('Error during bulk Home Assistant synchronization', { error: err.message });
    }
  }

  /**
   * Deletes entities from Home Assistant when a host is deleted from FleetUpdate-Hub
   */
  public async deleteHostEntities(host: Host): Promise<void> {
    const conn = await this.getClient();
    if (!conn) return;

    const { client } = conn;
    const slug = this.slugify(host.name);
    const updateEntityId = `update.fleetupdate_${slug}`;
    const legacyTriggerId = `input_boolean.fleetupdate_update_${slug}`;

    try {
      await client.removeEntityState(updateEntityId).catch(() => {});
      await client.removeEntityState(legacyTriggerId).catch(() => {});
      logger.info(`Removed entities for ${host.name} from Home Assistant`);
    } catch (err: any) {
      logger.warn(`Could not remove entities for ${host.name} from Home Assistant: ${err.message}`);
    }
  }

  /**
   * Starts both the Outbound WebSocket Listener (real-time native click interceptor)
   * and the fallback periodic polling watcher.
   */
  public startWatcher(customIntervalMs?: number): void {
    // 1. Start real-time outbound WebSocket listener for native update.install service calls
    this.startWebSocketListener().catch(() => {});

    // 2. Start fallback watcher
    if (this.watcherTimer) return;
    const intervalMs = customIntervalMs || 15000;
    logger.info(`🛡️ Zero-Trust Home Assistant Outbound Watcher active (WebSocket + Fallback: ${intervalMs / 1000}s, Inbound ports: 0)`);

    this.watcherTimer = setInterval(async () => {
      await this.pollOnce();
    }, intervalMs);
    if (this.watcherTimer.unref) {
      this.watcherTimer.unref();
    }
  }

  /**
   * Stops the outbound watcher and closes WebSocket connection
   */
  public stopWatcher(): void {
    if (this.watcherTimer) {
      clearInterval(this.watcherTimer);
      this.watcherTimer = null;
    }
    if (this.wsReconnectTimer) {
      clearTimeout(this.wsReconnectTimer);
      this.wsReconnectTimer = null;
    }
    if (this.wsClient) {
      try {
        this.wsClient.close();
      } catch {}
      this.wsClient = null;
    }
    logger.info('Home Assistant Outbound Watcher & WebSocket stopped.');
  }

  /**
   * Establishes a zero-trust outbound WebSocket connection to Home Assistant
   * to intercept native clicks on the "Mettre à jour" / "Installer" button in real-time.
   */
  public async startWebSocketListener(): Promise<void> {
    const conn = await this.getClient();
    if (!conn) return;
    const { config: haConfig } = conn;

    if (!haConfig.url || !haConfig.token) return;

    if (this.wsClient && (this.wsClient.readyState === WebSocket.OPEN || this.wsClient.readyState === WebSocket.CONNECTING)) {
      return;
    }

    const wsUrl = haConfig.url.replace(/^http/i, 'ws').replace(/\/$/, '') + '/api/websocket';
    logger.info(`🔌 Connecting outbound WebSocket to Home Assistant at ${wsUrl}...`);

    try {
      const ws = new WebSocket(wsUrl);
      this.wsClient = ws;

      ws.on('open', () => {
        logger.info('Home Assistant WebSocket connection opened.');
      });

      ws.on('message', async (data: WebSocket.RawData) => {
        try {
          const msg = JSON.parse(data.toString());
          if (msg.type === 'auth_required') {
            ws.send(JSON.stringify({ type: 'auth', access_token: haConfig.token.trim() }));
          } else if (msg.type === 'auth_ok') {
            logger.info('🛡️ Home Assistant WebSocket Authenticated (Zero-Trust Outbound). Subscribed to native update.install events.');
            ws.send(JSON.stringify({
              id: 1,
              type: 'subscribe_events',
              event_type: 'call_service'
            }));
          } else if (msg.type === 'event') {
            const eventData = msg.event?.data;
            if (eventData?.domain === 'update' && eventData?.service === 'install') {
              const entityId = eventData.service_data?.entity_id;
              if (entityId && typeof entityId === 'string' && entityId.startsWith('update.fleetupdate_')) {
                await this.handleNativeInstallRequest(entityId, eventData.service_data?.backup !== false);
              }
            }
          }
        } catch (err: any) {
          logger.warn(`Error parsing Home Assistant WebSocket message: ${err.message}`);
        }
      });

      ws.on('error', (err: any) => {
        logger.warn(`Home Assistant WebSocket error: ${err.message}`);
      });

      ws.on('close', () => {
        this.wsClient = null;
        if (!this.wsReconnectTimer) {
          this.wsReconnectTimer = setTimeout(() => {
            this.wsReconnectTimer = null;
            this.startWebSocketListener().catch(() => {});
          }, 10000);
          if (this.wsReconnectTimer.unref) this.wsReconnectTimer.unref();
        }
      });
    } catch (err: any) {
      logger.warn(`Failed to initialize Home Assistant WebSocket: ${err.message}`);
    }
  }

  /**
   * Handles a native "Installer" / "Mettre à jour" click from Home Assistant
   */
  public async handleNativeInstallRequest(entityId: string, requestBackup: boolean = true): Promise<void> {
    const conn = await this.getClient();
    if (!conn) return;
    const { client, config: haConfig } = conn;

    logger.info(`⚡ Intercepted native 'update.install' request for ${entityId} (Backup: ${requestBackup})`);

    const hosts = await prisma.host.findMany();
    const host = hosts.find(h => `update.fleetupdate_${this.slugify(h.name)}` === entityId);

    if (!host) {
      logger.warn(`No host found matching Home Assistant entity: ${entityId}`);
      return;
    }

    const isArmed = haConfig.allowHaTrigger !== false;
    if (!isArmed) {
      logger.warn(`[Security Guard] Native install ignored for ${host.name}: allowHaTrigger is explicitly false.`);
      return;
    }

    if (!host.isOnline) {
      logger.warn(`[Security Guard] Native install ignored for ${host.name}: Host is offline.`);
      return;
    }

    // Cooldown check (anti-flapping: 1 min between attempts)
    const COOLDOWN_MS = 60 * 1000;
    const lastTrigger = this.cooldowns.get(host.id);
    if (lastTrigger && (Date.now() - lastTrigger) < COOLDOWN_MS) {
      logger.warn(`[Security Guard] Native install ignored for ${host.name}: Cooldown active.`);
      return;
    }
    this.cooldowns.set(host.id, Date.now());

    // 1. Immediately reflect "in_progress: true" in Home Assistant UI
    const slug = this.slugify(host.name);
    const updateEntityId = `update.fleetupdate_${slug}`;
    const visuals = this.getVisualsForHost(host);

    await client.setEntityState(updateEntityId, 'on', {
      friendly_name: host.name,
      installed_version: host.currentVersion || 'Non détectée',
      latest_version: host.targetVersion || 'Mise à jour disponible',
      title: `${host.name} (${host.adapterType})`,
      release_summary: '🚀 Démarrage du pipeline de mise à jour sécurisé FleetUpdate...',
      in_progress: true,
      update_percentage: 10,
      supported_features: HA_UPDATE_FEATURES,
      icon: visuals.icon,
      entity_picture: visuals.entityPicture,
      fleetupdate_host_id: host.id,
      adapter_type: host.adapterType
    }).catch(() => {});

    // 2. Launch update pipeline
    UpdatesService.triggerUpdate({
      hostId: host.id,
      autoRollback: true,
      triggeredByEmail: 'Home Assistant (Bouton Natif Mettre à jour)'
    })
      .then(async (res) => {
        logger.info(`Update pipeline triggered for ${host.name} (Task ID: ${res.task.id})`);
        this.trackTaskProgress(res.task.id, host, client, updateEntityId, visuals);
      })
      .catch(async (err: any) => {
        logger.error(`Update pipeline failed to start for ${host.name}`, { error: err.message });
        const refreshedHost = await prisma.host.findUnique({ where: { id: host.id } });
        if (refreshedHost) {
          await this.syncHostState(refreshedHost);
        }
      });
  }

  /**
   * Tracks task execution in the background and streams live progress to Home Assistant
   */
  private trackTaskProgress(
    taskId: string,
    host: Host,
    client: HomeAssistantClient,
    updateEntityId: string,
    visuals: { icon: string; entityPicture: string }
  ): void {
    const interval = setInterval(async () => {
      try {
        const task = await prisma.updateTask.findUnique({ where: { id: taskId } });
        if (!task) {
          clearInterval(interval);
          return;
        }

        let percentage = 20;
        let summary = 'Mise à jour en cours...';

        switch (task.status) {
          case 'PRE_FLIGHT':
            percentage = 20;
            summary = 'Vérification pré-vol (Pre-flight)...';
            break;
          case 'BACKUP':
            percentage = 40;
            summary = 'Création du snapshot de sécurité...';
            break;
          case 'UPDATING':
            percentage = 65;
            summary = 'Application des mises à jour...';
            break;
          case 'HEALTH_CHECK':
            percentage = 85;
            summary = 'Vérification de santé (Health Check)...';
            break;
          case 'SUCCESS':
            clearInterval(interval);
            const refreshedHost = await prisma.host.findUnique({ where: { id: host.id } });
            if (refreshedHost) {
              await this.syncHostState(refreshedHost);
            }
            return;
          case 'FAILED':
          case 'ROLLED_BACK':
            clearInterval(interval);
            const failedHost = await prisma.host.findUnique({ where: { id: host.id } });
            if (failedHost) {
              await this.syncHostState(failedHost);
            }
            return;
        }

        await client.setEntityState(updateEntityId, 'on', {
          friendly_name: host.name,
          installed_version: host.currentVersion || 'Non détectée',
          latest_version: host.targetVersion || 'Mise à jour disponible',
          title: `${host.name} (${host.adapterType})`,
          release_summary: summary,
          in_progress: true,
          update_percentage: percentage,
          supported_features: HA_UPDATE_FEATURES,
          icon: visuals.icon,
          entity_picture: visuals.entityPicture,
          fleetupdate_host_id: host.id,
          adapter_type: host.adapterType
        }).catch(() => {});
      } catch (e) {
        clearInterval(interval);
      }
    }, 3000);

    if (interval.unref) interval.unref();
  }

  /**
   * Fallback polling cycle to clean up any legacy entities or handle states
   */
  public async pollOnce(): Promise<void> {
    if (this.isPolling) return;
    this.isPolling = true;

    try {
      const conn = await this.getClient();
      if (!conn) return;

      const { client } = conn;
      const states = await client.getStates().catch(() => []);

      // Filter and cleanly remove any legacy input_boolean helpers if still present in HA
      const legacyTriggers = states.filter(
        s => s.entity_id && s.entity_id.startsWith('input_boolean.fleetupdate_update_')
      );

      for (const trigger of legacyTriggers) {
        await client.removeEntityState(trigger.entity_id).catch(() => {});
      }
    } catch (err: any) {
      logger.warn(`Error during Home Assistant polling cycle: ${err.message}`);
    } finally {
      this.isPolling = false;
    }
  }
}
