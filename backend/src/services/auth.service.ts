import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { authenticator } from 'otplib';
import QRCode from 'qrcode';
import { User, UserRole } from '@prisma/client';
import { config } from '../config/index.js';
import { prisma } from '../core/prisma.client.js';
import { EncryptionService } from '../core/encryption.service.js';

export interface LoginResult {
  user: {
    id: string;
    email: string;
    name: string;
    role: UserRole;
    twoFactorEnabled: boolean;
  };
}

export interface TwoFactorRequired {
  requiresTwoFactor: true;
  message: string;
}

export interface Setup2FAResult {
  secret: string;
  qrCodeUrl: string;
}

export class AuthService {
  /**
   * Decrypts a TOTP secret that may be stored encrypted (iv:tag:cipher) or plain Base32
   */
  private static getPlainTotpSecret(secret: string): string {
    if (!secret) return '';
    try {
      if (secret.includes(':') && secret.split(':').length === 3) {
        return EncryptionService.decrypt(secret);
      }
    } catch {}
    return secret;
  }

  /**
   * Authenticate a user with email/password and optional TOTP code.
   * Returns the user profile and a signed JWT token, or signals that 2FA is required.
   */
  public static async login(
    email: string,
    password: string,
    totpCode?: string
  ): Promise<{ type: 'success'; user: LoginResult['user']; token: string } | { type: '2fa_required' }> {
    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
    if (!user) {
      throw new Error('INVALID_CREDENTIALS');
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      throw new Error('INVALID_CREDENTIALS');
    }

    // Check 2FA if enabled
    if (user.twoFactorEnabled && user.twoFactorSecret) {
      if (!totpCode) {
        return { type: '2fa_required' };
      }

      const plainSecret = this.getPlainTotpSecret(user.twoFactorSecret);
      const isValidTotp = authenticator.check(totpCode, plainSecret);
      if (!isValidTotp) {
        throw new Error('INVALID_TOTP');
      }
    }

    const token = jwt.sign(
      { userId: user.id, email: user.email, role: user.role },
      config.jwtSecret,
      { expiresIn: config.jwtExpiresIn as any }
    );

    return {
      type: 'success',
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        twoFactorEnabled: user.twoFactorEnabled
      },
      token
    };
  }

  public static async getUserProfile(userId: string) {
    return prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, role: true, twoFactorEnabled: true, createdAt: true }
    });
  }

  public static async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    if (newPassword.length < 8) {
      throw new Error('PASSWORD_TOO_SHORT');
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new Error('USER_NOT_FOUND');
    }

    const isMatch = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isMatch) {
      throw new Error('INVALID_CURRENT_PASSWORD');
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash }
    });
  }

  public static async setup2FA(userId: string, userEmail: string): Promise<Setup2FAResult> {
    const secret = authenticator.generateSecret();
    const otpauth = authenticator.keyuri(userEmail, 'FleetUpdate-Hub', secret);
    const qrCodeUrl = await QRCode.toDataURL(otpauth);

    // Save secret encrypted
    await prisma.user.update({
      where: { id: userId },
      data: { twoFactorSecret: EncryptionService.encrypt(secret) }
    });

    return { secret, qrCodeUrl };
  }

  public static async verifyAndEnable2FA(userId: string, code: string): Promise<void> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.twoFactorSecret) {
      throw new Error('2FA_NOT_INITIALIZED');
    }

    const plainSecret = this.getPlainTotpSecret(user.twoFactorSecret);
    const isValid = authenticator.check(code, plainSecret);
    if (!isValid) {
      throw new Error('INVALID_TOTP_CODE');
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { twoFactorEnabled: true }
    });
  }

  public static async disable2FA(userId: string, password: string): Promise<void> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new Error('USER_NOT_FOUND');
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      throw new Error('INVALID_PASSWORD');
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        twoFactorEnabled: false,
        twoFactorSecret: null
      }
    });
  }
}
