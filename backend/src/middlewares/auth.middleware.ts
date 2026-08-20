import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';
import { JwtPayload } from '../types/auth.types.js';

export interface AuthenticatedRequest extends Request {
  user?: JwtPayload;
}

export function authMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  // 1. Check HTTP-Only cookie first (recommended for browser SPA)
  let token = req.cookies?.token;

  // 2. Fallback to Authorization Bearer header (for API scripts / CLI)
  if (!token && req.headers.authorization?.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    res.status(401).json({
      error: 'UNAUTHORIZED',
      message: 'Authentification requise. Aucun jeton de session valide trouvé.'
    });
    return;
  }

  try {
    const decoded = jwt.verify(token, config.jwtSecret) as JwtPayload;
    req.user = decoded;
    next();
  } catch (err: any) {
    res.status(401).json({
      error: 'INVALID_TOKEN',
      message: 'Le jeton de session est invalide ou a expiré.'
    });
  }
}
