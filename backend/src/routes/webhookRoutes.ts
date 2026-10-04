import { Router } from 'express';
import { WebhookController } from '../controllers/webhookController.js';

const router = Router();

// 1. Store-specific webhook endpoints (Option 2): e.g. /webhook/arco, /webhook/rio, /whatsapp-cloud-inbound/arco
router.get('/whatsapp-cloud-inbound/:storeId', WebhookController.verifyWebhook);
router.post('/whatsapp-cloud-inbound/:storeId', WebhookController.handleIncomingWebhook);

router.get('/webhook/:storeId', WebhookController.verifyWebhook);
router.post('/webhook/:storeId', WebhookController.handleIncomingWebhook);

// 2. Global default webhook endpoints (Option 1 backwards-compatible)
router.get('/whatsapp-cloud-inbound', WebhookController.verifyWebhook);
router.post('/whatsapp-cloud-inbound', WebhookController.handleIncomingWebhook);

router.get('/webhook', WebhookController.verifyWebhook);
router.post('/webhook', WebhookController.handleIncomingWebhook);

export default router;
