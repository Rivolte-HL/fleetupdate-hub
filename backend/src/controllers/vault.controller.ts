import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../middlewares/auth.middleware.js';
import { VaultService } from '../services/vault.service.js';
import { logAuditEvent } from '../middlewares/audit.middleware.js';

export class VaultController {
  public static async list(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const credentials = await VaultService.listVaultEntries();
      res.status(200).json({ credentials });
    } catch (err) {
      next(err);
    }
  }

  public static async rotateSecret(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { hostId, credentials } = req.body;

      if (!hostId || !credentials) {
        res.status(400).json({ error: 'INVALID_INPUT', message: 'hostId et credentials requis.' });
        return;
      }

      const updated = await VaultService.rotateHostSecret({ hostId, credentials });
      await logAuditEvent(req, 'CREDENTIAL_ROTATED', 'CREDENTIAL', updated.id, { hostId });

      res.status(200).json({ message: 'Identifiants chiffrés avec AES-256-GCM et renouvelés avec succès.' });
    } catch (err) {
      next(err);
    }
  }
}
