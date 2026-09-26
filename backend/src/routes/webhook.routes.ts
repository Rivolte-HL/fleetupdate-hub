import { Router } from 'express';
import { WebhookController } from '../controllers/webhook.controller.js';

const router = Router();

// Secure actionable webhook endpoint: POST only with secret token in headers
router.post('/action', WebhookController.handleActionWebhook);

export default router;
