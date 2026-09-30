import { Request, Response } from 'express';
import { config } from '../config/env.js';
import { AppRepository } from '../database/repository.js';
import { NormalizationService } from '../services/normalizationService.js';
import { WorkflowService } from '../services/workflowService.js';
import { MetaWebhookPayload } from '../types/webhook.js';
import { logger } from '../utils/logger.js';
import { webhookPayloadSchema, webhookVerificationQuerySchema } from '../validators/webhookValidator.js';

const workflowService = new WorkflowService();

export class WebhookController {
  /**
   * GET /whatsapp-cloud-inbound
   * Meta Webhook Verification endpoint
   */
  public static verifyWebhook(req: Request, res: Response): void {
    const parseResult = webhookVerificationQuerySchema.safeParse(req.query);

    if (!parseResult.success) {
      logger.warn('[WebhookController] Invalid webhook verification query parameters');
      res.status(400).send('Invalid query parameters');
      return;
    }

    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === config.WHATSAPP_VERIFY_TOKEN) {
      logger.info('[WebhookController] Meta webhook verified successfully');
      res.status(200).send(challenge);
      return;
    }

    logger.warn('[WebhookController] Webhook verification failed. Token mismatch or invalid mode.');
    res.status(403).send('Forbidden: Verification token mismatch');
  }

  /**
   * POST /whatsapp-cloud-inbound
   * Receives incoming WhatsApp messages from Meta Cloud API
   */
  public static async handleIncomingWebhook(req: Request, res: Response): Promise<void> {
    // 1. Fast HTTP 200 response to acknowledge receipt to Meta Cloud API within 3 seconds
    res.status(200).json({ status: 'EVENT_RECEIVED' });

    try {
      const body = req.body as MetaWebhookPayload;

      // Validate body structure
      const parsed = webhookPayloadSchema.safeParse(body);
      if (!parsed.success) {
        logger.warn('[WebhookController] Received malformed webhook payload', parsed.error);
        return;
      }

      // Check if it's a whatsapp_business_account event
      if (body.object !== 'whatsapp_business_account') {
        logger.debug(`[WebhookController] Ignoring non-whatsapp payload object: ${body.object}`);
        return;
      }

      // 2. Extract and normalize messages
      const normalizedMessages = NormalizationService.extractAndNormalize(body);

      if (normalizedMessages.length === 0) {
        logger.debug('[WebhookController] Webhook payload contained no actionable user messages (e.g. status updates)');
        return;
      }

      // 3. Process each incoming message through the workflow
      for (const msg of normalizedMessages) {
        await AppRepository.saveWebhookEvent(msg.messageId, 'whatsapp_inbound', body as unknown as Record<string, unknown>);
        // Process pipeline
        workflowService.processNormalizedMessage(msg).catch((err) => {
          logger.error(`[WebhookController] Unhandled error processing message ${msg.messageId}: ${String(err)}`);
        });
      }
    } catch (err: unknown) {
      logger.error(`[WebhookController] Error handling incoming webhook: ${String(err)}`);
    }
  }
}
