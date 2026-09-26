import React from 'react';
import { LucideIcon } from 'lucide-react';

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  variant?: 'cyan' | 'amber' | 'emerald' | 'rose' | 'slate';
  trend?: string;
}

export const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  subtitle,
  icon: Icon,
  variant = 'cyan',
  trend
}) => {
  const variantStyles = {
    cyan: {
      bg: 'from-cyan-500/10 to-blue-500/5',
      border: 'border-cyan-500/20',
      iconBg: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30'
    },
    amber: {
      bg: 'from-amber-500/10 to-yellow-500/5',
      border: 'border-amber-500/20',
      iconBg: 'bg-amber-500/10 text-amber-400 border-amber-500/30'
    },
    emerald: {
      bg: 'from-emerald-500/10 to-teal-500/5',
      border: 'border-emerald-500/20',
      iconBg: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
    },
    rose: {
      bg: 'from-rose-500/10 to-red-500/5',
      border: 'border-rose-500/20',
      iconBg: 'bg-rose-500/10 text-rose-400 border-rose-500/30'
    },
    slate: {
      bg: 'from-slate-800/40 to-slate-900/40',
      border: 'border-slate-800',
      iconBg: 'bg-slate-800 text-slate-400 border-slate-700'
    }
  };

  const style = variantStyles[variant];

  return (
    <div className={`p-5 rounded-2xl bg-gradient-to-br ${style.bg} border ${style.border} backdrop-blur-md shadow-lg transition-all duration-200 hover:border-cyan-500/40`}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">{title}</span>
        <div className={`p-2.5 rounded-xl border ${style.iconBg}`}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <div className="text-3xl font-extrabold text-white tracking-tight">{value}</div>
        {trend && <span className="text-xs font-medium text-slate-400">{trend}</span>}
      </div>
      {subtitle && <p className="text-xs text-slate-400 mt-1">{subtitle}</p>}
    </div>
  );
};
