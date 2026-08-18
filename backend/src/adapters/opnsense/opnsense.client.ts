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

export interface OPNsenseFirmwareStatus {
  status: string; // e.g. "ok", "update", "upgrade"
  status_msg?: string;
  updates?: number | string;
  download_size?: string;
  upgrade_needs_reboot?: string | number | boolean;
  product_version?: string;
  product_latest?: string;
  all_packages?: Array<{
    name: string;
    version: string;
    new_version?: string;
    comment?: string;
  }>;
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

    const options: https.RequestOptions = {
      protocol: parsed.protocol,
      hostname: parsed.hostname,
      port: parsed.port || (isHttps ? 443 : 80),
      path: `${parsed.pathname}${parsed.search}`,
      method,
      headers,
      timeout,
      rejectUnauthorized: !!this.config.caCert ? true : (this.config.allowSelfSigned === false ? true : false)
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

  public async getFirmwareStatus(): Promise<OPNsenseFirmwareStatus> {
    return this.request<OPNsenseFirmwareStatus>('/api/core/firmware/status', 'GET');
  }

  public async getUpgradeStatus(): Promise<{ status: string; log?: string }> {
    return this.request<{ status: string; log?: string }>('/api/core/firmware/upgradestatus', 'GET');
  }

  public async triggerUpgrade(upgradeType: 'all' | 'pkg' = 'all'): Promise<{ status: string }> {
    return this.request<{ status: string }>('/api/core/firmware/upgrade', 'POST', {
      upgrade: upgradeType
    }, 60000);
  }

  public async rebootSystem(): Promise<any> {
    return this.request('/api/core/system/reboot', 'POST', {}, 30000);
  }

  public async getSystemStatus(): Promise<any> {
    return this.request('/api/core/system/status', 'GET');
  }
}
