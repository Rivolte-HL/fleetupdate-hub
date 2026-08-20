import React from 'react';
import { Bell, Send, Loader2 } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext.js';

interface DiscordChannelProps {
  settings: {
    enabled?: boolean;
    webhookUrl?: string;
  };
  onChange: (updated: any) => void;
  onTest: () => void;
  isTesting: boolean;
}

export const DiscordChannel: React.FC<DiscordChannelProps> = ({
  settings,
  onChange,
  onTest,
  isTesting
}) => {
  const { t } = useLanguage();

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="flex items-center justify-between pb-4 border-b border-slate-800">
        <div>
          <h3 className="font-bold text-base text-white flex items-center gap-2">
            <Bell className="w-5 h-5 text-purple-400" />
            <span>{t('notifications.discordTitle')}</span>
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">{t('notifications.discordDesc')}</p>
        </div>
        <label className="flex items-center gap-2.5 cursor-pointer">
          <input
            type="checkbox"
            checked={settings?.enabled || false}
            onChange={(e) => onChange({ ...settings, enabled: e.target.checked })}
            className="w-4 h-4 rounded text-purple-500 focus:ring-purple-400 bg-slate-800 border-slate-700"
          />
          <span className="text-xs font-bold text-white">{t('notifications.discordEnable')}</span>
        </label>
      </div>

      <div>
        <label className="text-xs font-semibold text-slate-300 block mb-1">
          Discord Webhook URL
        </label>
        <input
          type="text"
          value={settings?.webhookUrl || ''}
          onChange={(e) => onChange({ ...settings, webhookUrl: e.target.value })}
          placeholder="https://discord.com/api/webhooks/123456789/abcdefgh..."
          className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950/80 border border-slate-700/60 text-white text-xs font-mono focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
        />
      </div>

      {/* Test Button */}
      <div className="pt-4 border-t border-slate-800 flex justify-end">
        <button
          type="button"
          onClick={onTest}
          disabled={isTesting}
          className="px-5 py-2 rounded-xl text-xs font-bold text-purple-300 bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/40 disabled:opacity-50 transition-colors flex items-center gap-2 cursor-pointer"
        >
          {isTesting ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Send className="w-3.5 h-3.5" />
          )}
          <span>{t('notifications.testChannel')} Discord</span>
        </button>
      </div>
    </div>
  );
};
