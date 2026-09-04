import test from 'node:test';
import assert from 'node:assert/strict';
import { UserRole } from '@prisma/client';
import { requireRole } from '../middlewares/rbac.middleware.js';
import { hostSchemas, authSchemas, updateSchemas } from '../middlewares/validation.middleware.js';

test('RBAC Middleware Tests', async (t) => {
  await t.test('should deny access if user is not authenticated', () => {
    const middleware = requireRole(UserRole.OPERATOR);
    let statusSent = 0;
    let nextCalled = false;

    const req: any = {};
    const res: any = {
      status: (code: number) => {
        statusSent = code;
        return {
          json: () => {}
        };
      }
    };
    const next = () => { nextCalled = true; };

    middleware(req, res, next);
    assert.equal(statusSent, 401);
    assert.equal(nextCalled, false);
  });

  await t.test('should deny access if user role is below minimum required role', () => {
    const middleware = requireRole(UserRole.ADMIN);
    let statusSent = 0;
    let nextCalled = false;

    const req: any = { user: { role: UserRole.VIEWER, userId: 'user-1', email: 'test@local' } };
    const res: any = {
      status: (code: number) => {
        statusSent = code;
        return {
          json: () => {}
        };
      }
    };
    const next = () => { nextCalled = true; };

    middleware(req, res, next);
    assert.equal(statusSent, 403);
    assert.equal(nextCalled, false);
  });

  await t.test('should grant access if user role matches or exceeds required role', () => {
    const middleware = requireRole(UserRole.OPERATOR);
    let nextCalled = false;

    const req: any = { user: { role: UserRole.ADMIN, userId: 'user-admin', email: 'admin@local' } };
    const res: any = {};
    const next = () => { nextCalled = true; };

    middleware(req, res, next);
    assert.equal(nextCalled, true);
  });
});

test('Zod Validation Schemas Tests', async (t) => {
  await t.test('hostSchemas.create should validate valid host input and reject invalid host input', () => {
    const valid = {
      name: 'Proxmox Node 01',
      adapterType: 'PROXMOX',
      endpointUrl: 'https://192.168.1.100:8006',
      port: 8006
    };
    const parsed = hostSchemas.create.parse(valid);
    assert.equal(parsed.name, 'Proxmox Node 01');

    assert.throws(() => {
      hostSchemas.create.parse({ name: '', adapterType: 'INVALID_TYPE' });
    });
  });

  await t.test('authSchemas.login should validate email and password inputs', () => {
    const valid = { email: 'admin@fleetupdate.local', password: 'ValidPassword123' };
    const parsed = authSchemas.login.parse(valid);
    assert.equal(parsed.email, 'admin@fleetupdate.local');

    assert.throws(() => {
      authSchemas.login.parse({ email: 'not-an-email', password: '' });
    });
  });

  await t.test('updateSchemas.trigger should enforce UUID format', () => {
    const validUuid = '123e4567-e89b-12d3-a456-426614174000';
    const parsed = updateSchemas.trigger.parse({ hostId: validUuid, autoRollback: true });
    assert.equal(parsed.hostId, validUuid);
    assert.equal(parsed.autoRollback, true);

    assert.throws(() => {
      updateSchemas.trigger.parse({ hostId: 'invalid-id' });
    });
  });
});
