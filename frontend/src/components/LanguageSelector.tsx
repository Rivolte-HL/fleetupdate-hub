import React from 'react';
import { useLanguage } from '../context/LanguageContext.js';
import { Globe } from 'lucide-react';

interface LanguageSelectorProps {
  compact?: boolean;
}

export const LanguageSelector: React.FC<LanguageSelectorProps> = ({ compact = false }) => {
  const { language, setLanguage } = useLanguage();

  return (
    <div className="flex items-center gap-1 bg-slate-900/90 border border-slate-800 rounded-xl p-1 shadow-sm">
      {!compact && <Globe className="w-3.5 h-3.5 text-slate-400 ml-1.5 shrink-0" />}
      <button
        type="button"
        onClick={() => setLanguage('en')}
        className={`px-2 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
          language === 'en'
            ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 shadow-xs'
            : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
        }`}
        title="Switch to English"
      >
        <span>🇬🇧</span>
        <span>EN</span>
      </button>
      <button
        type="button"
        onClick={() => setLanguage('fr')}
        className={`px-2 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
          language === 'fr'
            ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 shadow-xs'
            : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
        }`}
        title="Passer en Français"
      >
        <span>🇫🇷</span>
        <span>FR</span>
      </button>
    </div>
  );
};
