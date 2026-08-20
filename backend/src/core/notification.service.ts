import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { config } from '../config/index.js';
import { EncryptionService } from './encryption.service.js';
import { prisma } from './prisma.client.js';

export interface NotificationPayload {
  title: string;
  hostName: string;
  status: 'SUCCESS' | 'FAILED' | 'ROLLED_BACK' | 'WARNING' | 'AVAILABLE';
  details: string;
  previousVersion?: string;
  targetVersion?: string;
  actionable?: boolean;
  upgradableHostsCount?: number;
  dashboardUrl?: string;
}

export interface NotificationConfig {
  enabled: boolean;
  publicUrl?: string; // e.g. "https://update.mydomain.com"
  webhookSecret?: string;
  homeAssistant?: {
    enabled: boolean;
    url: string;
    token: string;
    notifyService?: string; // e.g. "notify.notify", "notify.mobile_app_phone" or "persistent_notification"
    enableActions?: boolean;
    publicUrl?: string;
  };
  nextcloudTalk?: {
    enabled: boolean;
    url: string;
    roomTokenOrWebhook: string; // e.g. "https://nextcloud.domain.com/ocs/v2.php/apps/spreed/api/v1/chat/room123" or room token
    botSecret?: string;
  };
  discord?: {
    enabled: boolean;
    webhookUrl: string;
  };
  telegram?: {
    enabled: boolean;
    botToken: string;
    chatId: string;
  };
  genericWebhook?: {
    enabled: boolean;
    webhookUrl: string;
    customHeaders?: Record<string, string>;
  };
}

const SETTINGS_FILE_PATH = path.join(process.cwd(), 'data', 'notifications.json');
const SETTINGS_DB_KEY = 'NOTIFICATIONS_CONFIG';

export class NotificationService {
  private static cachedConfig: NotificationConfig | null = null;
  private static isInitialized = false;

  /**
   * Loads notification settings asynchronously from the encrypted Database Vault (AES-256-GCM),
   * with automatic transparent migration from legacy data/notifications.json or environment variables.
   */
  public static async getConfigAsync(): Promise<NotificationConfig> {
    if (this.cachedConfig && this.isInitialized) {
      return this.cachedConfig;
    }

    try {
      const dbRecord = await prisma.systemSetting.findUnique({
        where: { key: SETTINGS_DB_KEY }
      });

      if (dbRecord && dbRecord.encryptedPayload) {
        let parsed: Partial<NotificationConfig> = {};
        if (dbRecord.isEncrypted) {
          parsed = EncryptionService.decryptObject<NotificationConfig>(dbRecord.encryptedPayload);
        } else {
          parsed = JSON.parse(dbRecord.encryptedPayload);
        }
        this.cachedConfig = this.buildMergedConfig(parsed);
        this.isInitialized = true;
        return this.cachedConfig;
      }
    } catch (err: any) {
      console.warn(`[NotificationService] Database vault query warning: ${err.message}`);
    }

    // Fallback & Auto-Migration from legacy data/notifications.json if present
    let legacyConfig: Partial<NotificationConfig> = {};
    try {
      if (fs.existsSync(SETTINGS_FILE_PATH)) {
        const raw = fs.readFileSync(SETTINGS_FILE_PATH, 'utf8');
        legacyConfig = JSON.parse(raw);
        console.log(`[NotificationService] 🔐 Found legacy notifications.json, migrating into AES-256-GCM encrypted database vault...`);
      }
    } catch (err: any) {
      console.warn(`[NotificationService] Legacy file read warning: ${err.message}`);
    }

    const merged = this.buildMergedConfig(legacyConfig);
    this.cachedConfig = merged;
    this.isInitialized = true;

    // Persist into database encrypted vault asynchronously
    try {
      await this.saveConfigAsync(merged);
      // Safely cleanup legacy plaintext file once migrated
      if (fs.existsSync(SETTINGS_FILE_PATH)) {
        try {
          fs.unlinkSync(SETTINGS_FILE_PATH);
        } catch {}
      }
    } catch (err: any) {
      console.warn(`[NotificationService] Auto-migration persistence warning: ${err.message}`);
    }

    return this.cachedConfig;
  }

  /**
   * Synchronous config getter with memory caching
   */
  public static getConfig(): NotificationConfig {
    if (this.cachedConfig) {
      return this.cachedConfig;
    }
    // Asynchronously trigger load while returning sensible defaults immediately
    this.getConfigAsync().catch(() => {});
    return this.buildMergedConfig({});
  }

  /**
   * Helper to merge partial configs with defaults and environment variables
   */
  private static buildMergedConfig(loadedConfig: Partial<NotificationConfig>): NotificationConfig {
    return {
      enabled: loadedConfig.enabled ?? true,
      publicUrl: loadedConfig.publicUrl || process.env.APP_URL || process.env.PUBLIC_URL || '',
      webhookSecret: loadedConfig.webhookSecret || process.env.WEBHOOK_SECRET || crypto.randomBytes(24).toString('hex'),
      homeAssistant: {
        enabled: loadedConfig.homeAssistant?.enabled ?? false,
        url: loadedConfig.homeAssistant?.url || process.env.HA_URL || '',
        token: loadedConfig.homeAssistant?.token || process.env.HA_TOKEN || '',
        notifyService: loadedConfig.homeAssistant?.notifyService || 'notify.notify',
        enableActions: loadedConfig.homeAssistant?.enableActions ?? true,
        publicUrl: loadedConfig.homeAssistant?.publicUrl || loadedConfig.publicUrl || ''
      },
      nextcloudTalk: {
        enabled: loadedConfig.nextcloudTalk?.enabled ?? false,
        url: loadedConfig.nextcloudTalk?.url || process.env.NEXTCLOUD_URL || '',
        roomTokenOrWebhook: loadedConfig.nextcloudTalk?.roomTokenOrWebhook || process.env.NEXTCLOUD_TALK_TOKEN || '',
        botSecret: loadedConfig.nextcloudTalk?.botSecret || process.env.NEXTCLOUD_TALK_SECRET || ''
      },
      discord: {
        enabled: loadedConfig.discord?.enabled ?? !!config.discordWebhookUrl,
        webhookUrl: loadedConfig.discord?.webhookUrl || config.discordWebhookUrl || ''
      },
      telegram: {
        enabled: loadedConfig.telegram?.enabled ?? (!!config.telegramBotToken && !!config.telegramChatId),
        botToken: loadedConfig.telegram?.botToken || config.telegramBotToken || '',
        chatId: loadedConfig.telegram?.chatId || config.telegramChatId || ''
      },
      genericWebhook: {
        enabled: loadedConfig.genericWebhook?.enabled ?? false,
        webhookUrl: loadedConfig.genericWebhook?.webhookUrl || '',
        customHeaders: loadedConfig.genericWebhook?.customHeaders || {}
      }
    };
  }

  /**
   * Saves updated notification settings encrypted with AES-256-GCM into the database vault
   */
  public static async saveConfigAsync(newConfig: Partial<NotificationConfig>): Promise<NotificationConfig> {
    const current = await this.getConfigAsync();
    const merged: NotificationConfig = {
      enabled: newConfig.enabled ?? current.enabled,
      publicUrl: newConfig.publicUrl ?? current.publicUrl,
      webhookSecret: newConfig.webhookSecret ?? current.webhookSecret,
      homeAssistant: {
        enabled: newConfig.homeAssistant?.enabled ?? current.homeAssistant?.enabled ?? false,
        url: newConfig.homeAssistant?.url ?? current.homeAssistant?.url ?? '',
        token: newConfig.homeAssistant?.token ?? current.homeAssistant?.token ?? '',
        notifyService: newConfig.homeAssistant?.notifyService ?? current.homeAssistant?.notifyService ?? 'notify.notify',
        enableActions: newConfig.homeAssistant?.enableActions ?? current.homeAssistant?.enableActions ?? true,
        publicUrl: newConfig.homeAssistant?.publicUrl ?? newConfig.publicUrl ?? current.homeAssistant?.publicUrl ?? current.publicUrl ?? ''
      },
      nextcloudTalk: {
        enabled: newConfig.nextcloudTalk?.enabled ?? current.nextcloudTalk?.enabled ?? false,
        url: newConfig.nextcloudTalk?.url ?? current.nextcloudTalk?.url ?? '',
        roomTokenOrWebhook: newConfig.nextcloudTalk?.roomTokenOrWebhook ?? current.nextcloudTalk?.roomTokenOrWebhook ?? '',
        botSecret: newConfig.nextcloudTalk?.botSecret ?? current.nextcloudTalk?.botSecret ?? ''
      },
      discord: {
        enabled: newConfig.discord?.enabled ?? current.discord?.enabled ?? false,
        webhookUrl: newConfig.discord?.webhookUrl ?? current.discord?.webhookUrl ?? ''
      },
      telegram: {
        enabled: newConfig.telegram?.enabled ?? current.telegram?.enabled ?? false,
        botToken: newConfig.telegram?.botToken ?? current.telegram?.botToken ?? '',
        chatId: newConfig.telegram?.chatId ?? current.telegram?.chatId ?? ''
      },
      genericWebhook: {
        enabled: newConfig.genericWebhook?.enabled ?? current.genericWebhook?.enabled ?? false,
        webhookUrl: newConfig.genericWebhook?.webhookUrl ?? current.genericWebhook?.webhookUrl ?? '',
        customHeaders: newConfig.genericWebhook?.customHeaders ?? current.genericWebhook?.customHeaders ?? {}
      }
    };

    // Encrypt the entire configuration with AES-256-GCM
    const encryptedPayload = EncryptionService.encryptObject(merged);

    try {
      await prisma.systemSetting.upsert({
        where: { key: SETTINGS_DB_KEY },
        create: {
          key: SETTINGS_DB_KEY,
          encryptedPayload,
          isEncrypted: true,
          metadata: {
            enabled: merged.enabled,
            publicUrl: merged.publicUrl || '',
            haEnabled: merged.homeAssistant?.enabled ?? false,
            talkEnabled: merged.nextcloudTalk?.enabled ?? false,
            discordEnabled: merged.discord?.enabled ?? false,
            telegramEnabled: merged.telegram?.enabled ?? false,
            webhookEnabled: merged.genericWebhook?.enabled ?? false,
            updatedAt: new Date().toISOString()
          }
        },
        update: {
          encryptedPayload,
          isEncrypted: true,
          metadata: {
            enabled: merged.enabled,
            publicUrl: merged.publicUrl || '',
            haEnabled: merged.homeAssistant?.enabled ?? false,
            talkEnabled: merged.nextcloudTalk?.enabled ?? false,
            discordEnabled: merged.discord?.enabled ?? false,
            telegramEnabled: merged.telegram?.enabled ?? false,
            webhookEnabled: merged.genericWebhook?.enabled ?? false,
            updatedAt: new Date().toISOString()
          }
        }
      });
    } catch (err: any) {
      console.error(`[NotificationService] Error saving settings into encrypted database vault: ${err.message}`);
    }

    this.cachedConfig = merged;
    this.isInitialized = true;
    return merged;
  }

  /**
   * Synchronous save helper
   */
  public static saveConfig(newConfig: Partial<NotificationConfig>): NotificationConfig {
    const current = this.getConfig();
    const merged = { ...current, ...newConfig };
    this.cachedConfig = merged;
    this.saveConfigAsync(newConfig).catch((e) => {
      console.error('[NotificationService] Async save failed:', e.message);
    });
    return merged;
  }

  /**
   * Dispatches alerts across all enabled channels
   */
  public static async sendAlert(payload: NotificationPayload): Promise<void> {
    const cfg = this.getConfig();
    if (!cfg.enabled) return;

    console.log(`[Notification] [${payload.status}] ${payload.title} - ${payload.hostName}: ${payload.details}`);
    const promises: Promise<any>[] = [];

    // 1. Home Assistant
    if (cfg.homeAssistant?.enabled && cfg.homeAssistant.url && cfg.homeAssistant.token) {
      promises.push(this.sendHomeAssistantNotification(payload, cfg.homeAssistant));
    }

    // 2. Nextcloud Talk
    if (cfg.nextcloudTalk?.enabled && cfg.nextcloudTalk.roomTokenOrWebhook) {
      promises.push(this.sendNextcloudTalkNotification(payload, cfg.nextcloudTalk));
    }

    // 3. Discord
    if (cfg.discord?.enabled && cfg.discord.webhookUrl) {
      promises.push(this.sendDiscordWebhook(payload, cfg.discord.webhookUrl));
    }

    // 4. Telegram
    if (cfg.telegram?.enabled && cfg.telegram.botToken && cfg.telegram.chatId) {
      promises.push(this.sendTelegramMessage(payload, cfg.telegram.botToken, cfg.telegram.chatId));
    }

    // 5. Generic Webhook
    if (cfg.genericWebhook?.enabled && cfg.genericWebhook.webhookUrl) {
      promises.push(this.sendGenericWebhook(payload, cfg.genericWebhook));
    }

    await Promise.allSettled(promises);
  }

  /**
   * Home Assistant Notification (Persistent Notification + Mobile App Actionable Notification)
   */
  public static async sendHomeAssistantNotification(
    payload: NotificationPayload,
    haConfig: NonNullable<NotificationConfig['homeAssistant']>
  ): Promise<{ success: boolean; message: string }> {
    try {
      const cleanUrl = haConfig.url.trim().replace(/\/+$/, '');
      const service = (haConfig.notifyService || 'notify.notify').replace(/^notify\./, '');
      const isPersistent = service === 'persistent_notification' || service === 'persistent_notification.create';

      const icon = payload.status === 'SUCCESS' ? '✅' : payload.status === 'ROLLED_BACK' ? '⚠️' : payload.status === 'AVAILABLE' ? '⚡' : '🚨';
      const title = `${icon} FleetUpdate: ${payload.title}`;

      // In Home Assistant mobile push notifications, raw markdown ** is not parsed, so we format clean plain text
      const message = isPersistent
        ? `**Host:** ${payload.hostName}\n**Status:** ${payload.status}\n**Details:** ${payload.details}${payload.previousVersion && payload.targetVersion ? `\n**Versions:** ${payload.previousVersion} ➔ ${payload.targetVersion}` : ''}`
        : `Host: ${payload.hostName}\nStatus: ${payload.status}\nDetails: ${payload.details}${payload.previousVersion && payload.targetVersion ? `\nVersions: ${payload.previousVersion} ➔ ${payload.targetVersion}` : ''}`;

      const endpoint = isPersistent
        ? `${cleanUrl}/api/services/persistent_notification/create`
        : `${cleanUrl}/api/services/notify/${service}`;

      const body: any = {
        title,
        message
      };

      const dashboardTargetUrl =
        payload.dashboardUrl ||
        haConfig.publicUrl ||
        NotificationService.getConfig().publicUrl ||
        '/';

      // Add actionable notification buttons for mobile companion app if enabled
      if (!isPersistent && haConfig.enableActions) {
        body.data = {
          tag: `fleetupdate-${payload.hostName.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
          actions: payload.status === 'AVAILABLE'
            ? [
                {
                  action: 'FLEETUPDATE_TRIGGER_UPDATE_ALL',
                  title: '⚡ Mettre tout à jour'
                },
                {
                  action: 'URI',
                  title: '📊 Ouvrir le Dashboard',
                  uri: dashboardTargetUrl
                }
              ]
            : [
                {
                  action: 'URI',
                  title: '📊 Voir le Dashboard',
                  uri: dashboardTargetUrl
                }
              ]
        };
      }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${haConfig.token.trim()}`,
          'Content-Type': 'application/json',
          'User-Agent': 'FleetUpdate-Hub/1.0'
        },
        body: JSON.stringify(body)
      });

      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Home Assistant API HTTP ${res.status}: ${txt.slice(0, 150)}`);
      }

      return { success: true, message: 'Home Assistant notification dispatched successfully.' };
    } catch (err: any) {
      console.warn('[Notification] Failed to send Home Assistant notification:', err.message);
      return { success: false, message: err.message };
    }
  }

  /**
   * Nextcloud Talk Notification (Room Chat / Bot Message)
   */
  public static async sendNextcloudTalkNotification(
    payload: NotificationPayload,
    ncConfig: NonNullable<NotificationConfig['nextcloudTalk']>
  ): Promise<{ success: boolean; message: string }> {
    try {
      let targetUrl = ncConfig.roomTokenOrWebhook.trim();

      // If user passed just the room token (e.g. "abc123xyz") instead of full URL
      if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
        const cleanNc = (ncConfig.url || '').trim().replace(/\/+$/, '');
        targetUrl = `${cleanNc}/ocs/v2.php/apps/spreed/api/v1/chat/${targetUrl}`;
      }

      const icon = payload.status === 'SUCCESS' ? '✅' : payload.status === 'ROLLED_BACK' ? '⚠️' : payload.status === 'AVAILABLE' ? '⚡' : '🚨';
      const chatMessage = `${icon} **FleetUpdate-Hub Guard**\n\n**${payload.title}**\n* **Host:** \`${payload.hostName}\`\n* **Status:** \`${payload.status}\`\n* **Details:** ${payload.details}\n${payload.previousVersion && payload.targetVersion ? `* **Versions:** \`${payload.previousVersion}\` ➔ \`${payload.targetVersion}\`\n` : ''}`;

      const res = await fetch(targetUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'OCS-APIRequest': 'true',
          'Accept': 'application/json',
          'User-Agent': 'FleetUpdate-Hub/1.0',
          ...(ncConfig.botSecret ? { 'X-Nextcloud-Talk-Bot-Secret': ncConfig.botSecret } : {})
        },
        body: JSON.stringify({
          message: chatMessage
        })
      });

      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Nextcloud Talk API HTTP ${res.status}: ${txt.slice(0, 150)}`);
      }

      return { success: true, message: 'Nextcloud Talk notification sent successfully.' };
    } catch (err: any) {
      console.warn('[Notification] Failed to send Nextcloud Talk message:', err.message);
      return { success: false, message: err.message };
    }
  }

  /**
   * Discord Webhook Notification
   */
  public static async sendDiscordWebhook(
    payload: NotificationPayload,
    webhookUrl: string
  ): Promise<{ success: boolean; message: string }> {
    try {
      const color = payload.status === 'SUCCESS'
        ? 0x10b981
        : payload.status === 'ROLLED_BACK'
        ? 0xf59e0b
        : payload.status === 'AVAILABLE'
        ? 0x3b82f6
        : 0xef4444;

      const body = {
        username: 'FleetUpdate-Hub Guard',
        avatar_url: 'https://cdn-icons-png.flaticon.com/512/2099/2099058.png',
        embeds: [
          {
            title: `🛡️ ${payload.title}`,
            description: payload.details,
            color,
            fields: [
              { name: 'Host', value: payload.hostName, inline: true },
              { name: 'Status', value: payload.status, inline: true },
              ...(payload.previousVersion && payload.targetVersion
                ? [{ name: 'Versions', value: `${payload.previousVersion} ➔ ${payload.targetVersion}`, inline: false }]
                : [])
            ],
            timestamp: new Date().toISOString()
          }
        ]
      };

      const res = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (!res.ok) {
        throw new Error(`Discord API HTTP ${res.status}`);
      }

      return { success: true, message: 'Discord webhook message sent.' };
    } catch (err: any) {
      console.warn('[Notification] Failed to send Discord webhook:', err.message);
      return { success: false, message: err.message };
    }
  }

  /**
   * Telegram Bot Notification
   */
  public static async sendTelegramMessage(
    payload: NotificationPayload,
    botToken: string,
    chatId: string
  ): Promise<{ success: boolean; message: string }> {
    try {
      const icon = payload.status === 'SUCCESS' ? '✅' : payload.status === 'ROLLED_BACK' ? '⚠️' : payload.status === 'AVAILABLE' ? '⚡' : '🚨';
      const text = `${icon} *FleetUpdate-Hub Alert*\n\n*${payload.title}*\n*Host:* \`${payload.hostName}\`\n*Status:* ${payload.status}\n*Details:* ${payload.details}${payload.previousVersion && payload.targetVersion ? `\n*Versions:* \`${payload.previousVersion}\` ➔ \`${payload.targetVersion}\`` : ''}`;

      const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: 'Markdown'
        })
      });

      if (!res.ok) {
        throw new Error(`Telegram API HTTP ${res.status}`);
      }

      return { success: true, message: 'Telegram message sent.' };
    } catch (err: any) {
      console.warn('[Notification] Failed to send Telegram message:', err.message);
      return { success: false, message: err.message };
    }
  }

  /**
   * Generic JSON Webhook
   */
  public static async sendGenericWebhook(
    payload: NotificationPayload,
    genericConfig: NonNullable<NotificationConfig['genericWebhook']>
  ): Promise<{ success: boolean; message: string }> {
    try {
      const res = await fetch(genericConfig.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'FleetUpdate-Hub/1.0',
          ...(genericConfig.customHeaders || {})
        },
        body: JSON.stringify({
          event: 'FLEETUPDATE_NOTIFICATION',
          timestamp: new Date().toISOString(),
          payload
        })
      });

      if (!res.ok) {
        throw new Error(`Generic Webhook HTTP ${res.status}`);
      }

      return { success: true, message: 'Generic Webhook delivered.' };
    } catch (err: any) {
      console.warn('[Notification] Failed to deliver Generic Webhook:', err.message);
      return { success: false, message: err.message };
    }
  }

  /**
   * Test an individual channel from settings UI
   */
  public static async testChannel(
    channel: 'homeAssistant' | 'nextcloudTalk' | 'discord' | 'telegram' | 'genericWebhook',
    channelConfig: any
  ): Promise<{ success: boolean; message: string }> {
    const testPayload: NotificationPayload = {
      title: 'Test Notification Channel',
      hostName: 'FleetUpdate-Hub Engine',
      status: 'SUCCESS',
      details: `This is a test alert from FleetUpdate-Hub verifying the connection to ${channel}.`
    };

    if (channel === 'homeAssistant') {
      return this.sendHomeAssistantNotification(testPayload, channelConfig);
    }
    if (channel === 'nextcloudTalk') {
      return this.sendNextcloudTalkNotification(testPayload, channelConfig);
    }
    if (channel === 'discord') {
      return this.sendDiscordWebhook(testPayload, channelConfig.webhookUrl);
    }
    if (channel === 'telegram') {
      return this.sendTelegramMessage(testPayload, channelConfig.botToken, channelConfig.chatId);
    }
    if (channel === 'genericWebhook') {
      return this.sendGenericWebhook(testPayload, channelConfig);
    }

    return { success: false, message: `Unknown channel: ${channel}` };
  }
}
