import React, { useState } from 'react';
import {
  X,
  Zap,
  CheckSquare,
  Square,
  Shield,
  AlertTriangle,
  Server,
  Box,
  Home,
  CheckCircle2,
  Loader2,
  Layers
} from 'lucide-react';
import { Host } from '../types/index.js';
import { useLanguage } from '../context/LanguageContext.js';
import { api } from '../services/api.js';

interface BulkUpdateModalProps {
  isOpen: boolean;
  onClose: () => void;
  hosts: Host[];
  onSuccess: (tasks: any[]) => void;
}

export const BulkUpdateModal: React.FC<BulkUpdateModalProps> = ({
  isOpen,
  onClose,
  hosts,
  onSuccess
}) => {
  const { t } = useLanguage();

  // Filter only online hosts that have updates
  const upgradableHosts = hosts.filter(
    (h) => h.isOnline && (h.availableUpdatesCount || 0) > 0
  );

  const [selectedHostIds, setSelectedHostIds] = useState<string[]>(() =>
    upgradableHosts.map((h) => h.id)
  );
  const [autoRollback, setAutoRollback] = useState(true);
  const [stopOnError, setStopOnError] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const toggleHost = (id: string) => {
    setSelectedHostIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const selectAll = () => {
    setSelectedHostIds(upgradableHosts.map((h) => h.id));
  };

  const deselectAll = () => {
    setSelectedHostIds([]);
  };

  const getHostIcon = (adapterType: string) => {
    switch (adapterType) {
      case 'DOCKER':
        return <Box className="w-4 h-4 text-cyan-400" />;
      case 'HOME_ASSISTANT':
        return <Home className="w-4 h-4 text-indigo-400" />;
      case 'OPNSENSE':
        return <Shield className="w-4 h-4 text-emerald-400" />;
      default:
        return <Server className="w-4 h-4 text-slate-400" />;
    }
  };

  const totalPackagesSelected = upgradableHosts
    .filter((h) => selectedHostIds.includes(h.id))
    .reduce((sum, h) => sum + (h.availableUpdatesCount || 0), 0);

  const handleLaunch = async () => {
    if (selectedHostIds.length === 0) return;

    setLoading(true);
    setError(null);

    try {
      const res = await api.post('/updates/batch', {
        hostIds: selectedHostIds,
        autoRollback,
        stopOnError
      });

      onSuccess(res.data.tasks || []);
      onClose();
    } catch (err: any) {
      setError(
        err.response?.data?.message ||
          err.message ||
          'Failed to launch batch update.'
      );
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn">
      <div className="glass-card w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl border border-slate-700/60 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-slate-800/80 flex items-center justify-between bg-slate-900/60">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-bold text-lg text-white flex items-center gap-2">
                {t('bulk.title') || 'Bulk System Updates'}
                <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-mono">
                  {selectedHostIds.length}/{upgradableHosts.length}
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                {t('bulk.subtitle') ||
                  'Select targets to update in an orchestrated, fail-safe sequence.'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          {error && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center gap-3 text-rose-300 text-xs">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Quick Select Bar */}
          <div className="flex items-center justify-between text-xs text-slate-400 pb-1">
            <span>
              {t('bulk.selectTargets') || 'Select targets to include:'}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={selectAll}
                className="text-cyan-400 hover:underline flex items-center gap-1"
              >
                <CheckSquare className="w-3.5 h-3.5" />
                {t('bulk.selectAll') || 'Select All'}
              </button>
              <span>•</span>
              <button
                type="button"
                onClick={deselectAll}
                className="text-slate-400 hover:underline flex items-center gap-1"
              >
                <Square className="w-3.5 h-3.5" />
                {t('bulk.deselectAll') || 'Deselect All'}
              </button>
            </div>
          </div>

          {/* Hosts List */}
          <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
            {upgradableHosts.map((host) => {
              const isSelected = selectedHostIds.includes(host.id);
              return (
                <div
                  key={host.id}
                  onClick={() => toggleHost(host.id)}
                  className={`p-3.5 rounded-xl border cursor-pointer transition-all flex items-center justify-between gap-3 ${
                    isSelected
                      ? 'bg-slate-800/90 border-cyan-500/40 shadow-sm'
                      : 'bg-slate-900/40 border-slate-800 text-slate-500 opacity-60 hover:opacity-100'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-5 h-5 rounded-md flex items-center justify-center border transition-colors ${
                        isSelected
                          ? 'bg-cyan-500 border-cyan-400 text-slate-950'
                          : 'border-slate-700 bg-slate-800'
                      }`}
                    >
                      {isSelected && <CheckCircle2 className="w-3.5 h-3.5" />}
                    </div>

                    <div className="p-2 rounded-lg bg-slate-900 border border-slate-800 shrink-0">
                      {getHostIcon(host.adapterType)}
                    </div>

                    <div className="min-w-0">
                      <div className="font-semibold text-sm text-white truncate">
                        {host.name}
                      </div>
                      <div className="text-[11px] text-slate-400 font-mono truncate flex items-center gap-1.5 mt-0.5">
                        <span>{host.currentVersion || 'Current'}</span>
                        <span className="text-amber-400 font-bold">➔</span>
                        <span className="text-amber-300">
                          {host.targetVersion || 'Latest'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="shrink-0 flex items-center gap-2">
                    <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/25 text-amber-300">
                      +{host.availableUpdatesCount}{' '}
                      {t('common.updatesCount') || 'updates'}
                    </span>
                  </div>
                </div>
              );
            })}

            {upgradableHosts.length === 0 && (
              <div className="p-8 text-center text-slate-400 text-sm">
                <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
                {t('bulk.allUpToDate') ||
                  'All monitored hosts are completely up to date!'}
              </div>
            )}
          </div>

          {/* Execution Options */}
          <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2.5 text-xs text-slate-300">
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={autoRollback}
                onChange={(e) => setAutoRollback(e.target.checked)}
                className="w-4 h-4 rounded text-cyan-500 focus:ring-cyan-400 bg-slate-800 border-slate-700"
              />
              <div>
                <span className="font-medium text-white">
                  {t('bulk.autoRollback') || 'Automatic Rollback on Failure'}
                </span>
                <p className="text-[11px] text-slate-400">
                  {t('bulk.autoRollbackDesc') ||
                    'Instantly reverts host state if health check or post-start probe fails.'}
                </p>
              </div>
            </label>

            <label className="flex items-center gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={stopOnError}
                onChange={(e) => setStopOnError(e.target.checked)}
                className="w-4 h-4 rounded text-cyan-500 focus:ring-cyan-400 bg-slate-800 border-slate-700"
              />
              <div>
                <span className="font-medium text-white">
                  {t('bulk.stopOnError') || 'Stop Sequence on First Error'}
                </span>
                <p className="text-[11px] text-slate-400">
                  {t('bulk.stopOnErrorDesc') ||
                    'Halts remaining queued host updates if one host deployment fails.'}
                </p>
              </div>
            </label>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800/80 bg-slate-900/80 flex items-center justify-between gap-3">
          <div className="text-xs text-slate-400 font-mono">
            {selectedHostIds.length > 0 ? (
              <span>
                {selectedHostIds.length} {t('bulk.hostsSelected') || 'hosts'}{' '}
                (
                <strong className="text-amber-400">
                  {totalPackagesSelected}
                </strong>{' '}
                {t('bulk.itemsTotal') || 'packages/containers'})
              </span>
            ) : (
              <span className="text-rose-400">
                {t('bulk.noneSelected') || 'No host selected'}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white bg-slate-800/60 hover:bg-slate-700/80 border border-slate-700/60 transition-colors"
            >
              {t('common.cancel') || 'Cancel'}
            </button>

            <button
              type="button"
              onClick={handleLaunch}
              disabled={loading || selectedHostIds.length === 0}
              className="px-5 py-2 rounded-xl text-xs font-bold text-slate-950 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 shadow-lg shadow-amber-500/20 disabled:opacity-50 transition-all flex items-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>{t('bulk.launching') || 'Launching...'}</span>
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4 fill-slate-950" />
                  <span>
                    {t('bulk.startUpgrade') ||
                      `Update All (${selectedHostIds.length})`}
                  </span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
