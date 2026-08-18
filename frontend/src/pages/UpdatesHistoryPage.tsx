import React, { useEffect, useState } from 'react';
import { UpdateTask } from '../types/index.js';
import { updatesService } from '../services/updates.service.js';
import { useToast } from '../context/ToastContext.js';
import { Badge } from '../components/Badge.js';
import { PipelineExecutionModal } from '../components/PipelineExecutionModal.js';
import { History, Search, Eye, Filter } from 'lucide-react';

export const UpdatesHistoryPage: React.FC = () => {
  const [tasks, setTasks] = useState<UpdateTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('ALL');

  const { addToast } = useToast();

  const loadTasks = async () => {
    try {
      setLoading(true);
      const data = await updatesService.getTasks({ limit: 50 });
      setTasks(data);
    } catch (err: any) {
      addToast('error', 'Erreur de chargement', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTasks();
  }, []);

  const filteredTasks = tasks.filter((t) => {
    if (statusFilter === 'ALL') return true;
    return t.status === statusFilter;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-white tracking-tight">Historique des Mises à Jour</h2>
          <p className="text-sm text-slate-400 mt-0.5">
            Traçabilité complète des déploiements, logs d'exécution et rollbacks automatiques
          </p>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2">
        {['ALL', 'SUCCESS', 'ROLLED_BACK', 'FAILED', 'UPDATING', 'PRE_FLIGHT'].map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
              statusFilter === s
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                : 'bg-slate-900/60 text-slate-400 hover:text-slate-200 border border-slate-800'
            }`}
          >
            {s === 'ALL' ? 'Toutes les Tâches' : s}
          </button>
        ))}
      </div>

      {/* Tasks Table */}
      <div className="glass-panel rounded-3xl overflow-hidden border border-slate-800">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-900/80 border-b border-slate-800 text-slate-400 uppercase font-semibold">
              <tr>
                <th className="py-3.5 px-5">Statut</th>
                <th className="py-3.5 px-5">Équipement</th>
                <th className="py-3.5 px-5">Étape / Version</th>
                <th className="py-3.5 px-5">Initiateur</th>
                <th className="py-3.5 px-5">Date d'Exécution</th>
                <th className="py-3.5 px-5 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500">Chargement de l'historique...</td>
                </tr>
              ) : filteredTasks.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500">Aucune tâche correspondante.</td>
                </tr>
              ) : (
                filteredTasks.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-900/40 transition-colors">
                    <td className="py-4 px-5">
                      <Badge
                        variant={
                          t.status === 'SUCCESS'
                            ? 'success'
                            : t.status === 'ROLLED_BACK'
                            ? 'warning'
                            : t.status === 'FAILED'
                            ? 'danger'
                            : 'brand'
                        }
                        size="sm"
                        pulse={!['SUCCESS', 'FAILED', 'ROLLED_BACK'].includes(t.status)}
                      >
                        {t.status}
                      </Badge>
                    </td>
                    <td className="py-4 px-5 font-semibold text-white">
                      {t.host?.name || 'Hôte'}
                      <div className="text-[10px] text-slate-500 font-mono">{t.host?.endpointUrl}</div>
                    </td>
                    <td className="py-4 px-5">
                      <div className="text-slate-300 font-medium">{t.currentStep}</div>
                      {t.targetVersion && (
                        <div className="text-[10px] text-cyan-400 font-mono">➔ {t.targetVersion}</div>
                      )}
                    </td>
                    <td className="py-4 px-5 text-slate-400">
                      {t.triggeredBy?.name || t.triggeredBy?.email || 'Automate'}
                    </td>
                    <td className="py-4 px-5 text-slate-400">
                      {new Date(t.startedAt).toLocaleString()}
                    </td>
                    <td className="py-4 px-5 text-right">
                      <button
                        onClick={() => setActiveTaskId(t.id)}
                        className="p-2 rounded-lg bg-slate-800 text-slate-300 hover:text-cyan-400 hover:bg-slate-700 transition-colors"
                        title="Inspecter le log complet"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {activeTaskId && (
        <PipelineExecutionModal taskId={activeTaskId} onClose={() => setActiveTaskId(null)} />
      )}
    </div>
  );
};
