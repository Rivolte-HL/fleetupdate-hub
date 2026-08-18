import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../middlewares/auth.middleware.js';
import { EncryptionService } from '../core/encryption.service.js';
import { logAuditEvent } from '../middlewares/audit.middleware.js';
import { prisma } from '../core/prisma.client.js';

export class VaultController {
  public static async list(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const credentials = await prisma.credential.findMany({
        select: {
          id: true,
          hostId: true,
          authType: true,
          keyFingerprint: true,
          createdAt: true,
          updatedAt: true,
          host: {
            select: { id: true, name: true, adapterType: true, endpointUrl: true }
          }
        },
        orderBy: { updatedAt: 'desc' }
      });

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

      const encryptedPayload = EncryptionService.encryptObject(credentials);
      const updated = await prisma.credential.upsert({
        where: { hostId },
        create: {
          hostId,
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

      await logAuditEvent(req, 'CREDENTIAL_ROTATED', 'CREDENTIAL', updated.id, { hostId });

      res.status(200).json({ message: 'Identifiants chiffrés avec AES-256-GCM et renouvelés avec succès.' });
    } catch (err) {
      next(err);
    }
  }
}
