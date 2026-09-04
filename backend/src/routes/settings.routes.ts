import { Router } from 'express';
import { SettingsController } from '../controllers/settings.controller.js';
import { authMiddleware } from '../middlewares/auth.middleware.js';
import { requireRole } from '../middlewares/rbac.middleware.js';
import { UserRole } from '@prisma/client';

const router = Router();

router.use(authMiddleware);
// Viewing notification channels is allowed for OPERATOR
router.get('/notifications', requireRole(UserRole.OPERATOR), SettingsController.getNotificationSettings);

// Modifying notification settings and testing outbound webhook channels is strictly restricted to ADMIN
router.put('/notifications', requireRole(UserRole.ADMIN), SettingsController.updateNotificationSettings);
router.post('/notifications/test', requireRole(UserRole.ADMIN), SettingsController.testNotificationChannel);

export default router;
