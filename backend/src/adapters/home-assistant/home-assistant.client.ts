import http from 'http';
import https from 'https';
import { URL } from 'url';

export interface HomeAssistantConfig {
  baseUrl: string; // e.g. http://homeassistant.local:8123 or https://192.168.1.200:8123
  accessToken: string;
  timeoutMs?: number;
  allowSelfSigned?: boolean;
}

export class HomeAssistantClient {
  private config: HomeAssistantConfig;
  private normalizedBaseUrl: string;

  constructor(config: HomeAssistantConfig) {
    this.config = config;

    let base = (config.baseUrl || '').trim().replace(/\/+$/, '');
    if (!base.startsWith('http://') && !base.startsWith('https://')) {
      base = `http://${base}`;
    }
    this.normalizedBaseUrl = base;
  }

  public async request<T = any>(
    endpoint: string,
    method: 'GET' | 'POST' | 'DELETE' = 'GET',
    body?: any,
    customTimeoutMs?: number
  ): Promise<T> {
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    const fullUrl = `${this.normalizedBaseUrl}${cleanEndpoint}`;
    const parsed = new URL(fullUrl);
    const isHttps = parsed.protocol === 'https:';
    const clientModule = isHttps ? https : http;
    const timeout = customTimeoutMs || this.config.timeoutMs || 20000;

    const payload = body ? JSON.stringify(body) : undefined;
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${this.config.accessToken.trim()}`,
      'User-Agent': 'FleetUpdate-Hub/1.0'
    };
    if (payload) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(payload).toString();
    }

    const isSelfSignedAllowed = this.config.allowSelfSigned !== false;

    const options: https.RequestOptions = {
      protocol: parsed.protocol,
      hostname: parsed.hostname,
      port: parsed.port ? parseInt(parsed.port, 10) : (isHttps ? 443 : 80),
      path: `${parsed.pathname}${parsed.search}`,
      method,
      headers,
      timeout,
      rejectUnauthorized: !isSelfSignedAllowed
    };

    return new Promise<T>((resolve, reject) => {
      const req = clientModule.request(options, (res) => {
        let rawData = '';
        res.setEncoding('utf8');

        res.on('data', (chunk) => {
          rawData += chunk;
        });

        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            try {
              const parsedJson = rawData ? JSON.parse(rawData) : ({} as T);
              resolve(parsedJson);
            } catch (err: any) {
              resolve(rawData as unknown as T);
            }
          } else {
            reject(new Error(`Home Assistant API HTTP ${res.statusCode} (${res.statusMessage || 'Erreur'}): ${rawData.slice(0, 200)}`));
          }
        });
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error(`Délai d'attente dépassé (Timeout ${timeout}ms) sur Home Assistant (${fullUrl})`));
      });

      req.on('error', (err: any) => {
        reject(new Error(`Connexion impossible à Home Assistant (${fullUrl}): ${err.message}`));
      });

      if (payload) {
        req.write(payload);
      }
      req.end();
    });
  }

  public async getStatus(): Promise<{ message: string }> {
    return this.request('/api/', 'GET');
  }

  public async getConfig(): Promise<any> {
    return this.request('/api/config', 'GET');
  }

  public async getStates(): Promise<any[]> {
    return this.request<any[]>('/api/states', 'GET');
  }

  public async getEntityState(entityId: string): Promise<any> {
    const safeEntity = encodeURIComponent(entityId.trim());
    return this.request(`/api/states/${safeEntity}`, 'GET');
  }

  public async getUpdateEntities(): Promise<any[]> {
    const states = await this.getStates();
    return states.filter(s => s.entity_id && s.entity_id.startsWith('update.'));
  }

  public async installUpdate(entityId: string, backup: boolean = false): Promise<any> {
    const payload: any = { entity_id: entityId };
    if (backup) {
      payload.backup = true;
    }
    return this.request('/api/services/update/install', 'POST', payload, 60000);
  }

  public async skipUpdate(entityId: string): Promise<any> {
    return this.request('/api/services/update/skip', 'POST', {
      entity_id: entityId
    });
  }

  public async createBackup(name?: string): Promise<any> {
    const backupName = name || `FleetUpdate_PreUpdate_${Date.now()}`;
    // Try native backup service
    return this.request('/api/services/backup/create', 'POST', {
      name: backupName
    }, 60000).catch(async () => {
      // Fallback for older Home Assistant Supervisor hassio service
      return this.request('/api/services/hassio/backup_full', 'POST', {
        name: backupName
      }, 60000);
    });
  }

  public async restartCore(): Promise<any> {
    return this.request('/api/services/homeassistant/restart', 'POST');
  }

  public async rebootHost(): Promise<any> {
    return this.request('/api/services/hassio/host_reboot', 'POST', {}).catch(async () => {
      return this.restartCore();
    });
  }

  /**
   * Pushes or updates the state and attributes of an entity in Home Assistant's state machine.
   * If the entity does not exist, Home Assistant creates it dynamically.
   */
  public async setEntityState(entityId: string, state: string, attributes: Record<string, any> = {}): Promise<any> {
    const safeEntity = encodeURIComponent(entityId.trim());
    return this.request(`/api/states/${safeEntity}`, 'POST', {
      state,
      attributes
    });
  }

  /**
   * Removes an entity from Home Assistant's state machine.
   */
  public async removeEntityState(entityId: string): Promise<any> {
    const safeEntity = encodeURIComponent(entityId.trim());
    return this.request(`/api/states/${safeEntity}`, 'DELETE');
  }
}

