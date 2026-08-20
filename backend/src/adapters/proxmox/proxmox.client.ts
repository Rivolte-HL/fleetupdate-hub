import http from "http";
import https from "https";
import { URL } from "url";

export interface ProxmoxConfig {
  baseUrl: string;
  tokenId: string;
  tokenSecret: string;
  node?: string;
  allowSelfSigned?: boolean;
  timeoutMs?: number;
}

export class ProxmoxClient {
  private config: ProxmoxConfig;

  constructor(config: ProxmoxConfig) {
    this.config = config;
  }

  public async request<T = any>(endpoint: string, method: "GET" | "POST" | "DELETE" = "GET", body?: any): Promise<T> {
    let cleanBase = (this.config.baseUrl || "").trim().replace(/\/+$/, "");
    if (!cleanBase.startsWith("http://") && !cleanBase.startsWith("https://")) {
      cleanBase = `https://${cleanBase}`;
    }
    const rawUrl = `${cleanBase}/api2/json${endpoint.startsWith("/") ? "" : "/"}${endpoint}`;
    const parsed = new URL(rawUrl);
    const isHttps = parsed.protocol === "https:";
    const clientModule = isHttps ? https : http;

    const authHeader = `PVEAPIToken=${this.config.tokenId}=${this.config.tokenSecret}`;
    const payload = body ? JSON.stringify(body) : undefined;

    const headers: Record<string, string> = {
      "Authorization": authHeader,
      "Accept": "application/json",
      "User-Agent": "FleetUpdate-Hub/1.0"
    };

    if (payload) {
      headers["Content-Type"] = "application/json";
      headers["Content-Length"] = Buffer.byteLength(payload).toString();
    }

    let targetPort = parsed.port ? parseInt(parsed.port, 10) : (isHttps ? 443 : 80);
    // If raw URL did not specify a port, and host is an IP or localhost, default to 8006
    if (!parsed.port && (parsed.hostname.match(/^(\d{1,3}\.){3}\d{1,3}$/) || parsed.hostname === 'localhost')) {
      targetPort = 8006;
    }

    const options: https.RequestOptions = {
      protocol: parsed.protocol,
      hostname: parsed.hostname,
      port: targetPort,
      path: `${parsed.pathname}${parsed.search}`,
      method,
      headers,
      timeout: this.config.timeoutMs || 30000,
      rejectUnauthorized: this.config.allowSelfSigned === false ? true : false
    };

    return new Promise<T>((resolve, reject) => {
      const req = clientModule.request(options, (res) => {
        let rawData = "";
        res.setEncoding("utf8");

        res.on("data", (chunk) => {
          rawData += chunk;
        });

        res.on("end", () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            try {
              const parsedJson = JSON.parse(rawData);
              resolve(parsedJson.data !== undefined ? parsedJson.data : parsedJson);
            } catch (err: any) {
              reject(new Error(`Réponse PVE JSON invalide: ${err.message}`));
            }
          } else {
            reject(new Error(`Proxmox API HTTP ${res.statusCode} (${res.statusMessage || "Erreur"}): ${rawData.slice(0, 300)}`));
          }
        });
      });

      req.on("timeout", () => {
        req.destroy();
        reject(new Error(`Délai d'attente dépassé (Timeout ${options.timeout}ms) sur ${parsed.hostname}:${options.port}`));
      });

      req.on("error", (err: any) => {
        reject(new Error(`Connexion impossible à Proxmox (${parsed.hostname}:${options.port}): ${err.message}`));
      });

      if (payload) {
        req.write(payload);
      }
      req.end();
    });
  }

  public async getVersion(): Promise<any> {
    return this.request("/version");
  }

  public async getNodes(): Promise<Array<{ node: string; status: string; ssl_fingerprint?: string }>> {
    return this.request("/nodes");
  }

  public async getNodeStatus(node: string): Promise<any> {
    const safeNode = encodeURIComponent(node.trim());
    return this.request(`/nodes/${safeNode}/status`);
  }

  public async getStorages(node: string): Promise<any[]> {
    const safeNode = encodeURIComponent(node.trim());
    return this.request(`/nodes/${safeNode}/storage`, "GET");
  }

  public async getGuests(node: string): Promise<{ qemu: any[]; lxc: any[] }> {
    const safeNode = encodeURIComponent(node.trim());
    try {
      const [qemu, lxc] = await Promise.all([
        this.request(`/nodes/${safeNode}/qemu`, "GET").catch(() => []),
        this.request(`/nodes/${safeNode}/lxc`, "GET").catch(() => [])
      ]);
      return {
        qemu: Array.isArray(qemu) ? qemu : [],
        lxc: Array.isArray(lxc) ? lxc : []
      };
    } catch {
      return { qemu: [], lxc: [] };
    }
  }

  public async getUpdates(node: string): Promise<any[]> {
    const safeNode = encodeURIComponent(node.trim());
    return this.request(`/nodes/${safeNode}/apt/update`, "GET");
  }

  public async triggerAptUpdate(node: string): Promise<string> {
    const safeNode = encodeURIComponent(node.trim());
    return this.request(`/nodes/${safeNode}/apt/update`, "POST");
  }

  public async getTaskStatus(node: string, upid: string): Promise<any> {
    const safeNode = encodeURIComponent(node.trim());
    const safeUpid = encodeURIComponent(upid.trim());
    return this.request(`/nodes/${safeNode}/tasks/${safeUpid}/status`, "GET");
  }

  public async waitForTask(node: string, upid: string, timeoutMs: number = 60000): Promise<boolean> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try {
        const task = await this.getTaskStatus(node, upid);
        if (task && task.status === "stopped") {
          return task.exitstatus === "OK" || task.exitstatus === 0;
        }
      } catch {
        // ignore retry
      }
      await new Promise(r => setTimeout(r, 2000));
    }
    return false;
  }

  public async createVmSnapshot(node: string, type: "qemu" | "lxc", vmid: string | number, snapname: string, description?: string): Promise<string> {
    const safeNode = encodeURIComponent(node.trim());
    return this.request(`/nodes/${safeNode}/${type}/${vmid}/snapshot`, "POST", {
      snapname,
      description: description || "Automatic snapshot created by FleetUpdate-Hub"
    });
  }

  public async rollbackVmSnapshot(node: string, type: "qemu" | "lxc", vmid: string | number, snapname: string): Promise<string> {
    const safeNode = encodeURIComponent(node.trim());
    return this.request(`/nodes/${safeNode}/${type}/${vmid}/snapshot/${snapname}/rollback`, "POST");
  }

  public async createVzdumpBackup(node: string, options: { vmid?: string; mode?: "stop" | "suspend" | "snapshot"; protected?: boolean; storage?: string; all?: number }): Promise<string> {
    const safeNode = encodeURIComponent(node.trim());
    const body: any = {
      mode: options.mode || "snapshot"
    };
    if (options.all !== undefined) body.all = options.all;
    if (options.vmid) body.vmid = options.vmid;
    if (options.storage) body.storage = options.storage;
    if (options.protected && options.storage) body.protected = 1;

    return this.request(`/nodes/${safeNode}/vzdump`, "POST", body);
  }
}
