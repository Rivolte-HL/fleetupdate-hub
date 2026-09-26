import { Response, NextFunction } from 'express';
import { UserRole } from '@prisma/client';
import { AuthenticatedRequest } from './auth.middleware.js';

const roleHierarchy: Record<UserRole, number> = {
  [UserRole.VIEWER]: 1,
  [UserRole.OPERATOR]: 2,
  [UserRole.ADMIN]: 3
};

/**
 * Ensures the authenticated user has at least the required role
 */
export function requireRole(minimumRole: UserRole) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'UNAUTHORIZED', message: 'Authentification requise.' });
      return;
    }

    const userLevel = roleHierarchy[req.user.role] || 0;
    const requiredLevel = roleHierarchy[minimumRole] || 0;

    if (userLevel < requiredLevel) {
      res.status(403).json({
        error: 'FORBIDDEN',
        message: `Droits insuffisants. Rôle requis: ${minimumRole} (Votre rôle: ${req.user.role})`
      });
      return;
    }

    next();
  };
}
