export interface HomeAssistantConfig {
  baseUrl: string; // e.g. http://homeassistant.local:8123 or https://192.168.1.200:8123
  accessToken: string;
  timeoutMs?: number;
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

  private async request<T = any>(
    endpoint: string,
    method: 'GET' | 'POST' = 'GET',
    body?: any,
    customTimeoutMs?: number
  ): Promise<T> {
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    const url = `${this.normalizedBaseUrl}${cleanEndpoint}`;
    const timeout = customTimeoutMs || this.config.timeoutMs || 20000;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
      const headers: Record<string, string> = {
        'Authorization': `Bearer ${this.config.accessToken.trim()}`,
        'Content-Type': 'application/json',
        'User-Agent': 'FleetUpdate-Hub/1.0'
      };

      const res = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal
      });

      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Home Assistant API HTTP ${res.status}: ${txt.slice(0, 200)}`);
      }

      return await res.json() as T;
    } catch (err: any) {
      if (err.name === 'AbortError') {
        throw new Error(`Délai d'attente dépassé (Timeout ${timeout}ms) sur Home Assistant (${url})`);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
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
}
