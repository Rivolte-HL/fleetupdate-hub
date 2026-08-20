import React from 'react';
import { Home, Eye, EyeOff, Send, Loader2 } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext.js';

interface HomeAssistantChannelProps {
  settings: {
    enabled?: boolean;
    url?: string;
    token?: string;
    notifyService?: string;
    enableActions?: boolean;
  };
  onChange: (updated: any) => void;
  onTest: () => void;
  isTesting: boolean;
  showToken: boolean;
  onToggleToken: () => void;
}

export const HomeAssistantChannel: React.FC<HomeAssistantChannelProps> = ({
  settings,
  onChange,
  onTest,
  isTesting,
  showToken,
  onToggleToken
}) => {
  const { t } = useLanguage();

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="flex items-center justify-between pb-4 border-b border-slate-800">
        <div>
          <h3 className="font-bold text-base text-white flex items-center gap-2">
            <Home className="w-5 h-5 text-indigo-400" />
            <span>{t('notifications.haTitle')}</span>
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">{t('notifications.haDesc')}</p>
        </div>
        <label className="flex items-center gap-2.5 cursor-pointer">
          <input
            type="checkbox"
            checked={settings?.enabled || false}
            onChange={(e) => onChange({ ...settings, enabled: e.target.checked })}
            className="w-4 h-4 rounded text-indigo-500 focus:ring-indigo-400 bg-slate-800 border-slate-700"
          />
          <span className="text-xs font-bold text-white">{t('notifications.haEnable')}</span>
        </label>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div>
          <label className="text-xs font-semibold text-slate-300 block mb-1">
            Home Assistant URL
          </label>
          <input
            type="text"
            value={settings?.url || ''}
            onChange={(e) => onChange({ ...settings, url: e.target.value })}
            placeholder="http://192.168.1.100:8123 ou https://home.domain.com"
            className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950/80 border border-slate-700/60 text-white text-xs font-mono focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        <div>
          <label className="text-xs font-semibold text-slate-300 block mb-1">
            Long-Lived Access Token (LLAT)
          </label>
          <div className="relative">
            <input
              type={showToken ? 'text' : 'password'}
              value={settings?.token || ''}
              onChange={(e) => onChange({ ...settings, token: e.target.value })}
              placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
              className="w-full px-3.5 py-2.5 pr-10 rounded-xl bg-slate-950/80 border border-slate-700/60 text-white text-xs font-mono focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            />
            <button
              type="button"
              onClick={onToggleToken}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 cursor-pointer"
            >
              {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <div>
          <label className="text-xs font-semibold text-slate-300 block mb-1">
            Service de Notification (Service Target)
          </label>
          <input
            type="text"
            value={settings?.notifyService || 'notify.notify'}
            onChange={(e) => onChange({ ...settings, notifyService: e.target.value })}
            placeholder="notify.notify, notify.mobile_app_phone ou persistent_notification"
            className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950/80 border border-slate-700/60 text-white text-xs font-mono focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        <div className="flex items-center">
          <label className="flex items-center gap-3 p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 cursor-pointer w-full">
            <input
              type="checkbox"
              checked={settings?.enableActions !== false}
              onChange={(e) => onChange({ ...settings, enableActions: e.target.checked })}
              className="w-4 h-4 rounded text-indigo-500 focus:ring-indigo-400 bg-slate-800 border-slate-700"
            />
            <div>
              <span className="text-xs font-bold text-white block">
                Boutons d'actions interactifs (Mobile Companion)
              </span>
              <span className="text-[11px] text-slate-400">
                Ajoute les boutons ⚡ Mettre tout à jour et 📊 Dashboard sur votre smartphone.
              </span>
            </div>
          </label>
        </div>
      </div>

      {/* Test Button */}
      <div className="pt-4 border-t border-slate-800 flex justify-end">
        <button
          type="button"
          onClick={onTest}
          disabled={isTesting}
          className="px-5 py-2 rounded-xl text-xs font-bold text-indigo-300 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/40 disabled:opacity-50 transition-colors flex items-center gap-2 cursor-pointer"
        >
          {isTesting ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Send className="w-3.5 h-3.5" />
          )}
          <span>{t('notifications.testChannel')} Home Assistant</span>
        </button>
      </div>
    </div>
  );
};
