import { Request, Response, NextFunction } from 'express';
import { config } from '../config/index.js';

export function errorHandler(err: any, req: Request, res: Response, next: NextFunction): void {
  console.error(`[Error] ${req.method} ${req.path}:`, err);

  const statusCode = err.statusCode || err.status || 500;
  const isProd = config.env === 'production';
  const isServerInternal = statusCode >= 500;

  const message = isProd && isServerInternal
    ? 'Une erreur interne est survenue sur le serveur.'
    : (err.message || 'Une erreur interne est survenue sur le serveur.');

  const errorCode = isProd && isServerInternal
    ? 'INTERNAL_SERVER_ERROR'
    : (err.code || 'INTERNAL_SERVER_ERROR');

  res.status(statusCode).json({
    error: errorCode,
    message,
    ...(config.env === 'development' ? { stack: err.stack } : {})
  });
}
