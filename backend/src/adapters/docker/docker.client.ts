import http from 'http';
import https from 'https';
import { URL } from 'url';

export interface DockerClientConfig {
  endpoint: string; // e.g. http://192.168.1.20:2375, https://docker.example.com, or https://192.168.1.20:2376
  username?: string;
  password?: string;
  apiKey?: string;
  caCert?: string;
  clientCert?: string;
  clientKey?: string;
  allowSelfSigned?: boolean;
  timeoutMs?: number;
}

export class DockerClient {
  private config: DockerClientConfig;
  private isTls: boolean;
  private host: string;
  private port: number;
  private basePath: string;

  constructor(config: DockerClientConfig) {
    this.config = config;

    let raw = (config.endpoint || '').trim();
    if (!raw.startsWith('http://') && !raw.startsWith('https://') && !raw.startsWith('tcp://')) {
      raw = `http://${raw}`;
    }

    const normalized = raw.replace('tcp://', 'http://');
    const url = new URL(normalized);

    this.isTls = raw.startsWith('https://') || !!config.caCert || url.port === '2376' || url.port === '443';
    this.host = url.hostname;
    this.port = parseInt(
      url.port || (this.isTls ? (raw.startsWith('https://') ? '443' : '2376') : '2375'),
      10
    );
    this.basePath = url.pathname === '/' ? '' : url.pathname.replace(/\/+$/, '');
  }

  private async request<T = any>(
    path: string,
    method: string = 'GET',
    body?: any,
    customTimeoutMs?: number
  ): Promise<T> {
    const isHttps = this.isTls;
    const timeout = customTimeoutMs || this.config.timeoutMs || 15000;
    const fullPath = `${this.basePath}${path}`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'FleetUpdate-Hub/1.0'
    };

    // Support HTTP Basic Authentication for Docker HTTPS reverse proxies
    if (this.config.username || this.config.password) {
      const user = this.config.username || '';
      const pass = this.config.password || '';
      const auth = Buffer.from(`${user}:${pass}`).toString('base64');
      headers['Authorization'] = `Basic ${auth}`;
    } else if (this.config.apiKey) {
      const token = this.config.apiKey.startsWith('Bearer ') ? this.config.apiKey : `Bearer ${this.config.apiKey}`;
      headers['Authorization'] = token;
    }

    // Determine TLS certificate validation
    let rejectUnauthorized = true;
    if (this.config.allowSelfSigned) {
      rejectUnauthorized = false;
    } else if (this.config.caCert) {
      rejectUnauthorized = true;
    } else if (isHttps && (this.host.match(/^(\d{1,3}\.){3}\d{1,3}$/) || this.host === 'localhost')) {
      // If connecting to a raw IP via HTTPS without CA provided, allow self-signed by default
      rejectUnauthorized = false;
    }

    const options: https.RequestOptions = {
      hostname: this.host,
      port: this.port,
      path: fullPath,
      method,
      timeout,
      headers,
      rejectUnauthorized
    };

    if (this.config.caCert) options.ca = this.config.caCert;
    if (this.config.clientCert) options.cert = this.config.clientCert;
    if (this.config.clientKey) options.key = this.config.clientKey;

    return new Promise((resolve, reject) => {
      const httpModule = isHttps ? https : http;
      const req = httpModule.request(options, (res) => {
        let rawData = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => { rawData += chunk; });
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(rawData ? JSON.parse(rawData) : {} as T);
            } catch (e) {
              resolve(rawData as any);
            }
          } else {
            reject(new Error(`Docker API HTTP ${res.statusCode} (${res.statusMessage || 'Erreur'}): ${rawData.slice(0, 300)}`));
          }
        });
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error(`Délai d'attente dépassé (Timeout ${timeout}ms) sur ${this.host}:${this.port}${path}`));
      });

      req.on('error', (err: any) => {
        reject(new Error(`Connexion impossible au démon Docker (${this.host}:${this.port}): ${err.message}`));
      });

      if (body) {
        req.write(typeof body === 'string' ? body : JSON.stringify(body));
      }
      req.end();
    });
  }

  public async ping(): Promise<string> {
    return this.request('/_ping', 'GET');
  }

  public async getSystemInfo(): Promise<any> {
    return this.request('/info', 'GET');
  }

  public async listContainers(all: boolean = true): Promise<any[]> {
    return this.request(`/containers/json?all=${all ? 1 : 0}`, 'GET');
  }

  public async inspectContainer(id: string): Promise<any> {
    const safeId = encodeURIComponent(id.trim());
    return this.request(`/containers/${safeId}/json`, 'GET');
  }

  public async inspectImage(nameOrId: string): Promise<any> {
    const safeName = encodeURIComponent(nameOrId.trim());
    return this.request(`/images/${safeName}/json`, 'GET');
  }

  public async pullImage(imageName: string): Promise<any> {
    const safeName = encodeURIComponent(imageName.trim());
    // Extended timeout for pulling image layers (up to 3 minutes)
    return this.request(`/images/create?fromImage=${safeName}`, 'POST', undefined, 180000);
  }

  public async createContainer(name: string, config: any): Promise<{ Id: string; Warnings?: string[] }> {
    const safeName = encodeURIComponent(name.trim());
    return this.request(`/containers/create?name=${safeName}`, 'POST', config, 30000);
  }

  public async renameContainer(id: string, newName: string): Promise<any> {
    const safeId = encodeURIComponent(id.trim());
    const safeName = encodeURIComponent(newName.trim());
    return this.request(`/containers/${safeId}/rename?name=${safeName}`, 'POST');
  }

  public async removeContainer(id: string, force: boolean = false): Promise<any> {
    const safeId = encodeURIComponent(id.trim());
    return this.request(`/containers/${safeId}?force=${force ? 1 : 0}`, 'DELETE');
  }

  public async restartContainer(id: string): Promise<any> {
    const safeId = encodeURIComponent(id.trim());
    return this.request(`/containers/${safeId}/restart`, 'POST', undefined, 30000);
  }

  public async stopContainer(id: string): Promise<any> {
    const safeId = encodeURIComponent(id.trim());
    return this.request(`/containers/${safeId}/stop`, 'POST', undefined, 30000);
  }

  public async startContainer(id: string): Promise<any> {
    const safeId = encodeURIComponent(id.trim());
    return this.request(`/containers/${safeId}/start`, 'POST', undefined, 30000);
  }

  public async tagImage(imageNameOrId: string, repo: string, tag: string): Promise<any> {
    const safeId = encodeURIComponent(imageNameOrId.trim());
    const safeRepo = encodeURIComponent(repo.trim());
    const safeTag = encodeURIComponent(tag.trim());
    return this.request(`/images/${safeId}/tag?repo=${safeRepo}&tag=${safeTag}`, 'POST');
  }
}
