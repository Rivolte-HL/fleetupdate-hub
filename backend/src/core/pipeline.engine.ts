import { TaskStatus } from '@prisma/client';
import { prisma } from './prisma.client.js';
import { ServiceRegistry } from './service.registry.js';
import { EncryptionService } from './encryption.service.js';
import { NotificationService } from './notification.service.js';
import { PipelineExecutionOptions, PipelineLogEntry } from '../types/pipeline.types.js';
import { Logger } from './logger.js';

const logger = new Logger('PipelineEngine');

export class PipelineEngine {
  private static prisma = prisma;

  /**
   * Executes the full deterministic 5-step update pipeline for a given task
   */
  public static async runTask(
    options: PipelineExecutionOptions,
    onProgress?: (step: string, log: PipelineLogEntry) => void
  ): Promise<void> {
    const { taskId, hostId, autoRollbackOnFailure = true, healthCheckTimeoutSeconds = 60 } = options;
    const logs: PipelineLogEntry[] = [];

    let pendingLogTimer: NodeJS.Timeout | null = null;

    const flushLogs = async (currentStep?: string) => {
      if (pendingLogTimer) {
        clearTimeout(pendingLogTimer);
        pendingLogTimer = null;
      }
      try {
        await this.prisma.updateTask.update({
          where: { id: taskId },
          data: {
            ...(currentStep ? { currentStep } : {}),
            logs: logs as any
          }
        });
      } catch (err: any) {
        logger.warn(`Failed to persist logs chunk`, { taskId, error: err.message });
      }
    };

    const appendLog = (level: 'INFO' | 'WARN' | 'ERROR' | 'SUCCESS', step: string, message: string) => {
      const entry: PipelineLogEntry = {
        timestamp: new Date().toISOString(),
        level,
        step,
        message
      };
      logs.push(entry);

      // Diffusion WebSocket instantanée
      if (onProgress) {
        onProgress(step, entry);
      }

      // Persistance en base par lot (debounced 1000ms) pour éviter les écritures SQL excessives
      if (!pendingLogTimer) {
        pendingLogTimer = setTimeout(() => {
          pendingLogTimer = null;
          flushLogs(step).catch(() => {});
        }, 1000);
      }
    };

    let backupIdentifier = '';
    let host;

    try {
      host = await this.prisma.host.findUnique({
        where: { id: hostId },
        include: { credential: true }
      });

      if (!host) {
        throw new Error(`Host not found with ID: ${hostId}`);
      }

      // Decrypt credentials via AES-256-GCM (or empty object for proxy/unauthenticated endpoints)
      const credentials = EncryptionService.resolveCredentials(host.credential);
      const adapter = ServiceRegistry.getInstance().getAdapter(host.adapterType);

      // =========================================================================
      // STEP 1: PRE-FLIGHT CHECK
      // =========================================================================
      await this.prisma.updateTask.update({
        where: { id: taskId },
        data: { status: TaskStatus.PRE_FLIGHT }
      });
      await appendLog('INFO', 'PRE_FLIGHT', `Starting Pre-flight checks on ${host.name} (${host.endpointUrl})...`);

      const initialHealth = await adapter.healthCheck(host, credentials);
      if (!initialHealth.isHealthy) {
        throw new Error(`Pre-flight healthcheck failed before update: ${initialHealth.message}`);
      }
      await appendLog('SUCCESS', 'PRE_FLIGHT', `Pre-flight checks passed. Host is reachable and healthy.`);

      // =========================================================================
      // STEP 2: BACKUP / SNAPSHOT CREATION
      // =========================================================================
      await this.prisma.updateTask.update({
        where: { id: taskId },
        data: { status: TaskStatus.BACKUP }
      });
      await appendLog('INFO', 'BACKUP', `Initiating pre-update safety snapshot / backup...`);

      const backupResult = await adapter.createBackup(host, credentials, `pre-update-${taskId.substring(0, 8)}`);
      if (!backupResult.success || !backupResult.backupId) {
        throw new Error(`Failed to create preliminary safety backup: ${backupResult.message}`);
      }

      backupIdentifier = backupResult.backupId;
      await appendLog('SUCCESS', 'BACKUP', `Backup created successfully. Identifier: ${backupIdentifier} (${backupResult.backupType})`);

      // Store backup record in DB
      await this.prisma.backupRecord.create({
        data: {
          hostId: host.id,
          taskId: taskId,
          snapshotIdentifier: backupIdentifier,
          backupType: backupResult.backupType,
          sizeBytes: BigInt(backupResult.sizeBytes || 0),
          isProtected: true,
          status: 'READY'
        }
      });

      // =========================================================================
      // STEP 3: APPLY UPDATE
      // =========================================================================
      await this.prisma.updateTask.update({
        where: { id: taskId },
        data: { status: TaskStatus.UPDATING }
      });
      await appendLog('INFO', 'UPDATING', `Applying software updates on target host...`);

      const updateResult = await adapter.applyUpdate(host, credentials, (step, msg) => {
        appendLog('INFO', step, msg);
      });

      if (!updateResult.success) {
        throw new Error(`Update execution returned failure: ${updateResult.message}`);
      }
      await appendLog('SUCCESS', 'UPDATING', `Update applied successfully. ${updateResult.message}`);

      // =========================================================================
      // STEP 4: POST-DEPLOYMENT HEALTH CHECK
      // =========================================================================
      await this.prisma.updateTask.update({
        where: { id: taskId },
        data: { status: TaskStatus.HEALTH_CHECK }
      });
      await appendLog('INFO', 'HEALTH_CHECK', `Monitoring target health for post-deployment verification (Window: ${healthCheckTimeoutSeconds}s)...`);

      let isHealthyAfterUpdate = false;
      const startTime = Date.now();
      const maxTimeMs = healthCheckTimeoutSeconds * 1000;

      while (Date.now() - startTime < maxTimeMs) {
        try {
          const postHealth = await adapter.healthCheck(host, credentials);
          if (postHealth.isHealthy) {
            isHealthyAfterUpdate = true;
            await appendLog('SUCCESS', 'HEALTH_CHECK', `Post-deployment health verification passed! All services responsive.`);
            break;
          }
        } catch (err: any) {
          // Waiting for service restart
        }
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }

      if (!isHealthyAfterUpdate) {
        throw new Error(`Host failed post-update health check within the ${healthCheckTimeoutSeconds}s observation window.`);
      }

      // =========================================================================
      // STEP 5: SUCCESS & TASK COMPLETION
      // =========================================================================
      await this.prisma.updateTask.update({
        where: { id: taskId },
        data: {
          status: TaskStatus.SUCCESS,
          currentStep: 'COMPLETED',
          completedAt: new Date()
        }
      });

      // Update host state
      const refreshedVersion = await adapter.checkVersion(host, credentials);
      await this.prisma.host.update({
        where: { id: host.id },
        data: {
          currentVersion: refreshedVersion.currentVersion,
          targetVersion: refreshedVersion.targetVersion,
          availableUpdatesCount: refreshedVersion.packageCount || 0,
          requiresReboot: updateResult.requiresReboot || refreshedVersion.requiresReboot,
          lastCheckAt: new Date(),
          isOnline: true
        }
      });

      await appendLog('SUCCESS', 'COMPLETED', `Update pipeline completed successfully for host: ${host.name}`);
      await flushLogs('COMPLETED');

      await NotificationService.sendAlert({
        title: 'Mise à jour réussie',
        hostName: host.name,
        status: 'SUCCESS',
        details: `La mise à jour de ${host.name} s'est terminée avec succès.`,
        previousVersion: host.currentVersion || undefined,
        targetVersion: refreshedVersion.currentVersion
      });

    } catch (err: any) {
      const errorMessage = err.message || 'Unknown pipeline execution error';
      await appendLog('ERROR', 'FAILED', `Pipeline failed: ${errorMessage}`);

      // Check if automatic rollback is required and backup exists
      if (autoRollbackOnFailure && backupIdentifier && host) {
        await appendLog('WARN', 'ROLLBACK', `Triggering AUTOMATIC ROLLBACK using backup ${backupIdentifier}...`);
        try {
          const credentials = EncryptionService.resolveCredentials(host.credential);
          const adapter = ServiceRegistry.getInstance().getAdapter(host.adapterType);

          const rollbackResult = await adapter.rollback(host, credentials, backupIdentifier, (step, msg) => {
            appendLog('WARN', step, msg);
          });

          if (rollbackResult.success) {
            await appendLog('SUCCESS', 'ROLLBACK', `Automatic rollback completed successfully. System restored.`);
            await flushLogs('ROLLBACK');
            await this.prisma.updateTask.update({
              where: { id: taskId },
              data: {
                status: TaskStatus.ROLLED_BACK,
                errorDetails: errorMessage,
                completedAt: new Date()
              }
            });

            await NotificationService.sendAlert({
              title: 'Échec de mise à jour - Rollback Effectué',
              hostName: host.name,
              status: 'ROLLED_BACK',
              details: `Une erreur est survenue lors de la mise à jour (${errorMessage}). Le système a été restauré automatiquement à l'état de sauvegarde ${backupIdentifier}.`
            });
            return;
          } else {
            await appendLog('ERROR', 'ROLLBACK', `Rollback attempt failed: ${rollbackResult.message}`);
          }
        } catch (rollbackErr: any) {
          await appendLog('ERROR', 'ROLLBACK', `Critical error during automatic rollback: ${rollbackErr.message}`);
        }
      }

      await flushLogs('FAILED');
      await this.prisma.updateTask.update({
        where: { id: taskId },
        data: {
          status: TaskStatus.FAILED,
          errorDetails: errorMessage,
          completedAt: new Date()
        }
      });

      if (host) {
        await NotificationService.sendAlert({
          title: 'Échec Critique de Mise à Jour',
          hostName: host.name,
          status: 'FAILED',
          details: `Échec du pipeline de mise à jour: ${errorMessage}`
        });
      }
    }
  }
}
