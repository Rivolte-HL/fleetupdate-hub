import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

function readSecretOrEnv(envVar: string, fileEnvVar?: string, fallback: string = ''): string {
  // 1. Check if a _FILE env var is set (Docker secrets convention)
  if (fileEnvVar && process.env[fileEnvVar]) {
    const filePath = process.env[fileEnvVar]!;
    try {
      if (fs.existsSync(filePath)) {
        return fs.readFileSync(filePath, 'utf8').trim();
      }
    } catch (err) {
      console.warn(`[Config] Failed to read secret file at ${filePath}:`, err);
    }
  }

  // 2. Direct env var
  if (process.env[envVar]) {
    return process.env[envVar]!;
  }

  return fallback;
}

const DEFAULT_DEV_MASTER_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const DEFAULT_DEV_JWT_SECRET = 'development_jwt_secret_please_change_in_production_32_bytes';

const env = process.env.NODE_ENV || 'development';
const databaseUrl = readSecretOrEnv('DATABASE_URL', 'DATABASE_URL_FILE', '');
const masterEncryptionKey = readSecretOrEnv('MASTER_ENCRYPTION_KEY', 'MASTER_ENCRYPTION_KEY_FILE', DEFAULT_DEV_MASTER_KEY);
const jwtSecret = readSecretOrEnv('JWT_SECRET', 'JWT_SECRET_FILE', DEFAULT_DEV_JWT_SECRET);

// Sync DATABASE_URL in process.env for Prisma
if (databaseUrl && !process.env.DATABASE_URL) {
  process.env.DATABASE_URL = databaseUrl;
}

// Security checks for production mode
if (env === 'production') {
  if (masterEncryptionKey === DEFAULT_DEV_MASTER_KEY || masterEncryptionKey.length < 32) {
    console.error('CRITICAL SECURITY ERROR: Running in production with default or insecure MASTER_ENCRYPTION_KEY is forbidden!');
    process.exit(1);
  }
  if (jwtSecret === DEFAULT_DEV_JWT_SECRET || jwtSecret.length < 32) {
    console.error('CRITICAL SECURITY ERROR: Running in production with default or weak JWT_SECRET is forbidden!');
    process.exit(1);
  }
}

export const config = {
  env,
  port: parseInt(process.env.PORT || '5000', 10),
  host: process.env.HOST || '0.0.0.0',

  databaseUrl,
  masterEncryptionKey,
  jwtSecret,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '8h',
  corsOrigins: (process.env.CORS_ORIGIN || 'http://localhost:3000,http://127.0.0.1:3000').split(',').map((s: string) => s.trim()),

  discordWebhookUrl: process.env.DISCORD_WEBHOOK_URL || '',
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || '',
  telegramChatId: process.env.TELEGRAM_CHAT_ID || '',

  sshKeyDir: process.env.SSH_KEY_DIR || path.join(process.cwd(), 'keys')
};

