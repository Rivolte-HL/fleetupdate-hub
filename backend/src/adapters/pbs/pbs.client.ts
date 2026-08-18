import http from "http";
import https from "https";
import { URL } from "url";

export interface PbsConfig {
  baseUrl: string;
  tokenId: string;
  tokenSecret: string;
  node?: string;
  allowSelfSigned?: boolean;
  timeoutMs?: number;
}

export class PbsClient {
  private config: PbsConfig;

  constructor(config: PbsConfig) {
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

    // PBS API Token format: Authorization: PBSAPIToken=USER@REALM!TOKENID:SECRET or PBSAPIToken=TOKENID=SECRET
    let authHeader = `PBSAPIToken=${this.config.tokenId}:${this.config.tokenSecret}`;
    if (this.config.tokenId && this.config.tokenId.includes("=") && !this.config.tokenSecret) {
      authHeader = `PBSAPIToken=${this.config.tokenId}`;
    }

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
    // If raw URL did not specify a port and host is an IP or localhost, default to 8007 for PBS
    if (!parsed.port && (parsed.hostname.match(/^(\d{1,3}\.){3}\d{1,3}$/) || parsed.hostname === 'localhost')) {
      targetPort = 8007;
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
              reject(new Error(`Réponse PBS JSON invalide: ${err.message}`));
            }
          } else {
            reject(new Error(`Proxmox Backup Server API HTTP ${res.statusCode} (${res.statusMessage || "Erreur"}): ${rawData.slice(0, 300)}`));
          }
        });
      });

      req.on("timeout", () => {
        req.destroy();
        reject(new Error(`Délai d'attente dépassé (Timeout ${options.timeout}ms) sur PBS ${parsed.hostname}:${options.port}`));
      });

      req.on("error", (err: any) => {
        reject(new Error(`Connexion impossible à Proxmox Backup Server (${parsed.hostname}:${options.port}): ${err.message}`));
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

  public async getNodeStatus(node: string = "localhost"): Promise<any> {
    const safeNode = encodeURIComponent(node.trim());
    return this.request(`/nodes/${safeNode}/status`);
  }

  public async getDatastores(): Promise<any[]> {
    try {
      const res = await this.request("/admin/datastore", "GET");
      return Array.isArray(res) ? res : [];
    } catch {
      return [];
    }
  }

  public async getUpdates(node: string = "localhost"): Promise<any[]> {
    const safeNode = encodeURIComponent(node.trim());
    try {
      const res = await this.request(`/nodes/${safeNode}/apt/update`, "GET");
      return Array.isArray(res) ? res : [];
    } catch {
      return [];
    }
  }

  public async getAptVersions(node: string = "localhost"): Promise<any[]> {
    const safeNode = encodeURIComponent(node.trim());
    try {
      const res = await this.request(`/nodes/${safeNode}/apt/versions`, "GET");
      return Array.isArray(res) ? res : [];
    } catch {
      return [];
    }
  }

  public async triggerAptUpdate(node: string = "localhost"): Promise<string> {
    const safeNode = encodeURIComponent(node.trim());
    return this.request(`/nodes/${safeNode}/apt/update`, "POST");
  }

  public async getTaskStatus(upid: string, node: string = "localhost"): Promise<any> {
    const safeNode = encodeURIComponent(node.trim());
    const safeUpid = encodeURIComponent(upid.trim());
    return this.request(`/nodes/${safeNode}/tasks/${safeUpid}/status`, "GET");
  }

  public async waitForTask(upid: string, node: string = "localhost", timeoutMs: number = 60000): Promise<boolean> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try {
        const task = await this.getTaskStatus(upid, node);
        if (task && task.status === "stopped") {
          return task.exitstatus === "OK" || task.exitstatus === 0;
        }
      } catch {
        // retry
      }
      await new Promise(r => setTimeout(r, 2000));
    }
    return false;
  }
}
