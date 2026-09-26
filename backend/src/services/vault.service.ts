import { prisma } from '../core/prisma.client.js';
import { EncryptionService } from '../core/encryption.service.js';

export interface RotateSecretInput {
  hostId: string;
  credentials: Record<string, any>;
}

export class VaultService {
  public static async listVaultEntries() {
    return prisma.credential.findMany({
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
  }

  public static async rotateHostSecret(input: RotateSecretInput) {
    const { hostId, credentials } = input;
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

    return updated;
  }
}
