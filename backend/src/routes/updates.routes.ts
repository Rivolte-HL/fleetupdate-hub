import { Router } from 'express';
import { UserRole } from '@prisma/client';
import { UpdatesController } from '../controllers/updates.controller.js';
import { authMiddleware } from '../middlewares/auth.middleware.js';
import { requireRole } from '../middlewares/rbac.middleware.js';
import { validateBody, updateSchemas } from '../middlewares/validation.middleware.js';

const router = Router();

router.use(authMiddleware);

router.get('/tasks', UpdatesController.listTasks);
router.get('/tasks/:id', UpdatesController.getTaskById);
router.post('/trigger', requireRole(UserRole.OPERATOR), validateBody(updateSchemas.trigger), UpdatesController.triggerUpdate);
router.post('/batch', requireRole(UserRole.OPERATOR), UpdatesController.triggerBatchUpdate);
router.post('/rollback', requireRole(UserRole.ADMIN), validateBody(updateSchemas.rollback), UpdatesController.manualRollback);

export default router;

