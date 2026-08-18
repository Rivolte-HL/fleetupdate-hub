import { Router } from 'express';
import { UserRole } from '@prisma/client';
import { AuditController } from '../controllers/audit.controller.js';
import { authMiddleware } from '../middlewares/auth.middleware.js';
import { requireRole } from '../middlewares/rbac.middleware.js';

const router = Router();

router.use(authMiddleware);
router.get('/', requireRole(UserRole.ADMIN), AuditController.list);

export default router;
