import { prisma } from './prisma.client.js';
import { ServiceRegistry } from './service.registry.js';
import { EncryptionService } from './encryption.service.js';
import { broadcastPipelineUpdate } from '../server.js';

export interface CheckAllSummary {
  total: number;
  successCount: number;
  errorCount: number;
  updatesFound: number;
  results: Array<{
    id: string;
    name: string;
    success: boolean;
    hasUpdate?: boolean;
    packageCount?: number;
    error?: string;
  }>;
}

export class SchedulerService {
  private static instance: SchedulerService;
  private timer: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;
  private readonly INTERVAL_MS = 60 * 60 * 1000; // 1 hour (3600000 ms)

  public static getInstance(): SchedulerService {
    if (!SchedulerService.instance) {
      SchedulerService.instance = new SchedulerService();
    }
    return SchedulerService.instance;
  }

  public start(): void {
    if (this.timer) return;

    console.log(`[SchedulerService] 🕒 Automatic Hourly Infrastructure Check Service started (every 60 minutes).`);

    // Schedule hourly recurring check
    this.timer = setInterval(async () => {
      console.log(`[SchedulerService] 🔄 Triggering scheduled hourly check of all infrastructure services...`);
      try {
        await this.checkAllHosts();
      } catch (err: any) {
        console.error(`[SchedulerService] Error in scheduled hourly check:`, err.message);
      }
    }, this.INTERVAL_MS);
  }

  public stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      console.log(`[SchedulerService] ⏹️ Scheduler stopped.`);
    }
  }

  public async checkAllHosts(): Promise<CheckAllSummary> {
    if (this.isRunning) {
      console.log(`[SchedulerService] Check already in progress, skipping overlapping execution.`);
      return { total: 0, successCount: 0, errorCount: 0, updatesFound: 0, results: [] };
    }

    this.isRunning = true;
    const startTime = Date.now();

    try {
      const hosts = await prisma.host.findMany({
        include: { credential: true }
      });

      const summary: CheckAllSummary = {
        total: hosts.length,
        successCount: 0,
        errorCount: 0,
        updatesFound: 0,
        results: []
      };

      console.log(`[SchedulerService] Checking ${hosts.length} infrastructure host(s)...`);

      // Vérifier les hôtes par lots contrôlés (batch size = 5) pour préserver les sockets et la bande passante
      const BATCH_SIZE = 5;
      for (let i = 0; i < hosts.length; i += BATCH_SIZE) {
        const batch = hosts.slice(i, i + BATCH_SIZE);
        const batchPromises = batch.map(async (host) => {
          try {
            const credentials = host.credential
              ? EncryptionService.decryptObject(host.credential.encryptedPayload)
              : {};
            const adapter = ServiceRegistry.getInstance().getAdapter(host.adapterType);
            const verInfo = await adapter.checkVersion(host, credentials);

            const pkgCount = verInfo.packageCount || 0;
            if (verInfo.hasUpdate || pkgCount > 0) {
              summary.updatesFound += pkgCount || 1;
            }

            await prisma.host.update({
              where: { id: host.id },
              data: {
                currentVersion: verInfo.currentVersion,
                targetVersion: verInfo.targetVersion,
                availableUpdatesCount: pkgCount,
                requiresReboot: verInfo.requiresReboot,
                lastCheckAt: new Date(),
                isOnline: true
              }
            });

            summary.successCount++;
            summary.results.push({
              id: host.id,
              name: host.name,
              success: true,
              hasUpdate: verInfo.hasUpdate,
              packageCount: pkgCount
            });
          } catch (err: any) {
            summary.errorCount++;
            await prisma.host.update({
              where: { id: host.id },
              data: { isOnline: false, lastCheckAt: new Date() }
            }).catch(() => {});

            summary.results.push({
              id: host.id,
              name: host.name,
              success: false,
              error: err.message
            });
          }
        });

        await Promise.allSettled(batchPromises);
      }

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(
        `[SchedulerService] ✅ Completed check of ${summary.total} hosts in ${elapsed}s. ` +
        `${summary.successCount} online, ${summary.errorCount} unreachable, ${summary.updatesFound} pending update(s).`
      );

      // Broadcast live event stream to update all connected dashboards in real time
      try {
        broadcastPipelineUpdate({
          type: 'HOSTS_REFRESHED',
          timestamp: new Date().toISOString(),
          summary: {
            total: summary.total,
            online: summary.successCount,
            updatesFound: summary.updatesFound
          }
        });
      } catch (e) {}

      return summary;
    } finally {
      this.isRunning = false;
    }
  }
}
