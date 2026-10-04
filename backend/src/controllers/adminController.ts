import { Request, Response } from 'express';
import { AppRepository } from '../database/repository.js';
import { WorkflowService } from '../services/workflowService.js';
import { StoreRegistry } from '../config/stores.js';
import { ProcessingStatus } from '../types/pipeline.js';
import { NormalizedMessage } from '../types/webhook.js';
import { logger } from '../utils/logger.js';
import { normalizePhone } from '../utils/phoneNormalizer.js';

const workflowService = new WorkflowService();

export class AdminController {
  /**
   * GET /api/admin/metrics
   */
  public static async getMetrics(_req: Request, res: Response): Promise<void> {
    try {
      const metrics = await AppRepository.getMetrics();
      res.json(metrics);
    } catch (err: unknown) {
      logger.error(`[AdminController] Error fetching metrics: ${String(err)}`);
      res.status(500).json({ error: 'Failed to fetch metrics' });
    }
  }

  /**
   * GET /api/admin/messages
   */
  public static async getMessages(req: Request, res: Response): Promise<void> {
    try {
      const limit = Math.min(100, parseInt(req.query.limit as string, 10) || 50);
      const offset = parseInt(req.query.offset as string, 10) || 0;
      const status = req.query.status as ProcessingStatus | undefined;
      const category = req.query.category as string | undefined;

      const result = await AppRepository.getMessages(limit, offset, status, category);

      // Enrich each message item with its originating website/store name
      const enrichedItems = result.items.map((item) => {
        const payload = item.rawPayload as Record<string, unknown> | undefined;
        let website = (payload?.storeName as string) || '';
        if (!website) {
          const recipientId =
            (payload?.recipientPhoneNumberId as string) ||
            ((payload as any)?.entry?.[0]?.changes?.[0]?.value?.metadata?.phone_number_id as string);
          website = StoreRegistry.getStoreByPhoneNumberId(recipientId)?.name || 'Rio Digital Lenses';
        }
        return {
          ...item,
          website,
        };
      });

      res.json({
        ...result,
        items: enrichedItems,
      });
    } catch (err: unknown) {
      logger.error(`[AdminController] Error fetching messages: ${String(err)}`);
      res.status(500).json({ error: 'Failed to fetch messages' });
    }
  }

  /**
   * GET /api/admin/stores
   * Returns list of configured stores / websites
   */
  public static async getStores(req: Request, res: Response): Promise<void> {
    try {
      const stores = StoreRegistry.getAllStores().map((s) => ({
        id: s.id,
        name: s.name,
        whatsappPhoneNumberId: s.whatsappPhoneNumberId,
        whatsappDisplayPhone: s.whatsappDisplayPhone,
        websiteUrl: s.websiteUrl,
      }));
      res.json(stores);
    } catch (err: unknown) {
      logger.error(`[AdminController] Error fetching stores: ${String(err)}`);
      res.status(500).json({ error: 'Failed to fetch stores' });
    }
  }

  /**
   * GET /api/admin/orders
   */
  public static async getOrders(req: Request, res: Response): Promise<void> {
    try {
      const limit = Math.min(100, parseInt(req.query.limit as string, 10) || 50);
      const offset = parseInt(req.query.offset as string, 10) || 0;

      const result = await AppRepository.getOrders(limit, offset);
      const enrichedItems = result.items.map((order) => {
        let website = '';
        const payload = order.erpRequestPayload as Record<string, unknown> | undefined;
        if (payload?.storeName) website = String(payload.storeName);
        else if (payload?.storeId) website = StoreRegistry.getStoreById(String(payload.storeId))?.name || '';
        return {
          ...order,
          website: website || 'Rio Optical',
        };
      });

      res.json({
        ...result,
        items: enrichedItems,
      });
    } catch (err: unknown) {
      logger.error(`[AdminController] Error fetching orders: ${String(err)}`);
      res.status(500).json({ error: 'Failed to fetch orders' });
    }
  }

  /**
   * GET /api/admin/messages/:messageId/details
   * Used for the step-by-step visual execution flow
   */
  public static async getMessageDetails(req: Request, res: Response): Promise<void> {
    try {
      const messageId = String(req.params.messageId);
      const details = await AppRepository.getMessageDetails(messageId);

      if (!details.message) {
        res.status(404).json({ error: 'Message not found' });
        return;
      }

      res.json(details);
    } catch (err: unknown) {
      logger.error(`[AdminController] Error fetching message details: ${String(err)}`);
      res.status(500).json({ error: 'Failed to fetch message details' });
    }
  }

  /**
   * POST /api/admin/simulate
   * Injects a simulated WhatsApp message and runs the complete workflow pipeline,
   * returning the full execution trace immediately to the dashboard.
   */
  public static async simulateMessage(req: Request, res: Response): Promise<void> {
    try {
      const { phone, text, customerName, messageType, mediaId } = req.body;

      if (!phone || (!text && messageType !== 'image')) {
        res.status(400).json({ error: 'Phone and text (or image) are required to simulate a message' });
        return;
      }

      const normalizedPhone = normalizePhone(phone);
      const messageId = `wamid.HBgL${Date.now()}${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

      const normalizedMsg: NormalizedMessage = {
        phone: normalizedPhone,
        customerName: customerName || null,
        messageId,
        messageType: messageType || 'text',
        text: text ? String(text).trim() : null,
        mediaId: mediaId || (messageType === 'image' ? 'sim_image_prescription_01' : null),
        rawPayload: {
          simulated: true,
          phone: normalizedPhone,
          text,
          messageType: messageType || 'text',
          timestamp: new Date().toISOString(),
        },
      };

      const result = await workflowService.processNormalizedMessage(normalizedMsg);
      const details = await AppRepository.getMessageDetails(messageId);

      res.json({
        result,
        details,
      });
    } catch (err: unknown) {
      logger.error(`[AdminController] Error during message simulation: ${String(err)}`);
      res.status(500).json({ error: 'Simulation failed', message: String(err) });
    }
  }
}
