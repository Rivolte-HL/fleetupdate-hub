import { config } from '../config/index.js';

export interface NotificationPayload {
  title: string;
  hostName: string;
  status: 'SUCCESS' | 'FAILED' | 'ROLLED_BACK' | 'WARNING';
  details: string;
  previousVersion?: string;
  targetVersion?: string;
}

export class NotificationService {
  public static async sendAlert(payload: NotificationPayload): Promise<void> {
    console.log(`[Notification] [${payload.status}] ${payload.title} - ${payload.hostName}: ${payload.details}`);

    const promises: Promise<any>[] = [];

    if (config.discordWebhookUrl) {
      promises.push(this.sendDiscordWebhook(payload));
    }

    if (config.telegramBotToken && config.telegramChatId) {
      promises.push(this.sendTelegramMessage(payload));
    }

    await Promise.allSettled(promises);
  }

  private static async sendDiscordWebhook(payload: NotificationPayload): Promise<void> {
    try {
      const color = payload.status === 'SUCCESS' ? 0x10b981 : payload.status === 'ROLLED_BACK' ? 0xf59e0b : 0xef4444;
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
              { name: 'Versions', value: `${payload.previousVersion || 'N/A'} ➔ ${payload.targetVersion || 'N/A'}`, inline: false }
            ],
            timestamp: new Date().toISOString()
          }
        ]
      };

      await fetch(config.discordWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
    } catch (err) {
      console.warn('[Notification] Failed to send Discord webhook:', err);
    }
  }

  private static async sendTelegramMessage(payload: NotificationPayload): Promise<void> {
    try {
      const icon = payload.status === 'SUCCESS' ? '✅' : payload.status === 'ROLLED_BACK' ? '⚠️' : '🚨';
      const text = `${icon} *FleetUpdate-Hub Alert*\n\n*${payload.title}*\n*Host:* \`${payload.hostName}\`\n*Status:* ${payload.status}\n*Details:* ${payload.details}\n*Versions:* ${payload.previousVersion || 'N/A'} ➔ ${payload.targetVersion || 'N/A'}`;

      const url = `https://api.telegram.org/bot${config.telegramBotToken}/sendMessage`;
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: config.telegramChatId,
          text,
          parse_mode: 'Markdown'
        })
      });
    } catch (err) {
      console.warn('[Notification] Failed to send Telegram message:', err);
    }
  }
}
