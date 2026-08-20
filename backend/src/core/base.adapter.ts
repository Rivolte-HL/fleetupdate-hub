import { Host } from '@prisma/client';
import {
  AdapterMetadata,
  VersionInfo,
  ChangelogItem,
  BackupResult,
  UpdateExecutionResult,
  HealthCheckResult,
  RollbackResult,
  TargetCredentials
} from '../types/adapter.types.js';

export abstract class BaseServiceAdapter {
  /**
   * Returns metadata defining form fields, display name, icons, and capabilities
   */
  abstract getMetadata(): AdapterMetadata;

  /**
   * Interrogates the target host to determine current and available versions
   */
  abstract checkVersion(host: Host, credentials: TargetCredentials): Promise<VersionInfo>;

  /**
   * Fetches Release Notes / Changelog for available updates
   */
  abstract fetchChangelog(host: Host, credentials: TargetCredentials, targetVersion?: string): Promise<ChangelogItem[]>;

  /**
   * Executes a pre-update safety snapshot or backup (ZFS/LVM snapshot, XML config, docker image tag, etc.)
   */
  abstract createBackup(host: Host, credentials: TargetCredentials, backupName?: string): Promise<BackupResult>;

  /**
   * Performs the update execution on the target host
   */
  abstract applyUpdate(
    host: Host,
    credentials: TargetCredentials,
    onProgress?: (step: string, log: string) => void
  ): Promise<UpdateExecutionResult>;

  /**
   * Verifies that the host and its services are operational after update
   */
  abstract healthCheck(host: Host, credentials: TargetCredentials): Promise<HealthCheckResult>;

  /**
   * Restores the host or container to the previous backup/snapshot state in case of failure
   */
  abstract rollback(
    host: Host,
    credentials: TargetCredentials,
    backupIdentifier: string,
    onProgress?: (step: string, log: string) => void
  ): Promise<RollbackResult>;
}
