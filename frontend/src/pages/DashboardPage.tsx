import React, { useEffect, useState, useMemo } from 'react';
import { Host, UpdateTask } from '../types/index.js';
import { hostsService } from '../services/hosts.service.js';
import { updatesService } from '../services/updates.service.js';
import { useToast } from '../context/ToastContext.js';
import { StatCard } from '../components/StatCard.js';
import { HostCard } from '../components/HostCard.js';
import { PipelineExecutionModal } from '../components/PipelineExecutionModal.js';
import { ChangelogViewerModal } from '../components/ChangelogViewerModal.js';
import { Server, ShieldCheck, AlertTriangle, Activity, RefreshCw, Plus, Play, History, CheckCircle2, Search, Filter, Sparkles, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Badge } from '../components/Badge.js';

export const DashboardPage: React.FC = () => {
  const [hosts, setHosts] = useState<Host[]>([]);
  const [tasks, setTasks] = useState<UpdateTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshingAll, setRefreshingAll] = useState(false);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [selectedChangelogHost, setSelectedChangelogHost] = useState<Host | null>(null);
  const [changelogData, setChangelogData] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'UPDATES' | 'ONLINE' | 'OFFLINE' | 'REBOOT'>('ALL');

  const { addToast } = useToast();
  const navigate = useNavigate();

  const loadData = async () => {
    try {
      setLoading(true);
      const [hList, tList] = await Promise.all([
        hostsService.getHosts(),
        updatesService.getTasks({ limit: 6 })
      ]);
      setHosts(hList);
      setTasks(tList);
    } catch (err: any) {
      addToast('error', 'Erreur de chargement', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleRefreshHost = async (host: Host) => {
    try {
      addToast('info', 'Interrogation en cours', `Actualisation de ${host.name}...`);
      const res = await hostsService.refreshVersion(host.id);
      setHosts((prev) => prev.map((h) => (h.id === host.id ? res.host : h)));
      addToast('success', 'Hôte actualisé', `${host.name} : ${res.versionInfo?.hasUpdate ? 'Mises à jour disponibles' : 'À jour'}`);
    } catch (err: any) {
      addToast('error', 'Échec du rafraîchissement', err.response?.data?.message || err.message);
    }
  };

  const handleRefreshAll = async () => {
    setRefreshingAll(true);
    addToast('info', 'Synchronisation globale', 'Interrogation simultanée de tous les services...');
    try {
      const res = await hostsService.refreshAll();
      setHosts(res.hosts);
      addToast(
        'success',
        'Vérification terminée',
        res.message || `${res.summary?.updatesFound || 0} mise(s) à jour détectée(s).`
      );
    } catch (err: any) {
      addToast('error', 'Échec de la vérification globale', err.response?.data?.message || err.message);
    } finally {
      setRefreshingAll(false);
    }
  };

  const handleTriggerUpdate = async (host: Host) => {
    try {
      const res = await updatesService.triggerUpdate({ hostId: host.id, autoRollback: true });
      addToast('success', 'Pipeline lancé', res.message);
      setActiveTaskId(res.task.id);
    } catch (err: any) {
      addToast('error', 'Erreur de déclenchement', err.response?.data?.message || err.message);
    }
  };

  const handleViewChangelog = async (host: Host) => {
    try {
      setSelectedChangelogHost(host);
      const changelog = await hostsService.getChangelog(host.id);
      setChangelogData(changelog);
    } catch (err: any) {
      addToast('error', 'Erreur de changelog', err.message);
      setChangelogData([]);
    }
  };

  const totalHosts = hosts.length;
  const onlineHosts = hosts.filter((h) => h.isOnline).length;
  const pendingUpdatesTotal = hosts.reduce((acc, h) => acc + (h.availableUpdatesCount || 0), 0);
  const rebootsRequired = hosts.filter((h) => h.requiresReboot).length;
  const hostsWithUpdates = hosts.filter((h) => (h.availableUpdatesCount || 0) > 0 && h.isOnline).length;

  const filteredHosts = useMemo(() => {
    return hosts.filter((h) => {
      const matchesSearch =
        searchQuery.trim() === '' ||
        h.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        h.endpointUrl.toLowerCase().includes(searchQuery.toLowerCase()) ||
        h.adapterType.toLowerCase().includes(searchQuery.toLowerCase());

      if (!matchesSearch) return false;

      switch (statusFilter) {
        case 'UPDATES':
          return (h.availableUpdatesCount || 0) > 0;
        case 'ONLINE':
          return Boolean(h.isOnline);
        case 'OFFLINE':
          return !h.isOnline;
        case 'REBOOT':
          return Boolean(h.requiresReboot);
        default:
          return true;
      }
    });
  }, [hosts, searchQuery, statusFilter]);

  return (
    <div className="space-y-7">
      {/* Top Banner / Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-extrabold text-white tracking-tight">Tableau de Bord</h2>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-cyan-500/10 border border-cyan-500/25 text-cyan-300">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />
              Scan Auto Actif
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Supervision centralisée et déploiement résilient des correctifs d'infrastructure.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            type="button"
            onClick={handleRefreshAll}
            disabled={refreshingAll}
            className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-bold bg-slate-900/90 hover:bg-slate-800 text-cyan-300 hover:text-cyan-200 border border-slate-700/80 hover:border-cyan-500/40 shadow-sm transition-all disabled:opacity-50"
            title="Interroger tous les hôtes et conteneurs immédiatement"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshingAll ? 'animate-spin text-cyan-400' : 'text-cyan-400'}`} />
            <span>{refreshingAll ? 'Vérification...' : 'Tout Vérifier'}</span>
          </button>

          <button
            type="button"
            onClick={() => navigate('/hosts?action=new')}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white shadow-lg shadow-cyan-500/20 transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Ajouter un Équipement</span>
          </button>
        </div>
      </div>

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Équipements Managés"
          value={`${onlineHosts} / ${totalHosts}`}
          subtitle={`${totalHosts - onlineHosts} équipement(s) hors ligne`}
          icon={Server}
          variant="cyan"
        />
        <StatCard
          title="Mises à Jour en Attente"
          value={pendingUpdatesTotal}
          subtitle={`${hostsWithUpdates} équipement(s) à mettre à niveau`}
          icon={Activity}
          variant={pendingUpdatesTotal > 0 ? 'amber' : 'emerald'}
        />
        <StatCard
          title="Redémarrages Requis"
          value={rebootsRequired}
          subtitle="Redémarrages de noyau en attente"
          icon={AlertTriangle}
          variant={rebootsRequired > 0 ? 'rose' : 'slate'}
        />
        <StatCard
          title="Sécurité Zero-Trust"
          value="100%"
          subtitle="Coffre-fort AES-256-GCM actif"
          icon={ShieldCheck}
          variant="emerald"
        />
      </div>

      {/* Filter Toolbar & Hosts Section */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-bold text-white">Parc d'Infrastructure</h3>
            <span className="text-xs font-mono px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 border border-slate-700/60">
              {filteredHosts.length} / {hosts.length}
            </span>
          </div>

          {/* Quick status filters */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {[
              { id: 'ALL', label: 'Tous' },
              { id: 'UPDATES', label: `MàJ (${hostsWithUpdates})` },
              { id: 'ONLINE', label: `En Ligne (${onlineHosts})` },
              { id: 'OFFLINE', label: `Hors Ligne (${totalHosts - onlineHosts})` },
              { id: 'REBOOT', label: `Reboot (${rebootsRequired})` }
            ].map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setStatusFilter(f.id as any)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  statusFilter === f.id
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                    : 'bg-slate-900/60 text-slate-400 hover:text-slate-200 border border-slate-800'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Search Bar */}
        <div className="relative">
          <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
          <input
            type="text"
            placeholder="Filtrer rapidement par nom, IP ou type (Proxmox, Docker, Linux...)"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-xl bg-slate-900/80 border border-slate-800/80 text-xs text-slate-100 placeholder-slate-500 focus:border-cyan-500/50 outline-none transition-colors"
          />
        </div>

        {/* Hosts Cards */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="glass-panel p-6 rounded-2xl h-44 animate-pulse bg-slate-900/40" />
            ))}
          </div>
        ) : filteredHosts.length === 0 ? (
          <div className="glass-panel p-10 rounded-2xl text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 text-cyan-400 mx-auto flex items-center justify-center border border-cyan-500/20">
              <Server className="w-6 h-6" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-white">Aucun équipement trouvé</h4>
              <p className="text-xs text-slate-400 mt-0.5">
                {hosts.length === 0
                  ? "Commencez par ajouter un serveur Proxmox, un pare-feu OPNsense, un hôte Docker ou une machine Linux."
                  : "Aucun équipement ne correspond à vos filtres actuels."}
              </p>
            </div>
            {hosts.length === 0 && (
              <button
                type="button"
                onClick={() => navigate('/hosts?action=new')}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-cyan-500 text-slate-950 hover:bg-cyan-400 transition-colors inline-flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Ajouter un hôte
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredHosts.map((host) => (
              <HostCard
                key={host.id}
                host={host}
                onRefresh={handleRefreshHost}
                onTriggerUpdate={handleTriggerUpdate}
                onViewChangelog={handleViewChangelog}
                onSelect={(h) => navigate(`/hosts/${h.id}`)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Recent Update Pipeline Tasks */}
      <div className="glass-panel p-5 rounded-3xl space-y-3.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-cyan-400" />
            <h3 className="text-sm font-bold text-white">Dernières Exécutions du Pipeline</h3>
          </div>
          <button
            type="button"
            onClick={() => navigate('/updates')}
            className="text-xs text-cyan-400 hover:text-cyan-300 font-semibold flex items-center gap-1"
          >
            Historique complet <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {tasks.length === 0 ? (
          <p className="text-xs text-slate-500 py-3 text-center">Aucune tâche de mise à jour exécutée récemment.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {tasks.map((t) => (
              <div
                key={t.id}
                onClick={() => setActiveTaskId(t.id)}
                className="p-3.5 rounded-2xl bg-slate-900/60 border border-slate-800/80 hover:border-cyan-500/40 cursor-pointer transition-all flex flex-col justify-between space-y-2 group"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-xs text-white group-hover:text-cyan-300 transition-colors truncate">
                    {t.host?.name || 'Équipement'}
                  </span>
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
                </div>

                <div className="flex items-center justify-between text-[11px] text-slate-400">
                  <span className="font-mono text-cyan-400 truncate">Étape: {t.currentStep}</span>
                  <span>{new Date(t.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modals */}
      {activeTaskId && (
        <PipelineExecutionModal taskId={activeTaskId} onClose={() => { setActiveTaskId(null); loadData(); }} />
      )}

      {selectedChangelogHost && (
        <ChangelogViewerModal
          host={selectedChangelogHost}
          changelog={changelogData}
          onClose={() => setSelectedChangelogHost(null)}
        />
      )}
    </div>
  );
};

