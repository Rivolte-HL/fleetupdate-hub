import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { TaskStatus } from '@prisma/client';
import { prisma } from '../core/prisma.client.js';
import { PipelineEngine } from '../core/pipeline.engine.js';
import { NotificationService } from '../core/notification.service.js';
import { broadcastPipelineUpdate } from '../server.js';

export class WebhookController {
  /**
   * Action callback receiver for Home Assistant, Nextcloud Talk bots, or external automations
   */
  public static async handleActionWebhook(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const cfg = NotificationService.getConfig();
      const expectedSecret = cfg.webhookSecret;

      if (!expectedSecret || expectedSecret.trim() === '') {
        res.status(403).json({
          error: 'UNCONFIGURED_WEBHOOK_SECRET',
          message: 'Webhook functionality is disabled because no webhookSecret has been configured in Settings or environment variables.'
        });
        return;
      }

      // 1. Verify Secret Token securely via Headers ONLY (X-Webhook-Secret or Authorization Bearer)
      // Query parameters (?secret=...) are intentionally rejected to prevent URL logging leaks.
      const authHeader = (req.headers['authorization'] || '') as string;
      const secretHeader = (req.headers['x-webhook-secret'] || '') as string;

      const providedToken =
        secretHeader ||
        (authHeader.startsWith('Bearer ') ? authHeader.substring(7).trim() : '');

      if (!providedToken) {
        res.status(401).json({
          error: 'UNAUTHORIZED_WEBHOOK',
          message: 'Missing webhook secret token in header (X-Webhook-Secret or Authorization Bearer).'
        });
        return;
      }

      const expectedBuf = Buffer.from(expectedSecret);
      const providedBuf = Buffer.from(providedToken);

      const isMatch =
        expectedBuf.length === providedBuf.length &&
        crypto.timingSafeEqual(expectedBuf, providedBuf);

      if (!isMatch) {
        res.status(401).json({
          error: 'UNAUTHORIZED_WEBHOOK',
          message: 'Invalid webhook secret token.'
        });
        return;
      }

      // 2. Parse Action exclusively from POST body
      const action = (req.body?.action || req.body?.event || '').toString().toUpperCase();
      const hostId = req.body?.hostId;
      const hostName = req.body?.hostName;

      console.log(`[WebhookController] Received actionable event: "${action}" (Host: ${hostId || hostName || 'ALL'})`);

      // =========================================================================
      // ACTION 1: TRIGGER_UPDATE_ALL / UPDATE_ALL
      // =========================================================================
      if (action === 'TRIGGER_UPDATE_ALL' || action === 'UPDATE_ALL' || action === 'FLEETUPDATE_TRIGGER_UPDATE_ALL') {
        const upgradableHosts = await prisma.host.findMany({
          where: {
            isOnline: true,
            availableUpdatesCount: { gt: 0 }
          }
        });

        if (upgradableHosts.length === 0) {
          res.status(200).json({
            success: true,
            action: 'UPDATE_ALL',
            message: 'All hosts are already up to date. No updates needed.',
            tasksCount: 0
          });
          return;
        }

        const createdTasks: any[] = [];

        for (const host of upgradableHosts) {
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
                logs: [
                  {
                    timestamp: new Date().toISOString(),
                    level: 'INFO',
                    step: 'INITIALIZING',
                    message: 'Update triggered via Actionable Webhook (Home Assistant / Nextcloud Talk)'
                  }
                ]
              }
            });

            createdTasks.push({ host, task });
          }
        }

        // Execute sequential update queue in background
        (async () => {
          for (const item of createdTasks) {
            try {
              await PipelineEngine.runTask(
                {
                  taskId: item.task.id,
                  hostId: item.host.id,
                  autoRollbackOnFailure: true
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
            } catch (pipelineErr: any) {
              console.error(`[Webhook Batch Error] Task ${item.task.id} failed:`, pipelineErr.message);
            }
          }
        })();

        res.status(202).json({
          success: true,
          action: 'UPDATE_ALL',
          message: `Bulk update successfully initiated for ${createdTasks.length} host(s).`,
          tasksCount: createdTasks.length
        });
        return;
      }

      // =========================================================================
      // ACTION 2: TRIGGER_HOST_UPDATE / UPDATE_HOST
      // =========================================================================
      if (action === 'TRIGGER_HOST_UPDATE' || action === 'UPDATE_HOST') {
        const cleanHostId = hostId ? String(hostId).trim() : '';
        const cleanHostName = hostName ? String(hostName).trim() : '';

        if (!cleanHostId && !cleanHostName) {
          res.status(400).json({
            error: 'MISSING_TARGET',
            message: 'hostId or hostName is required to trigger a host update.'
          });
          return;
        }

        const targetHost = await prisma.host.findFirst({
          where: cleanHostId ? { id: cleanHostId } : { name: cleanHostName }
        });

        if (!targetHost) {
          res.status(404).json({ error: 'HOST_NOT_FOUND', message: `Host not found with ID/Name: ${cleanHostId || cleanHostName}` });
          return;
        }

        const running = await prisma.updateTask.findFirst({
          where: {
            hostId: targetHost.id,
            status: { in: [TaskStatus.PENDING, TaskStatus.PRE_FLIGHT, TaskStatus.BACKUP, TaskStatus.UPDATING, TaskStatus.HEALTH_CHECK] }
          }
        });

        if (running) {
          res.status(409).json({
            error: 'TASK_ALREADY_RUNNING',
            message: `An update task is already running on host: ${targetHost.name}.`
          });
          return;
        }

        const task = await prisma.updateTask.create({
          data: {
            hostId: targetHost.id,
            status: TaskStatus.PENDING,
            currentStep: 'INITIALIZING',
            previousVersion: targetHost.currentVersion,
            targetVersion: targetHost.targetVersion,
            logs: [
              {
                timestamp: new Date().toISOString(),
                level: 'INFO',
                step: 'INITIALIZING',
                message: 'Update triggered via Actionable Webhook'
              }
            ]
          }
        });

        PipelineEngine.runTask(
          {
            taskId: task.id,
            hostId: targetHost.id,
            autoRollbackOnFailure: true
          },
          (step, log) => {
            broadcastPipelineUpdate({
              type: 'PIPELINE_UPDATE',
              payload: {
                taskId: task.id,
                hostId: targetHost.id,
                step,
                log
              }
            });
          }
        ).catch(err => {
          console.error(`[Webhook Task Error] Task ${task.id} failed:`, err);
        });

        res.status(202).json({
          success: true,
          action: 'UPDATE_HOST',
          hostName: targetHost.name,
          taskId: task.id,
          message: `Update initiated for ${targetHost.name}.`
        });
        return;
      }

      res.status(400).json({
        error: 'UNKNOWN_ACTION',
        message: `Supported actions: TRIGGER_UPDATE_ALL, TRIGGER_HOST_UPDATE`
      });
    } catch (err) {
      next(err);
    }
  }
}
