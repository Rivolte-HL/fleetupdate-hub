import React, { useState } from 'react';
import { Host, UpdateTask } from '../types/index.js';
import { StatCard } from '../components/StatCard.js';
import { HostCard } from '../components/HostCard.js';
import { ChangelogViewerModal } from '../components/ChangelogViewerModal.js';
import { BulkUpdateModal } from '../components/BulkUpdateModal.js';
import { Server, ShieldCheck, AlertTriangle, Activity, Search, Zap, Terminal, CheckCircle2, Play, RefreshCw, X } from 'lucide-react';
import { Badge } from '../components/Badge.js';
import { useLanguage } from '../context/LanguageContext.js';

export const DemoDashboardPage: React.FC = () => {
  const { t } = useLanguage();

  const mockHosts: Host[] = [
    {
      id: 'demo-pve-1',
      name: 'pve-cluster-node01',
      adapterType: 'PROXMOX',
      endpointUrl: 'https://192.168.1.100:8006',
      isOnline: true,
      currentVersion: '8.2.4',
      targetVersion: '8.2.7',
      availableUpdatesCount: 3,
      requiresReboot: false,
      lastCheckAt: new Date().toISOString(),
      createdAt: '2026-08-01T00:00:00Z',
      updatedAt: '2026-08-20T18:00:00Z',
      metadata: {
        node: 'pve1',
        kernel: '6.8.8-2-pve',
        qemuVms: 8,
        lxcContainers: 6,
        snapshotCapability: 'QEMU Atomic Snapshots'
      }
    },
    {
      id: 'demo-opn-1',
      name: 'opnsense-core-fw',
      adapterType: 'OPNSENSE',
      endpointUrl: 'https://192.168.1.1:443',
      isOnline: true,
      currentVersion: '24.7.1',
      targetVersion: '24.7.2',
      availableUpdatesCount: 1,
      requiresReboot: false,
      lastCheckAt: new Date().toISOString(),
      createdAt: '2026-08-01T00:00:00Z',
      updatedAt: '2026-08-20T18:00:00Z',
      metadata: {
        product: 'OPNsense Business / Community',
        arch: 'amd64',
        xmlBackup: 'Enabled (Automated)'
      }
    },
    {
      id: 'demo-docker-1',
      name: 'docker-prod-swarm',
      adapterType: 'DOCKER',
      endpointUrl: 'https://192.168.1.20:2376',
      isOnline: true,
      currentVersion: '27.1.1',
      targetVersion: '27.1.1',
      availableUpdatesCount: 2,
      requiresReboot: false,
      lastCheckAt: new Date().toISOString(),
      createdAt: '2026-08-01T00:00:00Z',
      updatedAt: '2026-08-20T18:00:00Z',
      metadata: {
        containersRunning: 14,
        containersTotal: 14,
        outdatedImages: ['traefik:v3.1.2', 'nextcloud:30.0.0-fpm'],
        rollbackReady: true
      }
    },
    {
      id: 'demo-pbs-1',
      name: 'pbs-backup-node',
      adapterType: 'PROXMOX_BACKUP_SERVER',
      endpointUrl: 'https://192.168.1.101:8007',
      isOnline: true,
      currentVersion: '3.2.7',
      targetVersion: '3.2.7',
      availableUpdatesCount: 0,
      requiresReboot: false,
      lastCheckAt: new Date().toISOString(),
      createdAt: '2026-08-01T00:00:00Z',
      updatedAt: '2026-08-20T18:00:00Z',
      metadata: {
        datastore: 'tank-zfs-backup',
        verifyStatus: 'Verified (0 bad chunks)',
        dedupFactor: '4.82x'
      }
    },
    {
      id: 'demo-ha-1',
      name: 'homeassistant-hub',
      adapterType: 'HOME_ASSISTANT',
      endpointUrl: 'http://192.168.1.200:8123',
      isOnline: true,
      currentVersion: '2024.8.1',
      targetVersion: '2024.8.2',
      availableUpdatesCount: 1,
      requiresReboot: false,
      lastCheckAt: new Date().toISOString(),
      createdAt: '2026-08-01T00:00:00Z',
      updatedAt: '2026-08-20T18:00:00Z',
      metadata: {
        osVersion: 'Home Assistant OS 13.0',
        supervisorBackup: 'Automated Snapshot Enabled',
        entitiesManaged: 42
      }
    },
    {
      id: 'demo-linux-1',
      name: 'srv-ubuntu-prod01',
      adapterType: 'LINUX_SSH',
      endpointUrl: '192.168.1.50:22',
      isOnline: true,
      currentVersion: 'Ubuntu 24.04 LTS',
      targetVersion: '5 security packages',
      availableUpdatesCount: 5,
      requiresReboot: true,
      lastCheckAt: new Date().toISOString(),
      createdAt: '2026-08-01T00:00:00Z',
      updatedAt: '2026-08-20T18:00:00Z',
      metadata: {
        pkgManager: 'APT',
        authMethod: 'Ed25519 Key',
        rebootRequiredReason: 'Kernel 6.8.0-40-generic installed'
      }
    }
  ];

  const mockTasks: UpdateTask[] = [
    {
      id: 'demo-task-1',
      hostId: 'demo-pbs-1',
      status: 'SUCCESS',
      currentStep: 'COMPLETED',
      previousVersion: '3.2.6',
      targetVersion: '3.2.7',
      startedAt: '2026-08-20T17:30:00Z',
      completedAt: '2026-08-20T17:30:50Z',
      logs: [
        { timestamp: '2026-08-20T17:30:00Z', level: 'INFO', step: 'PRE_FLIGHT', message: 'Host reachable (latency: 1.1ms)' },
        { timestamp: '2026-08-20T17:30:05Z', level: 'SUCCESS', step: 'BACKUP', message: 'Datastore safety checkpoint verified' },
        { timestamp: '2026-08-20T17:30:45Z', level: 'SUCCESS', step: 'SUCCESS', message: 'Package upgrade applied cleanly' }
      ],
      host: mockHosts[3]
    },
    {
      id: 'demo-task-2',
      hostId: 'demo-docker-1',
      status: 'SUCCESS',
      currentStep: 'COMPLETED',
      previousVersion: '27.1.0',
      targetVersion: '27.1.1',
      startedAt: '2026-08-19T03:00:00Z',
      completedAt: '2026-08-19T03:01:20Z',
      logs: [
        { timestamp: '2026-08-19T03:00:00Z', level: 'INFO', step: 'PRE_FLIGHT', message: 'Daemon health probe OK' },
        { timestamp: '2026-08-19T03:00:10Z', level: 'SUCCESS', step: 'UPDATING', message: 'Containers recreated with new image digests' }
      ],
      host: mockHosts[2]
    }
  ];

  const [hosts] = useState<Host[]>(mockHosts);
  const [tasks] = useState<UpdateTask[]>(mockTasks);
  const [selectedDemoHost, setSelectedDemoHost] = useState<Host | null>(null);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [selectedChangelogHost, setSelectedChangelogHost] = useState<Host | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'UPDATES' | 'ONLINE' | 'OFFLINE' | 'REBOOT'>('ALL');

  const stats = {
    totalHosts: hosts.length,
    onlineHosts: hosts.filter((h) => h.isOnline).length,
    hasUpdates: hosts.filter((h) => h.availableUpdatesCount > 0).length,
    rebootRequired: hosts.filter((h) => h.requiresReboot).length
  };

  const filteredHosts = hosts.filter((h) => {
    const matchesSearch = h.name.toLowerCase().includes(searchQuery.toLowerCase()) || h.adapterType.toLowerCase().includes(searchQuery.toLowerCase());
    if (!matchesSearch) return false;
    if (statusFilter === 'UPDATES') return h.availableUpdatesCount > 0;
    if (statusFilter === 'ONLINE') return h.isOnline;
    if (statusFilter === 'OFFLINE') return !h.isOnline;
    if (statusFilter === 'REBOOT') return h.requiresReboot;
    return true;
  });

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Top Showcase Banner */}
      <div className="p-4 rounded-2xl bg-gradient-to-r from-cyan-950/80 via-blue-950/60 to-dark-800 border border-cyan-500/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-lg shadow-cyan-950/30">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 rounded-xl bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 font-bold font-mono text-sm">
            DEMO
          </div>
          <div>
            <h1 className="text-base font-bold text-white tracking-tight flex items-center space-x-2">
              <span>FleetUpdate-Hub Showcase Demo</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-950 text-emerald-400 border border-emerald-800/40">Live Mock Environment</span>
            </h1>
            <p className="text-xs text-slate-300">
              Interactive demonstration with Proxmox VE, OPNsense, Docker, PBS, Home Assistant & Linux SSH.
            </p>
          </div>
        </div>
        <button
          onClick={() => setShowBulkModal(true)}
          className="px-4 py-2 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white text-xs font-semibold rounded-xl shadow-lg shadow-cyan-500/25 transition flex items-center space-x-2"
        >
          <Zap className="w-4 h-4" />
          <span>Launch Bulk Pipeline ({stats.hasUpdates} Hosts)</span>
        </button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title={t('dashboard.kpiManagedHosts')}
          value={stats.totalHosts}
          subtitle={`${stats.onlineHosts} ${t('common.online')}`}
          icon={Server}
          variant="cyan"
        />
        <StatCard
          title={t('dashboard.kpiPendingUpdates')}
          value={stats.hasUpdates}
          subtitle={stats.hasUpdates > 0 ? t('common.updatesAvailable') : t('common.upToDate')}
          icon={AlertTriangle}
          variant={stats.hasUpdates > 0 ? 'amber' : 'emerald'}
        />
        <StatCard
          title={t('dashboard.kpiReboots')}
          value={stats.rebootRequired}
          subtitle={stats.rebootRequired > 0 ? t('dashboard.kpiRebootsSubtitle') : t('common.upToDate')}
          icon={Activity}
          variant={stats.rebootRequired > 0 ? 'rose' : 'slate'}
        />
        <StatCard
          title="Rollback Readiness"
          value="100%"
          subtitle="14 Protected Snapshots"
          icon={ShieldCheck}
          variant="emerald"
        />
      </div>

      {/* Main Hosts Section */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center space-x-2">
            <h2 className="text-lg font-bold text-white tracking-tight">{t('nav.hosts')}</h2>
            <span className="px-2 py-0.5 text-xs bg-dark-700 text-slate-400 rounded-full border border-dark-600">
              {filteredHosts.length}
            </span>
          </div>

          <div className="flex items-center space-x-2">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder={t('common.search')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 pr-3 py-1.5 bg-dark-800 border border-dark-600 rounded-xl text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition w-48 sm:w-64"
              />
            </div>

            <select
              value={statusFilter}
              onChange={(e: any) => setStatusFilter(e.target.value)}
              className="px-3 py-1.5 bg-dark-800 border border-dark-600 rounded-xl text-xs text-slate-300 focus:outline-none focus:border-cyan-500 transition"
            >
              <option value="ALL">All ({hosts.length})</option>
              <option value="UPDATES">Updates ({stats.hasUpdates})</option>
              <option value="REBOOT">Reboot ({stats.rebootRequired})</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredHosts.map((host) => (
            <HostCard
              key={host.id}
              host={host}
              onSelect={(h) => setSelectedDemoHost(h)}
              onRefresh={() => {}}
              onTriggerUpdate={(h) => setSelectedDemoHost(h)}
              onViewChangelog={(h) => setSelectedChangelogHost(h)}
            />
          ))}
        </div>
      </div>

      {/* Execution History Preview */}
      <div className="space-y-4 pt-4">
        <h2 className="text-lg font-bold text-white tracking-tight">{t('dashboard.recentExecutions')}</h2>
        <div className="bg-dark-800 border border-dark-600/80 rounded-2xl overflow-hidden divide-y divide-dark-600/50">
          {tasks.map((task) => (
            <div key={task.id} className="p-4 flex items-center justify-between hover:bg-dark-700/30 transition">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 rounded-xl bg-emerald-950 text-emerald-400 border border-emerald-800/40 flex items-center justify-center font-bold text-xs">
                  ✓
                </div>
                <div>
                  <div className="text-sm font-semibold text-white">{task.host?.name}</div>
                  <div className="text-xs text-slate-400 font-mono">Transition: {task.previousVersion} ➔ {task.targetVersion}</div>
                </div>
              </div>
              <Badge variant="success">Completed (0 Errors)</Badge>
            </div>
          ))}
        </div>
      </div>

      {/* Interactive Simulated Pipeline Modal for Demo */}
      {selectedDemoHost && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="glass-panel w-full max-w-3xl rounded-3xl border border-cyan-500/40 overflow-hidden shadow-2xl flex flex-col max-h-[90vh] bg-dark-800">
            <div className="p-6 border-b border-dark-600 flex items-center justify-between bg-dark-700/70">
              <div className="flex items-center space-x-3">
                <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
                  <Play className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">5-Phase Pipeline: {selectedDemoHost.name}</h3>
                  <p className="text-xs text-slate-400 font-mono">{selectedDemoHost.adapterType} • {selectedDemoHost.currentVersion} ➔ {selectedDemoHost.targetVersion}</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedDemoHost(null)}
                className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-dark-600 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-6 overflow-y-auto">
              {/* 5 Visual Steps */}
              <div className="grid grid-cols-5 gap-2 text-center text-xs">
                <div className="p-2.5 rounded-xl bg-emerald-950/80 border border-emerald-700/50 text-emerald-400">
                  <div className="font-bold">1. Pre-Flight</div>
                  <div className="text-[10px] text-emerald-300/80 mt-0.5">PASSED</div>
                </div>
                <div className="p-2.5 rounded-xl bg-emerald-950/80 border border-emerald-700/50 text-emerald-400">
                  <div className="font-bold">2. Snapshot</div>
                  <div className="text-[10px] text-emerald-300/80 mt-0.5">CREATED</div>
                </div>
                <div className="p-2.5 rounded-xl bg-cyan-950 border border-cyan-500/70 text-cyan-400 ring-2 ring-cyan-500/30">
                  <div className="font-bold flex items-center justify-center space-x-1">
                    <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping"></span>
                    <span>3. Updating</span>
                  </div>
                  <div className="text-[10px] text-cyan-300 mt-0.5">IN PROGRESS</div>
                </div>
                <div className="p-2.5 rounded-xl bg-dark-700 text-slate-400">
                  <div className="font-bold">4. Probe (60s)</div>
                  <div className="text-[10px] mt-0.5">PENDING</div>
                </div>
                <div className="p-2.5 rounded-xl bg-dark-700 text-slate-400">
                  <div className="font-bold">5. Finalize</div>
                  <div className="text-[10px] mt-0.5">READY</div>
                </div>
              </div>

              {/* Streaming Log Console */}
              <div className="bg-dark-900 border border-dark-600 rounded-2xl p-4 font-mono text-xs text-slate-300 space-y-1.5 h-64 overflow-y-auto shadow-inner">
                <div className="text-slate-500">// FleetUpdate-Hub Live Event Stream (WebSocket: /ws/pipeline)</div>
                <div className="text-emerald-400">[20:00:01] [SUCCESS] [PRE_FLIGHT] Target host reachable (RTT: 1.2ms, Disk headroom: 48GB OK).</div>
                <div className="text-emerald-400">[20:00:05] [SUCCESS] [BACKUP] Point-in-time safety checkpoint created: vzdump-qemu-100-20260820.</div>
                <div className="text-cyan-400">[20:00:08] [INFO] [UPDATING] Executing non-interactive package upgrade on node...</div>
                <div className="text-slate-400">[20:00:12] [INFO] [UPDATING] Reading package lists... Done</div>
                <div className="text-slate-400">[20:00:15] [INFO] [UPDATING] Upgrading pve-manager (8.2.4 ➔ 8.2.7), qemu-server (8.2.1 ➔ 8.2.4)...</div>
                <div className="text-cyan-300 font-semibold flex items-center space-x-2 pt-2">
                  <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"></span>
                  <span>[20:00:22] [UPDATING] Unpacking replacement packages and validating kernel modules...</span>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <div className="flex items-center space-x-2 text-xs text-slate-400">
                  <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                  <span>Zero-Downtime Rollback Primed if Health Check Fails</span>
                </div>
                <div className="flex space-x-2">
                  <button
                    onClick={() => setSelectedDemoHost(null)}
                    className="px-4 py-2 rounded-xl bg-red-950/80 hover:bg-red-900 text-red-300 border border-red-700/50 text-xs font-semibold transition"
                  >
                    Trigger Rollback
                  </button>
                  <button
                    onClick={() => setSelectedDemoHost(null)}
                    className="px-4 py-2 rounded-xl bg-dark-700 hover:bg-dark-600 text-slate-200 text-xs font-semibold transition"
                  >
                    Close Viewer
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {selectedChangelogHost && (
        <ChangelogViewerModal
          host={selectedChangelogHost}
          changelog={[
            { version: '8.2.7', summary: 'Security Advisory: Kernel & QEMU CVE Mitigation', isSecurityFix: true, releaseDate: '2026-08-19' },
            { version: '8.2.6', summary: 'PVE Manager Live Migration Stability Fix', isSecurityFix: false, releaseDate: '2026-08-15' }
          ]}
          onClose={() => setSelectedChangelogHost(null)}
        />
      )}

      {showBulkModal && (
        <BulkUpdateModal
          isOpen={showBulkModal}
          hosts={hosts.filter((h) => h.availableUpdatesCount > 0)}
          onClose={() => setShowBulkModal(false)}
          onSuccess={() => setShowBulkModal(false)}
        />
      )}
    </div>
  );
};
