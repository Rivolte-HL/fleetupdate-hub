import { Response, NextFunction } from 'express';
import { TaskStatus } from '@prisma/client';
import { AuthenticatedRequest } from '../middlewares/auth.middleware.js';
import { UpdatesService } from '../services/updates.service.js';
import { PipelineEngine } from '../core/pipeline.engine.js';
import { logAuditEvent } from '../middlewares/audit.middleware.js';
import { prisma } from '../core/prisma.client.js';
import { broadcastPipelineUpdate } from '../server.js';

export class UpdatesController {
  public static async listTasks(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { hostId, limit = '20' } = req.query;
      const tasks = await UpdatesService.listTasks(
        hostId ? String(hostId) : undefined,
        parseInt(String(limit), 10)
      );
      res.status(200).json({ tasks });
    } catch (err) {
      next(err);
    }
  }

  public static async getTaskById(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const task = await UpdatesService.getTaskById(id);

      if (!task) {
        res.status(404).json({ error: 'TASK_NOT_FOUND' });
        return;
      }

      res.status(200).json({ task });
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

      const { host, task } = await UpdatesService.triggerUpdate({
        hostId,
        triggeredByUserId: req.user?.userId,
        triggeredByEmail: req.user?.email,
        autoRollback
      });

      await logAuditEvent(req, 'UPDATE_TRIGGERED', 'TASK', task.id, { hostName: host.name, hostId: host.id });

      res.status(202).json({
        task,
        message: `Mise à jour initiée pour ${host.name}. Le pipeline s'exécute en arrière-plan.`
      });
    } catch (err: any) {
      if (err.message === 'HOST_NOT_FOUND') {
        res.status(404).json({ error: 'HOST_NOT_FOUND' });
        return;
      }
      if (err.message === 'TASK_ALREADY_RUNNING') {
        res.status(409).json({ error: 'TASK_ALREADY_RUNNING', message: 'Une mise à jour est déjà en cours sur cet hôte.' });
        return;
      }
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

      const { host, backup, rollbackResult } = await UpdatesService.manualRollback({
        hostId,
        backupRecordId
      });

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
    } catch (err: any) {
      if (err.message === 'HOST_OR_BACKUP_NOT_FOUND') {
        res.status(404).json({ error: 'HOST_OR_BACKUP_NOT_FOUND', message: 'Hôte ou sauvegarde introuvable.' });
        return;
      }
      next(err);
    }
  }

  public static async triggerBatchUpdate(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { hostIds, autoRollback = true, stopOnError = true } = req.body;

      if (!Array.isArray(hostIds) || hostIds.length === 0) {
        res.status(400).json({ error: 'HOST_IDS_ARRAY_REQUIRED', message: 'Un tableau hostIds est requis.' });
        return;
      }

      const hosts = await prisma.host.findMany({
        where: { id: { in: hostIds }, isOnline: true }
      });

      if (hosts.length === 0) {
        res.status(400).json({ error: 'NO_VALID_HOSTS', message: 'Aucun hôte valide ou en ligne trouvé.' });
        return;
      }

      const createdItems: any[] = [];

      for (const host of hosts) {
        const running = await prisma.updateTask.findFirst({
          where: {
            hostId: host.id,
            status: { in: [TaskStatus.PENDING, TaskStatus.PRE_FLIGHT, TaskStatus.BACKUP, TaskStatus.UPDATING, TaskStatus.HEALTH_CHECK] }
          }
        });

        if (!running) {
          const task = await prisma.updateTask.create({
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
                  message: `Mise à jour groupée initiée par ${req.user?.email || 'Admin'}`
                }
              ]
            }
          });

          createdItems.push({ host, task });
        }
      }

      await logAuditEvent(req, 'BATCH_UPDATE_TRIGGERED', 'SYSTEM', 'batch', {
        hostsCount: createdItems.length,
        hostIds: createdItems.map(i => i.host.id)
      });

      // Orchestration séquentielle contrôlée en arrière-plan
      (async () => {
        for (const item of createdItems) {
          try {
            await PipelineEngine.runTask(
              {
                taskId: item.task.id,
                hostId: item.host.id,
                triggeredByUserId: req.user?.userId,
                autoRollbackOnFailure: autoRollback
              },
              (step, log) => {
                broadcastPipelineUpdate({
                  type: 'PIPELINE_UPDATE',
                  payload: {
                    taskId: item.task.id,
                    hostId: item.host.id,
                    step,
                    log
                  }
                });
              }
            );
          } catch (batchErr: any) {
            console.error(`[Batch Pipeline Error] Host ${item.host.name}:`, batchErr.message);
            if (stopOnError) {
              console.warn(`[Batch Pipeline] Stopping subsequent batch updates due to failure on ${item.host.name}`);
              break;
            }
          }
        }
      })();

      res.status(202).json({
        success: true,
        tasks: createdItems.map(i => i.task),
        message: `Mise à jour groupée lancée avec succès pour ${createdItems.length} hôte(s).`
      });
    } catch (err) {
      next(err);
    }
  }
}


