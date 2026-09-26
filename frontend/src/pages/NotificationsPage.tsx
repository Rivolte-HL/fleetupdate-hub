import React, { useState, useEffect } from 'react';
import {
  Bell,
  Home,
  MessageSquare,
  Send,
  CheckCircle2,
  Loader2,
  Key,
  Globe,
  ShieldCheck,
  Copy,
  Check,
  Zap,
  Radio,
  Sliders
} from 'lucide-react';
import { useLanguage } from '../context/LanguageContext.js';
import { useToast } from '../context/ToastContext.js';
import { api } from '../services/api.js';

import { ChannelSummaryCard } from '../components/notifications/ChannelSummaryCard.js';
import { HomeAssistantChannel } from '../components/notifications/HomeAssistantChannel.js';
import { NextcloudTalkChannel } from '../components/notifications/NextcloudTalkChannel.js';
import { DiscordChannel } from '../components/notifications/DiscordChannel.js';
import { TelegramChannel } from '../components/notifications/TelegramChannel.js';
import { WebhookChannel } from '../components/notifications/WebhookChannel.js';
import { InboundWebhookDoc } from '../components/notifications/InboundWebhookDoc.js';

export const NotificationsPage: React.FC = () => {
  const { t } = useLanguage();
  const { addToast } = useToast();

  const [activeTab, setActiveTab] = useState<'ha' | 'talk' | 'discord' | 'telegram' | 'webhook'>('ha');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testingChannel, setTestingChannel] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [showTokens, setShowTokens] = useState<Record<string, boolean>>({});

  const [settings, setSettings] = useState<any>({
    enabled: true,
    publicUrl: typeof window !== 'undefined' ? window.location.origin : '',
    webhookSecret: '',
    homeAssistant: {
      enabled: false,
      url: '',
      token: '',
      notifyService: 'notify.notify',
      enableActions: true,
      publicUrl: ''
    },
    nextcloudTalk: {
      enabled: false,
      url: '',
      roomTokenOrWebhook: '',
      botSecret: ''
    },
    discord: {
      enabled: false,
      webhookUrl: ''
    },
    telegram: {
      enabled: false,
      botToken: '',
      chatId: ''
    },
    genericWebhook: {
      enabled: false,
      webhookUrl: '',
      customHeaders: {}
    }
  });

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const res = await api.get('/settings/notifications');
      if (res.data?.settings) {
        setSettings({
          ...res.data.settings,
          publicUrl: res.data.settings.publicUrl || window.location.origin
        });
      }
    } catch (err: any) {
      addToast('error', 'Erreur', err.response?.data?.message || err.message || 'Failed to load notification settings');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await api.put('/settings/notifications', settings);
      setSettings({
        ...(res.data.settings || settings),
        publicUrl: res.data.settings?.publicUrl || settings.publicUrl || window.location.origin
      });
      addToast('success', 'Succès', t('notifications.savedSuccess'));
    } catch (err: any) {
      addToast('error', 'Erreur', err.response?.data?.message || err.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleTestChannel = async (channelKey: string, channelPayload: any) => {
    setTestingChannel(channelKey);
    try {
      const res = await api.post('/settings/notifications/test', {
        channel: channelKey,
        config: {
          ...channelPayload,
          publicUrl: settings.publicUrl || window.location.origin
        }
      });
      if (res.data?.success) {
        addToast('success', 'Succès', res.data?.message || `Test notification sent successfully to ${channelKey}!`);
      } else {
        addToast('warning', 'Attention', res.data?.message || `Test failed for ${channelKey}.`);
      }
    } catch (err: any) {
      addToast('error', 'Erreur', err.response?.data?.message || err.message || `Test notification to ${channelKey} failed.`);
    } finally {
      setTestingChannel(null);
    }
  };

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    addToast('info', 'Copié', 'Copié dans le presse-papier !');
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const toggleTokenVisibility = (key: string) => {
    setShowTokens((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const activeCount = [
    settings.homeAssistant?.enabled,
    settings.nextcloudTalk?.enabled,
    settings.discord?.enabled,
    settings.telegram?.enabled,
    settings.genericWebhook?.enabled
  ].filter(Boolean).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-cyan-400 animate-spin" />
          <span className="text-xs font-mono text-slate-400">{t('common.loading')}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fadeIn pb-12">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800/80 pb-6">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 shadow-lg shadow-cyan-500/10">
              <Bell className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tight text-white flex items-center gap-3">
                <span>{t('notifications.title')}</span>
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 shadow-sm">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>{t('notifications.vaultEncryptedBadge')}</span>
                </span>
              </h1>
              <p className="text-xs text-slate-400 mt-1">
                {t('notifications.subtitle')}
              </p>
            </div>
          </div>
        </div>

        {/* Header Save Button */}
        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-2.5 rounded-xl text-xs font-bold text-slate-950 bg-gradient-to-r from-cyan-400 via-cyan-500 to-blue-500 hover:from-cyan-300 hover:to-blue-400 shadow-lg shadow-cyan-500/25 disabled:opacity-50 transition-all flex items-center gap-2 cursor-pointer"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>{t('common.saving')}</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                <span>{t('common.saveSettings')}</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Global Control & Environment Settings */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Master Engine Switch */}
        <div className="glass-card p-5 rounded-2xl border border-slate-700/60 bg-slate-900/50 flex flex-col justify-between space-y-4">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
                <Radio className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-white">{t('notifications.masterEnable')}</h3>
                <p className="text-[11px] text-slate-400 mt-0.5">{t('notifications.masterDesc')}</p>
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between pt-3 border-t border-slate-800/80">
            <span className="text-xs font-medium text-slate-400">
              {settings.enabled ? (
                <span className="text-emerald-400 font-bold flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" /> Actif ({activeCount} {t('notifications.activeChannels')})
                </span>
              ) : (
                <span className="text-slate-500 font-semibold">Désactivé</span>
              )}
            </span>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings.enabled}
                onChange={(e) => setSettings({ ...settings, enabled: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-cyan-500"></div>
            </label>
          </div>
        </div>

        {/* Public URL Config */}
        <div className="glass-card p-5 rounded-2xl border border-slate-700/60 bg-slate-900/50 space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-slate-200 flex items-center gap-2">
              <Globe className="w-4 h-4 text-cyan-400" />
              <span>{t('notifications.publicUrlLabel')}</span>
            </label>
          </div>
          <p className="text-[11px] text-slate-400">
            {t('notifications.publicUrlDesc')}
          </p>
          <input
            type="text"
            value={settings.publicUrl || ''}
            onChange={(e) => setSettings({ ...settings, publicUrl: e.target.value })}
            placeholder="https://update.votredomaine.com"
            className="w-full px-3.5 py-2 rounded-xl bg-slate-950/80 border border-slate-700/60 text-white text-xs font-mono focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
          />
        </div>

        {/* Action Webhook Secret Key */}
        <div className="glass-card p-5 rounded-2xl border border-slate-700/60 bg-slate-900/50 space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-slate-200 flex items-center gap-2">
              <Key className="w-4 h-4 text-cyan-400" />
              <span>{t('notifications.webhookSecretLabel')}</span>
            </label>
            <span className="text-[10px] font-mono text-cyan-400/80 bg-cyan-500/10 px-2 py-0.5 rounded-md border border-cyan-500/20">
              Inbound Webhook
            </span>
          </div>
          <p className="text-[11px] text-slate-400">
            {t('notifications.webhookSecretDesc')}
          </p>
          <div className="relative">
            <input
              type="text"
              readOnly
              value={settings.webhookSecret || '••••••••••••••••••••••••'}
              className="w-full px-3.5 py-2 pr-10 rounded-xl bg-slate-950/80 border border-slate-700/60 text-slate-300 text-xs font-mono select-all"
            />
            <button
              type="button"
              onClick={() => copyToClipboard(settings.webhookSecret, 'webhookSecret')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-1 rounded cursor-pointer"
              title="Copier le jeton secret"
            >
              {copiedKey === 'webhookSecret' ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>

      {/* 5 Channel Overview Cards */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Sliders className="w-4 h-4 text-cyan-400" />
            <span>{t('notifications.channelsSummary')}</span>
          </h2>
          <span className="text-xs font-semibold text-slate-400">
            {activeCount} / 5 {t('notifications.activeChannels')}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <ChannelSummaryCard
            id="ha"
            title="Home Assistant"
            subtitle="Mobile companion & actions directes"
            icon={<Home className="w-5 h-5 text-indigo-400" />}
            enabled={Boolean(settings.homeAssistant?.enabled)}
            isActiveTab={activeTab === 'ha'}
            activeColor="border-indigo-500/60 bg-indigo-950/20 shadow-indigo-950/30"
            onClick={() => setActiveTab('ha')}
          />
          <ChannelSummaryCard
            id="talk"
            title="Nextcloud Talk"
            subtitle="Salons de discussion et bots dédiés"
            icon={<MessageSquare className="w-5 h-5 text-sky-400" />}
            enabled={Boolean(settings.nextcloudTalk?.enabled)}
            isActiveTab={activeTab === 'talk'}
            activeColor="border-sky-500/60 bg-sky-950/20 shadow-sky-950/30"
            onClick={() => setActiveTab('talk')}
          />
          <ChannelSummaryCard
            id="discord"
            title="Discord"
            subtitle="Embeds riches & logs visuels"
            icon={<Bell className="w-5 h-5 text-purple-400" />}
            enabled={Boolean(settings.discord?.enabled)}
            isActiveTab={activeTab === 'discord'}
            activeColor="border-purple-500/60 bg-purple-950/20 shadow-purple-950/30"
            onClick={() => setActiveTab('discord')}
          />
          <ChannelSummaryCard
            id="telegram"
            title="Telegram"
            subtitle="Push instantané par bot privé"
            icon={<Send className="w-5 h-5 text-blue-400" />}
            enabled={Boolean(settings.telegram?.enabled)}
            isActiveTab={activeTab === 'telegram'}
            activeColor="border-blue-500/60 bg-blue-950/20 shadow-blue-950/30"
            onClick={() => setActiveTab('telegram')}
          />
          <ChannelSummaryCard
            id="webhook"
            title="Generic Webhook"
            subtitle="JSON pour n8n / Node-RED"
            icon={<Zap className="w-5 h-5 text-amber-400" />}
            enabled={Boolean(settings.genericWebhook?.enabled)}
            isActiveTab={activeTab === 'webhook'}
            activeColor="border-amber-500/60 bg-amber-950/20 shadow-amber-950/30"
            onClick={() => setActiveTab('webhook')}
          />
        </div>
      </div>

      {/* Selected Channel Detailed Form & Live Test */}
      <div className="glass-card rounded-2xl border border-slate-700/60 bg-slate-900/60 overflow-hidden shadow-2xl">
        {/* Tab Selection Bar */}
        <div className="flex items-center gap-2 p-3 bg-slate-950/80 border-b border-slate-800/80 overflow-x-auto">
          <button
            onClick={() => setActiveTab('ha')}
            className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'ha'
                ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-slate-900'
            }`}
          >
            <Home className="w-4 h-4 text-indigo-400" />
            <span>Home Assistant</span>
          </button>

          <button
            onClick={() => setActiveTab('talk')}
            className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'talk'
                ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40 shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-slate-900'
            }`}
          >
            <MessageSquare className="w-4 h-4 text-sky-400" />
            <span>Nextcloud Talk</span>
          </button>

          <button
            onClick={() => setActiveTab('discord')}
            className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'discord'
                ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40 shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-slate-900'
            }`}
          >
            <Bell className="w-4 h-4 text-purple-400" />
            <span>Discord</span>
          </button>

          <button
            onClick={() => setActiveTab('telegram')}
            className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'telegram'
                ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40 shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-slate-900'
            }`}
          >
            <Send className="w-4 h-4 text-blue-400" />
            <span>Telegram</span>
          </button>

          <button
            onClick={() => setActiveTab('webhook')}
            className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'webhook'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-slate-900'
            }`}
          >
            <Zap className="w-4 h-4 text-amber-400" />
            <span>Generic Webhook</span>
          </button>
        </div>

        {/* Tab Form Content */}
        <div className="p-6">
          {activeTab === 'ha' && (
            <HomeAssistantChannel
              settings={settings.homeAssistant}
              onChange={(updated) => setSettings({ ...settings, homeAssistant: updated })}
              onTest={() => handleTestChannel('homeAssistant', settings.homeAssistant)}
              isTesting={testingChannel === 'homeAssistant'}
              showToken={Boolean(showTokens['haToken'])}
              onToggleToken={() => toggleTokenVisibility('haToken')}
            />
          )}

          {activeTab === 'talk' && (
            <NextcloudTalkChannel
              settings={settings.nextcloudTalk}
              onChange={(updated) => setSettings({ ...settings, nextcloudTalk: updated })}
              onTest={() => handleTestChannel('nextcloudTalk', settings.nextcloudTalk)}
              isTesting={testingChannel === 'nextcloudTalk'}
              showSecret={Boolean(showTokens['talkSecret'])}
              onToggleSecret={() => toggleTokenVisibility('talkSecret')}
            />
          )}

          {activeTab === 'discord' && (
            <DiscordChannel
              settings={settings.discord}
              onChange={(updated) => setSettings({ ...settings, discord: updated })}
              onTest={() => handleTestChannel('discord', settings.discord)}
              isTesting={testingChannel === 'discord'}
            />
          )}

          {activeTab === 'telegram' && (
            <TelegramChannel
              settings={settings.telegram}
              onChange={(updated) => setSettings({ ...settings, telegram: updated })}
              onTest={() => handleTestChannel('telegram', settings.telegram)}
              isTesting={testingChannel === 'telegram'}
              showToken={Boolean(showTokens['tgToken'])}
              onToggleToken={() => toggleTokenVisibility('tgToken')}
            />
          )}

          {activeTab === 'webhook' && (
            <WebhookChannel
              settings={settings.genericWebhook}
              onChange={(updated) => setSettings({ ...settings, genericWebhook: updated })}
              onTest={() => handleTestChannel('genericWebhook', settings.genericWebhook)}
              isTesting={testingChannel === 'genericWebhook'}
            />
          )}
        </div>
      </div>

      {/* Interactive Action Webhook Documentation Hub */}
      <InboundWebhookDoc
        publicUrl={settings.publicUrl}
        webhookSecret={settings.webhookSecret}
        copiedKey={copiedKey}
        onCopy={copyToClipboard}
      />
    </div>
  );
};
