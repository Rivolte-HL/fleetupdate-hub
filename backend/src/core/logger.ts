import { AsyncLocalStorage } from 'async_hooks';
import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { config } from '../config/index.js';

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

const LOG_LEVEL_PRIORITIES: Record<LogLevel, number> = {
  DEBUG: 10,
  INFO: 20,
  WARN: 30,
  ERROR: 40
};

interface LogContext {
  requestId?: string;
  module?: string;
  [key: string]: any;
}

const asyncLocalStorage = new AsyncLocalStorage<LogContext>();

export class Logger {
  private moduleName: string;
  private minLevel: LogLevel;

  constructor(moduleName: string = 'System', minLevel?: LogLevel) {
    this.moduleName = moduleName;
    this.minLevel = minLevel || (config.env === 'development' ? 'DEBUG' : 'INFO');
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVEL_PRIORITIES[level] >= LOG_LEVEL_PRIORITIES[this.minLevel];
  }

  private formatMessage(level: LogLevel, message: string, meta?: Record<string, any>): void {
    if (!this.shouldLog(level)) return;

    const store = asyncLocalStorage.getStore() || {};
    const timestamp = new Date().toISOString();
    const requestId = store.requestId || meta?.requestId;
    const combinedMeta = { ...store, ...meta };
    delete combinedMeta.requestId;

    if (config.env === 'production') {
      // Structured JSON log for log aggregators (Datadog, Loki, ELK, CloudWatch)
      const logObject: Record<string, any> = {
        timestamp,
        level,
        module: this.moduleName,
        message,
        ...(requestId ? { requestId } : {}),
        ...(Object.keys(combinedMeta).length > 0 ? { context: combinedMeta } : {})
      };
      process.stdout.write(JSON.stringify(logObject) + '\n');
    } else {
      // Human-readable colored output in development
      const colors = {
        DEBUG: '\x1b[36m', // Cyan
        INFO: '\x1b[32m',  // Green
        WARN: '\x1b[33m',  // Yellow
        ERROR: '\x1b[31m', // Red
        RESET: '\x1b[0m'
      };

      const reqStr = requestId ? ` [req:${requestId.substring(0, 8)}]` : '';
      const metaStr = Object.keys(combinedMeta).length > 0 ? ` ${JSON.stringify(combinedMeta)}` : '';
      const prefix = `${colors[level]}[${timestamp}] [${level}] [${this.moduleName}]${reqStr}${colors.RESET}`;

      console.log(`${prefix} ${message}${metaStr}`);
    }
  }

  public debug(message: string, meta?: Record<string, any>): void {
    this.formatMessage('DEBUG', message, meta);
  }

  public info(message: string, meta?: Record<string, any>): void {
    this.formatMessage('INFO', message, meta);
  }

  public warn(message: string, meta?: Record<string, any>): void {
    this.formatMessage('WARN', message, meta);
  }

  public error(message: string, meta?: Record<string, any>): void {
    this.formatMessage('ERROR', message, meta);
  }

  public child(moduleName: string): Logger {
    return new Logger(moduleName, this.minLevel);
  }
}

export const rootLogger = new Logger('FleetUpdate-Hub');

/**
 * Express middleware to attach a correlation Request ID and track duration
 */
export function requestLoggerMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incomingId = req.headers['x-request-id'] as string;
  const requestId = incomingId || crypto.randomUUID();

  // Set response header for distributed tracing
  res.setHeader('X-Request-Id', requestId);

  const startTime = Date.now();

  asyncLocalStorage.run({ requestId, ip: req.ip, path: req.path, method: req.method }, () => {
    res.on('finish', () => {
      const durationMs = Date.now() - startTime;
      const status = res.statusCode;
      const level: LogLevel = status >= 500 ? 'ERROR' : status >= 400 ? 'WARN' : 'INFO';

      rootLogger.child('HTTP')[level.toLowerCase() as 'info' | 'warn' | 'error'](
        `${req.method} ${req.originalUrl || req.url} ${status} ${durationMs}ms`,
        { statusCode: status, durationMs }
      );
    });

    next();
  });
}
