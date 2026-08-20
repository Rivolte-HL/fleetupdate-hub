import React, { useEffect, useState } from 'react';
import { UpdateTask } from '../types/index.js';
import { updatesService } from '../services/updates.service.js';
import { useToast } from '../context/ToastContext.js';
import { useLanguage } from '../context/LanguageContext.js';
import { Badge } from '../components/Badge.js';
import { PipelineExecutionModal } from '../components/PipelineExecutionModal.js';
import { Eye } from 'lucide-react';

export const UpdatesHistoryPage: React.FC = () => {
  const [tasks, setTasks] = useState<UpdateTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('ALL');

  const { addToast } = useToast();
  const { t } = useLanguage();

  const loadTasks = async () => {
    try {
      setLoading(true);
      const data = await updatesService.getTasks({ limit: 50 });
      setTasks(data);
    } catch (err: any) {
      addToast('error', t('common.error'), err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTasks();
  }, []);

  const filteredTasks = tasks.filter((task) => {
    if (statusFilter === 'ALL') return true;
    return task.status === statusFilter;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-white tracking-tight">{t('updates.title')}</h2>
          <p className="text-sm text-slate-400 mt-0.5">{t('updates.subtitle')}</p>
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
            {s === 'ALL' ? t('dashboard.filterAll') : s}
          </button>
        ))}
      </div>

      {/* Tasks Table */}
      <div className="glass-panel rounded-3xl overflow-hidden border border-slate-800">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-900/80 border-b border-slate-800 text-slate-400 uppercase font-semibold">
              <tr>
                <th className="py-3.5 px-5">{t('updates.status')}</th>
                <th className="py-3.5 px-5">{t('updates.host')}</th>
                <th className="py-3.5 px-5">{t('updates.step')}</th>
                <th className="py-3.5 px-5">{t('updates.triggeredBy')}</th>
                <th className="py-3.5 px-5">{t('updates.startedAt')}</th>
                <th className="py-3.5 px-5 text-right">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500">{t('common.loading')}</td>
                </tr>
              ) : filteredTasks.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500">{t('updates.noTasks')}</td>
                </tr>
              ) : (
                filteredTasks.map((taskItem) => (
                  <tr key={taskItem.id} className="hover:bg-slate-900/40 transition-colors">
                    <td className="py-4 px-5">
                      <Badge
                        variant={
                          taskItem.status === 'SUCCESS'
                            ? 'success'
                            : taskItem.status === 'ROLLED_BACK'
                            ? 'warning'
                            : taskItem.status === 'FAILED'
                            ? 'danger'
                            : 'brand'
                        }
                        size="sm"
                        pulse={!['SUCCESS', 'FAILED', 'ROLLED_BACK'].includes(taskItem.status)}
                      >
                        {taskItem.status}
                      </Badge>
                    </td>
                    <td className="py-4 px-5 font-semibold text-white">
                      {taskItem.host?.name || t('updates.host')}
                      <div className="text-[10px] text-slate-500 font-mono">{taskItem.host?.endpointUrl}</div>
                    </td>
                    <td className="py-4 px-5">
                      <div className="text-slate-300 font-medium">{taskItem.currentStep}</div>
                      {taskItem.targetVersion && (
                        <div className="text-[10px] text-cyan-400 font-mono">➔ {taskItem.targetVersion}</div>
                      )}
                    </td>
                    <td className="py-4 px-5 text-slate-400">
                      {taskItem.triggeredBy?.name || taskItem.triggeredBy?.email || 'Automate'}
                    </td>
                    <td className="py-4 px-5 text-slate-400">
                      {new Date(taskItem.startedAt).toLocaleString()}
                    </td>
                    <td className="py-4 px-5 text-right">
                      <button
                        onClick={() => setActiveTaskId(taskItem.id)}
                        className="p-2 rounded-lg bg-slate-800 text-slate-300 hover:text-cyan-400 hover:bg-slate-700 transition-colors"
                        title={t('updates.viewLogs')}
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
