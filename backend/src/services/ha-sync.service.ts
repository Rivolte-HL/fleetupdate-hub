import { Host, HostType } from '@prisma/client';
import { prisma } from '../core/prisma.client.js';
import { NotificationService } from '../core/notification.service.js';
import { HomeAssistantClient } from '../adapters/home-assistant/home-assistant.client.js';
import { UpdatesService } from './updates.service.js';
import { Logger } from '../core/logger.js';

const logger = new Logger('HaSyncService');

export class HomeAssistantSyncService {
  private static instance: HomeAssistantSyncService;
  private watcherTimer: NodeJS.Timeout | null = null;
  private isPolling: boolean = false;
  private cooldowns: Map<string, number> = new Map(); // hostId -> timestamp ms
  private mockConn: { client: HomeAssistantClient; config: any } | null = null;

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
   * Publishes or updates the state of a single host in Home Assistant
   */
  public async syncHostState(host: Host): Promise<void> {
    const conn = await this.getClient();
    if (!conn) return;

    const { client } = conn;
    const slug = this.slugify(host.name);
    const updateEntityId = `update.fleetupdate_${slug}`;
    const triggerEntityId = `input_boolean.fleetupdate_update_${slug}`;

    const hasUpdate = (host.availableUpdatesCount || 0) > 0;
    const icon = this.getIconForType(host.adapterType);

    try {
      // 1. Native Home Assistant Update Entity
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
        icon,
        fleetupdate_host_id: host.id,
        adapter_type: host.adapterType,
        is_online: host.isOnline,
        last_check: host.lastCheckAt ? host.lastCheckAt.toISOString() : null
      });

      // 2. Actionable Trigger Helper Entity
      await client.setEntityState(triggerEntityId, 'off', {
        friendly_name: `Mettre à jour ${host.name}`,
        icon: 'mdi:update',
        fleetupdate_host_id: host.id,
        adapter_type: host.adapterType
      });

      logger.info(`Synchronized entities in Home Assistant for ${host.name} (${updateEntityId})`);
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
      logger.info(`Publishing ${hosts.length} hosts to Home Assistant state machine...`);

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
    const triggerEntityId = `input_boolean.fleetupdate_update_${slug}`;

    try {
      await client.removeEntityState(updateEntityId).catch(() => {});
      await client.removeEntityState(triggerEntityId).catch(() => {});
      logger.info(`Removed entities ${updateEntityId} & ${triggerEntityId} from Home Assistant`);
    } catch (err: any) {
      logger.warn(`Could not remove entities for ${host.name} from Home Assistant: ${err.message}`);
    }
  }

  /**
   * Starts the outbound-only polling loop to observe trigger entity state changes in Home Assistant
   */
  public startWatcher(customIntervalMs?: number): void {
    if (this.watcherTimer) return;

    const intervalMs = customIntervalMs || 10000;
    logger.info(`🛡️ Zero-Trust Home Assistant Outbound Watcher started (Interval: ${intervalMs / 1000}s, Inbound ports: 0)`);

    this.watcherTimer = setInterval(async () => {
      await this.pollOnce();
    }, intervalMs);
    if (this.watcherTimer.unref) {
      this.watcherTimer.unref();
    }
  }

  /**
   * Stops the outbound polling watcher
   */
  public stopWatcher(): void {
    if (this.watcherTimer) {
      clearInterval(this.watcherTimer);
      this.watcherTimer = null;
      logger.info('Home Assistant Outbound Watcher stopped.');
    }
  }

  /**
   * Single outbound polling cycle with strict zero-trust validation
   */
  public async pollOnce(): Promise<void> {
    if (this.isPolling) return;
    this.isPolling = true;

    try {
      const conn = await this.getClient();
      if (!conn) return;

      const { client, config: haConfig } = conn;
      const states = await client.getStates().catch(() => []);

      // Filter all active trigger entities (switched to 'on')
      const activeTriggers = states.filter(
        s => s.entity_id &&
          s.entity_id.startsWith('input_boolean.fleetupdate_update_') &&
          (s.state === 'on' || s.state === 'true')
      );

      for (const trigger of activeTriggers) {
        const entityId = trigger.entity_id;
        const hostId = trigger.attributes?.fleetupdate_host_id;

        // 1. IMMEDIATE RESET to 'off' in Home Assistant regardless of outcome
        await client.setEntityState(entityId, 'off', trigger.attributes).catch(() => {});

        if (!hostId) {
          logger.warn(`[Security Guard] Trigger ignored on ${entityId}: missing fleetupdate_host_id attribute.`);
          continue;
        }

        // 2. SECURITY GUARD 1: Check Arming Switch (allowHaTrigger)
        const isArmed = haConfig.allowHaTrigger === true;
        if (!isArmed) {
          logger.warn(
            `[Security Guard] Trigger ignored for host ${hostId} on ${entityId}: ` +
            `HA Trigger mode is DISARMED in FleetUpdate-Hub. Entity reset to off. Zero action taken.`
          );
          continue;
        }

        // 3. SECURITY GUARD 2: Verify Host existence in DB
        const host = await prisma.host.findUnique({ where: { id: hostId } });
        if (!host) {
          logger.warn(`[Security Guard] Trigger ignored: Host ID "${hostId}" does not exist in FleetUpdate database.`);
          continue;
        }

        if (!host.isOnline) {
          logger.warn(`[Security Guard] Trigger ignored for ${host.name}: Host is currently marked offline.`);
          continue;
        }

        // 4. SECURITY GUARD 3: Verify that an update is actually pending
        if ((host.availableUpdatesCount || 0) <= 0) {
          logger.warn(
            `[Security Guard] Trigger ignored for ${host.name}: No pending update found in database. ` +
            `Button click neutralized.`
          );
          continue;
        }

        // 5. SECURITY GUARD 4: Anti-Flapping & Rate Limiting (15 min cooldown)
        const COOLDOWN_MS = 15 * 60 * 1000;
        const lastTrigger = this.cooldowns.get(hostId);
        if (lastTrigger && (Date.now() - lastTrigger) < COOLDOWN_MS) {
          const remainingMins = Math.ceil((COOLDOWN_MS - (Date.now() - lastTrigger)) / 60000);
          logger.warn(
            `[Security Guard] Trigger ignored for ${host.name}: Cooldown active (${remainingMins}m remaining).`
          );
          continue;
        }

        // Record trigger timestamp
        this.cooldowns.set(hostId, Date.now());

        // Update Home Assistant entity to show update in progress
        const slug = this.slugify(host.name);
        const updateEntityId = `update.fleetupdate_${slug}`;
        await client.setEntityState(updateEntityId, 'on', {
          ...trigger.attributes,
          in_progress: true,
          release_summary: 'Mise à jour en cours d’exécution par le pipeline sécurisé FleetUpdate...'
        }).catch(() => {});

        logger.info(`🚀 [Zero-Trust Verified] Launching update pipeline for ${host.name} triggered from Home Assistant...`);

        // Execute deterministic update pipeline via UpdatesService
        UpdatesService.triggerUpdate({
          hostId: host.id,
          autoRollback: true,
          triggeredByEmail: 'Home Assistant (Air-Gap Watcher)'
        })
          .then(async (res) => {
            logger.info(`Update pipeline triggered for ${host.name} (Task ID: ${res.task.id})`);
            const refreshedHost = await prisma.host.findUnique({ where: { id: host.id } });
            if (refreshedHost) {
              await this.syncHostState(refreshedHost);
            }
          })
          .catch(async (err: any) => {
            logger.error(`Update pipeline failed for ${host.name}`, { error: err.message });
            const refreshedHost = await prisma.host.findUnique({ where: { id: host.id } });
            if (refreshedHost) {
              await this.syncHostState(refreshedHost);
            }
          });
      }
    } catch (err: any) {
      logger.warn(`Error during Home Assistant polling cycle: ${err.message}`);
    } finally {
      this.isPolling = false;
    }
  }
}
