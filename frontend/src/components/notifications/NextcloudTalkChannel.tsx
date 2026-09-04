import React from 'react';
import { MessageSquare, Eye, EyeOff, Send, Loader2 } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext.js';

interface NextcloudTalkChannelProps {
  settings: {
    enabled?: boolean;
    url?: string;
    roomTokenOrWebhook?: string;
    botSecret?: string;
  };
  onChange: (updated: any) => void;
  onTest: () => void;
  isTesting: boolean;
  showSecret: boolean;
  onToggleSecret: () => void;
}

export const NextcloudTalkChannel: React.FC<NextcloudTalkChannelProps> = ({
  settings,
  onChange,
  onTest,
  isTesting,
  showSecret,
  onToggleSecret
}) => {
  const { t } = useLanguage();

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="flex items-center justify-between pb-4 border-b border-slate-800">
        <div>
          <h3 className="font-bold text-base text-white flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-sky-400" />
            <span>{t('notifications.talkTitle')}</span>
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">{t('notifications.talkDesc')}</p>
        </div>
        <label className="flex items-center gap-2.5 cursor-pointer">
          <input
            type="checkbox"
            checked={settings?.enabled || false}
            onChange={(e) => onChange({ ...settings, enabled: e.target.checked })}
            className="w-4 h-4 rounded text-sky-500 focus:ring-sky-400 bg-slate-800 border-slate-700"
          />
          <span className="text-xs font-bold text-white">{t('notifications.talkEnable')}</span>
        </label>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div>
          <label className="text-xs font-semibold text-slate-300 block mb-1">
            Nextcloud Base URL
          </label>
          <input
            type="text"
            value={settings?.url || ''}
            onChange={(e) => onChange({ ...settings, url: e.target.value })}
            placeholder="https://cloud.votredomaine.com"
            className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950/80 border border-slate-700/60 text-white text-xs font-mono focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
          />
        </div>

        <div>
          <label className="text-xs font-semibold text-slate-300 block mb-1">
            Room Token ou Webhook complet
          </label>
          <input
            type="text"
            value={settings?.roomTokenOrWebhook || ''}
            onChange={(e) => onChange({ ...settings, roomTokenOrWebhook: e.target.value })}
            placeholder="ex: abcd1234room ou https://cloud.../chat/room123"
            className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950/80 border border-slate-700/60 text-white text-xs font-mono focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
          />
        </div>

        <div className="md:col-span-2">
          <label className="text-xs font-semibold text-slate-300 block mb-1">
            X-Nextcloud-Talk-Bot-Secret (Optionnel pour Bot Talk)
          </label>
          <div className="relative">
            <input
              type={showSecret ? 'text' : 'password'}
              value={settings?.botSecret || ''}
              onChange={(e) => onChange({ ...settings, botSecret: e.target.value })}
              placeholder="bot_secret_token..."
              className="w-full px-3.5 py-2.5 pr-10 rounded-xl bg-slate-950/80 border border-slate-700/60 text-white text-xs font-mono focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
            />
            <button
              type="button"
              onClick={onToggleSecret}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 cursor-pointer"
            >
              {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>

      {/* Test Button */}
      <div className="pt-4 border-t border-slate-800 flex justify-end">
        <button
          type="button"
          onClick={onTest}
          disabled={isTesting}
          className="px-5 py-2 rounded-xl text-xs font-bold text-sky-300 bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/40 disabled:opacity-50 transition-colors flex items-center gap-2 cursor-pointer"
        >
          {isTesting ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Send className="w-3.5 h-3.5" />
          )}
          <span>{t('notifications.testChannel')} Nextcloud Talk</span>
        </button>
      </div>
    </div>
  );
};
