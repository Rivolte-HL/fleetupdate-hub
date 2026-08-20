import { Router } from 'express';
import { AdaptersController } from '../controllers/adapters.controller.js';
import { authMiddleware } from '../middlewares/auth.middleware.js';

const router = Router();

router.use(authMiddleware);

router.get('/', AdaptersController.list);
router.get('/:type', AdaptersController.getByType);

export default router;
