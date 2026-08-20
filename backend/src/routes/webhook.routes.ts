import { Router } from 'express';
import { WebhookController } from '../controllers/webhook.controller.js';

const router = Router();

// Public webhook endpoint authenticated via Secret Token query or header
router.post('/action', WebhookController.handleActionWebhook);
router.get('/action', WebhookController.handleActionWebhook);

export default router;
