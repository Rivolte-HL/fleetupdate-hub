import { Response, NextFunction } from 'express';
import { HostType } from '@prisma/client';
import { AuthenticatedRequest } from '../middlewares/auth.middleware.js';
import { prisma } from '../core/prisma.client.js';
import { ServiceRegistry } from '../core/service.registry.js';
import { EncryptionService } from '../core/encryption.service.js';
import { logAuditEvent } from '../middlewares/audit.middleware.js';

export class HostsController {
  public static async list(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const hosts = await prisma.host.findMany({
        orderBy: { name: 'asc' },
        include: {
          credential: {
            select: {
              id: true,
              authType: true,
              keyFingerprint: true,
              updatedAt: true
            }
          },
          updateTasks: {
            orderBy: { startedAt: 'desc' },
            take: 1
          }
        }
      });

      res.status(200).json({ hosts });
    } catch (err) {
      next(err);
    }
  }

  public static async getById(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const host = await prisma.host.findUnique({
        where: { id },
        include: {
          credential: {
            select: {
              id: true,
              authType: true,
              keyFingerprint: true,
              updatedAt: true
            }
          },
          updateTasks: {
            orderBy: { startedAt: 'desc' },
            take: 5
          },
          backupRecords: {
            orderBy: { createdAt: 'desc' },
            take: 5
          }
        }
      });

      if (!host) {
        res.status(404).json({ error: 'HOST_NOT_FOUND', message: 'Hôte introuvable.' });
        return;
      }

      // Convert BigInt to string in backupRecords
      const formattedHost = {
        ...host,
        backupRecords: host.backupRecords.map(b => ({
          ...b,
          sizeBytes: b.sizeBytes ? b.sizeBytes.toString() : '0'
        }))
      };

      res.status(200).json({ host: formattedHost });
    } catch (err) {
      next(err);
    }
  }

  public static async create(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { name, description, adapterType, endpointUrl, port, metadata, credentials } = req.body;

      if (!name || !adapterType || !endpointUrl) {
        res.status(400).json({ error: 'INVALID_INPUT', message: 'Nom, type d’adaptateur et endpoint URL obligatoires.' });
        return;
      }

      const host = await prisma.host.create({
        data: {
          name,
          description,
          adapterType: adapterType as HostType,
          endpointUrl,
          port: port ? parseInt(port, 10) : undefined,
          metadata: metadata || {},
          isOnline: true
        }
      });

      // Encrypt and store credentials if provided
      if (credentials && Object.keys(credentials).length > 0) {
        const encryptedPayload = EncryptionService.encryptObject(credentials);
        await prisma.credential.create({
          data: {
            hostId: host.id,
            encryptedPayload,
            authType: credentials.authType || 'API_SECRET',
            keyFingerprint: credentials.tokenId || credentials.apiKey || credentials.username || 'Vault Secret'
          }
        });
      }

      await logAuditEvent(req, 'HOST_CREATED', 'HOST', host.id, { name: host.name, type: host.adapterType });
      res.status(201).json({ host, message: 'Hôte créé avec succès.' });
    } catch (err) {
      next(err);
    }
  }

  public static async update(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const { name, description, endpointUrl, port, metadata, credentials } = req.body;

      const host = await prisma.host.update({
        where: { id },
        data: {
          name,
          description,
          endpointUrl,
          port: port ? parseInt(port, 10) : undefined,
          metadata: metadata || {}
        }
      });

      if (credentials && Object.keys(credentials).length > 0) {
        const encryptedPayload = EncryptionService.encryptObject(credentials);
        await prisma.credential.upsert({
          where: { hostId: host.id },
          create: {
            hostId: host.id,
            encryptedPayload,
            authType: credentials.authType || 'API_SECRET',
            keyFingerprint: credentials.tokenId || credentials.apiKey || credentials.username || 'Vault Secret'
          },
          update: {
            encryptedPayload,
            authType: credentials.authType || 'API_SECRET',
            keyFingerprint: credentials.tokenId || credentials.apiKey || credentials.username || 'Vault Secret'
          }
        });
      }

      await logAuditEvent(req, 'HOST_UPDATED', 'HOST', host.id);
      res.status(200).json({ host, message: 'Hôte mis à jour avec succès.' });
    } catch (err) {
      next(err);
    }
  }

  public static async delete(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const host = await prisma.host.findUnique({ where: { id } });

      if (!host) {
        res.status(404).json({ error: 'HOST_NOT_FOUND' });
        return;
      }

      await prisma.host.delete({ where: { id } });
      await logAuditEvent(req, 'HOST_DELETED', 'HOST', id, { name: host.name });

      res.status(200).json({ message: 'Hôte supprimé avec succès.' });
    } catch (err) {
      next(err);
    }
  }

  public static async refreshVersion(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const host = await prisma.host.findUnique({
        where: { id },
        include: { credential: true }
      });

      if (!host) {
        res.status(404).json({ error: 'HOST_NOT_FOUND' });
        return;
      }

      const credentials = host.credential
        ? EncryptionService.decryptObject(host.credential.encryptedPayload)
        : {};
      const adapter = ServiceRegistry.getInstance().getAdapter(host.adapterType);

      const verInfo = await adapter.checkVersion(host, credentials);

      const updated = await prisma.host.update({
        where: { id: host.id },
        data: {
          currentVersion: verInfo.currentVersion,
          targetVersion: verInfo.targetVersion,
          availableUpdatesCount: verInfo.packageCount || 0,
          requiresReboot: verInfo.requiresReboot,
          lastCheckAt: new Date(),
          isOnline: true
        }
      });

      res.status(200).json({ host: updated, versionInfo: verInfo });
    } catch (err: any) {
      // Mark host as offline if check fails
      try {
        await prisma.host.update({
          where: { id: req.params.id },
          data: { isOnline: false, lastCheckAt: new Date() }
        });
      } catch (e) {}

      res.status(502).json({
        error: 'CHECK_VERSION_FAILED',
        message: `Échec de l'interrogation de l'hôte: ${err.message}`
      });
    }
  }

  public static async refreshAll(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { SchedulerService } = await import('../core/scheduler.service.js');
      const summary = await SchedulerService.getInstance().checkAllHosts();

      const hosts = await prisma.host.findMany({
        orderBy: { name: 'asc' },
        include: {
          credential: {
            select: {
              id: true,
              authType: true,
              keyFingerprint: true,
              updatedAt: true
            }
          },
          updateTasks: {
            orderBy: { startedAt: 'desc' },
            take: 1
          }
        }
      });

      await logAuditEvent(req, 'HOSTS_REFRESH_ALL', 'SYSTEM', 'PARC', {
        total: summary.total,
        online: summary.successCount,
        updatesFound: summary.updatesFound
      });

      res.status(200).json({
        message: `Vérification terminée : ${summary.successCount}/${summary.total} équipements joignables, ${summary.updatesFound} mise(s) à jour en attente.`,
        hosts,
        summary
      });
    } catch (err) {
      next(err);
    }
  }

  public static async getChangelog(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const host = await prisma.host.findUnique({
        where: { id },
        include: { credential: true }
      });

      if (!host) {
        res.status(404).json({ error: 'HOST_NOT_FOUND' });
        return;
      }

      const credentials = host.credential
        ? EncryptionService.decryptObject(host.credential.encryptedPayload)
        : {};
      const adapter = ServiceRegistry.getInstance().getAdapter(host.adapterType);

      const changelog = await adapter.fetchChangelog(host, credentials);
      res.status(200).json({ changelog });
    } catch (err: any) {
      res.status(500).json({ error: 'CHANGELOG_ERROR', message: err.message });
    }
  }
}
