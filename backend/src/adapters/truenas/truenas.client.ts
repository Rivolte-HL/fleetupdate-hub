import http from 'http';
import https from 'https';
import { URL } from 'url';

export interface TrueNASConfig {
  baseUrl: string; // e.g. https://192.168.1.50 or http://truenas.local
  apiKey?: string;
  username?: string;
  password?: string;
  caCert?: string;
  allowSelfSigned?: boolean;
  timeoutMs?: number;
}

export interface TrueNASSystemInfo {
  version: string;
  hostname: string;
  uptime_seconds?: number;
  system_serial?: string;
  model?: string;
  system_product?: string;
  cores?: number;
  physical_memory?: number;
}

export interface TrueNASSystemUpdateStatus {
  status: 'AVAILABLE' | 'UNAVAILABLE' | 'CHECKING' | string;
  version?: string;
  changelog?: string;
  notice?: string;
  files?: Array<{ filename: string; size: number }>;
}

export interface TrueNASApp {
  id: string;
  name: string;
  status: string; // 'RUNNING' | 'STOPPED' | 'DEPLOYING' | 'ACTIVE' | string
  currentVersion: string;
  targetVersion?: string;
  hasUpdate: boolean;
  type: 'DOCKER_APP' | 'CHART_RELEASE';
  description?: string;
  icon?: string;
}

export interface TrueNASAlert {
  id: string;
  level: 'CRITICAL' | 'WARNING' | 'INFO' | string;
  formatted: string;
  datetime: string;
  dismissed: boolean;
}

export interface TrueNASJob {
  id: number;
  method?: string;
  state: 'WAITING' | 'RUNNING' | 'SUCCESS' | 'FAILED' | 'ABORTED' | string;
  progress?: {
    percent?: number;
    description?: string;
    extra?: any;
  };
  result?: any;
  error?: string;
  exception?: string;
  time_started?: any;
  time_finished?: any;
}

export function extractJobId(response: any): number | null {
  if (typeof response === 'number' && Number.isInteger(response)) {
    return response;
  }
  if (response && typeof response === 'object') {
    if (typeof response.id === 'number') return response.id;
    if (typeof response.job_id === 'number') return response.job_id;
    if (typeof response.jobId === 'number') return response.jobId;
    if (typeof response.result === 'number') return response.result;
    if (typeof response.id === 'string' && /^\d+$/.test(response.id)) return parseInt(response.id, 10);
    if (typeof response.job_id === 'string' && /^\d+$/.test(response.job_id)) return parseInt(response.job_id, 10);
  }
  return null;
}

export class TrueNASClient {
  private config: TrueNASConfig;

  constructor(config: TrueNASConfig) {
    this.config = config;
  }

  public async request<T = any>(
    endpoint: string,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
    body?: any,
    customTimeoutMs?: number
  ): Promise<T> {
    let cleanBase = (this.config.baseUrl || '').trim().replace(/\/+$/, '');
    if (!cleanBase.startsWith('http://') && !cleanBase.startsWith('https://')) {
      cleanBase = `https://${cleanBase}`;
    }

    const rawUrl = `${cleanBase}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;
    const parsed = new URL(rawUrl);
    const isHttps = parsed.protocol === 'https:';
    const clientModule = isHttps ? https : http;

    const payload = body ? JSON.stringify(body) : undefined;
    const headers: Record<string, string> = {
      'Accept': 'application/json',
      'User-Agent': 'FleetUpdate-Hub/1.0'
    };

    // Authentication: Bearer API Key preferred, fallback to Basic Auth
    if (this.config.apiKey && this.config.apiKey.trim()) {
      headers['Authorization'] = `Bearer ${this.config.apiKey.trim()}`;
    } else if (this.config.username && this.config.password) {
      const authStr = Buffer.from(`${this.config.username.trim()}:${this.config.password}`).toString('base64');
      headers['Authorization'] = `Basic ${authStr}`;
    }

    if (payload) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(payload).toString();
    }

    const timeout = customTimeoutMs || this.config.timeoutMs || 30000;

    const isSelfSignedAllowed = this.config.allowSelfSigned === true;
    if (isHttps && isSelfSignedAllowed) {
      console.warn(`[SECURITY WARNING] TLS certificate verification is disabled (allowSelfSigned: true) for TrueNAS host: ${parsed.hostname}`);
    }

    const options: https.RequestOptions = {
      protocol: parsed.protocol,
      hostname: parsed.hostname,
      port: parsed.port || (isHttps ? 443 : 80),
      path: `${parsed.pathname}${parsed.search}`,
      method,
      headers,
      timeout,
      rejectUnauthorized: !isSelfSignedAllowed
    };

    if (this.config.caCert) {
      options.ca = this.config.caCert;
    }

    return new Promise<T>((resolve, reject) => {
      const req = clientModule.request(options, (res) => {
        let rawData = '';
        res.setEncoding('utf8');

        res.on('data', (chunk) => {
          rawData += chunk;
        });

        res.on('end', () => {
          const statusCode = res.statusCode || 0;
          if (statusCode >= 200 && statusCode < 300) {
            if (!rawData.trim()) {
              return resolve({} as T);
            }
            try {
              const parsedData = JSON.parse(rawData);
              resolve(parsedData as T);
            } catch (err: any) {
              resolve(rawData as unknown as T);
            }
          } else {
            let errorDetail = rawData.slice(0, 300);
            try {
              const errJson = JSON.parse(rawData);
              errorDetail = errJson.message || errJson.error || errorDetail;
            } catch {}
            reject(new Error(`TrueNAS API HTTP ${statusCode} sur ${endpoint}: ${errorDetail}`));
          }
        });
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error(`Délai d'attente dépassé (Timeout ${timeout}ms) sur TrueNAS API (${rawUrl})`));
      });

      req.on('error', (err: any) => {
        reject(new Error(`Erreur réseau TrueNAS (${rawUrl}): ${err.message}`));
      });

      if (payload) {
        req.write(payload);
      }
      req.end();
    });
  }

  /**
   * Retrieves TrueNAS System Information
   */
  public async getSystemInfo(): Promise<TrueNASSystemInfo> {
    return this.request<TrueNASSystemInfo>('/api/v2.0/system/info', 'GET');
  }

  /**
   * Checks for available system updates
   */
  public async checkSystemUpdate(): Promise<TrueNASSystemUpdateStatus> {
    try {
      // Primary TrueNAS SCALE endpoint: POST /api/v2.0/update/check_available
      return await this.request<TrueNASSystemUpdateStatus>('/api/v2.0/update/check_available', 'POST', {});
    } catch (err: any) {
      // Fallback: check pending updates if check_available endpoint failed
      try {
        const pending = await this.request<any>('/api/v2.0/update/get_pending', 'GET');
        if (pending && Array.isArray(pending) && pending.length > 0) {
          return {
            status: 'AVAILABLE',
            version: pending[0]?.version || 'Newer version',
            changelog: pending[0]?.changelog || ''
          };
        }
      } catch {}
      return { status: 'UNAVAILABLE' };
    }
  }

  /**
   * Applies the TrueNAS system update
   */
  public async applySystemUpdate(rebootAfterDownload: boolean = true): Promise<any> {
    return this.request('/api/v2.0/update/update', 'POST', {
      reboot_after_download: rebootAfterDownload
    }, 60000);
  }

  /**
   * Reboots the TrueNAS system via the official system/reboot API endpoint
   */
  public async rebootSystem(): Promise<any> {
    return this.request('/api/v2.0/system/reboot', 'POST', {});
  }

  /**
   * Retrieves all TrueNAS installed applications (Docker Compose apps or Helm Chart releases)
   */
  public async getApps(): Promise<TrueNASApp[]> {
    const apps: TrueNASApp[] = [];

    // 1. Attempt TrueNAS SCALE 24.10+ (Electric Eel) Docker Compose Apps endpoint: /api/v2.0/app
    let triedAppEndpoint = false;
    try {
      const dockerApps = await this.request<any[]>('/api/v2.0/app', 'GET');
      triedAppEndpoint = true;
      if (Array.isArray(dockerApps)) {
        for (const app of dockerApps) {
          const id = String(app.id || app.name || '');
          if (!id) continue;
          const currentVersion = String(app.version || app.human_version || 'Installed');
          const hasUpdate = Boolean(app.upgrade_available);
          const targetVersion = hasUpdate ? String(app.latest_version || app.target_version || 'Latest') : currentVersion;

          apps.push({
            id,
            name: String(app.name || id),
            status: String(app.status || 'UNKNOWN').toUpperCase(),
            currentVersion,
            targetVersion,
            hasUpdate,
            type: 'DOCKER_APP',
            description: app.metadata?.description || app.description,
            icon: app.metadata?.icon || app.icon
          });
        }
        return apps;
      }
    } catch (err: any) {
      // If /api/v2.0/app is not found or unsupported, fall back to /api/v2.0/chart/release
    }

    // 2. Fallback to TrueNAS SCALE 22.12 - 24.04 Chart Releases endpoint: /api/v2.0/chart/release
    try {
      const chartReleases = await this.request<any[]>('/api/v2.0/chart/release', 'GET');
      if (Array.isArray(chartReleases)) {
        for (const chart of chartReleases) {
          const id = String(chart.id || chart.name || '');
          if (!id) continue;
          const currentVersion = String(chart.human_version || chart.chart_metadata?.appVersion || chart.chart_metadata?.version || 'Installed');
          const hasUpdate = Boolean(chart.update_available);
          const targetVersion = hasUpdate ? String(chart.chart_metadata?.latest_version || 'Latest') : currentVersion;

          apps.push({
            id,
            name: String(chart.name || id),
            status: String(chart.status || 'UNKNOWN').toUpperCase(),
            currentVersion,
            targetVersion,
            hasUpdate,
            type: 'CHART_RELEASE',
            description: chart.chart_metadata?.description,
            icon: chart.chart_metadata?.icon
          });
        }
      }
    } catch (err: any) {
      if (!triedAppEndpoint) {
        throw new Error(`Failed to list TrueNAS applications: ${err.message}`);
      }
    }

    return apps;
  }

  /**
   * Upgrades a specific TrueNAS application
   */
  public async upgradeApp(appName: string, type: 'DOCKER_APP' | 'CHART_RELEASE'): Promise<any> {
    if (type === 'DOCKER_APP') {
      return this.request('/api/v2.0/app/upgrade', 'POST', {
        app_name: appName
      }, 120000);
    } else {
      return this.request('/api/v2.0/chart/release/upgrade', 'POST', {
        release_name: appName
      }, 120000);
    }
  }

  /**
   * Rolls back a specific TrueNAS application
   */
  public async rollbackApp(
    appName: string,
    type: 'DOCKER_APP' | 'CHART_RELEASE',
    snapshotOrVersion?: string | number
  ): Promise<any> {
    if (type === 'DOCKER_APP') {
      const body: any = { app_name: appName };
      if (snapshotOrVersion) {
        body.snapshot_name = String(snapshotOrVersion);
      }
      return this.request('/api/v2.0/app/rollback', 'POST', body, 120000);
    } else {
      const body: any = { release_name: appName };
      if (snapshotOrVersion) {
        body.item_version = Number(snapshotOrVersion) || 1;
      }
      return this.request('/api/v2.0/chart/release/rollback', 'POST', body, 120000);
    }
  }

  /**
   * Creates a safety ZFS Snapshot
   */
  public async createZfsSnapshot(dataset: string, snapshotName: string): Promise<any> {
    return this.request('/api/v2.0/zfs/snapshot', 'POST', {
      dataset: dataset.trim(),
      name: snapshotName.trim()
    }, 60000);
  }

  /**
   * Rolls back a ZFS Snapshot
   */
  public async rollbackZfsSnapshot(snapshotId: string): Promise<any> {
    return this.request('/api/v2.0/zfs/snapshot/rollback', 'POST', {
      id: snapshotId.trim()
    }, 60000);
  }

  /**
   * Saves TrueNAS system configuration archive (db backup)
   */
  public async saveConfig(): Promise<any> {
    return this.request('/api/v2.0/config/save', 'POST', {}, 30000);
  }

  /**
   * Fetches active TrueNAS alerts
   */
  public async getAlerts(): Promise<TrueNASAlert[]> {
    try {
      const alerts = await this.request<any[]>('/api/v2.0/alert/list', 'GET');
      if (Array.isArray(alerts)) {
        return alerts.map((a) => ({
          id: String(a.id || ''),
          level: String(a.level || 'INFO').toUpperCase(),
          formatted: String(a.formatted || a.text || 'Alert'),
          datetime: String(a.datetime || new Date().toISOString()),
          dismissed: Boolean(a.dismissed)
        }));
      }
      return [];
    } catch {
      return [];
    }
  }

  /**
   * Retrieves a specific TrueNAS job by ID
   */
  public async getJob(jobId: number): Promise<TrueNASJob | null> {
    try {
      const res = await this.request<any>(`/api/v2.0/core/get_jobs?id=${jobId}`, 'GET');
      if (Array.isArray(res)) {
        return res.find((j) => j && j.id === jobId) || res[0] || null;
      }
      if (res && typeof res === 'object' && res.id === jobId) {
        return res;
      }
      return null;
    } catch {
      try {
        const allJobs = await this.request<any[]>('/api/v2.0/core/get_jobs', 'GET');
        if (Array.isArray(allJobs)) {
          return allJobs.find((j) => j && j.id === jobId) || null;
        }
      } catch {}
      return null;
    }
  }

  /**
   * Waits for a background TrueNAS job to complete while streaming live progress
   */
  public async waitForJob(
    jobId: number,
    options?: {
      timeoutMs?: number;
      pollIntervalMs?: number;
      onProgress?: (progress: { percent?: number; description?: string }) => void;
    }
  ): Promise<TrueNASJob> {
    const timeout = options?.timeoutMs || 600000; // 10 minutes default
    const pollInterval = options?.pollIntervalMs || 2500;
    const startTime = Date.now();
    let lastProgressKey = '';
    let transientErrors = 0;

    while (Date.now() - startTime < timeout) {
      await new Promise((resolve) => setTimeout(resolve, pollInterval));

      let job: TrueNASJob | null = null;
      try {
        job = await this.getJob(jobId);
        transientErrors = 0;
      } catch (err: any) {
        transientErrors++;
        if (transientErrors > 5) {
          throw new Error(`Perte de communication avec TrueNAS lors du suivi de la tâche ${jobId}: ${err.message}`);
        }
        continue;
      }

      if (!job) {
        continue;
      }

      const state = String(job.state || '').toUpperCase();
      const percent = job.progress?.percent;
      const desc = job.progress?.description || '';
      const progressKey = `${percent ?? ''}-${desc}`;

      if (options?.onProgress && progressKey !== lastProgressKey && (percent !== undefined || desc)) {
        lastProgressKey = progressKey;
        options.onProgress({ percent, description: desc });
      }

      if (state === 'SUCCESS') {
        return job;
      }

      if (state === 'FAILED' || state === 'ABORTED') {
        const errorDetail = job.error || job.exception || `Tâche ${jobId} terminée en échec (état: ${state})`;
        throw new Error(`La tâche TrueNAS (${jobId}) a échoué: ${errorDetail}`);
      }
    }

    throw new Error(`Délai d'attente dépassé (${Math.round(timeout / 1000)}s) pour l'achèvement de la tâche TrueNAS ${jobId}`);
  }

  /**
   * Waits for TrueNAS host to reboot and verify that it comes back online
   */
  public async waitForReboot(
    targetVersion?: string,
    options?: { maxWaitMs?: number; onProgress?: (msg: string) => void }
  ): Promise<TrueNASSystemInfo> {
    const maxWaitMs = options?.maxWaitMs || 600000; // 10 minutes
    const startTime = Date.now();
    const pollIntervalMs = 5000;

    // Grace period for host to start shutdown sequence
    options?.onProgress?.('En attente de l\'extinction et du redémarrage du serveur TrueNAS...');
    await new Promise((resolve) => setTimeout(resolve, 15000));

    let hasBeenOffline = false;

    while (Date.now() - startTime < maxWaitMs) {
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
      const elapsed = Math.round((Date.now() - startTime) / 1000);

      try {
        const sysInfo = await this.getSystemInfo();
        if (sysInfo && sysInfo.version) {
          const uptime = sysInfo.uptime_seconds ?? 9999;
          if (hasBeenOffline || uptime < 300 || (targetVersion && sysInfo.version.includes(targetVersion))) {
            options?.onProgress?.(`TrueNAS a redémarré avec succès (${sysInfo.version}, uptime: ${uptime}s).`);
            return sysInfo;
          }
        }
      } catch {
        hasBeenOffline = true;
        options?.onProgress?.(`Redémarrage en cours... (${elapsed}s écoulées, serveur temporairement injoignable)`);
      }
    }

    throw new Error(`Délai d'attente dépassé (${Math.round(maxWaitMs / 1000)}s) lors du redémarrage de TrueNAS.`);
  }
}
