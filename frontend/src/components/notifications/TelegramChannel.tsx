import React from 'react';
import { Send, Eye, EyeOff, Loader2 } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext.js';

interface TelegramChannelProps {
  settings: {
    enabled?: boolean;
    botToken?: string;
    chatId?: string;
  };
  onChange: (updated: any) => void;
  onTest: () => void;
  isTesting: boolean;
  showToken: boolean;
  onToggleToken: () => void;
}

export const TelegramChannel: React.FC<TelegramChannelProps> = ({
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
            <Send className="w-5 h-5 text-blue-400" />
            <span>{t('notifications.telegramTitle')}</span>
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">{t('notifications.telegramDesc')}</p>
        </div>
        <label className="flex items-center gap-2.5 cursor-pointer">
          <input
            type="checkbox"
            checked={settings?.enabled || false}
            onChange={(e) => onChange({ ...settings, enabled: e.target.checked })}
            className="w-4 h-4 rounded text-blue-500 focus:ring-blue-400 bg-slate-800 border-slate-700"
          />
          <span className="text-xs font-bold text-white">{t('notifications.telegramEnable')}</span>
        </label>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div>
          <label className="text-xs font-semibold text-slate-300 block mb-1">
            Telegram Bot Token
          </label>
          <div className="relative">
            <input
              type={showToken ? 'text' : 'password'}
              value={settings?.botToken || ''}
              onChange={(e) => onChange({ ...settings, botToken: e.target.value })}
              placeholder="123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ..."
              className="w-full px-3.5 py-2.5 pr-10 rounded-xl bg-slate-950/80 border border-slate-700/60 text-white text-xs font-mono focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
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
            Telegram Chat ID
          </label>
          <input
            type="text"
            value={settings?.chatId || ''}
            onChange={(e) => onChange({ ...settings, chatId: e.target.value })}
            placeholder="ex: 12345678 ou -10012345678"
            className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950/80 border border-slate-700/60 text-white text-xs font-mono focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Test Button */}
      <div className="pt-4 border-t border-slate-800 flex justify-end">
        <button
          type="button"
          onClick={onTest}
          disabled={isTesting}
          className="px-5 py-2 rounded-xl text-xs font-bold text-blue-300 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/40 disabled:opacity-50 transition-colors flex items-center gap-2 cursor-pointer"
        >
          {isTesting ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Send className="w-3.5 h-3.5" />
          )}
          <span>{t('notifications.testChannel')} Telegram</span>
        </button>
      </div>
    </div>
  );
};
