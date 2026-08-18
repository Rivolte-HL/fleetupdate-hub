import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { authenticator } from 'otplib';
import QRCode from 'qrcode';
import { config } from '../config/index.js';
import { prisma } from '../core/prisma.client.js';
import { EncryptionService } from '../core/encryption.service.js';
import { AuthenticatedRequest } from '../middlewares/auth.middleware.js';
import { logAuditEvent } from '../middlewares/audit.middleware.js';

export class AuthController {
  private static getPlainTotpSecret(secret: string): string {
    if (!secret) return '';
    try {
      if (secret.includes(':') && secret.split(':').length === 3) {
        return EncryptionService.decrypt(secret);
      }
    } catch {}
    return secret;
  }

  public static async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { email, password, totpCode } = req.body;

      if (!email || !password) {
        res.status(400).json({ error: 'INVALID_INPUT', message: 'Email et mot de passe requis.' });
        return;
      }

      const user = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
      if (!user) {
        res.status(401).json({ error: 'INVALID_CREDENTIALS', message: 'Identifiants invalides.' });
        return;
      }

      const isMatch = await bcrypt.compare(password, user.passwordHash);
      if (!isMatch) {
        res.status(401).json({ error: 'INVALID_CREDENTIALS', message: 'Identifiants invalides.' });
        return;
      }

      // Check 2FA if enabled
      if (user.twoFactorEnabled && user.twoFactorSecret) {
        if (!totpCode) {
          res.status(200).json({
            requiresTwoFactor: true,
            message: 'Code TOTP 2FA requis pour finaliser l’authentification.'
          });
          return;
        }

        const plainSecret = AuthController.getPlainTotpSecret(user.twoFactorSecret);
        const isValidTotp = authenticator.check(totpCode, plainSecret);
        if (!isValidTotp) {
          res.status(401).json({ error: 'INVALID_TOTP', message: 'Code TOTP invalide ou expiré.' });
          return;
        }
      }

      const token = jwt.sign(
        { userId: user.id, email: user.email, role: user.role },
        config.jwtSecret,
        { expiresIn: config.jwtExpiresIn as any }
      );

      // Set secure HTTP-Only Cookie (only set Secure if connection is HTTPS)
      const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
      res.cookie('token', token, {
        httpOnly: true,
        secure: isHttps,
        sameSite: 'lax',
        maxAge: 8 * 60 * 60 * 1000 // 8h
      });

      await logAuditEvent(
        req as AuthenticatedRequest,
        'USER_LOGIN_SUCCESS',
        'USER',
        user.id,
        { email: user.email, role: user.role }
      );

      res.status(200).json({
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          twoFactorEnabled: user.twoFactorEnabled
        },
        token
      });
    } catch (err) {
      next(err);
    }
  }

  public static async logout(req: AuthenticatedRequest, res: Response): Promise<void> {
    if (req.user) {
      await logAuditEvent(req, 'USER_LOGOUT', 'USER', req.user.userId);
    }
    res.clearCookie('token');
    res.status(200).json({ message: 'Déconnexion réussie.' });
  }

  public static async me(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'UNAUTHORIZED' });
        return;
      }

      const user = await prisma.user.findUnique({
        where: { id: req.user.userId },
        select: { id: true, email: true, name: true, role: true, twoFactorEnabled: true, createdAt: true }
      });

      if (!user) {
        res.status(404).json({ error: 'USER_NOT_FOUND' });
        return;
      }

      res.status(200).json({ user });
    } catch (err) {
      next(err);
    }
  }

  public static async changePassword(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'UNAUTHORIZED' });
        return;
      }

      const { currentPassword, newPassword } = req.body;
      if (!currentPassword || !newPassword) {
        res.status(400).json({ error: 'INVALID_INPUT', message: 'Mot de passe actuel et nouveau mot de passe requis.' });
        return;
      }

      if (newPassword.length < 8) {
        res.status(400).json({ error: 'PASSWORD_TOO_SHORT', message: 'Le nouveau mot de passe doit contenir au moins 8 caractères.' });
        return;
      }

      const user = await prisma.user.findUnique({ where: { id: req.user.userId } });
      if (!user) {
        res.status(404).json({ error: 'USER_NOT_FOUND' });
        return;
      }

      const isMatch = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!isMatch) {
        res.status(400).json({ error: 'INVALID_CURRENT_PASSWORD', message: 'Le mot de passe actuel est incorrect.' });
        return;
      }

      const passwordHash = await bcrypt.hash(newPassword, 12);
      await prisma.user.update({
        where: { id: user.id },
        data: { passwordHash }
      });

      await logAuditEvent(req, 'USER_PASSWORD_CHANGED', 'USER', user.id, { email: user.email });
      res.status(200).json({ message: 'Mot de passe modifié avec succès !' });
    } catch (err) {
      next(err);
    }
  }

  public static async setup2FA(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'UNAUTHORIZED' });
        return;
      }

      const secret = authenticator.generateSecret();
      const otpauth = authenticator.keyuri(req.user.email, 'FleetUpdate-Hub', secret);
      const qrCodeUrl = await QRCode.toDataURL(otpauth);

      // Save secret encrypted
      await prisma.user.update({
        where: { id: req.user.userId },
        data: { twoFactorSecret: EncryptionService.encrypt(secret) }
      });

      res.status(200).json({
        secret,
        qrCodeUrl,
        message: 'Scannez le QR Code avec Google Authenticator ou FreeOTP puis validez le code.'
      });
    } catch (err) {
      next(err);
    }
  }

  public static async verifyAndEnable2FA(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { code } = req.body;
      if (!req.user || !code) {
        res.status(400).json({ error: 'INVALID_REQUEST', message: 'Code TOTP manquant.' });
        return;
      }

      const user = await prisma.user.findUnique({ where: { id: req.user.userId } });
      if (!user || !user.twoFactorSecret) {
        res.status(400).json({ error: '2FA_NOT_INITIALIZED' });
        return;
      }

      const plainSecret = AuthController.getPlainTotpSecret(user.twoFactorSecret);
      const isValid = authenticator.check(code, plainSecret);
      if (!isValid) {
        res.status(400).json({ error: 'INVALID_TOTP_CODE', message: 'Code de vérification invalide.' });
        return;
      }

      await prisma.user.update({
        where: { id: user.id },
        data: { twoFactorEnabled: true }
      });

      await logAuditEvent(req, '2FA_ENABLED', 'USER', user.id);
      res.status(200).json({ message: 'Authentification 2FA activée avec succès !' });
    } catch (err) {
      next(err);
    }
  }

  public static async disable2FA(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'UNAUTHORIZED' });
        return;
      }

      const { password } = req.body;
      if (!password) {
        res.status(400).json({ error: 'INVALID_INPUT', message: 'Mot de passe requis pour désactiver le 2FA.' });
        return;
      }

      const user = await prisma.user.findUnique({ where: { id: req.user.userId } });
      if (!user) {
        res.status(404).json({ error: 'USER_NOT_FOUND' });
        return;
      }

      const isMatch = await bcrypt.compare(password, user.passwordHash);
      if (!isMatch) {
        res.status(400).json({ error: 'INVALID_PASSWORD', message: 'Mot de passe incorrect.' });
        return;
      }

      await prisma.user.update({
        where: { id: user.id },
        data: {
          twoFactorEnabled: false,
          twoFactorSecret: null
        }
      });

      await logAuditEvent(req, '2FA_DISABLED', 'USER', user.id, { email: user.email });
      res.status(200).json({ message: 'Authentification à deux facteurs désactivée avec succès.' });
    } catch (err) {
      next(err);
    }
  }
}
