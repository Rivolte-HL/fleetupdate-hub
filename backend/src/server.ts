import express from 'express';
import http from 'http';
import fs from 'fs';
import path from 'path';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { WebSocketServer, WebSocket } from 'ws';
import jwt from 'jsonwebtoken';
import { URL } from 'url';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { UserRole, TaskStatus } from '@prisma/client';
import { config } from './config/index.js';
import { ServiceRegistry } from './core/service.registry.js';
import { prisma } from './core/prisma.client.js';
import apiRouter from './routes/index.js';
import { errorHandler } from './middlewares/error.middleware.js';
import { apiRateLimiter } from './middlewares/rate-limiter.middleware.js';
import { rootLogger, requestLoggerMiddleware } from './core/logger.js';

// Import and register all infrastructure adapters
import { ProxmoxAdapter } from './adapters/proxmox/proxmox.adapter.js';
import { ProxmoxBackupServerAdapter } from './adapters/pbs/pbs.adapter.js';
import { OPNsenseAdapter } from './adapters/opnsense/opnsense.adapter.js';
import { DockerAdapter } from './adapters/docker/docker.adapter.js';
import { LinuxSshAdapter } from './adapters/linux-ssh/linux-ssh.adapter.js';
import { HomeAssistantAdapter } from './adapters/home-assistant/home-assistant.adapter.js';
import { TrueNASAdapter } from './adapters/truenas/truenas.adapter.js';

// Sérialisation universelle des champs BigInt de PostgreSQL/Prisma vers JSON
(BigInt.prototype as any).toJSON = function () {
  return this.toString();
};

const app = express();
app.set('trust proxy', 1);
const server = http.createServer(app);

// Initialize WebSocket server for real-time pipeline log streaming
const wss = new WebSocketServer({
  server,
  path: '/ws/pipeline',
  verifyClient: async (info, callback) => {
    try {
      // 1. Origin validation against allowed origins to prevent Cross-Site WebSocket Hijacking (CSWSH)
      const origin = (info.origin || info.req.headers.origin || '').trim();
      if (origin) {
        let isAllowedOrigin = config.corsOrigins.includes('*') || config.corsOrigins.includes(origin);
        if (!isAllowedOrigin && config.env === 'development') {
          isAllowedOrigin = origin.includes('localhost') || origin.includes('127.0.0.1') || origin.includes('::1');
        }
        if (!isAllowedOrigin) {
          callback(false, 403, 'Forbidden: Untrusted WebSocket Origin (CSWSH Protection)');
          return;
        }
      } else if (config.env === 'production') {
        callback(false, 403, 'Forbidden: Missing WebSocket Origin header');
        return;
      }

      let token: string | undefined;

      // 2. Check Authorization header
      const authHeader = info.req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.split(' ')[1];
      }

      // 3. Check Cookie header (HttpOnly)
      if (!token && info.req.headers.cookie) {
        const cookies = info.req.headers.cookie.split(';').reduce((acc: Record<string, string>, c) => {
          const [k, v] = c.trim().split('=');
          if (k && v) acc[k] = decodeURIComponent(v);
          return acc;
        }, {});
        token = cookies['token'];
      }

      if (!token) {
        callback(false, 401, 'Unauthorized: Missing session token in Cookie or Authorization header');
        return;
      }

      const decoded = jwt.verify(token, config.jwtSecret) as any;
      if (!decoded || !decoded.userId) {
        callback(false, 401, 'Unauthorized: Invalid token payload');
        return;
      }

      // 4. Enforce session revocation via tokenVersion
      const user = await prisma.user.findUnique({
        where: { id: decoded.userId },
        select: { id: true, tokenVersion: true }
      });

      if (!user || (decoded.tokenVersion !== undefined && user.tokenVersion !== decoded.tokenVersion)) {
        callback(false, 401, 'Unauthorized: Session revoked');
        return;
      }

      callback(true);
    } catch (err) {
      callback(false, 401, 'Unauthorized: Invalid or expired token');
    }
  }
});

interface AuthenticatedWebSocket extends WebSocket {
  isAlive: boolean;
}

wss.on('connection', (ws: AuthenticatedWebSocket) => {
  ws.isAlive = true;
  ws.on('pong', () => {
    ws.isAlive = true;
  });

  ws.send(JSON.stringify({ type: 'WS_CONNECTED', message: 'Connected to FleetUpdate-Hub Live Event Stream' }));
});

// Periodic heartbeat to terminate zombie connections
const heartbeatInterval = setInterval(() => {
  wss.clients.forEach((client) => {
    const ws = client as AuthenticatedWebSocket;
    if (ws.isAlive === false) {
      return ws.terminate();
    }
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);
heartbeatInterval.unref();

wss.on('close', () => {
  clearInterval(heartbeatInterval);
});

export function broadcastPipelineUpdate(data: any): void {
  const payload = JSON.stringify(data);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
}

// 1. Register Adapters into ServiceRegistry
const registry = ServiceRegistry.getInstance();
registry.registerAdapter(new ProxmoxAdapter());
registry.registerAdapter(new ProxmoxBackupServerAdapter());
registry.registerAdapter(new OPNsenseAdapter());
registry.registerAdapter(new DockerAdapter());
registry.registerAdapter(new LinuxSshAdapter());
registry.registerAdapter(new HomeAssistantAdapter());
registry.registerAdapter(new TrueNASAdapter());

// 2. Global Security Middlewares
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'", 'ws:', 'wss:'],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      frameAncestors: ["'none'"],
      formAction: ["'self'"]
    }
  },
  frameguard: { action: 'deny' },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  },
  crossOriginEmbedderPolicy: false,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
}));

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (config.env === 'development') return callback(null, true);
    if (config.corsOrigins.includes('*')) return callback(null, true);
    if (config.corsOrigins.includes(origin)) return callback(null, true);

    try {
      const url = new URL(origin);
      const host = url.hostname;
      // Allow localhost / loopback
      if (host === 'localhost' || host === '127.0.0.1' || host === '::1') {
        return callback(null, true);
      }
      // Allow RFC1918 private networks and mDNS names only in development mode unless explicitly configured
      if (config.env === 'development') {
        if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) return callback(null, true);
        if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(host)) return callback(null, true);
        if (/^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(host)) return callback(null, true);
        if (host.endsWith('.local') || host.endsWith('.lan') || host.endsWith('.home')) {
          return callback(null, true);
        }
      }

      // Check configured origins and wildcard subdomains
      for (const allowed of config.corsOrigins) {
        if (allowed === origin) return callback(null, true);
        if (allowed.startsWith('*.')) {
          const rootDomain = allowed.slice(2);
          if (host === rootDomain || host.endsWith('.' + rootDomain)) return callback(null, true);
        }
        try {
          const allowedUrl = new URL(allowed);
          if (allowedUrl.hostname === host) return callback(null, true);
        } catch {}
      }
    } catch {}

    callback(null, false);
  },
  credentials: true
}));

app.use(cookieParser());
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));
app.use(requestLoggerMiddleware);
app.use(apiRateLimiter);

// 3. Healthcheck Endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'HEALTHY',
    service: 'FleetUpdate-Hub Backend',
    timestamp: new Date().toISOString(),
    registeredAdapters: registry.getAllMetadata().map(m => m.type)
  });
});

// 4. Mount API Routes
app.use('/api', apiRouter);

// 5. Global Error Handling
app.use(errorHandler);

async function initDatabaseDefaults(): Promise<void> {
  try {
    // Self-healing: ensure tokenVersion column exists even if migrations were not executed yet
    await prisma.$executeRawUnsafe(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "tokenVersion" INTEGER NOT NULL DEFAULT 0;`).catch(() => {});

    const adminEmail = process.env.INITIAL_ADMIN_EMAIL || 'admin@fleetupdate.local';
    const isCustomPassword = Boolean(process.env.INITIAL_ADMIN_PASSWORD);
    const adminPassword = process.env.INITIAL_ADMIN_PASSWORD || crypto.randomBytes(16).toString('hex');

    const count = await prisma.user.count();
    if (count === 0) {
      const passwordHash = await bcrypt.hash(adminPassword, 12);
      await prisma.user.create({
        data: {
          email: adminEmail,
          name: 'SecOps Administrator',
          passwordHash,
          role: UserRole.ADMIN,
          twoFactorEnabled: false
        }
      });
      await prisma.auditLog.create({
        data: {
          userEmail: adminEmail,
          action: 'SYSTEM_INITIALIZED',
          resourceType: 'SYSTEM',
          details: { message: 'Database initialized with default administrator credentials.' },
          ipAddress: '127.0.0.1'
        }
      });
      rootLogger.info(`Initial administrator created: ${adminEmail}`);
      if (!isCustomPassword) {
        rootLogger.warn(`🔑 Generated one-time Administrator Password: ${adminPassword}`);
        rootLogger.warn('⚠️ Please save this password immediately and change it upon first login via the web console!');
      } else {
        rootLogger.warn('⚠️ Please log in with your configured INITIAL_ADMIN_PASSWORD and enable 2FA TOTP immediately!');
      }
    }
  } catch (err) {
    rootLogger.warn('Initial auto-seed skipped or deferred', { error: (err as any)?.message });
  }
}

// 6. Start HTTP & WebSocket Server
const isTestEnv = process.env.NODE_ENV === 'test' || process.argv.some(arg => arg.includes('test'));
if (!isTestEnv) {
  server.listen(config.port, config.host, async () => {
    await initDatabaseDefaults();

  // Reconcile and auto-recover orphaned/stale tasks after server restart or crash
  try {
    const staleTasks = await prisma.updateTask.updateMany({
      where: {
        status: {
          in: [
            TaskStatus.PENDING,
            TaskStatus.PRE_FLIGHT,
            TaskStatus.BACKUP,
            TaskStatus.UPDATING,
            TaskStatus.HEALTH_CHECK
          ]
        }
      },
      data: {
        status: TaskStatus.FAILED,
        errorDetails: 'Tâche interrompue suite à un arrêt inattendu ou un redémarrage du serveur.'
      }
    });
    if (staleTasks.count > 0) {
      rootLogger.warn(`🧹 Nettoyage : ${staleTasks.count} tâche(s) orpheline(s) réconciliée(s) et marquée(s) comme FAILED.`);
    }
  } catch (cleanupErr: any) {
    rootLogger.warn('Erreur lors de la réconciliation des tâches orphelines', { error: cleanupErr.message });
  }

  // Start background recurring scheduler (hourly automatic checks)
  const { SchedulerService } = await import('./core/scheduler.service.js');
  SchedulerService.getInstance().start();

  // Start Zero-Trust Home Assistant Sync & Outbound Watcher
  try {
    const { HomeAssistantSyncService } = await import('./services/ha-sync.service.js');
    HomeAssistantSyncService.getInstance().startWatcher();
    HomeAssistantSyncService.getInstance().syncAllHosts().catch(() => {});
  } catch (haErr: any) {
    rootLogger.warn('Erreur lors du démarrage du service Home Assistant Sync', { error: haErr.message });
  }

  rootLogger.info(`🛡️ FleetUpdate-Hub Core Server running on http://${config.host}:${config.port}`, {
    host: config.host,
    port: config.port,
    env: config.env,
    registeredModules: registry.getAllMetadata().map(m => m.type)
  });
});
}

export { app, server };

