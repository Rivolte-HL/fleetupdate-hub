import React, { useEffect, useState, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Host, AdapterMetadata, ChangelogItem } from "../types/index.js";
import { hostsService } from "../services/hosts.service.js";
import { updatesService } from "../services/updates.service.js";
import { useToast } from "../context/ToastContext.js";
import { useLanguage } from "../context/LanguageContext.js";
import { HostCard } from "../components/HostCard.js";
import { DynamicAdapterForm } from "../components/DynamicAdapterForm.js";
import { ChangelogViewerModal } from "../components/ChangelogViewerModal.js";
import { PipelineExecutionModal } from "../components/PipelineExecutionModal.js";
import { EditHostModal } from "../components/EditHostModal.js";
import { ServiceTutorialModal } from "../components/ServiceTutorialModal.js";
import { BulkUpdateModal } from "../components/BulkUpdateModal.js";
import { Plus, Search, Filter, Server, X, RefreshCw, BookOpen, Zap } from "lucide-react";

export const HostsPage: React.FC = () => {
  const [hosts, setHosts] = useState<Host[]>([]);
  const [adapters, setAdapters] = useState<AdapterMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [showAddModal, setShowAddModal] = useState(false);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [showTutorialModal, setShowTutorialModal] = useState(false);
  const [tutorialService, setTutorialService] = useState("PROXMOX");
  const [editingHost, setEditingHost] = useState<Host | null>(null);
  const [selectedAdapter, setSelectedAdapter] = useState<AdapterMetadata | null>(null);
  const [formSubmitting, setFormSubmitting] = useState(false);

  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [selectedChangelogHost, setSelectedChangelogHost] = useState<Host | null>(null);
  const [changelogData, setChangelogData] = useState<ChangelogItem[]>([]);
  const [refreshingAll, setRefreshingAll] = useState(false);

  const { addToast } = useToast();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const loadData = async () => {
    try {
      setLoading(true);
      const [hostsData, adaptersData] = await Promise.all([
        hostsService.getHosts(),
        hostsService.getAdapters()
      ]);
      setHosts(hostsData);
      setAdapters(adaptersData);
      if (adaptersData.length > 0 && !selectedAdapter) {
        setSelectedAdapter(adaptersData[0]);
      }
    } catch (err: any) {
      addToast("error", t('common.error'), err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    if (searchParams.get('action') === 'new') {
      setShowAddModal(true);
    }
  }, [searchParams]);

  const handleRefreshAll = async () => {
    setRefreshingAll(true);
    addToast('info', t('common.refreshing'), t('common.refreshAll'));
    try {
      const res = await hostsService.refreshAll();
      setHosts(res.hosts);
      addToast(
        'success',
        t('common.success'),
        res.message || `${res.summary?.updatesFound || 0} ${t('common.updatesAvailable')}`
      );
    } catch (err: any) {
      addToast('error', t('common.error'), err.response?.data?.message || err.message);
    } finally {
      setRefreshingAll(false);
    }
  };

  const handleCreateHost = async (formData: any) => {
    if (!selectedAdapter) return;
    setFormSubmitting(true);
    try {
      const res = await hostsService.createHost({
        name: formData.name,
        description: formData.description,
        adapterType: selectedAdapter.type,
        endpointUrl: formData.endpointUrl,
        port: formData.port,
        metadata: formData.metadata,
        credentials: formData.credentials
      });
      addToast("success", t('common.success'), res.message || t('hosts.hostCreatedSuccess'));
      setShowAddModal(false);
      loadData();
    } catch (err: any) {
      addToast("error", t('common.error'), err.response?.data?.message || err.message);
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleRefreshHost = async (host: Host) => {
    try {
      addToast("info", t('common.refreshing'), `${host.name}...`);
      const res = await hostsService.refreshVersion(host.id);
      setHosts(prev => prev.map(h => (h.id === host.id ? res.host : h)));
      addToast("success", t('common.success'), `${host.name} : ${res.versionInfo?.hasUpdate ? t('common.updatesAvailable') : t('common.upToDate')}`);
    } catch (err: any) {
      addToast("error", t('common.error'), err.response?.data?.message || err.message);
    }
  };

  const handleTriggerUpdate = async (host: Host) => {
    try {
      const res = await updatesService.triggerUpdate({ hostId: host.id, autoRollback: true });
      addToast("success", t('pipeline.title'), res.message);
      setActiveTaskId(res.task.id);
    } catch (err: any) {
      addToast("error", t('common.error'), err.response?.data?.message || err.message);
    }
  };

  const handleViewChangelog = async (host: Host) => {
    try {
      setSelectedChangelogHost(host);
      const data = await hostsService.getChangelog(host.id);
      setChangelogData(data);
    } catch (e: any) {
      addToast("error", t('common.error'), e.message);
    }
  };

  const filteredHosts = useMemo(() => {
    return hosts.filter((h) => {
      const matchSearch =
        search.trim() === "" ||
        h.name.toLowerCase().includes(search.toLowerCase()) ||
        h.endpointUrl.toLowerCase().includes(search.toLowerCase()) ||
        h.adapterType.toLowerCase().includes(search.toLowerCase());

      const matchType = typeFilter === "ALL" || h.adapterType === typeFilter;
      return matchSearch && matchType;
    });
  }, [hosts, search, typeFilter]);

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-extrabold text-white tracking-tight">{t('hosts.title')}</h2>
            <span className="text-xs font-mono px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700/60 font-bold">
              {filteredHosts.length} / {hosts.length}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">{t('hosts.subtitle')}</p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {hosts.some(h => (h.availableUpdatesCount || 0) > 0 && h.isOnline) && (
            <button
              type="button"
              onClick={() => setShowBulkModal(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-slate-950 shadow-lg shadow-amber-500/25 transition-all animate-pulse"
              title={t('bulk.title') || 'Bulk System Updates'}
            >
              <Zap className="w-4 h-4 fill-slate-950" />
              <span>{t('bulk.updateAllButton') || 'Update All'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => { setTutorialService('PROXMOX'); setShowTutorialModal(true); }}
            className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-bold bg-slate-900/80 hover:bg-slate-800 text-amber-300 hover:text-amber-200 border border-slate-800 hover:border-amber-500/30 transition-all shadow-sm"
            title={t('nav.tutorials')}
          >
            <BookOpen className="w-4 h-4 text-amber-400" />
            <span>{t('nav.tutorials')}</span>
          </button>

          <button
            type="button"
            onClick={handleRefreshAll}
            disabled={refreshingAll}
            className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-bold bg-slate-900/80 hover:bg-slate-800 text-cyan-300 hover:text-cyan-200 border border-slate-800 hover:border-cyan-500/40 transition-all shadow-sm disabled:opacity-50"
            title={t('common.refreshAll')}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshingAll ? 'animate-spin text-cyan-400' : 'text-cyan-400'}`} />
            <span>{refreshingAll ? t('common.refreshing') : t('common.refreshAll')}</span>
          </button>

          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white shadow-lg shadow-cyan-500/20 transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>{t('hosts.addHostButton')}</span>
          </button>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="glass-panel p-3.5 rounded-2xl flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-2.5" />
          <input
            type="text"
            placeholder={t('hosts.searchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-8 py-2 rounded-xl bg-slate-900/90 border border-slate-800 text-xs text-slate-100 placeholder-slate-500 focus:border-cyan-500/50 outline-none"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-2.5 top-2.5 text-slate-500 hover:text-slate-300"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-1.5 w-full md:w-auto overflow-x-auto pb-1 md:pb-0">
          <span className="text-xs text-slate-500 flex items-center gap-1 shrink-0 px-1 font-semibold">
            <Filter className="w-3 h-3" /> {t('hosts.filterByType')} :
          </span>
          {[
            { id: "ALL", label: t('hosts.allTypes') },
            { id: "PROXMOX", label: "Proxmox" },
            { id: "PROXMOX_BACKUP_SERVER", label: "PBS" },
            { id: "OPNSENSE", label: "OPNsense" },
            { id: "DOCKER", label: "Docker" },
            { id: "LINUX_SSH", label: "Linux" },
            { id: "HOME_ASSISTANT", label: "Home Assistant" }
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTypeFilter(item.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 ${
                typeFilter === item.id
                  ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm"
                  : "bg-slate-900/60 text-slate-400 hover:text-slate-200 border border-slate-800"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* Hosts Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="glass-panel p-6 rounded-2xl h-44 animate-pulse bg-slate-900/40" />
          ))}
        </div>
      ) : filteredHosts.length === 0 ? (
        <div className="glass-panel p-10 rounded-2xl text-center text-slate-400 space-y-2">
          <Server className="w-8 h-8 text-slate-600 mx-auto" />
          <p className="text-sm font-semibold text-slate-300">{t('hosts.emptyList')}</p>
          <p className="text-xs text-slate-500">{t('dashboard.noHostsMatchSearch')}</p>
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
              onEdit={(h) => setEditingHost(h)}
            />
          ))}
        </div>
      )}

      {/* Add Host Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="glass-panel-glow w-full max-w-2xl rounded-3xl border border-cyan-500/30 overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
            <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-900/60">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
                  <Server className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">{t('hosts.addNewHostTitle')}</h3>
                  <p className="text-xs text-slate-400">{t('hosts.addNewHostSubtitle')}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-5 flex-1">
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-slate-400 block mb-2.5">
                  {t('hosts.selectModule')}
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {adapters.map((a) => (
                    <button
                      key={a.type}
                      type="button"
                      onClick={() => setSelectedAdapter(a)}
                      className={`p-3 rounded-2xl border text-left transition-all ${
                        selectedAdapter?.type === a.type
                          ? "bg-cyan-500/20 border-cyan-500/50 text-cyan-300 shadow-md shadow-cyan-950/30"
                          : "bg-slate-900/60 border-slate-800 text-slate-400 hover:border-slate-700"
                      }`}
                    >
                      <div className="font-bold text-xs text-white">{a.displayName}</div>
                      <div className="text-[10px] text-slate-500 mt-0.5 truncate">{a.type}</div>
                    </button>
                  ))}
                </div>
              </div>

              {selectedAdapter && (
                <DynamicAdapterForm
                  adapter={selectedAdapter}
                  onSubmit={handleCreateHost}
                  onCancel={() => setShowAddModal(false)}
                  loading={formSubmitting}
                />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Edit Host Modal */}
      {editingHost && (
        <EditHostModal
          host={editingHost}
          adapters={adapters}
          onClose={() => setEditingHost(null)}
          onSuccess={(updated) => {
            setHosts(prev => prev.map(h => h.id === updated.id ? updated : h));
            handleRefreshHost(updated);
          }}
        />
      )}

      {/* Pipeline Modal */}
      {activeTaskId && (
        <PipelineExecutionModal taskId={activeTaskId} onClose={() => { setActiveTaskId(null); loadData(); }} />
      )}

      {/* Changelog Modal */}
      {selectedChangelogHost && (
        <ChangelogViewerModal
          host={selectedChangelogHost}
          changelog={changelogData}
          onClose={() => setSelectedChangelogHost(null)}
        />
      )}

      {/* Integration Guides & Tutorials Modal */}
      {showTutorialModal && (
        <ServiceTutorialModal
          initialService={tutorialService}
          onClose={() => setShowTutorialModal(false)}
        />
      )}

      {/* Bulk Update Modal */}
      {showBulkModal && (
        <BulkUpdateModal
          isOpen={showBulkModal}
          onClose={() => setShowBulkModal(false)}
          hosts={hosts}
          onSuccess={(newTasks) => {
            setShowBulkModal(false);
            if (newTasks.length > 0) {
              setActiveTaskId(newTasks[0].id);
            }
            loadData();
          }}
        />
      )}
    </div>
  );
};

