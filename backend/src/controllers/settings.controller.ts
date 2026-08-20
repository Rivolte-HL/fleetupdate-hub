import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../middlewares/auth.middleware.js';
import { NotificationService } from '../core/notification.service.js';
import { logAuditEvent } from '../middlewares/audit.middleware.js';

export class SettingsController {
  public static async getNotificationSettings(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const cfg = await NotificationService.getConfigAsync();

      // Mask sensitive secrets for UI display
      const safeConfig = {
        enabled: cfg.enabled,
        publicUrl: cfg.publicUrl || '',
        webhookSecret: cfg.webhookSecret ? `${cfg.webhookSecret.slice(0, 4)}••••••••` : '',
        homeAssistant: {
          ...cfg.homeAssistant,
          token: cfg.homeAssistant?.token ? '••••••••' : ''
        },
        nextcloudTalk: {
          ...cfg.nextcloudTalk,
          botSecret: cfg.nextcloudTalk?.botSecret ? '••••••••' : ''
        },
        discord: {
          ...cfg.discord
        },
        telegram: {
          ...cfg.telegram,
          botToken: cfg.telegram?.botToken ? '••••••••' : ''
        },
        genericWebhook: {
          ...cfg.genericWebhook
        }
      };

      res.status(200).json({ settings: safeConfig });
    } catch (err) {
      next(err);
    }
  }

  public static async updateNotificationSettings(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const updates = req.body || {};
      const current = await NotificationService.getConfigAsync();

      // Preserve existing secret values if masked placeholders are sent back
      if (updates.webhookSecret && updates.webhookSecret.includes('••••')) {
        delete updates.webhookSecret;
      }
      if (updates.homeAssistant?.token && updates.homeAssistant.token.includes('••••')) {
        updates.homeAssistant.token = current.homeAssistant?.token || '';
      }
      if (updates.nextcloudTalk?.botSecret && updates.nextcloudTalk.botSecret.includes('••••')) {
        updates.nextcloudTalk.botSecret = current.nextcloudTalk?.botSecret || '';
      }
      if (updates.telegram?.botToken && updates.telegram.botToken.includes('••••')) {
        updates.telegram.botToken = current.telegram?.botToken || '';
      }

      const saved = await NotificationService.saveConfigAsync(updates);
      await logAuditEvent(req, 'NOTIFICATION_SETTINGS_UPDATED', 'SYSTEM', 'notifications', {
        enabled: saved.enabled
      });

      res.status(200).json({
        message: 'Notification settings saved and encrypted in vault successfully.',
        settings: {
          ...saved,
          webhookSecret: saved.webhookSecret ? `${saved.webhookSecret.slice(0, 4)}••••••••` : ''
        }
      });
    } catch (err) {
      next(err);
    }
  }

  public static async testNotificationChannel(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { channel, config: testCfg } = req.body;

      if (!channel) {
        res.status(400).json({ error: 'CHANNEL_REQUIRED', message: 'Channel parameter is required.' });
        return;
      }

      const current = NotificationService.getConfig();
      let resolvedConfig = testCfg || {};

      // If masked token, resolve real secret from current configuration
      if (channel === 'homeAssistant' && resolvedConfig.token && resolvedConfig.token.includes('••••')) {
        resolvedConfig.token = current.homeAssistant?.token || '';
      }
      if (channel === 'nextcloudTalk' && resolvedConfig.botSecret && resolvedConfig.botSecret.includes('••••')) {
        resolvedConfig.botSecret = current.nextcloudTalk?.botSecret || '';
      }
      if (channel === 'telegram' && resolvedConfig.botToken && resolvedConfig.botToken.includes('••••')) {
        resolvedConfig.botToken = current.telegram?.botToken || '';
      }

      const result = await NotificationService.testChannel(channel, resolvedConfig);

      if (!result.success) {
        res.status(400).json({
          success: false,
          error: 'TEST_NOTIFICATION_FAILED',
          message: result.message
        });
        return;
      }

      res.status(200).json({
        success: true,
        message: result.message
      });
    } catch (err) {
      next(err);
    }
  }
}
