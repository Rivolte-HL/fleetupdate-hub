import { TaskStatus } from '@prisma/client';

export interface PipelineLogEntry {
  timestamp: string;
  level: 'INFO' | 'WARN' | 'ERROR' | 'SUCCESS';
  step: string;
  message: string;
}

export interface PipelineExecutionOptions {
  taskId: string;
  hostId: string;
  triggeredByUserId?: string;
  autoRollbackOnFailure?: boolean;
  healthCheckTimeoutSeconds?: number;
}

export interface PipelineProgressEvent {
  taskId: string;
  hostId: string;
  status: TaskStatus;
  step: string;
  progressPercent: number;
  log: PipelineLogEntry;
}
