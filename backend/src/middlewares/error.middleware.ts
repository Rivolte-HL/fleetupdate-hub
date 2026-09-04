import { Request, Response, NextFunction } from 'express';
import { config } from '../config/index.js';

export function errorHandler(err: any, req: Request, res: Response, next: NextFunction): void {
  console.error(`[Error] ${req.method} ${req.path}:`, err);

  const statusCode = err.statusCode || err.status || 500;
  const message = err.message || 'Une erreur interne est survenue sur le serveur.';

  res.status(statusCode).json({
    error: err.code || 'INTERNAL_SERVER_ERROR',
    message,
    ...(config.env === 'development' ? { stack: err.stack } : {})
  });
}
