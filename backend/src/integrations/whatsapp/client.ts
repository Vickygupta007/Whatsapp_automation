import axios from 'axios';
import { config } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import { normalizePhone } from '../../utils/phoneNormalizer.js';

export interface SentMessageRecord {
  phone: string;
  message: string;
  timestamp: string;
  response: unknown;
  buttons?: Array<{ id: string; title: string }>;
}

export class WhatsAppClient {
  public static sentMessagesLog: SentMessageRecord[] = [];

  /**
   * Sends an outgoing WhatsApp text message to the specified recipient phone number.
   */
  public static async sendMessage(phone: string, text: string): Promise<{ success: boolean; data?: unknown }> {
    const normalized = normalizePhone(phone);
    const shouldUseMock =
      config.WHATSAPP_USE_MOCK ||
      !config.WHATSAPP_ACCESS_TOKEN ||
      config.WHATSAPP_ACCESS_TOKEN === 'your_whatsapp_permanent_access_token_here' ||
      process.env.NODE_ENV === 'test';

    if (shouldUseMock) {
      logger.info(`[MockWhatsAppClient] Outgoing WhatsApp message simulated for +${normalized}:`);
      console.log(`-------------------- WHATSAPP MESSAGE TO +${normalized} --------------------\n${text}\n--------------------------------------------------------------------------`);

      const record: SentMessageRecord = {
        phone: normalized,
        message: text,
        timestamp: new Date().toISOString(),
        response: { mock: true, recipient: normalized, status: 'delivered' },
      };
      this.sentMessagesLog.push(record);
      return { success: true, data: record.response };
    }

    if (text.length > 3900) {
      const lines = text.split('\n');
      const chunks: string[] = [];
      let currentChunk = '';

      for (const line of lines) {
        if ((currentChunk ? currentChunk + '\n' + line : line).length > 3800) {
          if (currentChunk) chunks.push(currentChunk);
          currentChunk = line;
        } else {
          currentChunk = currentChunk ? `${currentChunk}\n${line}` : line;
        }
      }
      if (currentChunk) chunks.push(currentChunk);

      let lastResult: { success: boolean; data?: unknown } = { success: true };
      for (const chunk of chunks) {
        lastResult = await this.sendMessage(phone, chunk);
      }
      return lastResult;
    }

    try {
      logger.info(`[WhatsAppClient] Dispatching WhatsApp message to +${normalized}`);
      const url = `${config.WHATSAPP_API_BASE_URL}/${config.WHATSAPP_PHONE_NUMBER_ID}/messages`;

      const payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: normalized,
        type: 'text',
        text: {
          preview_url: false,
          body: text,
        },
      };

      const response = await axios.post(url, payload, {
        headers: {
          Authorization: `Bearer ${config.WHATSAPP_ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      });

      this.sentMessagesLog.push({
        phone: normalized,
        message: text,
        timestamp: new Date().toISOString(),
        response: response.data,
      });

      return { success: true, data: response.data };
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        const metaError = err.response?.data?.error;
        const detailMsg = metaError
          ? `Meta API Error (${metaError.code || err.response?.status}): ${metaError.message}${metaError.error_subcode ? ` (subcode ${metaError.error_subcode})` : ''}`
          : err.message;
        logger.error(`[WhatsAppClient] Failed to send WhatsApp message: ${detailMsg}`, {
          status: err.response?.status,
          data: err.response?.data,
        });
        const customErr = new Error(detailMsg);
        (customErr as any).response = err.response;
        throw customErr;
      } else {
        logger.error(`[WhatsAppClient] Unexpected error sending WhatsApp message: ${String(err)}`);
      }
      throw err;
    }
  }

  /**
   * Sends an outgoing WhatsApp interactive message with quick reply buttons.
   * Gracefully falls back to standard text message if buttons fail or are unsupported.
   */
  public static async sendInteractiveButtons(
    phone: string,
    bodyText: string,
    buttons: Array<{ id: string; title: string }>,
    headerText = '👓 Prescription Verification',
    footerText = 'Rio Digital Lenses'
  ): Promise<{ success: boolean; data?: unknown }> {
    const normalized = normalizePhone(phone);
    const shouldUseMock =
      config.WHATSAPP_USE_MOCK ||
      !config.WHATSAPP_ACCESS_TOKEN ||
      config.WHATSAPP_ACCESS_TOKEN === 'your_whatsapp_permanent_access_token_here' ||
      process.env.NODE_ENV === 'test';

    if (shouldUseMock) {
      logger.info(`[MockWhatsAppClient] Outgoing WhatsApp interactive buttons simulated for +${normalized}:`);
      console.log(
        `-------------------- WHATSAPP BUTTONS TO +${normalized} --------------------\n${headerText ? `*${headerText}*\n` : ''}${bodyText}\n${footerText ? `_${footerText}_\n` : ''}${buttons.map(b => `[ ${b.title} ]`).join(' ')}\n--------------------------------------------------------------------------`
      );

      const record: SentMessageRecord = {
        phone: normalized,
        message: `${bodyText}\nButtons: ${buttons.map(b => b.title).join(' | ')}`,
        timestamp: new Date().toISOString(),
        response: { mock: true, recipient: normalized, status: 'delivered', interactive: true },
        buttons,
      };
      this.sentMessagesLog.push(record);
      return { success: true, data: record.response };
    }

    try {
      logger.info(`[WhatsAppClient] Dispatching WhatsApp interactive buttons to +${normalized}`);
      const url = `${config.WHATSAPP_API_BASE_URL}/${config.WHATSAPP_PHONE_NUMBER_ID}/messages`;

      const payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: normalized,
        type: 'interactive',
        interactive: {
          type: 'button',
          header: headerText ? { type: 'text', text: headerText } : undefined,
          body: { text: bodyText },
          footer: footerText ? { text: footerText } : undefined,
          action: {
            buttons: buttons.slice(0, 3).map((b) => ({
              type: 'reply',
              reply: {
                id: b.id,
                title: b.title.slice(0, 20),
              },
            })),
          },
        },
      };

      const response = await axios.post(url, payload, {
        headers: {
          Authorization: `Bearer ${config.WHATSAPP_ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      });

      this.sentMessagesLog.push({
        phone: normalized,
        message: `${bodyText}\nButtons: ${buttons.map((b) => b.title).join(' | ')}`,
        timestamp: new Date().toISOString(),
        response: response.data,
      });

      return { success: true, data: response.data };
    } catch (err: unknown) {
      logger.warn(`[WhatsAppClient] Interactive buttons dispatch failed, falling back to standard text: ${String(err)}`);
      const fallbackText = `${bodyText}\n\n👉 Reply *CONFIRM* to place this order, or reply *EDIT* to modify details.`;
      return this.sendMessage(phone, fallbackText);
    }
  }

  /**
   * Sends an outgoing WhatsApp interactive list message (supports up to 10 selectable items).
   * Used for selecting from customer's full order list.
   */
  public static async sendInteractiveList(
    phone: string,
    bodyText: string,
    buttonText: string,
    sections: Array<{
      title: string;
      rows: Array<{
        id: string;
        title: string;
        description?: string;
      }>;
    }>,
    headerText = '📦 Rio Order Tracking',
    footerText = 'Rio Digital Lenses'
  ): Promise<{ success: boolean; data?: unknown }> {
    const normalized = normalizePhone(phone);
    const shouldUseMock =
      config.WHATSAPP_USE_MOCK ||
      !config.WHATSAPP_ACCESS_TOKEN ||
      config.WHATSAPP_ACCESS_TOKEN === 'your_whatsapp_permanent_access_token_here' ||
      process.env.NODE_ENV === 'test';

    const allRows = sections.flatMap((s) => s.rows);

    if (shouldUseMock) {
      logger.info(`[MockWhatsAppClient] Outgoing WhatsApp interactive list simulated for +${normalized}:`);
      console.log(
        `-------------------- WHATSAPP LIST TO +${normalized} --------------------\n${headerText ? `*${headerText}*\n` : ''}${bodyText}\n${footerText ? `_${footerText}_\n` : ''}Button: [ ${buttonText} ]\nOptions:\n${allRows.map((r) => `  • [${r.id}] ${r.title}${r.description ? ` (${r.description})` : ''}`).join('\n')}\n--------------------------------------------------------------------------`
      );

      const record: SentMessageRecord = {
        phone: normalized,
        message: `${bodyText}\nList: ${allRows.map((r) => r.title).join(' | ')}`,
        timestamp: new Date().toISOString(),
        response: { mock: true, recipient: normalized, status: 'delivered', interactive: true },
      };
      this.sentMessagesLog.push(record);
      return { success: true, data: record.response };
    }

    try {
      logger.info(`[WhatsAppClient] Dispatching WhatsApp interactive list to +${normalized}`);
      const url = `${config.WHATSAPP_API_BASE_URL}/${config.WHATSAPP_PHONE_NUMBER_ID}/messages`;

      const payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: normalized,
        type: 'interactive',
        interactive: {
          type: 'list',
          header: headerText ? { type: 'text', text: headerText } : undefined,
          body: { text: bodyText },
          footer: footerText ? { text: footerText } : undefined,
          action: {
            button: buttonText.slice(0, 20),
            sections: sections.map((sec) => ({
              title: sec.title.slice(0, 24),
              rows: sec.rows.slice(0, 10).map((r) => ({
                id: r.id.slice(0, 200),
                title: r.title.slice(0, 24),
                description: r.description ? r.description.slice(0, 72) : undefined,
              })),
            })),
          },
        },
      };

      const response = await axios.post(url, payload, {
        headers: {
          Authorization: `Bearer ${config.WHATSAPP_ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      });

      this.sentMessagesLog.push({
        phone: normalized,
        message: `${bodyText}\nList: ${allRows.map((r) => r.title).join(' | ')}`,
        timestamp: new Date().toISOString(),
        response: response.data,
      });

      return { success: true, data: response.data };
    } catch (err: unknown) {
      logger.warn(`[WhatsAppClient] Interactive list dispatch failed, falling back to standard text: ${String(err)}`);
      return this.sendMessage(phone, bodyText);
    }
  }

  public static clearSentLog(): void {
    this.sentMessagesLog = [];
  }

  /**
   * Downloads a media file (image/document) from Meta WhatsApp Cloud API by mediaId.
   */
  public static async downloadMedia(mediaId: string): Promise<{ buffer: Buffer; mimeType: string }> {
    const shouldUseMock =
      config.WHATSAPP_USE_MOCK ||
      !config.WHATSAPP_ACCESS_TOKEN ||
      config.WHATSAPP_ACCESS_TOKEN === 'your_whatsapp_permanent_access_token_here' ||
      process.env.NODE_ENV === 'test' ||
      mediaId.startsWith('mock_') ||
      mediaId.startsWith('sim_');

    if (shouldUseMock) {
      logger.info(`[WhatsAppClient] Mock downloadMedia returning dummy image for mediaId: ${mediaId}`);
      return {
        buffer: Buffer.from('mock_image_bytes'),
        mimeType: 'image/jpeg',
      };
    }

    try {
      logger.info(`[WhatsAppClient] Fetching media metadata for mediaId: ${mediaId}`);
      const metaRes = await axios.get(`${config.WHATSAPP_API_BASE_URL}/${mediaId}`, {
        headers: {
          Authorization: `Bearer ${config.WHATSAPP_ACCESS_TOKEN}`,
        },
        timeout: 10000,
      });

      const mediaUrl = metaRes.data?.url;
      const mimeType = metaRes.data?.mime_type || 'image/jpeg';

      if (!mediaUrl) {
        throw new Error(`Meta API returned no media URL for mediaId: ${mediaId}`);
      }

      logger.info(`[WhatsAppClient] Downloading media binary from: ${mediaUrl}`);
      const fileRes = await axios.get(mediaUrl, {
        headers: {
          Authorization: `Bearer ${config.WHATSAPP_ACCESS_TOKEN}`,
        },
        responseType: 'arraybuffer',
        timeout: 20000,
      });

      return {
        buffer: Buffer.from(fileRes.data),
        mimeType,
      };
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        logger.error(`[WhatsAppClient] Media download failed: ${err.message}`, {
          status: err.response?.status,
          data: err.response?.data,
        });
      } else {
        logger.error(`[WhatsAppClient] Unexpected error downloading media: ${String(err)}`);
      }
      throw err;
    }
  }
}
