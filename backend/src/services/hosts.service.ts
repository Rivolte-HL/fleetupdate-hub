import { Host, HostType } from '@prisma/client';
import { prisma } from '../core/prisma.client.js';
import { ServiceRegistry } from '../core/service.registry.js';
import { EncryptionService } from '../core/encryption.service.js';
import { VersionInfo, ChangelogItem } from '../types/adapter.types.js';

export interface CreateHostInput {
  name: string;
  description?: string;
  adapterType: HostType;
  endpointUrl: string;
  port?: number;
  metadata?: Record<string, any>;
  credentials?: Record<string, any>;
}

export interface UpdateHostInput {
  name?: string;
  description?: string;
  endpointUrl?: string;
  port?: number;
  metadata?: Record<string, any>;
  credentials?: Record<string, any>;
}

export class HostsService {
  public static async listHosts(): Promise<Host[]> {
    return prisma.host.findMany({
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
  }

  public static async getHostById(id: string) {
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

    if (!host) return null;

    return {
      ...host,
      backupRecords: host.backupRecords.map((b) => ({
        ...b,
        sizeBytes: b.sizeBytes ? b.sizeBytes.toString() : '0'
      }))
    };
  }

  public static async createHost(input: CreateHostInput): Promise<Host> {
    const host = await prisma.host.create({
      data: {
        name: input.name,
        description: input.description,
        adapterType: input.adapterType,
        endpointUrl: input.endpointUrl,
        port: input.port,
        metadata: input.metadata || {},
        isOnline: true
      }
    });

    if (input.credentials && Object.keys(input.credentials).length > 0) {
      const encryptedPayload = EncryptionService.encryptObject(input.credentials);
      await prisma.credential.create({
        data: {
          hostId: host.id,
          encryptedPayload,
          authType: input.credentials.authType || 'API_SECRET',
          keyFingerprint: input.credentials.tokenId || input.credentials.apiKey || input.credentials.username || 'Vault Secret'
        }
      });
    }

    return host;
  }

  public static async updateHost(id: string, input: UpdateHostInput): Promise<Host> {
    const host = await prisma.host.update({
      where: { id },
      data: {
        name: input.name,
        description: input.description,
        endpointUrl: input.endpointUrl,
        port: input.port,
        metadata: input.metadata || {}
      }
    });

    if (input.credentials && Object.keys(input.credentials).length > 0) {
      const encryptedPayload = EncryptionService.encryptObject(input.credentials);
      await prisma.credential.upsert({
        where: { hostId: host.id },
        create: {
          hostId: host.id,
          encryptedPayload,
          authType: input.credentials.authType || 'API_SECRET',
          keyFingerprint: input.credentials.tokenId || input.credentials.apiKey || input.credentials.username || 'Vault Secret'
        },
        update: {
          encryptedPayload,
          authType: input.credentials.authType || 'API_SECRET',
          keyFingerprint: input.credentials.tokenId || input.credentials.apiKey || input.credentials.username || 'Vault Secret'
        }
      });
    }

    return host;
  }

  public static async deleteHost(id: string): Promise<Host> {
    return prisma.host.delete({ where: { id } });
  }

  public static async refreshHostVersion(id: string): Promise<{ host: Host; versionInfo: VersionInfo }> {
    const host = await prisma.host.findUnique({
      where: { id },
      include: { credential: true }
    });

    if (!host) {
      throw new Error('HOST_NOT_FOUND');
    }

    const credentials = EncryptionService.resolveCredentials(host.credential);
    const adapter = ServiceRegistry.getInstance().getAdapter(host.adapterType);
    const verInfo = await adapter.checkVersion(host, credentials);

    const updated = await prisma.host.update({
      where: { id: host.id },
      data: {
        currentVersion: verInfo.currentVersion,
        targetVersion: verInfo.targetVersion,
        availableUpdatesCount: verInfo.packageCount || 0,
        requiresReboot: verInfo.requiresReboot,
        metadata: verInfo.extraDetails
          ? { ...((host.metadata as any) || {}), ...verInfo.extraDetails }
          : host.metadata,
        lastCheckAt: new Date(),
        isOnline: true
      }
    });

    return { host: updated, versionInfo: verInfo };
  }

  public static async fetchHostChangelog(id: string): Promise<ChangelogItem[]> {
    const host = await prisma.host.findUnique({
      where: { id },
      include: { credential: true }
    });

    if (!host) {
      throw new Error('HOST_NOT_FOUND');
    }

    const credentials = EncryptionService.resolveCredentials(host.credential);
    const adapter = ServiceRegistry.getInstance().getAdapter(host.adapterType);
    return adapter.fetchChangelog(host, credentials);
  }

  public static async rebootHost(id: string, requestedByEmail?: string): Promise<{ success: boolean; message: string }> {
    const host = await prisma.host.findUnique({
      where: { id },
      include: { credential: true }
    });

    if (!host) {
      throw new Error('HOST_NOT_FOUND');
    }

    // Strict Security Guard: Proxmox VE hypervisors cannot be rebooted remotely
    if (host.adapterType === HostType.PROXMOX) {
      throw new Error('PROXMOX_REBOOT_FORBIDDEN: Proxmox VE hypervisors cannot be rebooted remotely to avoid self-hosting outages and comply with least-privilege token policies.');
    }

    if (host.adapterType === HostType.DOCKER) {
      throw new Error('DOCKER_REBOOT_UNSUPPORTED: Docker daemon adapter manages containers, not host reboot.');
    }

    const adapter = ServiceRegistry.getInstance().getAdapter(host.adapterType);
    if (typeof adapter.reboot !== 'function') {
      throw new Error(`REBOOT_NOT_SUPPORTED: The adapter "${host.adapterType}" does not support remote reboot.`);
    }

    const credentials = EncryptionService.resolveCredentials(host.credential);
    const result = await adapter.reboot(host, credentials);

    // Create audit log for security accountability
    await prisma.auditLog.create({
      data: {
        action: 'HOST_REBOOT',
        resourceType: 'HOST',
        resourceId: host.id,
        userEmail: requestedByEmail || 'system',
        details: {
          hostName: host.name,
          adapterType: host.adapterType,
          resultMessage: result.message
        },
        ipAddress: '127.0.0.1'
      }
    }).catch(() => {});

    return result;
  }
}
