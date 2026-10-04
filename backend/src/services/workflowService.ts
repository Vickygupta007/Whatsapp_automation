import { AppRepository, StoredOrder } from '../database/repository.js';
import { ErpAdapterFactory, RioErpAdapter } from '../integrations/rio-erp/adapter.js';
import { RioErpMapper } from '../integrations/rio-erp/mappers.js';
import { WhatsAppClient } from '../integrations/whatsapp/client.js';
import { StoreRegistry } from '../config/stores.js';
import { OrderParser } from '../parsers/orderParser.js';
import { ClassifierService, extractTargetOrderId } from './classifierService.js';
import { ImageOcrService } from './imageOcrService.js';
import { DeliveryTaskData, IRioErpClient } from '../types/erp.js';
import { ParsedOrder } from '../types/optical.js';
import { ProcessingStatus, StepLogRecord, WorkflowExecutionResult } from '../types/pipeline.js';
import { NormalizedMessage } from '../types/webhook.js';
import { logger } from '../utils/logger.js';
import { PendingOrderService } from './pendingOrderService.js';
import { RecentOrdersSessionService } from './recentOrdersSessionService.js';
import { formatDateTimeIST } from '../utils/dateFormatter.js';

/**
 * Strict store isolation helper: determines whether an order belongs to the target store.
 * Prevents orders from one store (e.g. Rio ERP with AHM-, SUR-, SO-, etc.) from leaking
 * into another store (e.g. ARCO optics with S(26-27)#... format), and vice versa.
 */
export function isOrderBelongingToStore(
  order: { erpOrderId?: string | null; storeId?: string | null; erpResponsePayload?: unknown },
  targetStoreId: string
): boolean {
  const target = (targetStoreId || '').trim().toLowerCase();
  const orderStoreId = (order.storeId || '').trim().toLowerCase();
  const rawId = (order.erpOrderId || '').trim();
  const upperId = rawId.toUpperCase();

  // 1. Explicit storeId on the order
  if (orderStoreId) {
    return orderStoreId === target;
  }

  // 2. Check erpResponsePayload metadata if available
  const resPayload = order.erpResponsePayload as any;
  if (resPayload) {
    const compName = (
      resPayload.order?.initialCompanyName ||
      resPayload.party?.companyName ||
      resPayload.initialCompanyName ||
      resPayload.companyName ||
      ''
    ).toString().toLowerCase();
    const labLoc = (
      resPayload.order?.labLocation ||
      resPayload.labLocation ||
      ''
    ).toString().toLowerCase();

    if (compName.includes('rio') || labLoc.includes('rio')) {
      return target === 'rio';
    }
    if (compName.includes('arco') || labLoc.includes('arco')) {
      return target === 'arco';
    }
  }

  // 3. Known signatures
  // Rio ERP signatures:
  // - Direct order IDs: SO-*, ORD-RIO-*, RIO-*
  // - Lab prefix orders: AHM-*-*, SUR-*-*, MUM-*-*, PUN-*-*, DEL-*-*, RAJ-*-* or any ^[A-Z]{3}-\d+-\d+$ pattern
  // - Any ID containing RIO
  const isRioSignature =
    upperId.startsWith('SO-') ||
    upperId.startsWith('ORD-RIO') ||
    upperId.startsWith('RIO-') ||
    upperId.startsWith('AHM-') ||
    upperId.startsWith('SUR-') ||
    upperId.startsWith('MUM-') ||
    upperId.startsWith('PUN-') ||
    upperId.startsWith('DEL-') ||
    upperId.startsWith('RAJ-') ||
    /^[A-Z]{3}-\d+-\d+$/.test(upperId) ||
    upperId.includes('RIO');

  // ARCO signatures:
  // - S(26-27)#...
  // - ARCO-...
  // - S-...
  // - Any ID containing ARCO
  const isArcoSignature =
    upperId.startsWith('S(') ||
    upperId.startsWith('ARCO-') ||
    upperId.startsWith('S-') ||
    upperId.includes('ARCO');

  if (target === 'arco') {
    if (isRioSignature) return false;
    return isArcoSignature;
  }

  if (target === 'rio') {
    if (isArcoSignature) return false;
    if (isRioSignature) return true;
    // Default legacy orders without explicit ARCO prefix to Rio
    return true;
  }

  // Future stores: if storeId is missing, reject if it has Rio or Arco signatures
  if (isRioSignature || isArcoSignature) return false;

  return false;
}

export class WorkflowService {
  private erpAdapter: IRioErpClient;
  private hasCustomClient: boolean;

  constructor(customErpClient?: IRioErpClient) {
    this.erpAdapter = customErpClient || new RioErpAdapter();
    this.hasCustomClient = !!customErpClient;
  }

  /**
   * Executes the WhatsApp Auto-Reply workflow for a normalized incoming message.
   *
   * Customer WhatsApp Message
   *         ↓
   * Meta WhatsApp Webhook (Stage 1: Webhook Received)
   *         ↓
   * Extract Phone Number and Message (Stage 2: Message Normalized)
   *         ↓
   * Identify Message Type (Stage 3: Message Classified)
   *         ↓
   * Select Appropriate Reply (Stage 4: Reply Selected)
   *         ↓
   * Send WhatsApp Reply (Stage 5: WhatsApp Reply Sent)
   *         ↓
   * Complete
   */
  public async processNormalizedMessage(msg: NormalizedMessage): Promise<WorkflowExecutionResult> {
    const logs: StepLogRecord[] = [];
    const { messageId, phone, customerName, text, messageType, rawPayload } = msg;

    logger.info(`[WorkflowService] Processing auto-reply workflow for messageId: ${messageId} (Phone: ${phone})`);

    const store = StoreRegistry.getStoreByPhoneNumberId(msg.recipientPhoneNumberId);
    const activeErp = this.hasCustomClient ? this.erpAdapter : ErpAdapterFactory.getAdapterForStore(store.id);
    const waOptions = {
      phoneNumberId: store.whatsappPhoneNumberId,
      accessToken: store.whatsappAccessToken,
    };

    const logStep = async (
      step: StepLogRecord['step'],
      status: StepLogRecord['status'],
      details?: Record<string, unknown>,
      errorType?: string,
      errorMessage?: string
    ) => {
      const record: StepLogRecord = {
        step,
        status,
        timestamp: new Date().toISOString(),
        details,
        errorType,
        errorMessage,
      };
      logs.push(record);
      await AppRepository.addProcessingLog({
        messageId,
        step,
        status,
        details,
        errorType,
        errorMessage,
      });
    };

    // Step 0: Check for duplicate message ID to prevent duplicate auto-replies
    const isDuplicate = await AppRepository.isMessageDuplicate(messageId);
    if (isDuplicate) {
      logger.warn(`[WorkflowService] Duplicate message detected: ${messageId}. Skipping duplicate reply.`);
      await AppRepository.addProcessingLog({
        messageId,
        step: 'WEBHOOK',
        status: 'SKIPPED',
        details: { reason: 'Duplicate message ID rejected' },
      });
      return {
        messageId,
        phone,
        status: 'DUPLICATE_IGNORED',
        logs,
      };
    }

    // Step 1: Webhook Received - Save initial message entry
    await AppRepository.createMessage({
      messageId,
      phone,
      customerName,
      messageType,
      textContent: text,
      mediaId: msg.mediaId,
      rawPayload: {
        ...(typeof rawPayload === 'object' && rawPayload !== null ? rawPayload : {}),
        storeId: store.id,
        storeName: store.name,
        recipientPhoneNumberId: msg.recipientPhoneNumberId,
        displayPhoneNumber: msg.displayPhoneNumber,
      },
      status: 'RECEIVED',
    });

    await logStep('WEBHOOK', 'SUCCESS', {
      messageId,
      phone,
      messageType,
      hasText: !!text,
      hasMedia: !!msg.mediaId,
    });

    // Step 2: Message Normalized
    await AppRepository.updateMessageStatus(messageId, 'NORMALIZED');
    await logStep('NORMALIZATION', 'SUCCESS', {
      phone,
      customerName,
      normalizedLength: text?.length || 0,
    });

    try {
      // Step 3: Check customer registration in Rio ERP (Party Lookup)
      let isCustomerRegistered = false;
      let customerId: string | undefined;
      let party: any;

      try {
        const customerLookup = await activeErp.findCustomerByPhone(phone);
        if (customerLookup.found && (customerLookup.party || customerLookup.customer)) {
          isCustomerRegistered = true;
          customerId = customerLookup.party?.accountId || customerLookup.customer?.id;
          party = customerLookup.party || {
            accountId: customerLookup.customer?.accountId || customerLookup.customer?.id || 'ACC',
            name: customerLookup.customer?.name || customerName || 'Registered Customer',
            labName: customerLookup.customer?.labName || `${store.name} Lab`,
          };
          await logStep('CUSTOMER_LOOKUP', 'SUCCESS', {
            phone,
            found: true,
            party,
          });
        } else {
          await logStep('CUSTOMER_LOOKUP', 'FAILED', {
            phone,
            found: false,
            reason: 'Party not registered in Rio ERP',
          });
        }
      } catch (lookupErr) {
        logger.warn(`[WorkflowService] Customer lookup check failed for ${phone}: ${String(lookupErr)}`);
        isCustomerRegistered = false;
        await logStep('CUSTOMER_LOOKUP', 'FAILED', {
          phone,
          found: false,
          error: String(lookupErr),
        });
      }

      // Step 4: Extract prescription from Image (if message is an image)
      let imageExtractedOrder: ParsedOrder | null = null;
      if (isCustomerRegistered && messageType === 'image') {
        try {
          let imageBuffer: Buffer = Buffer.from('');
          let mimeType = 'image/jpeg';

          if (msg.mediaId) {
            const media = await WhatsAppClient.downloadMedia(msg.mediaId);
            imageBuffer = media.buffer;
            mimeType = media.mimeType;
          }

          imageExtractedOrder = await ImageOcrService.extractPrescriptionFromImage(
            imageBuffer,
            mimeType,
            text,
            phone
          );

          if (imageExtractedOrder && imageExtractedOrder.isOrder) {
            await logStep('ORDER_PARSER', 'SUCCESS', {
              action: 'IMAGE_PRESCRIPTION_PARSED',
              mediaId: msg.mediaId,
              order: imageExtractedOrder.order,
            });
          }
        } catch (imgErr: unknown) {
          logger.error(`[WorkflowService] Image prescription processing error: ${String(imgErr)}`);
          await logStep('ORDER_PARSER', 'FAILED', {
            action: 'IMAGE_PRESCRIPTION_DOWNLOAD_OR_PARSE',
            mediaId: msg.mediaId,
            error: String(imgErr),
          });
        }
      }

      // Step 5: Message Classified
      let classification = ClassifierService.classify(text, isCustomerRegistered, phone, store.id);

      if (imageExtractedOrder && imageExtractedOrder.isOrder) {
        // Save pending draft order awaiting customer confirmation
        PendingOrderService.savePendingOrder({
          id: `draft_${Date.now()}`,
          phone,
          party,
          order: imageExtractedOrder.order,
          mediaId: msg.mediaId,
          messageId,
          createdAt: new Date(),
        });

        const rx = imageExtractedOrder.order.rx;
        const r = rx?.right || {};
        const l = rx?.left || {};
        const product = imageExtractedOrder.order.product;
        const coating = imageExtractedOrder.order.coating;
        const index = imageExtractedOrder.order.index;
        const lensType = imageExtractedOrder.order.lensType;
        const ref = imageExtractedOrder.order.customerRefNo;
        const rightAdd = r.addn && r.addn !== '0.00' ? `\n• ADD: *${r.addn}*` : '';
        const leftAdd = l.addn && l.addn !== '0.00' ? `\n• ADD: *${l.addn}*` : '';
        const dia = (imageExtractedOrder.order as any).dia;
        const tint = (imageExtractedOrder.order as any).tintColor;
        const fitting = (imageExtractedOrder.order as any).fittingType;
        const remarks = (imageExtractedOrder.order as any).remarks;

        const extraSpecsList = [
          dia ? `• Dia: *${dia}*` : '',
          tint && tint !== '__' ? `• Tint/Color: *${tint}*` : '',
          fitting && fitting !== '__' ? `• Fitting: *${fitting}*` : '',
          remarks && remarks !== '__' ? `• Remark: *${remarks}*` : '',
        ].filter(Boolean).join('\n');
        const extraSpecsSection = extraSpecsList ? `\n\n⚙️ *Specifications:*\n${extraSpecsList}` : '';

        const orderInfoLines = [
          ref ? `🔖 *Ref:* *${ref}*` : '',
          product ? `📦 *Product:* *${product}*` : '',
          lensType ? `📑 *Type:* *${lensType}*` : '',
          index ? `🔢 *Index:* *${index}*` : '',
          coating ? `✨ *Coating:* *${coating}*` : '',
        ].filter(Boolean).join('\n');
        const orderInfoSection = orderInfoLines ? `\n\n${orderInfoLines}` : '';

        const verificationText = `👓 *VERIFY PRESCRIPTION*

We scanned your prescription:${orderInfoSection}${extraSpecsSection}

👁️ *Right Eye (OD)*
• SPH: *${r.sph || '0.00'}*
• CYL: *${r.cyl || '0.00'}*
• AXIS: *${r.axis ?? 0}°*${rightAdd}

👁️ *Left Eye (OS)*
• SPH: *${l.sph || '0.00'}*
• CYL: *${l.cyl || '0.00'}*
• AXIS: *${l.axis ?? 0}°*${leftAdd}

👇 Please tap *Confirm* or *Edit* below:`;

        classification = {
          category: 'IMAGE_ORDER_VERIFICATION',
          replyText: verificationText,
          reason: 'Optical lens prescription extracted from image, awaiting customer confirmation or edit',
          orderDetails: {
            fromImage: true,
            customerRefNo: ref,
            product,
            coating,
            lensType,
            index,
            rx,
            requiresConfirmation: true,
          },
        };
      } else if (messageType === 'image' && isCustomerRegistered && !text) {
        classification = {
          category: 'INVALID_ORDER',
          replyText: `⚠️ *Could Not Read Prescription*

We received your image, but the prescription numbers (Sphere, Cylinder, Axis) were not clear enough to scan.

📷 *Quick Tips:*
• Keep the prescription slip flat and well-lit
• Avoid shadows or lens reflection
• Or type your order:
  *ORDER Ref: Sharma R: -1.50/-0.50x90 L: -2.00/-0.50x85 Bluecut 1.56*

💬 Reply *HELP* if you need lab assistance.`,
          reason: 'Could not extract optical prescription from image',
        };
      }

      await AppRepository.updateMessageReply(messageId, {
        category: classification.category,
        status: 'CLASSIFIED',
      });

      await logStep('CLASSIFICATION', 'SUCCESS', {
        category: classification.category,
        reason: classification.reason,
        detectedKeywords: classification.detectedKeywords,
        orderDetails: classification.orderDetails,
      });

      // Step 6: Process based on classification category
      let replyText = classification.replyText;
      let finalStatus: ProcessingStatus = 'REPLY_SENT';
      let sendError: string | undefined;
      let createdOrderId: string | undefined;
      let erpOrderId: string | undefined;
      let statusInteractiveButtons: Array<{ id: string; title: string }> | undefined = undefined;
      let statusInteractiveList:
        | {
            buttonText: string;
            sections: Array<{
              title: string;
              rows: Array<{ id: string; title: string; description?: string }>;
            }>;
          }
        | undefined = undefined;

      // Handle UNREGISTERED_CUSTOMER: Store-branded registration notification
      if (classification.category === 'UNREGISTERED_CUSTOMER') {
        replyText = `⚠️ *Account Not Registered*

Your WhatsApp number is not linked to an ${store.name} account.

Please contact your ${store.name} coordinator to activate your account.`;
        classification.replyText = replyText;
      }

      // Handle GREETING: Personalized welcome message with customer account and assigned lab details
      if (classification.category === 'GREETING') {
        const greetingName = customerName || party?.name || 'Customer';
        const accountName = party?.name || customerName || store.name;
        const accountId = party?.accountId || '1001';
        const labName = party?.labName || `${store.name} Lab`;

        replyText = `👋 Hello ${greetingName},
Welcome to ${store.name} 👓
🏢 Account: ${accountName} (${accountId})
🏭 Assigned Lab: ${labName}
How can we help you today?

1.📝 ORDER FORMAT — Text ordering guide
2.📦 STATUS — Check order progress
3.❓ HELP — Support & assistance
📸 Send Prescription Photo — Place an order`;
        classification.replyText = replyText;
      }

      // Handle VALID_ORDER: Stage draft order and request customer verification (same as image orders)
      if (isCustomerRegistered && classification.category === 'VALID_ORDER') {
        const parsedOrder = imageExtractedOrder || OrderParser.parse(text || '', phone);
        await logStep('ORDER_PARSER', 'SUCCESS', {
          phone,
          customerRefNo: parsedOrder.order.customerRefNo,
          product: parsedOrder.order.product,
          coating: parsedOrder.order.coating,
          index: parsedOrder.order.index,
          dia: parsedOrder.order.dia,
          tintColor: parsedOrder.order.tintColor,
          fittingType: parsedOrder.order.fittingType,
          remarks: parsedOrder.order.remarks,
          rx: parsedOrder.order.rx,
        });

        // Save pending draft order awaiting customer confirmation
        PendingOrderService.savePendingOrder({
          id: `draft_${Date.now()}`,
          phone,
          party,
          order: parsedOrder.order,
          rawText: text || '',
          messageId,
          createdAt: new Date(),
        });

        const rx = parsedOrder.order.rx;
        const r = rx?.right || {};
        const l = rx?.left || {};
        const product = parsedOrder.order.product;
        const coating = parsedOrder.order.coating;
        const index = parsedOrder.order.index;
        const lensType = parsedOrder.order.lensType;
        const ref = parsedOrder.order.customerRefNo;
        const rightAdd = r.addn && r.addn !== '0.00' ? `\n• ADD: *${r.addn}*` : '';
        const leftAdd = l.addn && l.addn !== '0.00' ? `\n• ADD: *${l.addn}*` : '';
        const dia = parsedOrder.order.dia;
        const tint = parsedOrder.order.tintColor;
        const fitting = parsedOrder.order.fittingType;
        const remarks = parsedOrder.order.remarks;

        const extraSpecsList = [
          dia ? `• Dia: *${dia}*` : '',
          tint && tint !== '__' ? `• Tint/Color: *${tint}*` : '',
          fitting && fitting !== '__' ? `• Fitting: *${fitting}*` : '',
          remarks && remarks !== '__' ? `• Remark: *${remarks}*` : '',
        ].filter(Boolean).join('\n');
        const extraSpecsSection = extraSpecsList ? `\n\n⚙️ *Specifications:*\n${extraSpecsList}` : '';

        const orderInfoLines = [
          ref ? `🔖 *Ref:* *${ref}*` : '',
          product ? `📦 *Product:* *${product}*` : '',
          lensType ? `📑 *Type:* *${lensType}*` : '',
          index ? `🔢 *Index:* *${index}*` : '',
          coating ? `✨ *Coating:* *${coating}*` : '',
        ].filter(Boolean).join('\n');
        const orderInfoSection = orderInfoLines ? `\n\n${orderInfoLines}` : '';

        const verificationText = `👓 *VERIFY ORDER DETAILS*

Please verify your order details:${orderInfoSection}${extraSpecsSection}

👁️ *Right Eye (OD)*
• SPH: *${r.sph || '0.00'}*
• CYL: *${r.cyl || '0.00'}*
• AXIS: *${r.axis ?? 0}°*${rightAdd}

👁️ *Left Eye (OS)*
• SPH: *${l.sph || '0.00'}*
• CYL: *${l.cyl || '0.00'}*
• AXIS: *${l.axis ?? 0}°*${leftAdd}

👇 Please tap *Confirm* or *Edit* below:`;

        classification = {
          category: 'ORDER_VERIFICATION',
          replyText: verificationText,
          reason: 'Optical lens order parsed from text, awaiting customer confirmation or edit',
          orderDetails: {
            fromText: true,
            customerRefNo: ref,
            product,
            coating,
            lensType,
            index,
            rx,
          },
        };

        replyText = verificationText;
      } else if (isCustomerRegistered && classification.category === 'CONFIRM_ORDER') {
        const pendingDraft = PendingOrderService.getPendingOrder(phone);
        if (pendingDraft) {
          const erpOrderReq = RioErpMapper.toErpOrderRequest(pendingDraft.order, pendingDraft.party || party);

          try {
            const erpResponse = await activeErp.createOrder(erpOrderReq);
            erpOrderId = erpResponse.orderId;

            const dbOrder = await AppRepository.createOrder({
              messageId,
              phone,
              customerRefNo: pendingDraft.order.customerRefNo,
              product: pendingDraft.order.product,
              lensType: pendingDraft.order.lensType,
              coating: pendingDraft.order.coating,
              index: pendingDraft.order.index,
              rxData: {
                ...pendingDraft.order.rx,
                dia: pendingDraft.order.dia || null,
                tintColor: pendingDraft.order.tintColor || null,
                fittingType: pendingDraft.order.fittingType || null,
                remarks: pendingDraft.order.remarks || null,
              },
              rawMessage: pendingDraft.rawText || (pendingDraft.mediaId ? `[CONFIRMED_IMAGE_ORDER] Ref: ${pendingDraft.order.customerRefNo}` : `[CONFIRMED_ORDER] Ref: ${pendingDraft.order.customerRefNo}`),
              status: 'ORDER_CREATED',
              storeId: store.id,
            });
            createdOrderId = dbOrder.id;

            await AppRepository.updateOrderWithErpResult(
              dbOrder.id,
              erpResponse.orderId,
              erpResponse.orderRef || '',
              'ORDER_CREATED',
              erpOrderReq,
              erpResponse
            );

            await logStep('ORDER_CREATION', 'SUCCESS', {
              orderId: dbOrder.id,
              erpOrderId: erpResponse.orderId,
              party: erpResponse.party || party,
            });

            PendingOrderService.removePendingOrder(phone);

            const accountName = erpResponse.party?.name || pendingDraft.party?.name || party?.name || 'Customer';
            const accountId = erpResponse.party?.accountId || pendingDraft.party?.accountId || party?.accountId || '100023';
            const labName = erpResponse.party?.labName || pendingDraft.party?.labName || party?.labName || `${store.name}-LAB`;
            const displayProduct = erpOrderReq.product || pendingDraft.order.product || '';
            const displayCoating = erpOrderReq.coating || pendingDraft.order.coating || '';
            const displayRef = erpOrderReq.customerRefNo || pendingDraft.order.customerRefNo || erpResponse.orderRef || '';

            const refDetailLine = displayRef ? `• Ref: *${displayRef}*\n` : '';
            const productDetailLine = displayProduct ? `• Product: *${displayProduct}*\n` : '';
            const typeDetailLine = pendingDraft.order.lensType ? `• Type: *${pendingDraft.order.lensType}*\n` : '';
            const indexDetailLine = pendingDraft.order.index ? `• Index: *${pendingDraft.order.index}*\n` : '';
            const coatingDetailLine = displayCoating ? `• Coating: *${displayCoating}*\n` : '';

            const extraLines = [
              pendingDraft.order.dia ? `• Dia: *${pendingDraft.order.dia}*` : '',
              pendingDraft.order.tintColor ? `• Tint/Color: *${pendingDraft.order.tintColor}*` : '',
              pendingDraft.order.fittingType ? `• Fitting: *${pendingDraft.order.fittingType}*` : '',
              pendingDraft.order.remarks ? `• Remark: *${pendingDraft.order.remarks}*` : '',
            ].filter(Boolean).join('\n');

            const storeDisplayName = store.id === 'rio' ? 'Rio' : store.name;
            const lensesHeader = store.id === 'rio' ? 'Rio Digital Lenses' : `${store.name} Lenses`;

            replyText = `✅ *ORDER CONFIRMED*

👓 *${lensesHeader}*
Order ID: *${erpResponse.orderId}*

📋 *Order Details:*
${refDetailLine}${productDetailLine}${typeDetailLine}${indexDetailLine}${coatingDetailLine}• Account: *${accountName}* (${accountId})
• Lab: *${labName}*${extraLines ? '\n' + extraLines : ''}

🏭 Your order has been placed in ${storeDisplayName} ERP. Lab technicians are now preparing your lenses.

💬 Reply *STATUS* anytime for live progress!`;

            finalStatus = 'CONFIRMATION_SENT';
          } catch (erpErr: unknown) {
            const erpErrMsg = erpErr instanceof Error ? erpErr.message : String(erpErr);
            logger.error(`[WorkflowService] ERP order confirmation failed for ${phone}: ${erpErrMsg}`);
            await logStep('ORDER_CREATION', 'FAILED', { phone, error: erpErrMsg }, 'ErpOrderError', erpErrMsg);
            replyText = `⚠️ We encountered an issue punching your confirmed order in ${store.name} ERP. Our lab coordinator has been notified.`;
          }
        } else {
          replyText = `ℹ️ *No Active Order Found*

There is no pending order waiting for confirmation.

📸 Send a photo of your prescription slip to place an order, or reply:
*ORDER Ref: Sharma R: -1.50/-0.50x90 L: -2.00/-0.50x85 Bluecut 1.56*`;
        }
      } else if (classification.category === 'EDIT_ORDER') {
        const pendingDraft = PendingOrderService.getPendingOrder(phone);
        if (pendingDraft && pendingDraft.order) {
          const ord = pendingDraft.order;
          const r = ord.rx?.right || {};
          const l = ord.rx?.left || {};
          const rSph = r.sph ?? '0.00';
          const rCyl = r.cyl ?? '0.00';
          const rAxis = r.axis !== undefined && r.axis !== null ? r.axis : 0;
          const rAdd = r.addn && r.addn !== '0.00' ? ` Add: ${r.addn}` : '';
          const lSph = l.sph ?? '0.00';
          const lCyl = l.cyl ?? '0.00';
          const lAxis = l.axis !== undefined && l.axis !== null ? l.axis : 0;
          const lAdd = l.addn && l.addn !== '0.00' ? ` Add: ${l.addn}` : '';

          replyText = `✏️ *Edit Prescription*

Please copy the message below, make your changes, and send it back:

Ref: ${ord.customerRefNo || '__'}
Product: ${ord.product || '__'}
R: ${rSph} / ${rCyl} x ${rAxis}${rAdd}
L: ${lSph} / ${lCyl} x ${lAxis}${lAdd}
Dia: ${ord.dia || '__'}
Tint: ${ord.tintColor || '__'}
Fitting: ${ord.fittingType || '__'}
Type: ${ord.lensType || '__'}
Index: ${ord.index || '__'}
Coating: ${ord.coating || '__'}
Remark: ${ord.remarks || '__'}

📸 Or simply send a clearer photo of the prescription slip!`;
        } else {
          replyText = `✏️ *Edit Prescription*

Please copy the message below, make your changes, and send it back:

Ref: Sharma
Product: I SIGHT
R: -1.50 / -0.50 x 90
L: -2.00 / -0.50 x 85
Dia: 70
Tint: Blue
Fitting: Full Rim
Type: Single Vision
Index: 1.56
Coating: Blue Cut
Remark: __

📸 Or simply send a photo of the prescription slip!`;
        }
      } else if (classification.category === 'ORDER_STATUS') {
        let targetOrderId = (classification.orderDetails?.queriedOrderId as string) || undefined;
        if (!targetOrderId && text) {
          targetOrderId = extractTargetOrderId(text) || undefined;
        }

        if (targetOrderId) {
          try {
            let localDbOrder = await AppRepository.findOrderByErpOrderId(targetOrderId);
            if (localDbOrder && !isOrderBelongingToStore(localDbOrder, store.id)) {
              localDbOrder = null;
            }
            if (!localDbOrder) {
              const userOrders = await AppRepository.findAllOrdersByPhone(phone, 50);
              const found = userOrders.find(
                (o) =>
                  isOrderBelongingToStore(o, store.id) &&
                  o.erpOrderId &&
                  (o.erpOrderId.toLowerCase() === targetOrderId!.toLowerCase() ||
                    o.erpOrderId.toLowerCase().includes(targetOrderId!.toLowerCase()) ||
                    targetOrderId!.toLowerCase().includes(o.erpOrderId.toLowerCase()))
              );
              if (found) {
                localDbOrder = found;
                targetOrderId = found.erpOrderId!;
              }
            }

            if (!isOrderBelongingToStore({ erpOrderId: targetOrderId, storeId: localDbOrder?.storeId }, store.id)) {
              replyText = `🔍 *Order Not Found*

We could not find an active order with ID: *${targetOrderId}* in ${store.name}.

Please check your Order ID or reply *STATUS* to see all your active orders.`;
            } else {
              const lookupId = localDbOrder?.erpOrderRef || targetOrderId;
              const statusResult = await (activeErp.getOrderStatus as any)(lookupId, phone);
            await logStep('REPLY_SELECTION', 'SUCCESS', {
              action: 'ORDER_STATUS_LOOKUP',
              orderId: lookupId,
              found: statusResult.success,
              order: statusResult.order,
            });

            const cleanCustomerPhone = phone.replace(/\D/g, '').slice(-10);
            const partyId = party?.id;
            const partyAccountId = party?.accountId;
            const partyName = party?.name ? party.name.trim().toLowerCase() : '';

            const ord = statusResult.order;
            const ordPartyId = ord?.partyId || (ord as any)?.details?.partyId;
            const ordAccountId = (ord as any)?.details?.partyAccountId;
            const ordCustomer = ((ord as any)?.customer || (ord as any)?.details?.customer || '').trim().toLowerCase();
            const ordPhone = ((ord as any)?.details?.whatsappSenderPhone || (ord as any)?.details?.phone || (ord as any)?.phone || '').replace(/\D/g, '').slice(-10);

            const cleanDbPhone = localDbOrder?.phone ? localDbOrder.phone.replace(/\D/g, '').slice(-10) : '';

            const belongsToCustomer = Boolean(
              (ordPartyId && partyId && ordPartyId === partyId) ||
              (ordAccountId && partyAccountId && ordAccountId === partyAccountId) ||
              (ordCustomer && partyName && (ordCustomer.includes(partyName) || partyName.includes(ordCustomer))) ||
              (ordPhone && cleanCustomerPhone && ordPhone === cleanCustomerPhone) ||
              (cleanDbPhone && cleanCustomerPhone && cleanDbPhone === cleanCustomerPhone)
            );

            if (statusResult.success && ord && belongsToCustomer) {
              // Read CURRENT delivery status from the existing delivery system
              let deliveryTask: DeliveryTaskData | null = null;
              if (activeErp.getDeliveryTaskByOrderId) {
                try {
                  deliveryTask = await activeErp.getDeliveryTaskByOrderId(targetOrderId);
                } catch (taskErr: unknown) {
                  logger.warn(`[WorkflowService] DeliveryTask lookup failed for ${targetOrderId}: ${String(taskErr)}`);
                }
              }

              // Coating resolution logic:
              // 1. If local DB recorded a real coating entered by customer, use it
              // 2. If local DB order exists but coating is empty or default, do NOT show ARC
              // 3. If local DB order has explicit ARC, use ARC
              // 4. If candidate coating is not ARC/UNCOTE, use it
              let realCoating: string | null = null;
              if (localDbOrder) {
                if (localDbOrder.coating && localDbOrder.coating !== '-' && localDbOrder.coating !== '__' && localDbOrder.coating.toUpperCase() !== 'UNCOTE') {
                  realCoating = localDbOrder.coating;
                }
              } else {
                const candidate = (ord as any).coatingName || (ord as any).details?.coating || ord.coating;
                if (candidate && candidate !== 'ARC' && candidate !== '-' && candidate !== '__' && candidate.toUpperCase() !== 'UNCOTE') {
                  realCoating = candidate;
                }
              }

              const { date: formattedDate, time: formattedTime } = formatDateTimeIST(
                ord.orderDate || localDbOrder?.createdAt,
                (ord as any).orderTime || (ord as any).time || (ord as any).details?.time
              );
              const timeLine = formattedTime ? `\n• Time: *${formattedTime}*` : '';
              const lab = ord.labLocation || party?.labName || `${store.name}-LAB`;
              const cust = ord.customer || party?.name || 'Customer';
              const prod = ord.product || localDbOrder?.product || '';
              const lens = (ord.lensType || localDbOrder?.lensType) ? ` (${ord.lensType || localDbOrder?.lensType})` : '';
              const coating = realCoating ? ` (${realCoating})` : '';
              const ref = ord.customerRefNo || localDbOrder?.customerRefNo || 'N/A';
              const liveStatus = ord.status || deliveryTask?.status || 'In Progress';
              const stage = ord.pendingAt || liveStatus;

              const displayOrderId =
                (ord.orderId && !ord.orderId.match(/^[0-9a-f]{24}$/i) && !ord.orderId.startsWith('ARCO-'))
                  ? ord.orderId
                  : localDbOrder?.erpOrderRef || localDbOrder?.erpOrderId || ord.orderId || targetOrderId;

              replyText = `🔍 *ORDER STATUS*

📦 Order: *${displayOrderId}*
⚡ Status: *${liveStatus}*
🔬 Stage: *${stage}*

📋 *Details:*
• Ref: *${ref}*
• Product: *${prod}*${lens}${coating}
• Lab: *${lab}*
• Account: *${cust}*
• Date: *${formattedDate}*${timeLine}

🏭 Our lab is actively processing your order.

💬 Reply *STATUS* anytime to see all your orders!`;
            } else if (localDbOrder && cleanDbPhone && cleanDbPhone === cleanCustomerPhone) {
              let deliveryTask: DeliveryTaskData | null = null;
              if (activeErp.getDeliveryTaskByOrderId) {
                try {
                  deliveryTask = await activeErp.getDeliveryTaskByOrderId(targetOrderId);
                } catch {}
              }
              const currentStatus = deliveryTask?.status || localDbOrder.status || 'In Progress';
              const { date: formattedDate, time: formattedTime } = formatDateTimeIST(
                localDbOrder.createdAt,
                (localDbOrder as any).time
              );
              const timeLine = formattedTime ? `\n• Time: *${formattedTime}*` : '';
              const realCoating = (localDbOrder.coating && localDbOrder.coating !== '-' && localDbOrder.coating !== '__' && localDbOrder.coating.toUpperCase() !== 'UNCOTE') ? ` (${localDbOrder.coating})` : '';
              const lens = localDbOrder.lensType ? ` (${localDbOrder.lensType})` : '';

              replyText = `🔍 *ORDER STATUS*

📦 Order: *${localDbOrder.erpOrderId || targetOrderId}*
⚡ Status: *${currentStatus}*
🔬 Stage: *Lab Processing*

📋 *Details:*
• Ref: *${localDbOrder.customerRefNo || 'N/A'}*
• Product: *${localDbOrder.product || ''}*${lens}${realCoating}
• Lab: *${party?.labName || `${store.name}-LAB`}*
• Account: *${party?.name || 'Customer'}*
• Date: *${formattedDate}*${timeLine}

🏭 Our lab is actively processing your order.

💬 Reply *STATUS* anytime to see all your orders!`;
            } else {
              replyText = `🔍 *Order Not Found*

We could not find an active order with ID: *${targetOrderId}*.

Please check your Order ID or reply *STATUS* to see all your active orders.`;
            }
          }
          } catch (statusErr: unknown) {
            const errMsg = statusErr instanceof Error ? statusErr.message : String(statusErr);
            logger.error(`[WorkflowService] ERP order status check failed for ${targetOrderId}: ${errMsg}`);
            await logStep('REPLY_SELECTION', 'FAILED', { orderId: targetOrderId, error: errMsg }, 'ErpStatusError', errMsg);
            replyText = `⚠️ We are currently unable to fetch live status from ${store.name} ERP for order *${targetOrderId}*. Our team is checking on it. Please try again shortly or reply *HELP*.`;
          }
        } else {
          // Customer asked for STATUS without an order ID: Fetch and show active non-delivered orders for this customer
          const seenIds = new Set<string>();
          const combinedOrders: Array<{
            orderId: string;
            customerRefNo?: string | null;
            product?: string | null;
            coating?: string | null;
            lensType?: string | null;
            status?: string | null;
            pendingAt?: string | null;
            orderDate?: string | null;
          }> = [];

          // 1. Fetch from live orders API and filter STRICTLY for this specific customer
          if (activeErp.getOrdersByPhone) {
            try {
              const erpOrdersRes = await activeErp.getOrdersByPhone(phone);
              if (erpOrdersRes.success && Array.isArray(erpOrdersRes.orders)) {
                const cleanCustomerPhone = phone.replace(/\D/g, '').slice(-10);
                const partyId = party?.id;
                const partyAccountId = party?.accountId;
                const partyName = party?.name ? party.name.trim().toLowerCase() : '';

                for (const ord of erpOrdersRes.orders) {
                  if (!isOrderBelongingToStore({ erpOrderId: ord.orderId }, store.id)) {
                    continue;
                  }
                  const ordPartyId = ord.partyId || (ord as any).details?.partyId;
                  const ordAccountId = (ord as any).details?.partyAccountId;
                  const ordCustomer = ((ord as any).customer || (ord as any).details?.customer || '').trim().toLowerCase();
                  const ordPhone = ((ord as any).details?.whatsappSenderPhone || (ord as any).details?.phone || (ord as any).phone || '').replace(/\D/g, '').slice(-10);

                  const belongsToCustomer = Boolean(
                    (ordPartyId && partyId && ordPartyId === partyId) ||
                    (ordAccountId && partyAccountId && ordAccountId === partyAccountId) ||
                    (ordCustomer && partyName && (ordCustomer.includes(partyName) || partyName.includes(ordCustomer))) ||
                    (ordPhone && ordPhone === cleanCustomerPhone)
                  );

                  if (belongsToCustomer && ord.orderId && !seenIds.has(ord.orderId)) {
                    seenIds.add(ord.orderId);
                    combinedOrders.push({
                      orderId: ord.orderId,
                      customerRefNo: ord.customerRefNo,
                      product: ord.product,
                      coating: ord.coating,
                      lensType: ord.lensType,
                      status: ord.status,
                      pendingAt: ord.pendingAt,
                      orderDate: ord.orderDate ? ord.orderDate.replace('T', ' ') : null,
                    });
                  }
                }
              }
            } catch (err: unknown) {
              logger.warn(`[WorkflowService] Rio ERP orders query error: ${String(err)}`);
            }
          }

          // 2. Merge with local DB orders (strictly isolated per store)
          try {
            const dbOrders = await AppRepository.findAllOrdersByPhone(phone, 200);
            const dbOrdersByErpId = new Map<string, StoredOrder>();
            for (const dbo of dbOrders) {
              // Store isolation guard: strictly ensure order belongs to current store
              if (!isOrderBelongingToStore(dbo, store.id)) continue;

              if (dbo.erpOrderId) {
                dbOrdersByErpId.set(dbo.erpOrderId, dbo);
              }
            }

            // Enrich orders with local DB actual coating/product/ref
            for (const ord of combinedOrders) {
              const matchedDbOrder = dbOrdersByErpId.get(ord.orderId);
              if (matchedDbOrder) {
                if (matchedDbOrder.coating && matchedDbOrder.coating !== '-' && matchedDbOrder.coating !== '__' && matchedDbOrder.coating.toUpperCase() !== 'UNCOTE') {
                  ord.coating = matchedDbOrder.coating;
                } else if (ord.coating === 'ARC' && (!matchedDbOrder.coating || matchedDbOrder.coating === '-' || matchedDbOrder.coating === '__')) {
                  ord.coating = null;
                }
                if (!ord.customerRefNo && matchedDbOrder.customerRefNo) {
                  ord.customerRefNo = matchedDbOrder.customerRefNo;
                }
              } else if (ord.coating === 'ARC') {
                ord.coating = null;
              }
            }

            for (const dbo of dbOrders) {
              // Store isolation guard: strictly ensure order belongs to current store
              if (!isOrderBelongingToStore(dbo, store.id)) continue;

              if (dbo.erpOrderId && !seenIds.has(dbo.erpOrderId)) {
                seenIds.add(dbo.erpOrderId);
                const realDboCoating = (dbo.coating && dbo.coating !== '-' && dbo.coating !== '__' && dbo.coating.toUpperCase() !== 'UNCOTE') ? dbo.coating : null;
                combinedOrders.push({
                  orderId: dbo.erpOrderId,
                  customerRefNo: dbo.customerRefNo,
                  product: dbo.product,
                  coating: realDboCoating,
                  lensType: dbo.lensType,
                  status: dbo.status,
                  pendingAt: 'Lab Processing',
                  orderDate: dbo.createdAt ? dbo.createdAt.toISOString().slice(0, 10) : null,
                });
              }
            }
          } catch (dbErr: unknown) {
            logger.warn(`[WorkflowService] Local DB orders query error: ${String(dbErr)}`);
          }

          // 3. Find corresponding DeliveryTask for each order using existing delivery system
          const deliveryTaskMap = new Map<string, DeliveryTaskData>();
          if (activeErp.getDeliveryTasks) {
            try {
              const tasks = await activeErp.getDeliveryTasks();
              for (const t of tasks) {
                if (t.invoiceNo) {
                  deliveryTaskMap.set(t.invoiceNo.trim().toUpperCase(), t);
                }
                if (t.id) {
                  deliveryTaskMap.set(t.id.trim().toUpperCase(), t);
                }
              }
            } catch (err: unknown) {
              logger.warn(`[WorkflowService] Failed to fetch delivery tasks: ${String(err)}`);
            }
          }

          interface ActiveOrder {
            orderId: string;
            customerRefNo?: string | null;
            product?: string | null;
            coating?: string | null;
            lensType?: string | null;
            status?: string | null;
            deliveryStatus: string;
            pendingAt?: string | null;
            orderDate?: string | null;
          }

          // 4. Read CURRENT delivery status and 5. Filter out every order whose delivery status is "Delivered"
          const activeOrders: ActiveOrder[] = [];

          for (const ord of combinedOrders) {
            let deliveryStatus = 'Pending Pickup';
            let task = deliveryTaskMap.get(ord.orderId.trim().toUpperCase()) ||
              (ord.customerRefNo ? deliveryTaskMap.get(ord.customerRefNo.trim().toUpperCase()) : undefined);

            if (!task && activeErp.getDeliveryTaskByOrderId) {
              try {
                task = (await activeErp.getDeliveryTaskByOrderId(ord.orderId)) || undefined;
              } catch {}
            }

            if (task && task.status) {
              deliveryStatus = task.status;
            } else if (ord.status) {
              deliveryStatus = ord.status;
            }

            // Exclude delivered orders: status === "Delivered" -> HIDE FROM CUSTOMER STATUS LIST
            const isDelivered = deliveryStatus.trim().toLowerCase() === 'delivered' ||
              ord.status?.trim().toLowerCase() === 'delivered';

            if (!isDelivered) {
              activeOrders.push({
                ...ord,
                deliveryStatus,
              });
            }
          }

          // 6. Show ONLY orders that are still active/not delivered
          if (combinedOrders.length === 0) {
            replyText = `📦 *Track Your Order*

We couldn't find any recent orders associated with your account (*${party?.name || 'Customer'}*).

To check a specific order, please send:
*STATUS <Order ID>*
Example: *STATUS ${store.id === 'rio' ? 'SO-2026-581335720' : 'S(26-27)#1'}*

📸 Send a photo of your prescription slip or reply *ORDER FORMAT* to place your lens order!`;
          } else if (activeOrders.length === 0) {
            replyText = `✅ You have no active orders. All your orders have been delivered.`;
          } else {
            // Cache active orders in session
            RecentOrdersSessionService.setRecentOrders(phone, activeOrders, store.id);

            const formattedItems = activeOrders
              .map((ord, idx) => `${idx + 1}. Order ID: ${ord.orderId}\n   Status: ${ord.deliveryStatus}`)
              .join('\n\n');

            replyText = `📦 *Your Active Orders*\n\n${formattedItems}`;

            if (activeOrders.length > 3) {
              statusInteractiveList = {
                buttonText: '📋 Select Order',
                sections: [
                  {
                    title: 'Your Active Orders',
                    rows: activeOrders.slice(0, 10).map((ord) => ({
                      id: `STATUS:${ord.orderId}`,
                      title: ord.orderId.slice(0, 24),
                      description: `Status: ${ord.deliveryStatus}`.slice(0, 72),
                    })),
                  },
                ],
              };
            } else {
              statusInteractiveButtons = activeOrders.slice(0, 3).map((ord) => ({
                id: `STATUS:${ord.orderId}`,
                title: ord.orderId.slice(0, 20),
              }));
            }
          }
        }
      }

      // Ensure all reply text uses the active store branding
      if (store.id !== 'rio') {
        replyText = replyText
          .replace(/Rio Digital Lenses/g, store.name)
          .replace(/Rio ERP/g, `${store.name} ERP`);
      }

      await AppRepository.updateMessageReply(messageId, {
        replyText,
        status: 'REPLY_SELECTED',
      });

      await logStep('REPLY_SELECTION', 'SUCCESS', {
        category: classification.category,
        selectedReply: replyText,
      });

      // Send WhatsApp message to customer via Meta Cloud API
      try {
        if (classification.category === 'IMAGE_ORDER_VERIFICATION' || classification.category === 'ORDER_VERIFICATION') {
          await WhatsAppClient.sendInteractiveButtons(
            phone,
            replyText,
            [
              { id: 'confirm_order', title: '✅ Confirm Order' },
              { id: 'edit_order', title: '✏️ Edit Details' },
            ],
            classification.category === 'IMAGE_ORDER_VERIFICATION'
              ? '👓 Prescription Verification'
              : '👓 Order Verification',
            'Tap button or reply CONFIRM / EDIT',
            waOptions
          );
        } else if (statusInteractiveList && replyText.length <= 1000) {
          await WhatsAppClient.sendInteractiveList(
            phone,
            replyText,
            statusInteractiveList.buttonText,
            statusInteractiveList.sections,
            `📦 ${store.name} Tracking`,
            'Tap Select Order or send Order ID',
            waOptions
          );
        } else if (statusInteractiveButtons && statusInteractiveButtons.length > 0 && replyText.length <= 1000) {
          await WhatsAppClient.sendInteractiveButtons(
            phone,
            replyText,
            statusInteractiveButtons,
            `📦 ${store.name} Tracking`,
            'Tap order button or send Order ID',
            waOptions
          );
        } else {
          await WhatsAppClient.sendMessage(phone, replyText, waOptions);
        }
        await AppRepository.updateMessageReply(messageId, {
          replyStatus: 'SENT',
          status: finalStatus,
        });
        await logStep('WHATSAPP_REPLY', 'SUCCESS', {
          phone,
          category: classification.category,
          replyText,
          erpOrderId,
        });
        logger.info(`[WorkflowService] Auto-reply successfully sent (${classification.category}) to ${phone}`);
      } catch (sendErr: unknown) {
        const errMsg = sendErr instanceof Error ? sendErr.message : String(sendErr);
        const errType = sendErr instanceof Error ? sendErr.name : 'WhatsAppDispatchError';
        sendError = errMsg;
        finalStatus = 'REPLY_FAILED';

        logger.error(`[WorkflowService] Failed to send WhatsApp auto-reply to ${phone}: ${errMsg}`);

        await AppRepository.updateMessageReply(messageId, {
          replyStatus: 'FAILED',
          status: 'REPLY_FAILED',
        });

        await logStep(
          'WHATSAPP_REPLY',
          'FAILED',
          {
            phone,
            category: classification.category,
            replyText,
            reason: 'Failed to dispatch WhatsApp reply via Meta WhatsApp Cloud API',
          },
          errType,
          errMsg
        );
      }

      return {
        messageId,
        phone,
        category: classification.category,
        replyText,
        status: finalStatus,
        customerId,
        orderId: createdOrderId,
        erpOrderId,
        logs,
        error: sendError,
      };
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      const errorType = err instanceof Error ? err.name : 'ProcessingError';

      logger.error(`[WorkflowService] Unexpected error during workflow execution: ${errorMsg}`, {
        messageId,
        phone,
      });

      await AppRepository.updateMessageStatus(messageId, 'FAILED');
      await logStep('CLASSIFICATION', 'FAILED', { phone }, errorType, errorMsg);

      return {
        messageId,
        phone,
        status: 'FAILED',
        logs,
        error: errorMsg,
      };
    }
  }
}
