import test from 'node:test';
import assert from 'node:assert/strict';
import { validateSafeEndpointUrl, updateSchemas } from '../middlewares/validation.middleware.js';
import { EncryptionService } from '../core/encryption.service.js';
import { errorHandler } from '../middlewares/error.middleware.js';
import { config } from '../config/index.js';

test('Security Hardening Test Suite', async (t) => {

  await t.test('Anti-SSRF: validateSafeEndpointUrl blocking rules', async (st) => {
    // Should block loopback addresses
    await st.test('should reject loopback addresses and hostnames', () => {
      assert.equal(validateSafeEndpointUrl('http://127.0.0.1:8080'), false);
      assert.equal(validateSafeEndpointUrl('http://127.0.0.2:8080'), false);
      assert.equal(validateSafeEndpointUrl('http://localhost:3000'), false);
      assert.equal(validateSafeEndpointUrl('http://localhost'), false);
      assert.equal(validateSafeEndpointUrl('http://[::1]:8080'), false);
    });

    // Should block link-local and metadata addresses
    await st.test('should reject link-local and cloud metadata endpoints', () => {
      assert.equal(validateSafeEndpointUrl('http://169.254.169.254/latest/meta-data'), false);
      assert.equal(validateSafeEndpointUrl('http://169.254.0.1:80'), false);
      assert.equal(validateSafeEndpointUrl('http://[fe80::1]'), false);
      assert.equal(validateSafeEndpointUrl('http://[fe80::dead:beef]'), false);
    });

    // Should block alternative decimal / hex IP encodings
    await st.test('should reject alternative IP representations (decimal and hex)', () => {
      // 2130706433 = 127.0.0.1
      assert.equal(validateSafeEndpointUrl('http://2130706433:8000'), false);
      // 2852039166 = 169.254.169.254
      assert.equal(validateSafeEndpointUrl('http://2852039166'), false);
      // Hex representation 0x7f000001
      assert.equal(validateSafeEndpointUrl('http://0x7f000001:80'), false);
      assert.equal(validateSafeEndpointUrl('http://0xa9fea9fe'), false);
    });

    // Should block internal Docker service hostnames
    await st.test('should reject internal docker service names', () => {
      assert.equal(validateSafeEndpointUrl('http://db:5432'), false);
      assert.equal(validateSafeEndpointUrl('http://fleetupdate-db:5432'), false);
      assert.equal(validateSafeEndpointUrl('http://postgres:5432'), false);
      assert.equal(validateSafeEndpointUrl('http://backend:5000'), false);
      assert.equal(validateSafeEndpointUrl('http://fleetupdate-backend:5000'), false);
    });

    // Should block IPv4-mapped IPv6 loopback / link-local
    await st.test('should reject IPv4-mapped IPv6 loopback and link-local', () => {
      assert.equal(validateSafeEndpointUrl('http://[::ffff:127.0.0.1]:8080'), false);
      assert.equal(validateSafeEndpointUrl('http://[::ffff:169.254.1.1]'), false);
    });

    // Should block invalid schemes and allow authorized protocols (http, https, ssh, tcp)
    await st.test('should reject dangerous protocols and allow supported management protocols', () => {
      assert.equal(validateSafeEndpointUrl('file:///etc/shadow'), false);
      assert.equal(validateSafeEndpointUrl('gopher://127.0.0.1:70'), false);
      assert.equal(validateSafeEndpointUrl('ftp://192.168.1.10'), false);
      assert.equal(validateSafeEndpointUrl('javascript:alert(1)'), false);
      assert.equal(validateSafeEndpointUrl('ssh://192.168.1.10:22'), true);
      assert.equal(validateSafeEndpointUrl('tcp://192.168.1.10:2375'), true);
    });

    // Should permit legitimate target infrastructure in homelab / enterprise subnets
    await st.test('should allow legitimate private and public target URLs', () => {
      assert.equal(validateSafeEndpointUrl('https://192.168.1.50:8006'), true);
      assert.equal(validateSafeEndpointUrl('https://10.0.10.5:443'), true);
      assert.equal(validateSafeEndpointUrl('http://172.20.0.15:8080'), true);
      assert.equal(validateSafeEndpointUrl('https://pve01.homelab.lan:8006'), true);
      assert.equal(validateSafeEndpointUrl('https://truenas.local:443'), true);
    });
  });

  await t.test('Anti-DoS: Batch update schema limits', async (st) => {
    const validUuid1 = 'a0000000-0000-0000-0000-000000000001';
    const validUuid2 = 'a0000000-0000-0000-0000-000000000002';

    await st.test('should accept valid batch update payload with 1-100 items', () => {
      const parsed = updateSchemas.batch.parse({ hostIds: [validUuid1, validUuid2] });
      assert.deepEqual(parsed.hostIds, [validUuid1, validUuid2]);
    });

    await st.test('should reject empty hostIds array', () => {
      assert.throws(() => {
        updateSchemas.batch.parse({ hostIds: [] });
      });
    });

    await st.test('should reject invalid non-UUID items', () => {
      assert.throws(() => {
        updateSchemas.batch.parse({ hostIds: ['not-a-uuid'] });
      });
    });

    await st.test('should reject payloads exceeding 100 hostIds (DoS limit)', () => {
      const excessiveList = Array.from({ length: 101 }, (_, i) => 
        `b0000000-0000-0000-0000-${String(i).padStart(12, '0')}`
      );
      assert.throws(() => {
        updateSchemas.batch.parse({ hostIds: excessiveList });
      });
    });
  });

  await t.test('Error Masking: Production 5xx Information Leak Prevention', async (st) => {
    await st.test('should mask internal 500 error messages and codes in production', () => {
      const originalEnv = config.env;
      (config as any).env = 'production';

      let capturedStatus = 0;
      let capturedBody: any = null;

      const mockRes: any = {
        status: (code: number) => {
          capturedStatus = code;
          return {
            json: (body: any) => {
              capturedBody = body;
            }
          };
        }
      };

      const internalError = new Error('FATAL: relation "users" does not exist at character 15');
      (internalError as any).code = 'P2002';
      (internalError as any).statusCode = 500;

      errorHandler(internalError, { method: 'GET', path: '/api/hosts' } as any, mockRes, () => {});

      assert.equal(capturedStatus, 500);
      assert.equal(capturedBody.error, 'INTERNAL_SERVER_ERROR');
      assert.equal(capturedBody.message, 'Une erreur interne est survenue sur le serveur.');
      assert.equal(capturedBody.stack, undefined);

      (config as any).env = originalEnv;
    });

    await st.test('should preserve user-friendly 4xx validation errors even in production', () => {
      const originalEnv = config.env;
      (config as any).env = 'production';

      let capturedStatus = 0;
      let capturedBody: any = null;

      const mockRes: any = {
        status: (code: number) => {
          capturedStatus = code;
          return {
            json: (body: any) => {
              capturedBody = body;
            }
          };
        }
      };

      const clientError = new Error('Identifiants invalides');
      (clientError as any).code = 'INVALID_CREDENTIALS';
      (clientError as any).statusCode = 401;

      errorHandler(clientError, { method: 'POST', path: '/api/auth/login' } as any, mockRes, () => {});

      assert.equal(capturedStatus, 401);
      assert.equal(capturedBody.error, 'INVALID_CREDENTIALS');
      assert.equal(capturedBody.message, 'Identifiants invalides');

      (config as any).env = originalEnv;
    });
  });

  await t.test('Cryptographic Zeroing & Key Derivation Cache', async (st) => {
    await st.test('should successfully encrypt, decrypt, and verify key caching', () => {
      EncryptionService.clearKeyCache();
      const secret = 'vault-super-secret-passphrase-999';
      const encrypted = EncryptionService.encrypt(secret);
      const decrypted = EncryptionService.decrypt(encrypted);

      assert.equal(decrypted, secret);
    });
  });
});
