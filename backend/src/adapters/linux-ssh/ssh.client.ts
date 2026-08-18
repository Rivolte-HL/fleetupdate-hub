import { Client as SSH2Client } from 'ssh2';

export interface SshClientConfig {
  host: string;
  port?: number;
  username: string;
  privateKey?: string;
  passphrase?: string;
  password?: string;
  timeoutMs?: number;
}

export class SshClient {
  private config: SshClientConfig;

  constructor(config: SshClientConfig) {
    this.config = {
      port: 22,
      timeoutMs: 15000,
      ...config
    };
  }

  public async executeCommand(
    command: string,
    executionTimeoutMs: number = 300000 // 5 minutes max par commande par défaut
  ): Promise<{ stdout: string; stderr: string; code: number }> {
    return new Promise((resolve, reject) => {
      const conn = new SSH2Client();
      let isResolved = false;

      const timer = setTimeout(() => {
        if (!isResolved) {
          isResolved = true;
          try {
            conn.destroy();
          } catch {}
          reject(new Error(`[SSH Timeout] La commande a dépassé le délai limite de ${executionTimeoutMs / 1000}s : ${command.slice(0, 80)}...`));
        }
      }, executionTimeoutMs);

      conn.on('ready', () => {
        conn.exec(command, (err, stream) => {
          if (err) {
            clearTimeout(timer);
            if (!isResolved) {
              isResolved = true;
              try { conn.end(); } catch {}
              return reject(err);
            }
            return;
          }

          let stdout = '';
          let stderr = '';

          stream.on('close', (code: number) => {
            clearTimeout(timer);
            if (isResolved) return;
            isResolved = true;
            try { conn.end(); } catch {}
            resolve({ stdout, stderr, code: code ?? 0 });
          });

          stream.on('data', (data: Buffer) => {
            stdout += data.toString('utf8');
          });

          stream.stderr.on('data', (data: Buffer) => {
            stderr += data.toString('utf8');
          });

          stream.on('error', (streamErr: any) => {
            clearTimeout(timer);
            if (isResolved) return;
            isResolved = true;
            try { conn.destroy(); } catch {}
            reject(new Error(`[SSH Stream Error] ${streamErr.message}`));
          });
        });
      });

      conn.on('error', (err) => {
        clearTimeout(timer);
        if (isResolved) return;
        isResolved = true;
        try { conn.destroy(); } catch {}
        reject(new Error(`[SSH Connection Error] ${err.message}`));
      });

      try {
        conn.connect({
          host: this.config.host,
          port: this.config.port,
          username: this.config.username,
          privateKey: this.config.privateKey,
          passphrase: this.config.passphrase,
          password: this.config.password,
          readyTimeout: this.config.timeoutMs
        });
      } catch (err: any) {
        clearTimeout(timer);
        if (!isResolved) {
          isResolved = true;
          reject(err);
        }
      }
    });
  }
}
