import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Server, History, KeyRound, ShieldAlert, ShieldCheck, BookOpen, ChevronRight, Bell } from 'lucide-react';
import { useAuth } from '../context/AuthContext.js';
import { useLanguage } from '../context/LanguageContext.js';
import { ServiceTutorialModal } from './ServiceTutorialModal.js';

export const Sidebar: React.FC = () => {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [showTutorialModal, setShowTutorialModal] = useState(false);
  const isAdmin = user?.role === 'ADMIN';

  const navItems = [
    { to: '/', label: t('nav.dashboard'), icon: LayoutDashboard },
    { to: '/hosts', label: t('nav.hosts'), icon: Server },
    { to: '/updates', label: t('nav.updates'), icon: History },
    { to: '/notifications', label: t('nav.notifications'), icon: Bell },
    ...(isAdmin
      ? [
          { to: '/vault', label: t('nav.vault'), icon: KeyRound },
          { to: '/audit', label: t('nav.audit'), icon: ShieldAlert }
        ]
      : [])
  ];

  return (
    <>
      <aside className="w-64 border-r border-slate-800/80 bg-[#0a0f1d]/90 backdrop-blur-xl flex flex-col justify-between p-4 min-h-[calc(100vh-4rem)] shrink-0 select-none">
        <div className="space-y-6">
          <div className="px-2">
            <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 mb-3 px-2">
              {t('nav.mainMenu')}
            </div>
            <nav className="space-y-1.5">
              {navItems.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to === '/'}
                    className={({ isActive }) =>
                      `flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-bold transition-all group ${
                        isActive
                          ? 'bg-gradient-to-r from-cyan-500/20 to-blue-500/10 text-cyan-300 border border-cyan-500/30 shadow-md shadow-cyan-950/30'
                          : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/60 border border-transparent'
                      }`
                    }
                  >
                    <div className="flex items-center gap-3">
                      <Icon className="w-4 h-4 flex-shrink-0 text-cyan-400/80 group-hover:text-cyan-300 transition-colors" />
                      <span>{item.label}</span>
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 text-slate-500 transition-opacity" />
                  </NavLink>
                );
              })}
            </nav>
          </div>

          {/* Guides & Quick Help */}
          <div className="px-2">
            <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 mb-2 px-2">
              {t('nav.assistance')}
            </div>
            <button
              type="button"
              onClick={() => setShowTutorialModal(true)}
              className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-bold text-amber-300 hover:text-amber-200 bg-amber-500/10 hover:bg-amber-500/15 border border-amber-500/20 hover:border-amber-500/30 transition-all shadow-sm group"
            >
              <div className="flex items-center gap-3">
                <BookOpen className="w-4 h-4 text-amber-400 flex-shrink-0" />
                <span>{t('nav.tutorials')}</span>
              </div>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-mono">{t('nav.tutorialsCount')}</span>
            </button>
          </div>
        </div>

        {/* Bottom security assurance pill */}
        <div className="p-3 rounded-2xl bg-slate-900/80 border border-slate-800/80 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <div className="font-bold text-slate-200 text-[11px] flex items-center gap-1.5">
                <span>{t('common.appName')}</span>
                <span className="text-[10px] font-mono text-cyan-400 font-bold">v1.2.0</span>
              </div>
              <div className="text-[10px] text-slate-500">{t('common.aesVaultActive')}</div>
            </div>
          </div>
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-sm shadow-emerald-400/50" />
        </div>
      </aside>

      {showTutorialModal && (
        <ServiceTutorialModal
          initialService="PROXMOX"
          onClose={() => setShowTutorialModal(false)}
        />
      )}
    </>
  );
};

