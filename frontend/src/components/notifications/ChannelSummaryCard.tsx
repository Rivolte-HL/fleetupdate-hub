import React from 'react';

interface ChannelSummaryCardProps {
  id: string;
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  enabled: boolean;
  isActiveTab: boolean;
  activeColor: string;
  onClick: () => void;
}

export const ChannelSummaryCard: React.FC<ChannelSummaryCardProps> = ({
  title,
  subtitle,
  icon,
  enabled,
  isActiveTab,
  activeColor,
  onClick
}) => {
  return (
    <div
      onClick={onClick}
      className={`cursor-pointer glass-card p-4 rounded-2xl border transition-all duration-200 flex flex-col justify-between ${
        isActiveTab
          ? `${activeColor} shadow-lg`
          : 'border-slate-800/80 hover:border-slate-700 bg-slate-900/40'
      }`}
    >
      <div className="flex items-start justify-between">
        <div className="p-2.5 rounded-xl bg-slate-800/80 border border-slate-700/60">
          {icon}
        </div>
        <span
          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
            enabled
              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
              : 'bg-slate-800 text-slate-500'
          }`}
        >
          {enabled ? 'ACTIF' : 'INACTIF'}
        </span>
      </div>
      <div className="mt-4">
        <h4 className="font-bold text-sm text-white">{title}</h4>
        <p className="text-[11px] text-slate-400 mt-1 line-clamp-2">
          {subtitle}
        </p>
      </div>
    </div>
  );
};
