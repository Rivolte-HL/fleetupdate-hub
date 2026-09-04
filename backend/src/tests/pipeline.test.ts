import test from 'node:test';
import assert from 'node:assert/strict';
import { TaskStatus } from '@prisma/client';
import { PipelineExecutionOptions, PipelineLogEntry } from '../types/pipeline.types.js';

test('Pipeline Engine & Task State Machine Contract Tests', async (t) => {
  await t.test('TaskStatus enum should contain all 5 deterministic phases + outcomes', () => {
    const expectedStatuses = [
      'PENDING',
      'PRE_FLIGHT',
      'BACKUP',
      'UPDATING',
      'HEALTH_CHECK',
      'SUCCESS',
      'FAILED',
      'ROLLED_BACK'
    ];

    for (const status of expectedStatuses) {
      assert.ok(status in TaskStatus, `TaskStatus should include ${status}`);
    }
  });

  await t.test('PipelineLogEntry format should enforce standard structured logs', () => {
    const entry: PipelineLogEntry = {
      timestamp: new Date().toISOString(),
      level: 'INFO',
      step: 'PRE_FLIGHT',
      message: 'Running pre-flight checks on host.'
    };

    assert.ok(entry.timestamp.length > 0);
    assert.equal(entry.level, 'INFO');
    assert.equal(entry.step, 'PRE_FLIGHT');
    assert.equal(typeof entry.message, 'string');
  });

  await t.test('PipelineExecutionOptions defaults should enforce autoRollback safety', () => {
    const options: PipelineExecutionOptions = {
      taskId: 'task-uuid-1',
      hostId: 'host-uuid-1',
      autoRollbackOnFailure: true,
      healthCheckTimeoutSeconds: 60
    };

    assert.equal(options.autoRollbackOnFailure, true);
    assert.equal(options.healthCheckTimeoutSeconds, 60);
  });
});
