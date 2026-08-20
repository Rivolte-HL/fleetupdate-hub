import React, { useState, useEffect } from 'react';
import {
  X,
  Bell,
  Home,
  MessageSquare,
  Send,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Key,
  Globe,
  Sliders,
  Sparkles,
  Link,
  Shield,
  HelpCircle
} from 'lucide-react';
import { useLanguage } from '../context/LanguageContext.js';
import { api } from '../services/api.js';

interface NotificationSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const NotificationSettingsModal: React.FC<NotificationSettingsModalProps> = ({
  isOpen,
  onClose
}) => {
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState<'ha' | 'talk' | 'discord' | 'telegram' | 'webhook'>('ha');

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

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
      webhookUrl: ''
    }
  });

  useEffect(() => {
    if (isOpen) {
      loadSettings();
    }
  }, [isOpen]);

  const loadSettings = async () => {
    setLoading(true);
    setFeedback(null);
    try {
      const res = await api.get('/settings/notifications');
      if (res.data?.settings) {
        setSettings({
          ...res.data.settings,
          publicUrl: res.data.settings.publicUrl || window.location.origin
        });
      }
    } catch (err: any) {
      console.warn('Could not load notification settings:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setFeedback(null);
    try {
      const res = await api.put('/settings/notifications', settings);
      setSettings({
        ...(res.data.settings || settings),
        publicUrl: res.data.settings?.publicUrl || settings.publicUrl || window.location.origin
      });
      setFeedback({
        type: 'success',
        message: t('notifications.savedSuccess') || 'Notification settings saved successfully!'
      });
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.response?.data?.message || err.message || 'Failed to save settings.'
      });
    } finally {
      setSaving(false);
    }
  };

  const handleTestChannel = async (channelKey: string, channelPayload: any) => {
    setTesting(channelKey);
    setFeedback(null);
    try {
      const res = await api.post('/settings/notifications/test', {
        channel: channelKey,
        config: {
          ...channelPayload,
          publicUrl: settings.publicUrl || window.location.origin
        }
      });
      setFeedback({
        type: 'success',
        message: res.data?.message || `Test notification sent successfully to ${channelKey}!`
      });
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.response?.data?.message || err.message || `Test notification to ${channelKey} failed.`
      });
    } finally {
      setTesting(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn">
      <div className="glass-card w-full max-w-3xl max-h-[90vh] flex flex-col rounded-2xl border border-slate-700/60 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-slate-800/80 flex items-center justify-between bg-slate-900/60">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
              <Bell className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-bold text-lg text-white flex items-center gap-2">
                {t('notifications.title') || 'Alerts & Actionable Notifications'}
              </h2>
              <p className="text-xs text-slate-400">
                {t('notifications.subtitle') ||
                  'Configure channels (Home Assistant, Nextcloud Talk, Discord) and interactive action triggers.'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Global Master Switch, Public URL & Webhook Info */}
        <div className="p-4 border-b border-slate-800/80 bg-slate-900/40 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.enabled}
                onChange={(e) => setSettings({ ...settings, enabled: e.target.checked })}
                className="w-5 h-5 rounded text-cyan-500 focus:ring-cyan-400 bg-slate-800 border-slate-700"
              />
              <div>
                <span className="font-bold text-sm text-white">
                  {t('notifications.masterEnable') || 'Enable Notification Engine'}
                </span>
                <p className="text-[11px] text-slate-400">
                  {t('notifications.masterDesc') || 'Dispatches alerts on update discovery, pipeline completion, or auto-rollbacks.'}
                </p>
              </div>
            </label>

            <div className="flex items-center gap-2 text-xs bg-slate-800/60 px-3 py-1.5 rounded-xl border border-slate-700/60">
              <Key className="w-3.5 h-3.5 text-cyan-400" />
              <span className="text-slate-400">Webhook Secret:</span>
              <span className="font-mono text-cyan-300 font-semibold">{settings.webhookSecret || '••••••••'}</span>
            </div>
          </div>

          {/* Public App URL Input */}
          <div className="pt-2 border-t border-slate-800/60">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5 text-cyan-400" />
                <span>FleetUpdate-Hub Public Domain / URL</span>
              </label>
              <span className="text-[11px] text-slate-500">
                Used in mobile notification buttons (Dashboard Link)
              </span>
            </div>
            <input
              type="text"
              value={settings.publicUrl || ''}
              onChange={(e) => setSettings({ ...settings, publicUrl: e.target.value })}
              placeholder={typeof window !== 'undefined' ? window.location.origin : 'https://update.mydomain.com'}
              className="w-full mt-1 px-3.5 py-2 rounded-xl bg-slate-950/80 border border-slate-700/60 text-cyan-300 text-xs font-mono focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
            />
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-1 p-2 bg-slate-950/60 border-b border-slate-800/80 overflow-x-auto">
          <button
            onClick={() => setActiveTab('ha')}
            className={`px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all shrink-0 ${
              activeTab === 'ha'
                ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-slate-900'
            }`}
          >
            <Home className="w-4 h-4 text-indigo-400" />
            <span>Home Assistant</span>
            {settings.homeAssistant?.enabled && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />}
          </button>

          <button
            onClick={() => setActiveTab('talk')}
            className={`px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all shrink-0 ${
              activeTab === 'talk'
                ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40 shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-slate-900'
            }`}
          >
            <MessageSquare className="w-4 h-4 text-blue-400" />
            <span>Nextcloud Talk</span>
            {settings.nextcloudTalk?.enabled && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />}
          </button>

          <button
            onClick={() => setActiveTab('discord')}
            className={`px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all shrink-0 ${
              activeTab === 'discord'
                ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40 shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-slate-900'
            }`}
          >
            <Sparkles className="w-4 h-4 text-purple-400" />
            <span>Discord</span>
            {settings.discord?.enabled && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />}
          </button>

          <button
            onClick={() => setActiveTab('telegram')}
            className={`px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all shrink-0 ${
              activeTab === 'telegram'
                ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40 shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-slate-900'
            }`}
          >
            <Send className="w-4 h-4 text-sky-400" />
            <span>Telegram</span>
            {settings.telegram?.enabled && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />}
          </button>

          <button
            onClick={() => setActiveTab('webhook')}
            className={`px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all shrink-0 ${
              activeTab === 'webhook'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-slate-900'
            }`}
          >
            <Link className="w-4 h-4 text-emerald-400" />
            <span>Custom Webhook</span>
            {settings.genericWebhook?.enabled && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />}
          </button>
        </div>

        {/* Tab Body Content */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          {feedback && (
            <div
              className={`p-3 rounded-xl border flex items-center gap-3 text-xs animate-fadeIn ${
                feedback.type === 'success'
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                  : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
              }`}
            >
              {feedback.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 shrink-0" />
              )}
              <span>{feedback.message}</span>
            </div>
          )}

          {/* 1. HOME ASSISTANT TAB */}
          {activeTab === 'ha' && (
            <div className="space-y-4">
              <label className="flex items-center gap-3 cursor-pointer p-3 rounded-xl bg-slate-900/60 border border-slate-800">
                <input
                  type="checkbox"
                  checked={settings.homeAssistant?.enabled}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      homeAssistant: { ...settings.homeAssistant, enabled: e.target.checked }
                    })
                  }
                  className="w-4 h-4 rounded text-indigo-500 focus:ring-indigo-400 bg-slate-800 border-slate-700"
                />
                <div>
                  <span className="font-semibold text-sm text-white">
                    {t('notifications.haEnable') || 'Enable Home Assistant Notifications'}
                  </span>
                  <p className="text-xs text-slate-400">
                    {t('notifications.haDesc') || 'Send persistent and mobile companion alerts with interactive action buttons.'}
                  </p>
                </div>
              </label>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Home Assistant URL
                  </label>
                  <input
                    type="text"
                    value={settings.homeAssistant?.url || ''}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        homeAssistant: { ...settings.homeAssistant, url: e.target.value }
                      })
                    }
                    placeholder="http://homeassistant.local:8123 or https://ha.mydomain.com"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900/80 border border-slate-700/60 text-white text-xs font-mono focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Long-Lived Access Token (LLAT)
                  </label>
                  <input
                    type="password"
                    value={settings.homeAssistant?.token || ''}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        homeAssistant: { ...settings.homeAssistant, token: e.target.value }
                      })
                    }
                    placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900/80 border border-slate-700/60 text-white text-xs font-mono focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    Generated in Home Assistant Profile &gt; Security &gt; Long-Lived Access Tokens.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Notification Service
                    </label>
                    <input
                      type="text"
                      value={settings.homeAssistant?.notifyService || 'notify.notify'}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          homeAssistant: { ...settings.homeAssistant, notifyService: e.target.value }
                        })
                      }
                      placeholder="notify.notify or notify.mobile_app_phone"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900/80 border border-slate-700/60 text-white text-xs font-mono focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>

                  <div className="flex items-center pt-5">
                    <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300">
                      <input
                        type="checkbox"
                        checked={settings.homeAssistant?.enableActions}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            homeAssistant: { ...settings.homeAssistant, enableActions: e.target.checked }
                          })
                        }
                        className="w-4 h-4 rounded text-indigo-500 focus:ring-indigo-400 bg-slate-800 border-slate-700"
                      />
                      <span>Enable Mobile Action Buttons (⚡ Update All)</span>
                    </label>
                  </div>
                </div>

                <div className="pt-2 flex justify-end">
                  <button
                    type="button"
                    onClick={() => handleTestChannel('homeAssistant', settings.homeAssistant)}
                    disabled={testing === 'homeAssistant' || !settings.homeAssistant?.url}
                    className="px-4 py-2 rounded-xl text-xs font-semibold text-indigo-300 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 transition-colors flex items-center gap-2 disabled:opacity-50"
                  >
                    {testing === 'homeAssistant' ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Send className="w-3.5 h-3.5" />
                    )}
                    <span>Test Home Assistant Notification</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 2. NEXTCLOUD TALK TAB */}
          {activeTab === 'talk' && (
            <div className="space-y-4">
              <label className="flex items-center gap-3 cursor-pointer p-3 rounded-xl bg-slate-900/60 border border-slate-800">
                <input
                  type="checkbox"
                  checked={settings.nextcloudTalk?.enabled}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      nextcloudTalk: { ...settings.nextcloudTalk, enabled: e.target.checked }
                    })
                  }
                  className="w-4 h-4 rounded text-blue-500 focus:ring-blue-400 bg-slate-800 border-slate-700"
                />
                <div>
                  <span className="font-semibold text-sm text-white">
                    {t('notifications.talkEnable') || 'Enable Nextcloud Talk Chat / Bot'}
                  </span>
                  <p className="text-xs text-slate-400">
                    {t('notifications.talkDesc') || 'Send rich chat messages to your Nextcloud Talk conversation or room bot.'}
                  </p>
                </div>
              </label>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Nextcloud Base URL
                  </label>
                  <input
                    type="text"
                    value={settings.nextcloudTalk?.url || ''}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        nextcloudTalk: { ...settings.nextcloudTalk, url: e.target.value }
                      })
                    }
                    placeholder="https://cloud.mydomain.com"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900/80 border border-slate-700/60 text-white text-xs font-mono focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Talk Room Token or Webhook URL
                  </label>
                  <input
                    type="text"
                    value={settings.nextcloudTalk?.roomTokenOrWebhook || ''}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        nextcloudTalk: { ...settings.nextcloudTalk, roomTokenOrWebhook: e.target.value }
                      })
                    }
                    placeholder="e.g. abc123token or https://cloud.domain.com/ocs/v2.php/apps/spreed/api/v1/chat/..."
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900/80 border border-slate-700/60 text-white text-xs font-mono focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    The room token is found in the Nextcloud Talk conversation URL (e.g. /call/abc123token).
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Talk Bot Secret (Optional)
                  </label>
                  <input
                    type="password"
                    value={settings.nextcloudTalk?.botSecret || ''}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        nextcloudTalk: { ...settings.nextcloudTalk, botSecret: e.target.value }
                      })
                    }
                    placeholder="Optional secret for bot signature verification"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900/80 border border-slate-700/60 text-white text-xs font-mono focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                <div className="pt-2 flex justify-end">
                  <button
                    type="button"
                    onClick={() => handleTestChannel('nextcloudTalk', settings.nextcloudTalk)}
                    disabled={testing === 'nextcloudTalk' || !settings.nextcloudTalk?.roomTokenOrWebhook}
                    className="px-4 py-2 rounded-xl text-xs font-semibold text-blue-300 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 transition-colors flex items-center gap-2 disabled:opacity-50"
                  >
                    {testing === 'nextcloudTalk' ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Send className="w-3.5 h-3.5" />
                    )}
                    <span>Test Nextcloud Talk Message</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 3. DISCORD TAB */}
          {activeTab === 'discord' && (
            <div className="space-y-4">
              <label className="flex items-center gap-3 cursor-pointer p-3 rounded-xl bg-slate-900/60 border border-slate-800">
                <input
                  type="checkbox"
                  checked={settings.discord?.enabled}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      discord: { ...settings.discord, enabled: e.target.checked }
                    })
                  }
                  className="w-4 h-4 rounded text-purple-500 focus:ring-purple-400 bg-slate-800 border-slate-700"
                />
                <div>
                  <span className="font-semibold text-sm text-white">Enable Discord Webhook</span>
                  <p className="text-xs text-slate-400">Post rich embed alerts to a Discord channel.</p>
                </div>
              </label>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Discord Webhook URL
                  </label>
                  <input
                    type="text"
                    value={settings.discord?.webhookUrl || ''}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        discord: { ...settings.discord, webhookUrl: e.target.value }
                      })
                    }
                    placeholder="https://discord.com/api/webhooks/..."
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900/80 border border-slate-700/60 text-white text-xs font-mono focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
                  />
                </div>

                <div className="pt-2 flex justify-end">
                  <button
                    type="button"
                    onClick={() => handleTestChannel('discord', settings.discord)}
                    disabled={testing === 'discord' || !settings.discord?.webhookUrl}
                    className="px-4 py-2 rounded-xl text-xs font-semibold text-purple-300 bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/30 transition-colors flex items-center gap-2 disabled:opacity-50"
                  >
                    {testing === 'discord' ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Send className="w-3.5 h-3.5" />
                    )}
                    <span>Test Discord Webhook</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 4. TELEGRAM TAB */}
          {activeTab === 'telegram' && (
            <div className="space-y-4">
              <label className="flex items-center gap-3 cursor-pointer p-3 rounded-xl bg-slate-900/60 border border-slate-800">
                <input
                  type="checkbox"
                  checked={settings.telegram?.enabled}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      telegram: { ...settings.telegram, enabled: e.target.checked }
                    })
                  }
                  className="w-4 h-4 rounded text-sky-500 focus:ring-sky-400 bg-slate-800 border-slate-700"
                />
                <div>
                  <span className="font-semibold text-sm text-white">Enable Telegram Bot</span>
                  <p className="text-xs text-slate-400">Send direct push notifications via Telegram Bot API.</p>
                </div>
              </label>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Telegram Bot Token
                  </label>
                  <input
                    type="password"
                    value={settings.telegram?.botToken || ''}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        telegram: { ...settings.telegram, botToken: e.target.value }
                      })
                    }
                    placeholder="123456789:ABCdefGhIJKlmNoPQRstUVwxyZ"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900/80 border border-slate-700/60 text-white text-xs font-mono focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Telegram Chat ID
                  </label>
                  <input
                    type="text"
                    value={settings.telegram?.chatId || ''}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        telegram: { ...settings.telegram, chatId: e.target.value }
                      })
                    }
                    placeholder="-100123456789 or 987654321"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900/80 border border-slate-700/60 text-white text-xs font-mono focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
                  />
                </div>

                <div className="pt-2 flex justify-end">
                  <button
                    type="button"
                    onClick={() => handleTestChannel('telegram', settings.telegram)}
                    disabled={testing === 'telegram' || !settings.telegram?.botToken}
                    className="px-4 py-2 rounded-xl text-xs font-semibold text-sky-300 bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/30 transition-colors flex items-center gap-2 disabled:opacity-50"
                  >
                    {testing === 'telegram' ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Send className="w-3.5 h-3.5" />
                    )}
                    <span>Test Telegram Notification</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 5. CUSTOM WEBHOOK & ACTION CALLBACKS */}
          {activeTab === 'webhook' && (
            <div className="space-y-4">
              <label className="flex items-center gap-3 cursor-pointer p-3 rounded-xl bg-slate-900/60 border border-slate-800">
                <input
                  type="checkbox"
                  checked={settings.genericWebhook?.enabled}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      genericWebhook: { ...settings.genericWebhook, enabled: e.target.checked }
                    })
                  }
                  className="w-4 h-4 rounded text-emerald-500 focus:ring-emerald-400 bg-slate-800 border-slate-700"
                />
                <div>
                  <span className="font-semibold text-sm text-white">Enable Generic Outgoing Webhook</span>
                  <p className="text-xs text-slate-400">Post JSON payloads to any endpoint (n8n, Node-RED, custom API).</p>
                </div>
              </label>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Webhook Destination URL
                  </label>
                  <input
                    type="text"
                    value={settings.genericWebhook?.webhookUrl || ''}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        genericWebhook: { ...settings.genericWebhook, webhookUrl: e.target.value }
                      })
                    }
                    placeholder="https://n8n.mydomain.com/webhook/fleetupdate-events"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900/80 border border-slate-700/60 text-white text-xs font-mono focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                  />
                </div>

                <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-cyan-300">
                    <Shield className="w-4 h-4" />
                    <span>Incoming Action Webhook (Callback API)</span>
                  </div>
                  <p className="text-xs text-slate-400">
                    To trigger updates from Home Assistant scripts or Nextcloud Talk bots, call:
                  </p>
                  <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 font-mono text-[11px] text-cyan-300 overflow-x-auto">
                    POST /api/webhooks/action?secret=YOUR_WEBHOOK_SECRET
                  </div>
                  <div className="text-[11px] text-slate-400 font-mono">
                    Payload: {`{ "action": "TRIGGER_UPDATE_ALL" }`}
                  </div>
                </div>

                <div className="pt-2 flex justify-end">
                  <button
                    type="button"
                    onClick={() => handleTestChannel('genericWebhook', settings.genericWebhook)}
                    disabled={testing === 'genericWebhook' || !settings.genericWebhook?.webhookUrl}
                    className="px-4 py-2 rounded-xl text-xs font-semibold text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 transition-colors flex items-center gap-2 disabled:opacity-50"
                  >
                    {testing === 'genericWebhook' ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Send className="w-3.5 h-3.5" />
                    )}
                    <span>Test Generic Webhook</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800/80 bg-slate-900/80 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white bg-slate-800/60 hover:bg-slate-700/80 border border-slate-700/60 transition-colors"
          >
            {t('common.close') || 'Close'}
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={saving || loading}
            className="px-5 py-2 rounded-xl text-xs font-bold text-slate-950 bg-gradient-to-r from-cyan-400 to-cyan-500 hover:from-cyan-300 hover:to-cyan-400 shadow-lg shadow-cyan-500/20 disabled:opacity-50 transition-all flex items-center gap-2"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>{t('common.saving') || 'Saving...'}</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                <span>{t('common.saveSettings') || 'Save Notification Settings'}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
