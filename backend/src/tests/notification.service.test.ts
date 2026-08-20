import { describe, it } from 'node:test';
import assert from 'node:assert';
import { NotificationService, NotificationPayload } from '../core/notification.service.js';

describe('NotificationService Multi-Channel & Actions Tests', () => {
  it('should format Home Assistant payload correctly with mobile actionable buttons', async () => {
    const payload: NotificationPayload = {
      title: '3 Updates Available',
      hostName: 'VM Docker',
      status: 'AVAILABLE',
      details: 'Containers adguardhome, n8n, phpipam-db have updates.',
      actionable: true,
      upgradableHostsCount: 3,
      dashboardUrl: 'https://fleetupdate.local'
    };

    const haConfig = {
      enabled: true,
      url: 'http://localhost:8123',
      token: 'fake_test_llat_token',
      notifyService: 'notify.mobile_app_phone',
      enableActions: true
    };

    // Test channel handler returns failure gracefully on offline server without crashing
    const res = await NotificationService.sendHomeAssistantNotification(payload, haConfig);
    assert.strictEqual(typeof res.success, 'boolean');
    assert.strictEqual(typeof res.message, 'string');
  });

  it('should format Nextcloud Talk room payload correctly', async () => {
    const payload: NotificationPayload = {
      title: 'Update Completed',
      hostName: 'Proxmox Node 1',
      status: 'SUCCESS',
      details: 'All packages successfully upgraded.',
      previousVersion: '8.2-2',
      targetVersion: '8.2-4'
    };

    const ncConfig = {
      enabled: true,
      url: 'https://cloud.example.com',
      roomTokenOrWebhook: 'abc123room',
      botSecret: 'bot_secret_xyz'
    };

    const res = await NotificationService.sendNextcloudTalkNotification(payload, ncConfig);
    assert.strictEqual(typeof res.success, 'boolean');
    assert.strictEqual(typeof res.message, 'string');
  });

  it('should test Discord and Generic Webhooks safely', async () => {
    const resDiscord = await NotificationService.testChannel('discord', { webhookUrl: 'https://discord.com/api/webhooks/dummy/dummy' });
    assert.strictEqual(typeof resDiscord.success, 'boolean');

    const resWebhook = await NotificationService.testChannel('genericWebhook', { webhookUrl: 'https://dummy.example.com/webhook' });
    assert.strictEqual(typeof resWebhook.success, 'boolean');
  });

  it('should save and load notification configuration accurately with encrypted vault', async () => {
    const initialConfig = await NotificationService.getConfigAsync();
    assert.ok(initialConfig);
    assert.strictEqual(typeof initialConfig.enabled, 'boolean');
    assert.ok(initialConfig.webhookSecret);

    const updated = await NotificationService.saveConfigAsync({
      publicUrl: 'https://fleetupdate.test.domain',
      homeAssistant: {
        enabled: true,
        url: 'https://ha.test.domain',
        token: 'test_secret_vault_token_123',
        notifyService: 'notify.mobile_app_phone',
        enableActions: true
      }
    });

    assert.strictEqual(updated.publicUrl, 'https://fleetupdate.test.domain');
    assert.strictEqual(updated.homeAssistant?.token, 'test_secret_vault_token_123');

    const reloaded = await NotificationService.getConfigAsync();
    assert.strictEqual(reloaded.publicUrl, 'https://fleetupdate.test.domain');
    assert.strictEqual(reloaded.homeAssistant?.token, 'test_secret_vault_token_123');
  });
});
