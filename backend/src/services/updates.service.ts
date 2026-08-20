import { TaskStatus, UpdateTask } from '@prisma/client';
import { prisma } from '../core/prisma.client.js';
import { PipelineEngine } from '../core/pipeline.engine.js';
import { ServiceRegistry } from '../core/service.registry.js';
import { EncryptionService } from '../core/encryption.service.js';
import { broadcastPipelineUpdate } from '../server.js';
import { RollbackResult } from '../types/adapter.types.js';
import { Logger } from '../core/logger.js';

const logger = new Logger('UpdatesService');

export interface TriggerUpdateOptions {
  hostId: string;
  triggeredByUserId?: string;
  triggeredByEmail?: string;
  autoRollback?: boolean;
}

export interface ManualRollbackOptions {
  hostId: string;
  backupRecordId: string;
}

export class UpdatesService {
  public static async listTasks(hostId?: string, limit = 20) {
    const tasks = await prisma.updateTask.findMany({
      where: hostId ? { hostId } : undefined,
      orderBy: { startedAt: 'desc' },
      take: limit,
      include: {
        host: {
          select: { id: true, name: true, adapterType: true, endpointUrl: true }
        },
        triggeredBy: {
          select: { id: true, name: true, email: true }
        },
        backupRecords: true
      }
    });

    return tasks.map((t) => ({
      ...t,
      backupRecords: t.backupRecords.map((b) => ({
        ...b,
        sizeBytes: b.sizeBytes ? b.sizeBytes.toString() : '0'
      }))
    }));
  }

  public static async getTaskById(id: string) {
    const task = await prisma.updateTask.findUnique({
      where: { id },
      include: {
        host: true,
        triggeredBy: { select: { id: true, name: true, email: true } },
        backupRecords: true
      }
    });

    if (!task) return null;

    return {
      ...task,
      backupRecords: task.backupRecords.map((b) => ({
        ...b,
        sizeBytes: b.sizeBytes ? b.sizeBytes.toString() : '0'
      }))
    };
  }

  public static async triggerUpdate(options: TriggerUpdateOptions) {
    const { hostId, triggeredByUserId, triggeredByEmail, autoRollback = true } = options;

    const result = await prisma.$transaction(async (tx) => {
      const host = await tx.host.findUnique({ where: { id: hostId } });
      if (!host) {
        throw new Error('HOST_NOT_FOUND');
      }

      const running = await tx.updateTask.findFirst({
        where: {
          hostId,
          status: {
            in: [
              TaskStatus.PENDING,
              TaskStatus.PRE_FLIGHT,
              TaskStatus.BACKUP,
              TaskStatus.UPDATING,
              TaskStatus.HEALTH_CHECK
            ]
          }
        }
      });

      if (running) {
        throw new Error('TASK_ALREADY_RUNNING');
      }

      const newTask = await tx.updateTask.create({
        data: {
          hostId: host.id,
          status: TaskStatus.PENDING,
          currentStep: 'INITIALIZING',
          previousVersion: host.currentVersion,
          targetVersion: host.targetVersion,
          triggeredById: triggeredByUserId,
          logs: [
            {
              timestamp: new Date().toISOString(),
              level: 'INFO',
              step: 'INITIALIZING',
              message: `Mise à jour demandée par ${triggeredByEmail || 'Admin'}`
            }
          ]
        }
      });

      return { host, task: newTask };
    });

    const { host, task } = result;

    // Launch pipeline in background with live websocket streaming
    PipelineEngine.runTask(
      {
        taskId: task.id,
        hostId: host.id,
        triggeredByUserId,
        autoRollbackOnFailure: autoRollback
      },
      (step, log) => {
        broadcastPipelineUpdate({
          type: 'PIPELINE_UPDATE',
          payload: {
            taskId: task.id,
            hostId: host.id,
            step,
            log
          }
        });
      }
    ).catch((err) => {
      logger.error(`Pipeline Error for task ${task.id}`, { taskId: task.id, hostId: host.id, error: err.message });
    });

    return { host, task };
  }

  public static async manualRollback(options: ManualRollbackOptions): Promise<{ host: any; backup: any; rollbackResult: RollbackResult }> {
    const { hostId, backupRecordId } = options;

    const host = await prisma.host.findUnique({
      where: { id: hostId },
      include: { credential: true }
    });

    const backup = await prisma.backupRecord.findUnique({
      where: { id: backupRecordId }
    });

    if (!host || !backup) {
      throw new Error('HOST_OR_BACKUP_NOT_FOUND');
    }

    const credentials = EncryptionService.resolveCredentials(host.credential);
    const adapter = ServiceRegistry.getInstance().getAdapter(host.adapterType);

    const rollbackResult = await adapter.rollback(
      host,
      credentials,
      backup.snapshotIdentifier,
      (step, msg) => {
        logger.info(`[Manual Rollback - ${host.name}] [${step}]: ${msg}`, { hostId: host.id, step });
      }
    );

    return { host, backup, rollbackResult };
  }
}
