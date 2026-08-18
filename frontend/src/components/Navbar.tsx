import React from "react";
import { useAuth } from "../context/AuthContext.js";
import { Shield, Lock, LogOut, Key, CheckCircle2, KeyRound, Radio } from "lucide-react";
import { Badge } from "./Badge.js";

interface NavbarProps {
  onOpen2FAModal?: () => void;
  onOpenPasswordModal?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ onOpen2FAModal, onOpenPasswordModal }) => {
  const { user, logout } = useAuth();

  return (
    <header className="h-16 border-b border-slate-800/90 bg-[#0c1222]/85 backdrop-blur-xl px-6 flex items-center justify-between sticky top-0 z-30 shadow-md">
      {/* Brand & Subtitle */}
      <div className="flex items-center gap-3.5">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-500 via-blue-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-cyan-500/25 border border-cyan-400/30 shrink-0">
          <Shield className="w-5 h-5 text-white" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-extrabold text-base tracking-tight text-white">FleetUpdate-Hub</h1>
            <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-cyan-500/15 border border-cyan-500/30 text-cyan-300">
              Zero-Trust
            </span>
          </div>
          <p className="text-[11px] text-slate-400 font-medium">Orchestration & Sécurité d'Infrastructure</p>
        </div>
      </div>

      {/* Center / Right status & Actions */}
      <div className="flex items-center gap-4">
        {/* Security Vault Indicator */}
        <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900/80 border border-slate-800 text-xs text-slate-300">
          <Lock className="w-3.5 h-3.5 text-emerald-400" />
          <span className="font-semibold text-slate-200">Coffre AES-256-GCM Actif</span>
        </div>

        {/* User profile & controls */}
        {user && (
          <div className="flex items-center gap-3 pl-3 border-l border-slate-800">
            <div className="text-right hidden sm:block">
              <div className="text-xs font-bold text-slate-200 leading-tight">{user.name || user.email}</div>
              <div className="flex items-center justify-end gap-1.5 mt-0.5">
                <Badge variant={user.role === "ADMIN" ? "brand" : "neutral"} size="sm">
                  {user.role}
                </Badge>
                {user.twoFactorEnabled ? (
                  <span className="flex items-center gap-0.5 text-[10px] font-bold text-emerald-400">
                    <CheckCircle2 className="w-3 h-3" /> 2FA
                  </span>
                ) : (
                  <span className="text-[10px] text-amber-400 font-medium">
                    2FA inactif
                  </span>
                )}
              </div>
            </div>

            {/* Quick Action buttons */}
            <div className="flex items-center gap-1.5">
              {onOpenPasswordModal && (
                <button
                  type="button"
                  onClick={onOpenPasswordModal}
                  className="p-2 rounded-xl bg-slate-900 text-slate-300 hover:text-cyan-300 hover:bg-slate-800 border border-slate-800 transition-colors"
                  title="Changer de mot de passe"
                >
                  <KeyRound className="w-4 h-4" />
                </button>
              )}
              {!user.twoFactorEnabled && onOpen2FAModal && (
                <button
                  type="button"
                  onClick={onOpen2FAModal}
                  className="p-2 rounded-xl bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 border border-amber-500/30 transition-colors"
                  title="Activer la protection TOTP 2FA"
                >
                  <Key className="w-4 h-4" />
                </button>
              )}
              <button
                type="button"
                onClick={logout}
                className="p-2 rounded-xl bg-slate-900 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 border border-slate-800 hover:border-rose-500/30 transition-colors"
                title="Déconnexion sécurisée"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </header>
  );
};

