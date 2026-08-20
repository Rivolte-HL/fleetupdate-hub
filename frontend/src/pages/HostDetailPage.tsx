import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Host, BackupRecord } from "../types/index.js";
import { hostsService } from "../services/hosts.service.js";
import { updatesService } from "../services/updates.service.js";
import { useToast } from "../context/ToastContext.js";
import { useLanguage } from "../context/LanguageContext.js";
import { Badge } from "../components/Badge.js";
import { PipelineExecutionModal } from "../components/PipelineExecutionModal.js";
import { RollbackConfirmModal } from "../components/RollbackConfirmModal.js";
import { EditHostModal } from "../components/EditHostModal.js";
import { ArrowLeft, Play, RefreshCw, Trash2, Server, HardDrive, Key, AlertTriangle, RotateCcw, Edit3 } from "lucide-react";

export const HostDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { addToast } = useToast();
  const { t } = useLanguage();

  const [host, setHost] = useState<Host | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedBackupRollback, setSelectedBackupRollback] = useState<BackupRecord | null>(null);
  const [rollbackLoading, setRollbackLoading] = useState(false);

  const loadHost = async () => {
    if (!id) return;
    try {
      setLoading(true);
      const data = await hostsService.getHostById(id);
      setHost(data);
    } catch (err: any) {
      addToast("error", t('common.error'), err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadHost();
  }, [id]);

  const handleRefresh = async () => {
    if (!host) return;
    try {
      addToast("info", t('common.refreshing'), `${host.name}...`);
      const res = await hostsService.refreshVersion(host.id);
      setHost(res.host);
      addToast("success", t('common.success'), `${host.name} : ${res.versionInfo?.hasUpdate ? t('common.updatesAvailable') : t('common.upToDate')}`);
    } catch (err: any) {
      addToast("error", t('common.error'), err.response?.data?.message || err.message);
    }
  };

  const handleTriggerUpdate = async () => {
    if (!host) return;
    try {
      const res = await updatesService.triggerUpdate({ hostId: host.id, autoRollback: true });
      addToast("success", t('pipeline.title'), res.message);
      setActiveTaskId(res.task.id);
    } catch (err: any) {
      addToast("error", t('common.error'), err.message);
    }
  };

  const handleConfirmRollback = async () => {
    if (!host || !selectedBackupRollback) return;
    setRollbackLoading(true);
    try {
      const res = await updatesService.triggerRollback({
        hostId: host.id,
        backupRecordId: selectedBackupRollback.id
      });
      addToast("success", t('common.rollback'), res.message);
      setSelectedBackupRollback(null);
      loadHost();
    } catch (err: any) {
      addToast("error", t('common.error'), err.message);
    } finally {
      setRollbackLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!host || !window.confirm(t('hostDetail.deleteHostConfirm'))) return;
    try {
      await hostsService.deleteHost(host.id);
      addToast("success", t('common.success'), t('hosts.hostDeletedSuccess'));
      navigate("/hosts");
    } catch (err: any) {
      addToast("error", t('common.error'), err.message);
    }
  };

  if (loading || !host) {
    return (
      <div className="p-12 text-center text-slate-400 space-y-3">
        <div className="w-8 h-8 rounded-full border-2 border-cyan-500 border-t-transparent animate-spin mx-auto" />
        <p className="text-xs">{t('common.loading')}</p>
      </div>
    );
  }

  const hasUpdates = (host.availableUpdatesCount || 0) > 0;
  const isOnline = Boolean(host.isOnline);

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <button
            type="button"
            onClick={() => navigate("/hosts")}
            className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:border-slate-700 transition-colors"
            title={t('hostDetail.backToHosts')}
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h2 className="text-2xl font-extrabold text-white tracking-tight">{host.name}</h2>
              <Badge variant={isOnline ? "success" : "danger"} size="sm" pulse={isOnline}>
                {isOnline ? t('common.online') : t('common.offline')}
              </Badge>
              <span className="text-[11px] font-mono px-2 py-0.5 rounded-md bg-slate-800 text-cyan-300 font-bold border border-slate-700">
                {host.adapterType}
              </span>
            </div>
            <p className="text-xs text-slate-400 font-mono mt-0.5">{host.endpointUrl}</p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            type="button"
            onClick={() => setShowEditModal(true)}
            className="p-2.5 rounded-xl bg-slate-900 text-slate-300 hover:text-cyan-300 border border-slate-800 hover:border-slate-700 transition-colors flex items-center gap-1.5 text-xs font-bold"
            title={t('common.edit')}
          >
            <Edit3 className="w-4 h-4" />
            <span className="hidden sm:inline">{t('common.edit')}</span>
          </button>

          <button
            type="button"
            onClick={handleRefresh}
            className="p-2.5 rounded-xl bg-slate-900 text-slate-300 hover:text-cyan-300 border border-slate-800 hover:border-slate-700 transition-colors"
            title={t('common.refresh')}
          >
            <RefreshCw className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={handleTriggerUpdate}
            disabled={!isOnline || !hasUpdates}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white shadow-lg shadow-cyan-500/20 disabled:opacity-50 transition-all"
          >
            <Play className="w-4 h-4 fill-current" />
            <span>{t('common.triggerUpdate')}</span>
          </button>

          <button
            type="button"
            onClick={handleDelete}
            className="p-2.5 rounded-xl bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 border border-rose-500/30 transition-colors"
            title={t('common.delete')}
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Grid: Host Info & Snapshots */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left: System Information */}
        <div className="glass-panel p-5 rounded-3xl space-y-4 lg:col-span-1">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
            <Server className="w-4 h-4 text-cyan-400" /> {t('hostDetail.systemInfo')}
          </h3>

          <div className="space-y-2.5 text-xs">
            <div className="flex justify-between py-2 border-b border-slate-800/80">
              <span className="text-slate-400 font-medium">{t('hostDetail.activeVersion')} :</span>
              <span className="font-bold text-white font-mono text-right max-w-[200px] truncate" title={host.currentVersion || t('common.never')}>
                {host.currentVersion || t('common.never')}
              </span>
            </div>
            {hasUpdates && host.targetVersion && (
              <div className="flex justify-between py-2 border-b border-slate-800/80 bg-amber-500/5 px-2 rounded-lg">
                <span className="text-amber-400 font-medium flex items-center gap-1">{t('hostDetail.targetVersionLabel')} :</span>
                <span className="font-bold text-amber-300 font-mono text-right max-w-[200px] truncate" title={host.targetVersion}>
                  {host.targetVersion}
                </span>
              </div>
            )}
            <div className="flex justify-between py-2 border-b border-slate-800/80">
              <span className="text-slate-400 font-medium">{t('hostDetail.updateAvailability')} :</span>
              <span className={`font-bold ${hasUpdates ? "text-amber-400" : "text-emerald-400"}`}>
                {hasUpdates ? `${host.availableUpdatesCount} ${t('common.updatesCount')}` : t('common.upToDate')}
              </span>
            </div>
            <div className="flex justify-between py-2 border-b border-slate-800/80">
              <span className="text-slate-400 font-medium">{t('hostDetail.rebootStatus')} :</span>
              <span className="font-bold text-white">
                {host.requiresReboot ? (
                  <span className="text-amber-400 flex items-center gap-1 font-bold"><AlertTriangle className="w-3.5 h-3.5" /> {t('common.yes')}</span>
                ) : t('common.no')}
              </span>
            </div>
            <div className="flex justify-between py-2 border-b border-slate-800/80">
              <span className="text-slate-400 font-medium">{t('hostDetail.lastScanDate')} :</span>
              <span className="text-slate-300 font-mono">{host.lastCheckAt ? new Date(host.lastCheckAt).toLocaleString() : t('common.never')}</span>
            </div>
            <div className="flex justify-between py-2">
              <span className="text-slate-400 font-medium">{t('hostDetail.vaultStatus')} :</span>
              <span className="font-mono text-emerald-400 flex items-center gap-1 font-semibold text-[11px]">
                <Key className="w-3.5 h-3.5" /> {host.credential?.keyFingerprint ? t('hostDetail.vaultEncrypted') : t('hostDetail.vaultConfigured')}
              </span>
            </div>
          </div>
        </div>

        {/* Right: Restoration Points & Snapshots */}
        <div className="glass-panel p-5 rounded-3xl space-y-4 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
              <HardDrive className="w-4 h-4 text-amber-400" /> {t('hostDetail.snapshotsAndBackups')}
            </h3>
            <span className="text-xs text-slate-500 font-mono font-bold">
              {host.backupRecords?.length || 0} {t('hostDetail.snapshotsCount')}
            </span>
          </div>

          {!host.backupRecords || host.backupRecords.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500 rounded-2xl bg-slate-900/40 border border-slate-800/80">
              {t('hostDetail.noSnapshots')}
            </div>
          ) : (
            <div className="space-y-2.5">
              {host.backupRecords.map((b) => (
                <div
                  key={b.id}
                  className="p-3.5 rounded-2xl bg-slate-900/60 border border-slate-800/80 flex items-center justify-between gap-4 hover:border-slate-700 transition-colors"
                >
                  <div className="space-y-0.5 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-xs text-cyan-300 font-mono truncate">
                        {b.snapshotIdentifier}
                      </span>
                      <Badge variant="neutral" size="sm">{b.backupType}</Badge>
                      {b.isProtected && (
                        <Badge variant="success" size="sm">{t('common.aesVaultActive')}</Badge>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-400 font-mono">
                      {new Date(b.createdAt).toLocaleString()}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => setSelectedBackupRollback(b)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 border border-rose-500/30 transition-colors shrink-0"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>{t('common.rollback')}</span>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Edit Host Modal */}
      {showEditModal && (
        <EditHostModal
          host={host}
          onClose={() => setShowEditModal(false)}
          onSuccess={(updated) => {
            setHost(updated);
            handleRefresh();
          }}
        />
      )}

      {/* Pipeline Modal */}
      {activeTaskId && (
        <PipelineExecutionModal taskId={activeTaskId} onClose={() => { setActiveTaskId(null); loadHost(); }} />
      )}

      {selectedBackupRollback && (
        <RollbackConfirmModal
          host={host}
          backup={selectedBackupRollback}
          onConfirm={handleConfirmRollback}
          onClose={() => setSelectedBackupRollback(null)}
          loading={rollbackLoading}
        />
      )}
    </div>
  );
};

