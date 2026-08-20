import { Router } from 'express';
import { SettingsController } from '../controllers/settings.controller.js';
import { authMiddleware } from '../middlewares/auth.middleware.js';
import { requireRole } from '../middlewares/rbac.middleware.js';
import { UserRole } from '@prisma/client';

const router = Router();

router.use(authMiddleware);
router.use(requireRole(UserRole.OPERATOR));

router.get('/notifications', SettingsController.getNotificationSettings);
router.put('/notifications', SettingsController.updateNotificationSettings);
router.post('/notifications/test', SettingsController.testNotificationChannel);

export default router;
