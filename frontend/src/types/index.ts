export type UserRole = 'ADMIN' | 'OPERATOR' | 'VIEWER';

export type HostType = 'PROXMOX' | 'PROXMOX_BACKUP_SERVER' | 'OPNSENSE' | 'DOCKER' | 'LINUX_SSH' | 'HOME_ASSISTANT' | 'CUSTOM';

export type TaskStatus =
  | 'PENDING'
  | 'PRE_FLIGHT'
  | 'BACKUP'
  | 'UPDATING'
  | 'HEALTH_CHECK'
  | 'SUCCESS'
  | 'FAILED'
  | 'ROLLED_BACK';

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  twoFactorEnabled: boolean;
  createdAt: string;
}

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

export interface Host {
  id: string;
  name: string;
  description?: string;
  adapterType: HostType;
  endpointUrl: string;
  port?: number;
  isOnline: boolean;
  lastCheckAt?: string;
  requiresReboot: boolean;
  availableUpdatesCount: number;
  currentVersion?: string;
  targetVersion?: string;
  metadata?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
  credential?: {
    id: string;
    authType: string;
    keyFingerprint?: string;
    updatedAt: string;
  };
  updateTasks?: UpdateTask[];
  backupRecords?: BackupRecord[];
}

export interface PipelineLogEntry {
  timestamp: string;
  level: 'INFO' | 'WARN' | 'ERROR' | 'SUCCESS';
  step: string;
  message: string;
}

export interface UpdateTask {
  id: string;
  hostId: string;
  host?: Host;
  status: TaskStatus;
  currentStep: string;
  previousVersion?: string;
  targetVersion?: string;
  logs: PipelineLogEntry[];
  errorDetails?: string;
  triggeredBy?: {
    id: string;
    name: string;
    email: string;
  };
  startedAt: string;
  completedAt?: string;
  backupRecords?: BackupRecord[];
}

export interface BackupRecord {
  id: string;
  hostId: string;
  taskId?: string;
  snapshotIdentifier: string;
  backupType: string;
  sizeBytes?: string;
  isProtected: boolean;
  status: string;
  createdAt: string;
}

export interface ChangelogItem {
  version: string;
  releaseDate?: string;
  summary: string;
  detailsUrl?: string;
  isSecurityFix?: boolean;
}

export interface AuditLog {
  id: string;
  userId?: string;
  userEmail: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  details?: any;
  ipAddress?: string;
  createdAt: string;
}
