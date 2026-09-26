import crypto from 'crypto';
import { config } from '../config/index.js';

export class EncryptionService {
  private static readonly ALGORITHM = 'aes-256-gcm';
  private static readonly IV_LENGTH = 12; // 96 bits recommended for GCM
  private static readonly AUTH_TAG_LENGTH = 16; // 128 bits tag

  private static cachedMasterKey: Buffer | null = null;

  public static getMasterKey(): Buffer {
    if (this.cachedMasterKey) {
      return this.cachedMasterKey;
    }

    const rawKey = config.masterEncryptionKey;
    if (!rawKey) {
      throw new Error('[EncryptionService] MASTER_ENCRYPTION_KEY is missing or empty.');
    }

    // Key can be provided as 64-character hex or 32-character utf8
    if (rawKey.length === 64 && /^[0-9a-fA-F]+$/.test(rawKey)) {
      this.cachedMasterKey = Buffer.from(rawKey, 'hex');
      return this.cachedMasterKey;
    }

    // If key is plain string, derive 32-byte key via PBKDF2 (100,000 iterations) with fixed application salt
    const salt = Buffer.from('fleetupdate-master-encryption-vault-v1', 'utf8');
    this.cachedMasterKey = crypto.pbkdf2Sync(rawKey, salt, 100000, 32, 'sha256');
    return this.cachedMasterKey;
  }

  /**
   * Clears the cached master key (useful for tests, rotation, or memory wipe)
   */
  public static clearKeyCache(): void {
    if (this.cachedMasterKey) {
      this.cachedMasterKey.fill(0);
      this.cachedMasterKey = null;
    }
  }

  /**
   * Encrypts a plaintext string into format: "ivHex:authTagHex:ciphertextHex"
   */
  public static encrypt(plainText: string): string {
    if (!plainText) {
      throw new Error('[EncryptionService] Plaintext cannot be empty');
    }

    const key = this.getMasterKey();
    const iv = crypto.randomBytes(this.IV_LENGTH);
    const cipher = crypto.createCipheriv(this.ALGORITHM, key, iv, {
      authTagLength: this.AUTH_TAG_LENGTH
    });

    let encrypted = cipher.update(plainText, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();

    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  }

  /**
   * Decrypts an encrypted payload formatted as "ivHex:authTagHex:ciphertextHex"
   */
  public static decrypt(encryptedPayload: string): string {
    if (!encryptedPayload || !encryptedPayload.includes(':')) {
      throw new Error('[EncryptionService] Invalid encrypted payload format');
    }

    const parts = encryptedPayload.split(':');
    if (parts.length !== 3) {
      throw new Error('[EncryptionService] Payload must contain iv, authTag, and ciphertext');
    }

    const [ivHex, authTagHex, cipherTextHex] = parts;
    const key = this.getMasterKey();
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');

    if (iv.length !== this.IV_LENGTH || authTag.length !== this.AUTH_TAG_LENGTH) {
      throw new Error('[EncryptionService] Invalid IV or Auth Tag length');
    }

    const decipher = crypto.createDecipheriv(this.ALGORITHM, key, iv, {
      authTagLength: this.AUTH_TAG_LENGTH
    });

    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(cipherTextHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    // Secure memory hygiene: zero out sensitive cryptographic parameters
    iv.fill(0);
    authTag.fill(0);

    return decrypted;
  }

  /**
   * Helper to encrypt a JSON-serializable object
   */
  public static encryptObject<T = any>(obj: T): string {
    const jsonStr = JSON.stringify(obj);
    return this.encrypt(jsonStr);
  }

  /**
   * Helper to decrypt into a typed object
   */
  public static decryptObject<T = any>(encryptedPayload: string): T {
    const jsonStr = this.decrypt(encryptedPayload);
    return JSON.parse(jsonStr) as T;
  }

  /**
   * Safely decodes a credential record payload into an object or returns empty object with alert logging
   */
  public static resolveCredentials(credential?: { encryptedPayload: string } | null, hostIdentifier?: string): Record<string, any> {
    if (!credential || !credential.encryptedPayload) return {};
    try {
      return this.decryptObject(credential.encryptedPayload);
    } catch (err: any) {
      console.error(`[EncryptionService CRITICAL] Échec du déchiffrement des identifiants (Hôte: ${hostIdentifier || 'inconnu'}) : ${err.message}`);
      return {};
    }
  }
}
