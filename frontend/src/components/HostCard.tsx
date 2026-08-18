import React from "react";
import { Host } from "../types/index.js";
import { Server, Shield, Box, Terminal, Home, Archive, Play, RefreshCw, FileText, AlertTriangle, CheckCircle2, Edit2, ArrowUpRight } from "lucide-react";
import { Badge } from "./Badge.js";

interface HostCardProps {
  host: Host;
  onRefresh: (host: Host) => void;
  onTriggerUpdate: (host: Host) => void;
  onViewChangelog: (host: Host) => void;
  onSelect: (host: Host) => void;
  onEdit?: (host: Host) => void;
  loadingRefresh?: boolean;
}

export const HostCard: React.FC<HostCardProps> = ({
  host,
  onRefresh,
  onTriggerUpdate,
  onViewChangelog,
  onSelect,
  onEdit,
  loadingRefresh = false
}) => {
  const getAdapterTheme = () => {
    switch (host.adapterType) {
      case "PROXMOX":
        return {
          icon: <Server className="w-5 h-5 text-amber-400" />,
          bg: "bg-amber-500/10 border-amber-500/20 text-amber-300",
          label: "Proxmox VE"
        };
      case "PROXMOX_BACKUP_SERVER":
        return {
          icon: <Archive className="w-5 h-5 text-emerald-400" />,
          bg: "bg-emerald-500/10 border-emerald-500/20 text-emerald-300",
          label: "Proxmox PBS"
        };
      case "OPNSENSE":
        return {
          icon: <Shield className="w-5 h-5 text-cyan-400" />,
          bg: "bg-cyan-500/10 border-cyan-500/20 text-cyan-300",
          label: "OPNsense"
        };
      case "DOCKER":
        return {
          icon: <Box className="w-5 h-5 text-blue-400" />,
          bg: "bg-blue-500/10 border-blue-500/20 text-blue-300",
          label: "Docker"
        };
      case "LINUX_SSH":
        return {
          icon: <Terminal className="w-5 h-5 text-purple-400" />,
          bg: "bg-purple-500/10 border-purple-500/20 text-purple-300",
          label: "Linux SSH"
        };
      case "HOME_ASSISTANT":
        return {
          icon: <Home className="w-5 h-5 text-indigo-400" />,
          bg: "bg-indigo-500/10 border-indigo-500/20 text-indigo-300",
          label: "Home Assistant"
        };
      default:
        return {
          icon: <Server className="w-5 h-5 text-slate-400" />,
          bg: "bg-slate-500/10 border-slate-500/20 text-slate-300",
          label: host.adapterType
        };
    }
  };

  const theme = getAdapterTheme();
  const hasUpdates = (host.availableUpdatesCount || 0) > 0;
  const isOnline = Boolean(host.isOnline);

  return (
    <div
      onClick={() => onSelect(host)}
      className="glass-card-interactive p-5 rounded-2xl cursor-pointer flex flex-col justify-between group relative overflow-hidden"
    >
      {/* Top ambient color accent line */}
      <div className={`absolute top-0 left-0 right-0 h-0.5 ${
        !isOnline ? "bg-rose-500/50" : hasUpdates ? "bg-amber-500/60" : "bg-emerald-500/50"
      }`} />

      <div>
        {/* Header: Service Icon + Host Name + Actions */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className={`p-2.5 rounded-xl border flex items-center justify-center shrink-0 ${theme.bg}`}>
              {theme.icon}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-sm sm:text-base text-white group-hover:text-cyan-300 transition-colors truncate">
                  {host.name}
                </h3>
                <ArrowUpRight className="w-3.5 h-3.5 text-slate-500 opacity-0 group-hover:opacity-100 group-hover:text-cyan-400 transition-all shrink-0" />
              </div>

              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[11px] text-slate-400 font-mono truncate" title={host.endpointUrl}>
                  {host.endpointUrl}
                </span>
              </div>
            </div>
          </div>

          {/* Quick icon buttons */}
          <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
            {onEdit && (
              <button
                type="button"
                onClick={() => onEdit(host)}
                className="p-1.5 rounded-lg bg-slate-800/80 text-slate-400 hover:text-cyan-300 hover:bg-slate-700/80 border border-slate-700/60 transition-colors"
                title="Modifier les paramètres de l'hôte"
              >
                <Edit2 className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              type="button"
              onClick={() => onRefresh(host)}
              disabled={loadingRefresh}
              className="p-1.5 rounded-lg bg-slate-800/80 text-slate-400 hover:text-cyan-300 hover:bg-slate-700/80 border border-slate-700/60 transition-colors disabled:opacity-50"
              title="Actualiser le statut des versions"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingRefresh ? "animate-spin text-cyan-400" : ""}`} />
            </button>
            {hasUpdates && (
              <button
                type="button"
                onClick={() => onViewChangelog(host)}
                className="p-1.5 rounded-lg bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 border border-amber-500/30 transition-colors"
                title="Voir le journal des modifications"
              >
                <FileText className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Version Information Grid */}
        <div className="mt-4 pt-3.5 border-t border-slate-800/80 grid grid-cols-2 gap-2.5">
          <div className="p-2.5 rounded-xl bg-slate-900/70 border border-slate-800/60">
            <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500 block">Version Active</span>
            <span className="text-xs font-semibold text-slate-200 truncate block mt-0.5 font-mono" title={host.currentVersion || "Non détectée"}>
              {isOnline ? (host.currentVersion || "Non analysée") : "Injoignable"}
            </span>
          </div>

          <div className="p-2.5 rounded-xl bg-slate-900/70 border border-slate-800/60">
            <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500 block">Disponibilité</span>
            <div className="mt-0.5 flex items-center gap-1.5">
              {!isOnline ? (
                <span className="text-xs font-medium text-rose-400">Hors ligne</span>
              ) : hasUpdates ? (
                <span className="text-xs font-bold text-amber-400 font-mono">
                  {host.availableUpdatesCount} MàJ dispo
                </span>
              ) : (
                <span className="text-xs font-semibold text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> À jour
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Badges / Tags */}
        <div className="mt-3 flex items-center gap-1.5 flex-wrap">
          <Badge variant={isOnline ? "success" : "danger"} size="sm" pulse={isOnline}>
            {isOnline ? "En ligne" : "Hors ligne"}
          </Badge>
          <span className="text-[10px] px-2 py-0.5 rounded-md font-semibold bg-slate-800/90 text-slate-300 border border-slate-700/60">
            {theme.label}
          </span>
          {host.requiresReboot && (
            <Badge variant="warning" size="sm">
              <AlertTriangle className="w-3 h-3" /> Reboot Requis
            </Badge>
          )}
        </div>
      </div>

      {/* Action Footer */}
      <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between gap-2" onClick={(e) => e.stopPropagation()}>
        <span className="text-[10px] text-slate-500 font-mono">
          {host.lastCheckAt ? new Date(host.lastCheckAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "Pas de scan"}
        </span>

        <button
          type="button"
          onClick={() => onTriggerUpdate(host)}
          disabled={!isOnline || !hasUpdates}
          className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all shadow-sm ${
            hasUpdates && isOnline
              ? "bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white shadow-cyan-500/25 hover:shadow-cyan-500/40"
              : "bg-slate-800/60 text-slate-500 cursor-not-allowed border border-slate-700/40"
          }`}
        >
          <Play className="w-3 h-3 fill-current" />
          <span>Mettre à jour</span>
        </button>
      </div>
    </div>
  );
};

