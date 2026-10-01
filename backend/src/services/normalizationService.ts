import { MetaIncomingMessage, MetaWebhookPayload, NormalizedMessage } from '../types/webhook.js';
import { normalizePhone } from '../utils/phoneNormalizer.js';
import { config } from '../config/env.js';
import { StoreRegistry } from '../config/stores.js';
import { logger } from '../utils/logger.js';

export class NormalizationService {
  /**
   * Extracts and normalizes incoming messages from Meta WhatsApp webhook payload.
   * Can return an array of normalized messages (usually 1 per webhook event).
   */
  public static extractAndNormalize(payload: MetaWebhookPayload): NormalizedMessage[] {
    const results: NormalizedMessage[] = [];

    if (!payload || !payload.entry || !Array.isArray(payload.entry)) {
      return results;
    }

    for (const entry of payload.entry) {
      if (!entry.changes || !Array.isArray(entry.changes)) continue;

      for (const change of entry.changes) {
        const value = change.value;
        if (!value || !value.messages || !Array.isArray(value.messages)) continue;

        // Filter: Ignore incoming messages directed to the old WhatsApp phone number
        const targetPhoneId = value.metadata?.phone_number_id;
        const targetDisplay = value.metadata?.display_phone_number;

        // Explicitly block the old phone number (1225478070642817 / 919619981755)
        if (targetPhoneId === '1225478070642817' || targetDisplay === '919619981755') {
          logger.info(
            `[NormalizationService] Ignoring incoming message for old WhatsApp number: ${targetPhoneId} (${targetDisplay})`
          );
          continue;
        }

        // Accept message if it belongs to any registered store or the configured active number
        const isRegisteredNumber =
          StoreRegistry.isKnownPhoneNumberId(targetPhoneId) ||
          targetPhoneId === config.WHATSAPP_PHONE_NUMBER_ID;

        if (process.env.NODE_ENV !== 'test' && targetPhoneId && !isRegisteredNumber) {
          logger.info(
            `[NormalizationService] Ignoring message for non-registered phone number ID: ${targetPhoneId}`
          );
          continue;
        }

        // Extract contacts map for customer name lookup
        const contactMap = new Map<string, string>();
        if (value.contacts && Array.isArray(value.contacts)) {
          for (const contact of value.contacts) {
            if (contact.wa_id && contact.profile?.name) {
              contactMap.set(contact.wa_id, contact.profile.name);
            }
          }
        }

        for (const msg of value.messages) {
          const normalized = this.normalizeSingleMessage(
            msg,
            contactMap,
            payload as unknown as Record<string, unknown>,
            targetPhoneId,
            targetDisplay
          );
          if (normalized) {
            results.push(normalized);
          }
        }
      }
    }

    return results;
  }

  /**
   * Normalizes a single Meta incoming message object.
   */
  public static normalizeSingleMessage(
    msg: MetaIncomingMessage,
    contactsMap?: Map<string, string>,
    rawPayload: Record<string, unknown> = {},
    recipientPhoneNumberId?: string | null,
    displayPhoneNumber?: string | null
  ): NormalizedMessage | null {
    if (!msg || !msg.id || !msg.from) {
      return null;
    }

    const rawPhone = msg.from;
    const phone = normalizePhone(rawPhone);
    const messageId = msg.id;
    const messageType = msg.type || 'text';
    const customerName = contactsMap?.get(rawPhone) || contactsMap?.get(phone) || null;

    let text: string | null = null;
    let mediaId: string | null = null;

    switch (messageType) {
      case 'text':
        text = msg.text?.body?.trim() || null;
        break;
      case 'image':
        mediaId = msg.image?.id || null;
        text = msg.image?.caption?.trim() || null;
        break;
      case 'document':
        mediaId = msg.document?.id || null;
        text = msg.document?.caption?.trim() || null;
        break;
      case 'audio':
        mediaId = msg.audio?.id || null;
        break;
      case 'video':
        mediaId = msg.video?.id || null;
        text = msg.video?.caption?.trim() || null;
        break;
      case 'interactive':
        text =
          msg.interactive?.button_reply?.id ||
          msg.interactive?.button_reply?.title ||
          msg.interactive?.list_reply?.id ||
          msg.interactive?.list_reply?.title ||
          null;
        break;
      case 'button':
        text = msg.button?.text || msg.button?.payload || null;
        break;
      default:
        // Other types (location, sticker)
        text = null;
        break;
    }

    return {
      phone,
      customerName,
      messageId,
      messageType,
      text,
      mediaId,
      recipientPhoneNumberId: recipientPhoneNumberId || null,
      displayPhoneNumber: displayPhoneNumber || null,
      rawPayload,
    };
  }
}
