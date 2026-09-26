import { Request, Response, NextFunction } from 'express';
import { z, ZodError, ZodSchema } from 'zod';
import { HostType } from '@prisma/client';

/**
 * Middleware express générique pour valider le corps (body) de requête avec un schéma Zod
 */
export function validateBody<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (err: any) {
      if (err instanceof ZodError) {
        res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: 'Données de requête invalides.',
          details: err.errors.map(e => ({
            field: e.path.join('.'),
            message: e.message
          }))
        });
        return;
      }
      next(err);
    }
  };
}

/**
 * Helper anti-SSRF : interdit l'accès aux métadonnées cloud, plages link-local et services Docker internes
 */
export const validateSafeEndpointUrl = (val: string): boolean => {
  if (!val || typeof val !== 'string') return false;
  const trimmed = val.trim();

  // 1. Interdire les pseudo-protocoles dangereux
  if (/^(file|gopher|dict|ldap|ldaps|ftp|tftp|sftp|data|javascript|vbscript):/i.test(trimmed)) {
    return false;
  }

  let hostname = trimmed;
  if (trimmed.includes('://')) {
    try {
      const parsed = new URL(trimmed);
      if (!['http:', 'https:', 'ssh:', 'tcp:'].includes(parsed.protocol.toLowerCase())) {
        return false;
      }
      hostname = parsed.hostname;
    } catch {
      return false;
    }
  } else {
    // Format hôte:port ou hôte/chemin
    hostname = trimmed.split('/')[0].split(':')[0];
  }

  hostname = hostname.replace(/^\[/, '').replace(/\]$/, '').toLowerCase();

  // 2. Bloquer les services internes du cluster Docker et localhost / loopback
  const FORBIDDEN_INTERNAL_SERVICES = [
    'localhost',
    '127.0.0.1',
    '::1',
    '0.0.0.0',
    'db',
    'fleetupdate-db',
    'postgres',
    'fleetupdate-backend',
    'backend'
  ];
  if (FORBIDDEN_INTERNAL_SERVICES.includes(hostname)) {
    return false;
  }

  // 3. Bloquer les adresses et domaines connus de métadonnées cloud
  const FORBIDDEN_METADATA_NAMES = [
    'metadata.google.internal',
    'metadata',
    'instance-data',
    '100.100.100.200'
  ];
  if (FORBIDDEN_METADATA_NAMES.includes(hostname)) {
    return false;
  }

  // 4. Bloquer la plage complète IPv4 link-local (169.254.0.0/16) et loopback (127.0.0.0/8)
  if (/^169\.254\.\d{1,3}\.\d{1,3}$/.test(hostname) || /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)) {
    return false;
  }

  // 5. Bloquer les représentations décimales alternatives (127.0.0.0/8 et 169.254.0.0/16)
  if (/^\d+$/.test(hostname)) {
    const decIp = parseInt(hostname, 10);
    if ((decIp >= 2130706432 && decIp <= 2147483647) || (decIp >= 2851995648 && decIp <= 2852061183)) {
      return false;
    }
  }

  // 6. Bloquer les représentations hexadécimales alternatives
  if (/^0x[0-9a-f]+$/i.test(hostname)) {
    const hexIp = parseInt(hostname, 16);
    if ((hexIp >= 2130706432 && hexIp <= 2147483647) || (hexIp >= 2851995648 && hexIp <= 2852061183)) {
      return false;
    }
  }

  // 7. Bloquer IPv6 loopback (::1), link-local (fe80::/10) et AWS IPv6 metadata (fd00:ec2::254)
  if (hostname === '::1' || hostname.startsWith('fe80:') || hostname.startsWith('fd00:ec2:')) {
    return false;
  }

  // 8. Bloquer les adresses IPv4-mapped IPv6 ciblant 127.x.x.x ou 169.254.x.x
  if (hostname.includes('::ffff:')) {
    if (
      hostname.includes('127.') ||
      hostname.includes('169.254.') ||
      hostname.includes('7f00:') ||
      hostname.includes('a9fe:')
    ) {
      return false;
    }
  }

  return true;
};

/**
 * Schémas de validation déclaratifs pour l'ensemble des endpoints API
 */
export const hostSchemas = {
  create: z.object({
    name: z.string().trim().min(1, 'Le nom de l’hôte est obligatoire').max(100),
    description: z.string().trim().max(500).optional(),
    adapterType: z.nativeEnum(HostType, {
      errorMap: () => ({ message: 'Type d’adaptateur invalide ou non supporté' })
    }),
    endpointUrl: z.string().trim().min(1, 'L’endpoint URL est obligatoire').refine(
      validateSafeEndpointUrl,
      { message: 'Endpoint URL invalide ou interdite (SSRF Protection: métadonnées cloud et protocoles non autorisés)' }
    ),
    port: z.union([z.number().int().min(1).max(65535), z.string().regex(/^\d+$/).transform(Number)]).optional(),
    metadata: z.record(z.any()).optional().default({}),
    credentials: z.record(z.any()).optional()
  }),

  update: z.object({
    name: z.string().trim().min(1).max(100).optional(),
    description: z.string().trim().max(500).optional(),
    endpointUrl: z.string().trim().min(1).refine(
      validateSafeEndpointUrl,
      { message: 'Endpoint URL invalide ou interdite (SSRF Protection: métadonnées cloud et protocoles non autorisés)' }
    ).optional(),
    port: z.union([z.number().int().min(1).max(65535), z.string().regex(/^\d+$/).transform(Number)]).optional(),
    metadata: z.record(z.any()).optional(),
    credentials: z.record(z.any()).optional()
  })
};

export const authSchemas = {
  login: z.object({
    email: z.string().trim().email('Adresse email invalide'),
    password: z.string().min(1, 'Mot de passe requis'),
    totpCode: z.string().trim().optional()
  }),

  changePassword: z.object({
    currentPassword: z.string().min(1, 'Mot de passe actuel requis'),
    newPassword: z.string().min(8, 'Le nouveau mot de passe doit contenir au moins 8 caractères')
  }),

  verify2FA: z.object({
    code: z.string().trim().min(6, 'Le code TOTP doit comporter 6 chiffres').max(8)
  }),

  disable2FA: z.object({
    password: z.string().min(1, 'Mot de passe actuel requis')
  })
};

export const updateSchemas = {
  trigger: z.object({
    hostId: z.string().uuid('Identifiant hostId invalide (UUID attendu)'),
    autoRollback: z.boolean().optional().default(true)
  }),

  batch: z.object({
    hostIds: z.array(z.string().uuid('Chaque identifiant doit être un UUID valide')).min(1, 'Au moins un hôte requis').max(100, 'Maximum 100 hôtes par lot'),
    autoRollback: z.boolean().optional().default(true),
    stopOnError: z.boolean().optional().default(true)
  }),

  rollback: z.object({
    hostId: z.string().uuid('Identifiant hostId invalide (UUID attendu)'),
    backupRecordId: z.string().uuid('Identifiant backupRecordId invalide (UUID attendu)')
  })
};

export const vaultSchemas = {
  rotate: z.object({
    hostId: z.string().uuid('Identifiant hostId invalide (UUID attendu)'),
    credentials: z.record(z.any()).refine(obj => Object.keys(obj).length > 0, {
      message: 'Les identifiants ne peuvent pas être vides'
    })
  })
};
