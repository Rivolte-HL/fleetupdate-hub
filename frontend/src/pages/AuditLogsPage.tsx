import React, { useEffect, useState } from 'react';
import { AuditLog } from '../types/index.js';
import { authService } from '../services/auth.service.js';
import { useToast } from '../context/ToastContext.js';
import { ShieldAlert, RefreshCw, Filter } from 'lucide-react';
import { Badge } from '../components/Badge.js';

export const AuditLogsPage: React.FC = () => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const { addToast } = useToast();

  const loadLogs = async () => {
    try {
      setLoading(true);
      const data = await authService.getAuditLogs({ limit: 100 });
      setLogs(data);
    } catch (err: any) {
      addToast('error', 'Erreur d’audit', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-2xl font-black text-white tracking-tight">Journaux d'Audit & Traçabilité</h2>
            <Badge variant="brand" size="sm">Immuable</Badge>
          </div>
          <p className="text-sm text-slate-400 mt-0.5">
            Historique infalsifiable de toutes les connexions, modifications et déclenchements de maintenance
          </p>
        </div>

        <button
          onClick={loadLogs}
          className="p-2.5 rounded-xl bg-slate-800 text-slate-300 hover:text-cyan-400 border border-slate-700 transition-colors self-start sm:self-auto"
          title="Actualiser les logs d'audit"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      <div className="glass-panel rounded-3xl overflow-hidden border border-slate-800">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-900/80 border-b border-slate-800 text-slate-400 uppercase font-semibold">
              <tr>
                <th className="py-3.5 px-5">Date & Heure</th>
                <th className="py-3.5 px-5">Utilisateur</th>
                <th className="py-3.5 px-5">Action</th>
                <th className="py-3.5 px-5">Ressource</th>
                <th className="py-3.5 px-5">Adresse IP</th>
                <th className="py-3.5 px-5">Détails</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500">Chargement des logs d'audit...</td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500">Aucun journal d'audit enregistré.</td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-900/40 transition-colors">
                    <td className="py-4 px-5 text-slate-400 font-mono">
                      {new Date(log.createdAt).toLocaleString()}
                    </td>
                    <td className="py-4 px-5 font-semibold text-white">
                      {log.userEmail}
                    </td>
                    <td className="py-4 px-5">
                      <span className="font-mono text-cyan-300 font-semibold">{log.action}</span>
                    </td>
                    <td className="py-4 px-5">
                      <Badge variant="neutral" size="sm">{log.resourceType}</Badge>
                    </td>
                    <td className="py-4 px-5 text-slate-400 font-mono">
                      {log.ipAddress || '127.0.0.1'}
                    </td>
                    <td className="py-4 px-5 text-slate-400 font-mono text-[11px] max-w-xs truncate">
                      {JSON.stringify(log.details || {})}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
