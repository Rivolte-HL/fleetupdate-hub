import React from 'react';
import { Zap, Send, Loader2 } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext.js';

interface WebhookChannelProps {
  settings: {
    enabled?: boolean;
    webhookUrl?: string;
    customHeaders?: Record<string, string>;
  };
  onChange: (updated: any) => void;
  onTest: () => void;
  isTesting: boolean;
}

export const WebhookChannel: React.FC<WebhookChannelProps> = ({
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
            <Zap className="w-5 h-5 text-amber-400" />
            <span>{t('notifications.webhookTitle')}</span>
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">{t('notifications.webhookDesc')}</p>
        </div>
        <label className="flex items-center gap-2.5 cursor-pointer">
          <input
            type="checkbox"
            checked={settings?.enabled || false}
            onChange={(e) => onChange({ ...settings, enabled: e.target.checked })}
            className="w-4 h-4 rounded text-amber-500 focus:ring-amber-400 bg-slate-800 border-slate-700"
          />
          <span className="text-xs font-bold text-white">{t('notifications.webhookEnable')}</span>
        </label>
      </div>

      <div>
        <label className="text-xs font-semibold text-slate-300 block mb-1">
          Target Webhook URL (POST JSON)
        </label>
        <input
          type="text"
          value={settings?.webhookUrl || ''}
          onChange={(e) => onChange({ ...settings, webhookUrl: e.target.value })}
          placeholder="https://n8n.domain.com/webhook/fleetupdate-alerts"
          className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950/80 border border-slate-700/60 text-white text-xs font-mono focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
        />
      </div>

      {/* Test Button */}
      <div className="pt-4 border-t border-slate-800 flex justify-end">
        <button
          type="button"
          onClick={onTest}
          disabled={isTesting}
          className="px-5 py-2 rounded-xl text-xs font-bold text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/40 disabled:opacity-50 transition-colors flex items-center gap-2 cursor-pointer"
        >
          {isTesting ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Send className="w-3.5 h-3.5" />
          )}
          <span>{t('notifications.testChannel')} Generic Webhook</span>
        </button>
      </div>
    </div>
  );
};
