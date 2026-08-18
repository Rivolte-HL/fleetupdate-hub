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
 * Schémas de validation déclaratifs pour l'ensemble des endpoints API
 */
export const hostSchemas = {
  create: z.object({
    name: z.string().trim().min(1, 'Le nom de l’hôte est obligatoire').max(100),
    description: z.string().trim().max(500).optional(),
    adapterType: z.nativeEnum(HostType, {
      errorMap: () => ({ message: 'Type d’adaptateur invalide ou non supporté' })
    }),
    endpointUrl: z.string().trim().min(1, 'L’endpoint URL est obligatoire'),
    port: z.union([z.number().int().min(1).max(65535), z.string().regex(/^\d+$/).transform(Number)]).optional(),
    metadata: z.record(z.any()).optional().default({}),
    credentials: z.record(z.any()).optional()
  }),

  update: z.object({
    name: z.string().trim().min(1).max(100).optional(),
    description: z.string().trim().max(500).optional(),
    endpointUrl: z.string().trim().min(1).optional(),
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
