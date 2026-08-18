import { Response, NextFunction } from 'express';
import { TaskStatus } from '@prisma/client';
import { AuthenticatedRequest } from '../middlewares/auth.middleware.js';
import { PipelineEngine } from '../core/pipeline.engine.js';
import { ServiceRegistry } from '../core/service.registry.js';
import { EncryptionService } from '../core/encryption.service.js';
import { logAuditEvent } from '../middlewares/audit.middleware.js';
import { prisma } from '../core/prisma.client.js';
import { broadcastPipelineUpdate } from '../server.js';

export class UpdatesController {
  public static async listTasks(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { hostId, limit = '20' } = req.query;
      const tasks = await prisma.updateTask.findMany({
        where: hostId ? { hostId: String(hostId) } : undefined,
        orderBy: { startedAt: 'desc' },
        take: parseInt(String(limit), 10),
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

      // Format BigInt
      const formatted = tasks.map(t => ({
        ...t,
        backupRecords: t.backupRecords.map(b => ({
          ...b,
          sizeBytes: b.sizeBytes ? b.sizeBytes.toString() : '0'
        }))
      }));

      res.status(200).json({ tasks: formatted });
    } catch (err) {
      next(err);
    }
  }

  public static async getTaskById(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const task = await prisma.updateTask.findUnique({
        where: { id },
        include: {
          host: true,
          triggeredBy: { select: { id: true, name: true, email: true } },
          backupRecords: true
        }
      });

      if (!task) {
        res.status(404).json({ error: 'TASK_NOT_FOUND' });
        return;
      }

      res.status(200).json({
        task: {
          ...task,
          backupRecords: task.backupRecords.map(b => ({
            ...b,
            sizeBytes: b.sizeBytes ? b.sizeBytes.toString() : '0'
          }))
        }
      });
    } catch (err) {
      next(err);
    }
  }

  public static async triggerUpdate(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { hostId, autoRollback = true } = req.body;

      if (!hostId) {
        res.status(400).json({ error: 'HOST_ID_REQUIRED' });
        return;
      }

      // Transaction atomique pour empêcher le lancement concurrent de deux tâches sur le même hôte
      const result = await prisma.$transaction(async (tx) => {
        const host = await tx.host.findUnique({ where: { id: hostId } });
        if (!host) {
          throw new Error('HOST_NOT_FOUND');
        }

        const running = await tx.updateTask.findFirst({
          where: {
            hostId,
            status: { in: [TaskStatus.PENDING, TaskStatus.PRE_FLIGHT, TaskStatus.BACKUP, TaskStatus.UPDATING, TaskStatus.HEALTH_CHECK] }
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
            triggeredById: req.user?.userId,
            logs: [
              {
                timestamp: new Date().toISOString(),
                level: 'INFO',
                step: 'INITIALIZING',
                message: `Mise à jour demandée par ${req.user?.email || 'Admin'}`
              }
            ]
          }
        });

        return { host, task: newTask };
      });

      const { host, task } = result;

      await logAuditEvent(req, 'UPDATE_TRIGGERED', 'TASK', task.id, { hostName: host.name, hostId: host.id });

      // Run pipeline asynchronously in background with real-time WebSocket broadcast
      PipelineEngine.runTask(
        {
          taskId: task.id,
          hostId: host.id,
          triggeredByUserId: req.user?.userId,
          autoRollbackOnFailure: autoRollback
        },
        (step, log) => {
          broadcastPipelineUpdate({
            taskId: task.id,
            hostId: host.id,
            step,
            log
          });
        }
      ).catch(err => {
        console.error(`[Pipeline Error for task ${task.id}]:`, err);
      });

      res.status(202).json({
        task,
        message: `Mise à jour initiée pour ${host.name}. Le pipeline s'exécute en arrière-plan.`
      });
    } catch (err) {
      next(err);
    }
  }

  public static async manualRollback(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { hostId, backupRecordId } = req.body;

      if (!hostId || !backupRecordId) {
        res.status(400).json({ error: 'INVALID_INPUT', message: 'hostId et backupRecordId requis.' });
        return;
      }

      const host = await prisma.host.findUnique({
        where: { id: hostId },
        include: { credential: true }
      });

      const backup = await prisma.backupRecord.findUnique({
        where: { id: backupRecordId }
      });

      if (!host || !backup) {
        res.status(404).json({ error: 'HOST_OR_BACKUP_NOT_FOUND', message: 'Hôte ou sauvegarde introuvable.' });
        return;
      }

      const credentials = host.credential
        ? EncryptionService.decryptObject(host.credential.encryptedPayload)
        : {};
      const adapter = ServiceRegistry.getInstance().getAdapter(host.adapterType);

      const rollbackResult = await adapter.rollback(
        host,
        credentials,
        backup.snapshotIdentifier,
        (step, msg) => {
          console.log(`[Manual Rollback - ${host.name}] [${step}]: ${msg}`);
        }
      );

      await logAuditEvent(req, 'MANUAL_ROLLBACK_TRIGGERED', 'HOST', host.id, {
        backupId: backup.snapshotIdentifier,
        result: rollbackResult
      });

      if (!rollbackResult.success) {
        res.status(500).json({
          error: 'ROLLBACK_FAILED',
          message: rollbackResult.message || 'Échec du rollback manuel.'
        });
        return;
      }

      res.status(200).json({
        message: `Rollback manuel exécuté avec succès vers le point ${backup.snapshotIdentifier}.`,
        rollbackResult
      });
    } catch (err) {
      next(err);
    }
  }
}

