import { Router } from 'express';
import { WebhookController } from '../controllers/webhookController.js';

const router = Router();

// Meta WhatsApp Webhook endpoints
router.get('/whatsapp-cloud-inbound', WebhookController.verifyWebhook);
router.post('/whatsapp-cloud-inbound', WebhookController.handleIncomingWebhook);

// Also accept /webhook path in case configured in Meta Portal
router.get('/webhook', WebhookController.verifyWebhook);
router.post('/webhook', WebhookController.handleIncomingWebhook);

export default router;
