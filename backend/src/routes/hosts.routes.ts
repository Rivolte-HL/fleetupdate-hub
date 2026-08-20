import { Router } from 'express';
import { UserRole } from '@prisma/client';
import { HostsController } from '../controllers/hosts.controller.js';
import { authMiddleware } from '../middlewares/auth.middleware.js';
import { requireRole } from '../middlewares/rbac.middleware.js';
import { validateBody, hostSchemas } from '../middlewares/validation.middleware.js';

const router = Router();

router.use(authMiddleware);

router.get('/', HostsController.list);
router.post('/refresh-all', requireRole(UserRole.OPERATOR), HostsController.refreshAll);
router.get('/:id', HostsController.getById);
router.post('/', requireRole(UserRole.OPERATOR), validateBody(hostSchemas.create), HostsController.create);
router.put('/:id', requireRole(UserRole.OPERATOR), validateBody(hostSchemas.update), HostsController.update);
router.delete('/:id', requireRole(UserRole.ADMIN), HostsController.delete);

router.post('/:id/refresh', requireRole(UserRole.OPERATOR), HostsController.refreshVersion);
router.get('/:id/changelog', HostsController.getChangelog);

export default router;
