import test from 'node:test';
import assert from 'node:assert/strict';
import { authenticator } from 'otplib';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';
import { EncryptionService } from '../core/encryption.service.js';

test('Authentication & 2FA Core Business Logic Tests', async (t) => {
  await t.test('should hash and compare passwords securely with bcrypt', async () => {
    const password = 'SuperSecurePassword2026!';
    const hash = await bcrypt.hash(password, 10);

    assert.notEqual(hash, password);
    assert.equal(await bcrypt.compare(password, hash), true);
    assert.equal(await bcrypt.compare('WrongPassword', hash), false);
  });

  await t.test('should generate, verify, and reject TOTP tokens accurately', () => {
    const secret = authenticator.generateSecret();
    assert.ok(secret.length >= 16);

    const token = authenticator.generate(secret);
    const isValid = authenticator.check(token, secret);
    assert.equal(isValid, true);

    const isInvalid = authenticator.check('000000', secret);
    assert.equal(isInvalid, false);
  });

  await t.test('should handle encrypted 2FA TOTP secrets correctly via EncryptionService', () => {
    const secret = authenticator.generateSecret();
    const encryptedSecret = EncryptionService.encrypt(secret);

    // Verify format iv:authTag:ciphertext
    assert.equal(encryptedSecret.split(':').length, 3);

    // Decrypt and verify
    const decryptedSecret = EncryptionService.decrypt(encryptedSecret);
    assert.equal(decryptedSecret, secret);

    // Generate TOTP using decrypted secret
    const token = authenticator.generate(decryptedSecret);
    assert.equal(authenticator.check(token, decryptedSecret), true);
  });

  await t.test('should sign and verify valid JWT session tokens', () => {
    const payload = { userId: 'user-uuid-123', email: 'admin@fleetupdate.local', role: 'ADMIN' };
    const token = jwt.sign(payload, config.jwtSecret, { expiresIn: '1h' });

    assert.ok(typeof token === 'string');
    const decoded = jwt.verify(token, config.jwtSecret) as any;
    assert.equal(decoded.userId, payload.userId);
    assert.equal(decoded.email, payload.email);
    assert.equal(decoded.role, payload.role);
  });

  await t.test('should reject invalid or expired JWT signatures', () => {
    const payload = { userId: 'user-uuid-123', email: 'admin@fleetupdate.local', role: 'ADMIN' };
    const token = jwt.sign(payload, 'wrong-secret-key-12345', { expiresIn: '1h' });

    assert.throws(() => {
      jwt.verify(token, config.jwtSecret);
    });
  });
});
