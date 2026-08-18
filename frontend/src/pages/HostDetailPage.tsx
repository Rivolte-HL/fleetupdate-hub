import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Host, BackupRecord } from "../types/index.js";
import { hostsService } from "../services/hosts.service.js";
import { updatesService } from "../services/updates.service.js";
import { useToast } from "../context/ToastContext.js";
import { Badge } from "../components/Badge.js";
import { PipelineExecutionModal } from "../components/PipelineExecutionModal.js";
import { RollbackConfirmModal } from "../components/RollbackConfirmModal.js";
import { EditHostModal } from "../components/EditHostModal.js";
import { ArrowLeft, Play, RefreshCw, Trash2, Server, HardDrive, Key, AlertTriangle, RotateCcw, Edit3, Shield, CheckCircle2 } from "lucide-react";

export const HostDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { addToast } = useToast();

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
      addToast("error", "Erreur", err.message);
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
      addToast("info", "Interrogation", `Actualisation de ${host.name}...`);
      const res = await hostsService.refreshVersion(host.id);
      setHost(res.host);
      addToast("success", "Actualisé", `${host.name} mis à jour.`);
    } catch (err: any) {
      addToast("error", "Échec", err.response?.data?.message || err.message);
    }
  };

  const handleTriggerUpdate = async () => {
    if (!host) return;
    try {
      const res = await updatesService.triggerUpdate({ hostId: host.id, autoRollback: true });
      addToast("success", "Pipeline lancé", res.message);
      setActiveTaskId(res.task.id);
    } catch (err: any) {
      addToast("error", "Erreur", err.message);
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
      addToast("success", "Rollback Réussi", res.message);
      setSelectedBackupRollback(null);
      loadHost();
    } catch (err: any) {
      addToast("error", "Échec du Rollback", err.message);
    } finally {
      setRollbackLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!host || !window.confirm(`Confirmez-vous la suppression définitive de l'hôte ${host.name} ?`)) return;
    try {
      await hostsService.deleteHost(host.id);
      addToast("success", "Supprimé", `L'hôte ${host.name} a été retiré du parc.`);
      navigate("/hosts");
    } catch (err: any) {
      addToast("error", "Erreur de suppression", err.message);
    }
  };

  if (loading || !host) {
    return (
      <div className="p-12 text-center text-slate-400 space-y-3">
        <div className="w-8 h-8 rounded-full border-2 border-cyan-500 border-t-transparent animate-spin mx-auto" />
        <p className="text-xs">Chargement des détails de l'équipement...</p>
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
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h2 className="text-2xl font-extrabold text-white tracking-tight">{host.name}</h2>
              <Badge variant={isOnline ? "success" : "danger"} size="sm" pulse={isOnline}>
                {isOnline ? "En Ligne" : "Injoignable"}
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
            title="Modifier l'équipement"
          >
            <Edit3 className="w-4 h-4" />
            <span className="hidden sm:inline">Modifier</span>
          </button>

          <button
            type="button"
            onClick={handleRefresh}
            className="p-2.5 rounded-xl bg-slate-900 text-slate-300 hover:text-cyan-300 border border-slate-800 hover:border-slate-700 transition-colors"
            title="Actualiser les versions"
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
            <span>Mettre à Jour</span>
          </button>

          <button
            type="button"
            onClick={handleDelete}
            className="p-2.5 rounded-xl bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 border border-rose-500/30 transition-colors"
            title="Supprimer l'équipement"
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
            <Server className="w-4 h-4 text-cyan-400" /> Informations Système
          </h3>

          <div className="space-y-2.5 text-xs">
            <div className="flex justify-between py-2 border-b border-slate-800/80">
              <span className="text-slate-400 font-medium">Version Actuelle :</span>
              <span className="font-bold text-white font-mono">{host.currentVersion || "Non détectée"}</span>
            </div>
            <div className="flex justify-between py-2 border-b border-slate-800/80">
              <span className="text-slate-400 font-medium">Disponibilité MàJ :</span>
              <span className={`font-bold ${hasUpdates ? "text-amber-400" : "text-emerald-400"}`}>
                {hasUpdates ? `${host.availableUpdatesCount} disponible(s)` : "À jour"}
              </span>
            </div>
            <div className="flex justify-between py-2 border-b border-slate-800/80">
              <span className="text-slate-400 font-medium">Redémarrage Requis :</span>
              <span className="font-bold text-white">
                {host.requiresReboot ? (
                  <span className="text-amber-400 flex items-center gap-1 font-bold"><AlertTriangle className="w-3.5 h-3.5" /> Oui</span>
                ) : "Non"}
              </span>
            </div>
            <div className="flex justify-between py-2 border-b border-slate-800/80">
              <span className="text-slate-400 font-medium">Dernier scan :</span>
              <span className="text-slate-300 font-mono">{host.lastCheckAt ? new Date(host.lastCheckAt).toLocaleString() : "Jamais"}</span>
            </div>
            <div className="flex justify-between py-2">
              <span className="text-slate-400 font-medium">Statut du Coffre :</span>
              <span className="font-mono text-emerald-400 flex items-center gap-1 font-semibold text-[11px]">
                <Key className="w-3.5 h-3.5" /> {host.credential?.keyFingerprint ? "Chiffré AES-256-GCM" : "Configuré"}
              </span>
            </div>
          </div>
        </div>

        {/* Right: Restoration Points & Snapshots */}
        <div className="glass-panel p-5 rounded-3xl space-y-4 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
              <HardDrive className="w-4 h-4 text-amber-400" /> Points de Restauration & Snapshots
            </h3>
            <span className="text-xs text-slate-500 font-mono font-bold">
              {host.backupRecords?.length || 0} snapshot(s)
            </span>
          </div>

          {!host.backupRecords || host.backupRecords.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500 rounded-2xl bg-slate-900/40 border border-slate-800/80">
              Aucun snapshot préalable enregistré. Un snapshot de sécurité est créé automatiquement avant chaque mise à jour.
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
                        <Badge variant="success" size="sm">Verrouillé</Badge>
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
                    <span>Rollback</span>
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

