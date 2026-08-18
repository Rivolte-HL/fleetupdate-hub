import test from 'node:test';
import assert from 'node:assert/strict';
import { EncryptionService } from '../core/encryption.service.js';

test('AES-256-GCM EncryptionService Tests', async (t) => {
  await t.test('should encrypt and decrypt a plaintext string correctly', () => {
    const secretText = 'PVEAPIToken=root@pam!token=12345-6789-abcdef';
    const encrypted = EncryptionService.encrypt(secretText);

    assert.notEqual(encrypted, secretText);
    assert.match(encrypted, /^[0-9a-fA-F]+:[0-9a-fA-F]+:[0-9a-fA-F]+$/);

    const decrypted = EncryptionService.decrypt(encrypted);
    assert.equal(decrypted, secretText);
  });

  await t.test('should generate different ciphertexts (IV randomization) for same plaintext', () => {
    const secretText = 'same_secret_key_12345';
    const enc1 = EncryptionService.encrypt(secretText);
    const enc2 = EncryptionService.encrypt(secretText);

    assert.notEqual(enc1, enc2);
    assert.equal(EncryptionService.decrypt(enc1), secretText);
    assert.equal(EncryptionService.decrypt(enc2), secretText);
  });

  await t.test('should encrypt and decrypt complex JSON credentials objects', () => {
    const creds = {
      apiKey: 'opn_api_key_89234',
      apiSecret: 'opn_secret_99882211',
      privateKey: '-----BEGIN OPENSSH PRIVATE KEY-----\nMIIBO...\n-----END OPENSSH PRIVATE KEY-----',
      options: { port: 22, allowSelfSigned: true }
    };

    const encrypted = EncryptionService.encryptObject(creds);
    const decrypted = EncryptionService.decryptObject<typeof creds>(encrypted);

    assert.deepEqual(decrypted, creds);
  });

  await t.test('should detect tampering and fail authentication on altered ciphertext', () => {
    const secretText = 'sensitive_data_to_tamper';
    const encrypted = EncryptionService.encrypt(secretText);
    const parts = encrypted.split(':');

    // Alter ciphertext hex
    const tamperedCipher = parts[2].substring(0, parts[2].length - 2) + (parts[2].endsWith('a') ? 'b' : 'a');
    const tamperedPayload = `${parts[0]}:${parts[1]}:${tamperedCipher}`;

    assert.throws(() => {
      EncryptionService.decrypt(tamperedPayload);
    });
  });
});
