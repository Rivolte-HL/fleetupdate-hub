import React, { useEffect, useState, useRef } from 'react';
import { UpdateTask, TaskStatus, PipelineLogEntry } from '../types/index.js';
import { updatesService } from '../services/updates.service.js';
import { Shield, CheckCircle2, AlertTriangle, XCircle, Terminal, Play, RotateCcw, X, ShieldAlert, Cpu, Radio } from 'lucide-react';
import { Badge } from './Badge.js';

interface PipelineExecutionModalProps {
  taskId: string;
  onClose: () => void;
}

const pipelineSteps = [
  { id: 'PRE_FLIGHT', label: '1. Pre-Flight', description: 'Connectivité & Espace' },
  { id: 'BACKUP', label: '2. Snapshot', description: 'Point de restauration' },
  { id: 'UPDATING', label: '3. Mise à Jour', description: 'Téléchargement & Application' },
  { id: 'HEALTH_CHECK', label: '4. Test Résilience', description: 'Vérification de santé' },
  { id: 'SUCCESS', label: '5. Terminé', description: 'Nettoyage & Alertes' }
];

export const PipelineExecutionModal: React.FC<PipelineExecutionModalProps> = ({ taskId, onClose }) => {
  const [task, setTask] = useState<UpdateTask | null>(null);
  const [isLiveConnected, setIsLiveConnected] = useState(false);
  const terminalEndRef = useRef<HTMLDivElement>(null);

  const fetchTaskStatus = async () => {
    try {
      const updated = await updatesService.getTaskById(taskId);
      setTask(updated);
    } catch (e) {
      console.error("[PipelineModal] Failed to fetch task status:", e);
    }
  };

  // 1. Initial fetch & Polling fallback
  useEffect(() => {
    fetchTaskStatus();

    const interval = setInterval(() => {
      if (!task || !['SUCCESS', 'FAILED', 'ROLLED_BACK'].includes(task.status)) {
        fetchTaskStatus();
      }
    }, 2500);

    return () => clearInterval(interval);
  }, [taskId]);

  // 2. WebSocket live streaming
  useEffect(() => {
    let ws: WebSocket | null = null;
    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.host;
      ws = new WebSocket(`${protocol}//${host}/ws/pipeline`);

      ws.onopen = () => {
        setIsLiveConnected(true);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          const payload = data.type === 'PIPELINE_UPDATE' && data.payload ? data.payload : (data.taskId ? data : null);
          if (payload && payload.taskId === taskId) {
            const { step, log } = payload;
            setTask((prev) => {
              if (!prev) return prev;
              const newLogs = log ? [...(prev.logs || []), log] : prev.logs;
              return {
                ...prev,
                currentStep: step || prev.currentStep,
                logs: newLogs
              };
            });
          }
        } catch {}
      };

      ws.onclose = () => {
        setIsLiveConnected(false);
      };
    } catch {
      setIsLiveConnected(false);
    }

    return () => {
      try {
        ws?.close();
      } catch {}
    };
  }, [taskId]);

  // 3. Escape key listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // 4. Auto scroll terminal
  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [task?.logs?.length]);

  const getStepStatus = (stepId: string) => {
    if (!task) return 'waiting';
    if (task.status === 'SUCCESS') return 'completed';
    const statusOrder: TaskStatus[] = ['PENDING', 'PRE_FLIGHT', 'BACKUP', 'UPDATING', 'HEALTH_CHECK', 'SUCCESS'];

    const currentIndex = statusOrder.indexOf(task.status);
    const stepIndex = statusOrder.indexOf(stepId as TaskStatus);

    if (task.status === 'ROLLED_BACK' || task.status === 'FAILED') {
      if (task.currentStep === stepId) return 'error';
      if (currentIndex > stepIndex) return 'completed';
      return 'waiting';
    }

    if (currentIndex > stepIndex) return 'completed';
    if (currentIndex === stepIndex) return 'active';
    return 'waiting';
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="glass-panel-glow w-full max-w-4xl rounded-3xl border border-cyan-500/30 overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-900/70">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white">Pipeline de Déploiement</h3>
                {task && (
                  <Badge
                    variant={
                      task.status === 'SUCCESS'
                        ? 'success'
                        : task.status === 'ROLLED_BACK'
                        ? 'warning'
                        : task.status === 'FAILED'
                        ? 'danger'
                        : 'brand'
                    }
                    pulse={!['SUCCESS', 'FAILED', 'ROLLED_BACK'].includes(task.status)}
                  >
                    {task.status}
                  </Badge>
                )}
                {isLiveConnected && (
                  <span className="flex items-center gap-1 text-[10px] text-emerald-400 font-mono font-semibold bg-emerald-950/40 px-2 py-0.5 rounded-full border border-emerald-500/30">
                    <Radio className="w-3 h-3 animate-pulse" /> Live
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Équipement : <span className="font-bold text-slate-200">{task?.host?.name || '...'}</span> | Tâche ID : <span className="font-mono text-cyan-300">{taskId.slice(0, 8)}</span>
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto space-y-5 flex-1">
          {/* Stepper Timeline */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
            {pipelineSteps.map((s) => {
              const state = getStepStatus(s.id);
              return (
                <div
                  key={s.id}
                  className={`p-3 rounded-2xl border transition-all ${
                    state === 'completed'
                      ? 'bg-emerald-950/30 border-emerald-500/30 text-emerald-300'
                      : state === 'active'
                      ? 'bg-cyan-950/50 border-cyan-500/60 text-cyan-200 ring-1 ring-cyan-500/50'
                      : state === 'error'
                      ? 'bg-rose-950/40 border-rose-500/60 text-rose-300'
                      : 'bg-slate-900/40 border-slate-800/80 text-slate-500'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold">{s.label}</span>
                    {state === 'completed' ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    ) : state === 'active' ? (
                      <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-ping" />
                    ) : state === 'error' ? (
                      <XCircle className="w-4 h-4 text-rose-400" />
                    ) : (
                      <span className="w-2 h-2 rounded-full bg-slate-700" />
                    )}
                  </div>
                  <p className="text-[10px] leading-tight text-slate-400">{s.description}</p>
                </div>
              );
            })}
          </div>

          {/* Rollback Alert */}
          {task?.status === 'ROLLED_BACK' && (
            <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-3">
              <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-bold text-amber-300">Filet de Sécurité Déclenché : Restauration Automatique Effectuée</h4>
                <p className="text-xs text-slate-300 mt-0.5">
                  Une anomalie a été détectée. L'orchestrateur a immédiatement restauré le snapshot de sauvegarde préalable sans interruption prolongée.
                </p>
                {task.errorDetails && (
                  <div className="mt-2 p-2 rounded-lg bg-black/50 font-mono text-xs text-rose-400 border border-rose-950">
                    Détail: {task.errorDetails}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Live Terminal Log Stream */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                <Terminal className="w-4 h-4 text-cyan-400" /> Flux d'Événements & Logs
              </span>
              <span className="text-[11px] font-mono text-slate-500">
                {task?.logs?.length || 0} ligne(s) de journal
              </span>
            </div>

            <div className="terminal-scroll p-4 rounded-2xl border border-slate-800 text-xs font-mono max-h-72 overflow-y-auto space-y-1.5 shadow-inner">
              {(!task?.logs || task.logs.length === 0) ? (
                <div className="text-slate-600 italic">Initialisation du flux de logs...</div>
              ) : (
                task.logs.map((log: PipelineLogEntry, index: number) => (
                  <div key={index} className="flex items-start gap-2.5">
                    <span className="text-slate-500 select-none text-[11px]">
                      [{new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}]
                    </span>
                    <span
                      className={`font-bold select-none px-1.5 py-0.2 rounded text-[10px] ${
                        log.level === 'SUCCESS'
                          ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/40'
                          : log.level === 'ERROR'
                          ? 'bg-rose-950 text-rose-400 border border-rose-800/40'
                          : log.level === 'WARN'
                          ? 'bg-amber-950 text-amber-400 border border-amber-800/40'
                          : 'bg-cyan-950 text-cyan-400 border border-cyan-800/40'
                      }`}
                    >
                      {log.level}
                    </span>
                    <span className="text-slate-400 select-none font-semibold">[{log.step}]</span>
                    <span className="text-slate-200 flex-1 break-words">{log.message}</span>
                  </div>
                ))
              )}
              <div ref={terminalEndRef} />
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-900/50 flex items-center justify-between">
          <div className="text-xs text-slate-400">
            Démarré le {task?.startedAt ? new Date(task.startedAt).toLocaleString() : '...'}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl text-xs font-bold bg-slate-800 text-slate-200 hover:bg-slate-700 transition-colors"
          >
            Fermer (Échap)
          </button>
        </div>
      </div>
    </div>
  );
};

