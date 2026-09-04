import http from 'http';
import https from 'https';
import { URL } from 'url';

export interface OPNsenseConfig {
  baseUrl: string; // e.g. https://192.168.1.1 or https://router.example.com
  apiKey: string;
  apiSecret: string;
  caCert?: string;
  allowSelfSigned?: boolean;
  timeoutMs?: number;
}

export interface OPNsenseFirmwarePackage {
  name?: string;
  version?: string;
  new_version?: string;
  old?: string;
  new?: string;
  current_version?: string;
  reason?: string;
  repository?: string;
  comment?: string;
}

export interface OPNsenseFirmwareStatus {
  status: string; // e.g. "ok", "update", "upgrade", "none"
  status_msg?: string;
  updates?: number | string;
  download_size?: string;
  upgrade_needs_reboot?: string | number | boolean;
  product_version?: string;
  product_latest?: string;
  all_packages?: Record<string, OPNsenseFirmwarePackage> | OPNsenseFirmwarePackage[];
  all_sets?: Record<string, OPNsenseFirmwarePackage> | OPNsenseFirmwarePackage[];
  upgrade_packages?: Record<string, OPNsenseFirmwarePackage> | OPNsenseFirmwarePackage[];
  new_packages?: Record<string, OPNsenseFirmwarePackage> | OPNsenseFirmwarePackage[];
  reinstall_packages?: Record<string, OPNsenseFirmwarePackage> | OPNsenseFirmwarePackage[];
  downgrade_packages?: Record<string, OPNsenseFirmwarePackage> | OPNsenseFirmwarePackage[];
  remove_packages?: Record<string, OPNsenseFirmwarePackage> | OPNsenseFirmwarePackage[];
}

export class OPNsenseClient {
  private config: OPNsenseConfig;

  constructor(config: OPNsenseConfig) {
    this.config = config;
  }

  public async request<T = any>(
    endpoint: string,
    method: 'GET' | 'POST' = 'GET',
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

    const authString = Buffer.from(`${this.config.apiKey.trim()}:${this.config.apiSecret.trim()}`).toString('base64');
    const payload = body ? JSON.stringify(body) : undefined;

    const headers: Record<string, string> = {
      'Authorization': `Basic ${authString}`,
      'Accept': 'application/json',
      'User-Agent': 'FleetUpdate-Hub/1.0'
    };

    if (payload) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(payload).toString();
    }

    const timeout = customTimeoutMs || this.config.timeoutMs || 30000;

    const isSelfSignedAllowed = this.config.allowSelfSigned === true;
    if (isHttps && isSelfSignedAllowed) {
      console.warn(`[SECURITY WARNING] TLS certificate verification is disabled (allowSelfSigned: true) for OPNsense host: ${parsed.hostname}`);
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
          if (res.statusCode === 401) {
            reject(new Error(`Authentification OPNsense refusée (HTTP 401). Vérifiez la Clé API et le Secret API.`));
            return;
          }
          if (res.statusCode === 403) {
            reject(new Error(`Droits insuffisants sur OPNsense (HTTP 403). Vérifiez les privilèges de l'utilisateur API (Firmware / System).`));
            return;
          }

          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            try {
              const parsedJson = JSON.parse(rawData);
              resolve(parsedJson);
            } catch (err: any) {
              resolve(rawData as any);
            }
          } else {
            reject(new Error(`OPNsense API HTTP ${res.statusCode} (${res.statusMessage || 'Erreur'}): ${rawData.slice(0, 300)}`));
          }
        });
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error(`Délai d'attente dépassé (Timeout ${timeout}ms) sur OPNsense (${parsed.hostname}:${options.port})`));
      });

      req.on('error', (err: any) => {
        reject(new Error(`Connexion impossible à OPNsense (${parsed.hostname}:${options.port}): ${err.message}`));
      });

      if (payload) {
        req.write(payload);
      }
      req.end();
    });
  }

  public async checkForUpdates(): Promise<any> {
    return this.request('/api/core/firmware/check', 'POST', {}, 45000);
  }

  public async getFirmwareStatus(forceRefresh = false): Promise<OPNsenseFirmwareStatus> {
    // Calling status with POST triggers a synchronous 'firmware probe' on OPNsense backend
    const method = forceRefresh ? 'POST' : 'GET';
    return this.request<OPNsenseFirmwareStatus>('/api/core/firmware/status', method, forceRefresh ? {} : undefined, 45000);
  }

  public async getUpgradeStatus(): Promise<{ status: string; log?: string }> {
    return this.request<{ status: string; log?: string }>('/api/core/firmware/upgradestatus', 'GET');
  }

  /**
   * Triggers standard package and minor updates (opnsense-update / pkg upgrade)
   */
  public async triggerUpdate(): Promise<{ status: string; msg_uuid?: string }> {
    return this.request<{ status: string; msg_uuid?: string }>('/api/core/firmware/update', 'POST', {}, 60000);
  }

  /**
   * Triggers major release upgrade (e.g. 23.7 -> 24.1)
   */
  public async triggerUpgrade(): Promise<{ status: string; msg_uuid?: string }> {
    return this.request<{ status: string; msg_uuid?: string }>('/api/core/firmware/upgrade', 'POST', {}, 60000);
  }

  /**
   * Reboots the firewall using the System: Firmware privilege endpoint
   */
  public async rebootSystem(): Promise<any> {
    return this.request('/api/core/firmware/reboot', 'POST', {}, 30000);
  }

  public async getSystemStatus(): Promise<any> {
    return this.request('/api/core/system/status', 'GET');
  }
}
