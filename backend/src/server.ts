import express from 'express';
import http from 'http';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { WebSocketServer, WebSocket } from 'ws';
import jwt from 'jsonwebtoken';
import { URL } from 'url';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { UserRole } from '@prisma/client';
import { config } from './config/index.js';
import { ServiceRegistry } from './core/service.registry.js';
import { prisma } from './core/prisma.client.js';
import apiRouter from './routes/index.js';
import { errorHandler } from './middlewares/error.middleware.js';
import { apiRateLimiter } from './middlewares/rate-limiter.middleware.js';

// Import and register all infrastructure adapters
import { ProxmoxAdapter } from './adapters/proxmox/proxmox.adapter.js';
import { ProxmoxBackupServerAdapter } from './adapters/pbs/pbs.adapter.js';
import { OPNsenseAdapter } from './adapters/opnsense/opnsense.adapter.js';
import { DockerAdapter } from './adapters/docker/docker.adapter.js';
import { LinuxSshAdapter } from './adapters/linux-ssh/linux-ssh.adapter.js';
import { HomeAssistantAdapter } from './adapters/home-assistant/home-assistant.adapter.js';

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
  verifyClient: (info, callback) => {
    try {
      let token: string | undefined;

      // 1. Check Authorization header
      const authHeader = info.req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.split(' ')[1];
      }

      // 2. Check Cookie header
      if (!token && info.req.headers.cookie) {
        const cookies = info.req.headers.cookie.split(';').reduce((acc: Record<string, string>, c) => {
          const [k, v] = c.trim().split('=');
          if (k && v) acc[k] = decodeURIComponent(v);
          return acc;
        }, {});
        token = cookies['token'];
      }

      // 3. Check Query parameter
      if (!token && info.req.url) {
        const parsedUrl = new URL(info.req.url, `http://${info.req.headers.host || 'localhost'}`);
        token = parsedUrl.searchParams.get('token') || undefined;
      }

      if (!token) {
        callback(false, 401, 'Unauthorized: Missing session token');
        return;
      }

      jwt.verify(token, config.jwtSecret);
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

// 2. Global Security Middlewares
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'", 'ws:', 'wss:']
    }
  },
  crossOriginEmbedderPolicy: false
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
      // Allow RFC1918 private networks (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16)
      if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) return callback(null, true);
      if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(host)) return callback(null, true);
      if (/^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(host)) return callback(null, true);
      if (host.endsWith('.local') || host.endsWith('.lan') || host.endsWith('.home')) {
        return callback(null, true);
      }

      // Check configured origins and wildcard subdomains
      for (const allowed of config.corsOrigins) {
        if (allowed === origin) return callback(null, true);
        if (allowed.startsWith('*.')) {
          const rootDomain = allowed.slice(2);
          if (host.endsWith(rootDomain)) return callback(null, true);
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
      console.log(`[Database] Initial administrator created: ${adminEmail}`);
      console.log(`[Database] Initial admin password: ${adminPassword}`);
      if (!isCustomPassword) {
        console.log('[Database] 🔒 (A cryptographically secure random password was generated automatically)');
      }
      console.log('[Database] ⚠️  Please change this password upon first login and enable 2FA TOTP!');
    }
  } catch (err) {
    console.warn('[Database] Initial auto-seed skipped or deferred:', err);
  }
}

// 6. Start HTTP & WebSocket Server
server.listen(config.port, config.host, async () => {
  await initDatabaseDefaults();

  // Start background recurring scheduler (hourly automatic checks)
  const { SchedulerService } = await import('./core/scheduler.service.js');
  SchedulerService.getInstance().start();

  console.log(`================================================================`);
  console.log(`🛡️  FleetUpdate-Hub Core Server running on http://${config.host}:${config.port}`);
  console.log(`🔒 Security Mode: Zero-Trust with AES-256-GCM Vault Active`);
  console.log(`📦 Registered Modules: ${registry.getAllMetadata().map(m => m.displayName).join(', ')}`);
  console.log(`🕒 Automatic Hourly Check: ENABLED`);
  console.log(`================================================================`);
});

export { app, server };

