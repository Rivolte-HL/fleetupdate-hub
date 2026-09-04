import { HostType } from '@prisma/client';

export interface FormFieldDefinition {
  name: string;
  label: string;
  type: 'text' | 'password' | 'number' | 'textarea' | 'select' | 'boolean';
  required: boolean;
  defaultValue?: any;
  placeholder?: string;
  description?: string;
  options?: Array<{ label: string; value: string | number }>;
  isSecret?: boolean;
}

export interface AdapterMetadata {
  type: HostType;
  displayName: string;
  description: string;
  icon: string;
  supportedActions: Array<'checkVersion' | 'fetchChangelog' | 'createBackup' | 'applyUpdate' | 'healthCheck' | 'rollback'>;
  connectionFields: FormFieldDefinition[];
  credentialFields: FormFieldDefinition[];
}

export interface VersionInfo {
  currentVersion: string;
  targetVersion: string;
  hasUpdate: boolean;
  requiresReboot: boolean;
  packageCount?: number;
  downloadSizeBytes?: number;
  extraDetails?: Record<string, any>;
}

export interface ChangelogItem {
  version: string;
  releaseDate?: string;
  summary: string;
  detailsUrl?: string;
  isSecurityFix?: boolean;
  rawMarkdown?: string;
}

export interface BackupResult {
  success: boolean;
  backupId: string;
  backupType: string;
  sizeBytes?: number;
  metadata?: Record<string, any>;
  message: string;
}

export interface UpdateExecutionResult {
  success: boolean;
  newVersion?: string;
  logs: string[];
  requiresReboot: boolean;
  message: string;
}

export interface HealthCheckResult {
  isHealthy: boolean;
  statusCode?: number;
  responseTimeMs?: number;
  checks: Array<{
    name: string;
    passed: boolean;
    details?: string;
  }>;
  message: string;
}

export interface RollbackResult {
  success: boolean;
  restoredVersion?: string;
  logs: string[];
  message: string;
}

export interface TargetCredentials {
  [key: string]: any;
}
