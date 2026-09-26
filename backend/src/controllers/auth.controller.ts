import { Request, Response, NextFunction } from 'express';
import { config } from '../config/index.js';
import { AuthenticatedRequest } from '../middlewares/auth.middleware.js';
import { AuthService } from '../services/auth.service.js';
import { logAuditEvent } from '../middlewares/audit.middleware.js';

export class AuthController {
  public static async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { email, password, totpCode } = req.body;

      if (!email || !password) {
        res.status(400).json({ error: 'INVALID_INPUT', message: 'Email et mot de passe requis.' });
        return;
      }

      const result = await AuthService.login(email, password, totpCode);

      if (result.type === '2fa_required') {
        res.status(200).json({
          requiresTwoFactor: true,
          message: 'Code TOTP 2FA requis pour finaliser l\'authentification.'
        });
        return;
      }

      // Set secure HTTP-Only Cookie — token is NOT returned in the JSON body
      const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
      res.cookie('token', result.token, {
        httpOnly: true,
        secure: isHttps,
        sameSite: 'strict',
        maxAge: 8 * 60 * 60 * 1000 // 8h
      });

      await logAuditEvent(
        req as AuthenticatedRequest,
        'USER_LOGIN_SUCCESS',
        'USER',
        result.user.id,
        { email: result.user.email, role: result.user.role }
      );

      res.status(200).json({ user: result.user });
    } catch (err: any) {
      if (err.message === 'INVALID_CREDENTIALS') {
        res.status(401).json({ error: 'INVALID_CREDENTIALS', message: 'Identifiants invalides.' });
        return;
      }
      if (err.message === 'INVALID_TOTP') {
        res.status(401).json({ error: 'INVALID_TOTP', message: 'Code TOTP invalide ou expiré.' });
        return;
      }
      next(err);
    }
  }

  public static async logout(req: AuthenticatedRequest, res: Response): Promise<void> {
    if (req.user) {
      await logAuditEvent(req, 'USER_LOGOUT', 'USER', req.user.userId);
    }
    const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
    res.clearCookie('token', {
      httpOnly: true,
      secure: isHttps,
      sameSite: 'strict'
    });
    res.status(200).json({ message: 'Déconnexion réussie.' });
  }

  public static async me(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'UNAUTHORIZED' });
        return;
      }

      const user = await AuthService.getUserProfile(req.user.userId);
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

      await AuthService.changePassword(req.user.userId, currentPassword, newPassword);

      await logAuditEvent(req, 'USER_PASSWORD_CHANGED', 'USER', req.user.userId, { email: req.user.email });
      res.status(200).json({ message: 'Mot de passe modifié avec succès !' });
    } catch (err: any) {
      if (err.message === 'PASSWORD_TOO_SHORT') {
        res.status(400).json({ error: 'PASSWORD_TOO_SHORT', message: 'Le nouveau mot de passe doit contenir au moins 8 caractères.' });
        return;
      }
      if (err.message === 'INVALID_CURRENT_PASSWORD') {
        res.status(400).json({ error: 'INVALID_CURRENT_PASSWORD', message: 'Le mot de passe actuel est incorrect.' });
        return;
      }
      if (err.message === 'USER_NOT_FOUND') {
        res.status(404).json({ error: 'USER_NOT_FOUND' });
        return;
      }
      next(err);
    }
  }

  public static async setup2FA(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'UNAUTHORIZED' });
        return;
      }

      const result = await AuthService.setup2FA(req.user.userId, req.user.email);
      res.status(200).json({
        ...result,
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

      await AuthService.verifyAndEnable2FA(req.user.userId, code);

      await logAuditEvent(req, '2FA_ENABLED', 'USER', req.user.userId);
      res.status(200).json({ message: 'Authentification 2FA activée avec succès !' });
    } catch (err: any) {
      if (err.message === '2FA_NOT_INITIALIZED') {
        res.status(400).json({ error: '2FA_NOT_INITIALIZED' });
        return;
      }
      if (err.message === 'INVALID_TOTP_CODE') {
        res.status(400).json({ error: 'INVALID_TOTP_CODE', message: 'Code de vérification invalide.' });
        return;
      }
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

      await AuthService.disable2FA(req.user.userId, password);

      await logAuditEvent(req, '2FA_DISABLED', 'USER', req.user.userId, { email: req.user.email });
      res.status(200).json({ message: 'Authentification à deux facteurs désactivée avec succès.' });
    } catch (err: any) {
      if (err.message === 'USER_NOT_FOUND') {
        res.status(404).json({ error: 'USER_NOT_FOUND' });
        return;
      }
      if (err.message === 'INVALID_PASSWORD') {
        res.status(400).json({ error: 'INVALID_PASSWORD', message: 'Mot de passe incorrect.' });
        return;
      }
      next(err);
    }
  }
}
