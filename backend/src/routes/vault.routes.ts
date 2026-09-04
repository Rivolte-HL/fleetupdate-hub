import { Router } from 'express';
import { UserRole } from '@prisma/client';
import { VaultController } from '../controllers/vault.controller.js';
import { authMiddleware } from '../middlewares/auth.middleware.js';
import { requireRole } from '../middlewares/rbac.middleware.js';
import { validateBody, vaultSchemas } from '../middlewares/validation.middleware.js';

const router = Router();

router.use(authMiddleware);

router.get('/', requireRole(UserRole.ADMIN), VaultController.list);
router.post('/rotate', requireRole(UserRole.ADMIN), validateBody(vaultSchemas.rotate), VaultController.rotateSecret);

export default router;
