import { Response, NextFunction } from 'express';
import { HostType } from '@prisma/client';
import { AuthenticatedRequest } from '../middlewares/auth.middleware.js';
import { HostsService } from '../services/hosts.service.js';
import { logAuditEvent } from '../middlewares/audit.middleware.js';

export class HostsController {
  public static async list(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const hosts = await HostsService.listHosts();
      res.status(200).json({ hosts });
    } catch (err) {
      next(err);
    }
  }

  public static async getById(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const host = await HostsService.getHostById(id);

      if (!host) {
        res.status(404).json({ error: 'HOST_NOT_FOUND', message: 'Hôte introuvable.' });
        return;
      }

      res.status(200).json({ host });
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

      const host = await HostsService.createHost({
        name,
        description,
        adapterType: adapterType as HostType,
        endpointUrl,
        port: port ? parseInt(port, 10) : undefined,
        metadata,
        credentials
      });

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

      const host = await HostsService.updateHost(id, {
        name,
        description,
        endpointUrl,
        port: port ? parseInt(port, 10) : undefined,
        metadata,
        credentials
      });

      await logAuditEvent(req, 'HOST_UPDATED', 'HOST', host.id);
      res.status(200).json({ host, message: 'Hôte mis à jour avec succès.' });
    } catch (err) {
      next(err);
    }
  }

  public static async delete(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const host = await HostsService.deleteHost(id);

      await logAuditEvent(req, 'HOST_DELETED', 'HOST', id, { name: host.name });
      res.status(200).json({ message: 'Hôte supprimé avec succès.' });
    } catch (err: any) {
      if (err.code === 'P2025') {
        res.status(404).json({ error: 'HOST_NOT_FOUND' });
        return;
      }
      next(err);
    }
  }

  public static async refreshVersion(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const { host, versionInfo } = await HostsService.refreshHostVersion(id);
      res.status(200).json({ host, versionInfo });
    } catch (err: any) {
      if (err.message === 'HOST_NOT_FOUND') {
        res.status(404).json({ error: 'HOST_NOT_FOUND' });
        return;
      }
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
      const hosts = await HostsService.listHosts();

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
      const changelog = await HostsService.fetchHostChangelog(id);
      res.status(200).json({ changelog });
    } catch (err: any) {
      if (err.message === 'HOST_NOT_FOUND') {
        res.status(404).json({ error: 'HOST_NOT_FOUND' });
        return;
      }
      res.status(500).json({ error: 'CHANGELOG_ERROR', message: err.message });
    }
  }
}
