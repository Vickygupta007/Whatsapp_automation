import { OrderParser } from '../parsers/orderParser.js';
import { AUTO_REPLY_TEMPLATES, ClassificationResult, MessageCategory } from '../types/classifier.js';
import { logger } from '../utils/logger.js';
import { OrderValidator } from '../validators/orderValidator.js';
import { RecentOrdersSessionService } from './recentOrdersSessionService.js';

export class ClassifierService {
  /**
   * Deterministically classifies an incoming message into one of the 9 defined business categories
   * and returns the exact pre-defined WhatsApp reply.
   */
  public static classify(
    rawText: string | null | undefined,
    isRegisteredCustomer: boolean,
    phone: string
  ): ClassificationResult {
    // Rule H: Unregistered Customer
    if (!isRegisteredCustomer) {
      logger.info(`[ClassifierService] Customer ${phone} is unregistered -> UNREGISTERED_CUSTOMER`);
      return {
        category: 'UNREGISTERED_CUSTOMER',
        replyText: AUTO_REPLY_TEMPLATES.UNREGISTERED_CUSTOMER,
        reason: 'Customer phone number is not registered in Rio ERP',
      };
    }

    const text = (rawText || '').trim();
    if (!text) {
      return {
        category: 'UNKNOWN',
        replyText: AUTO_REPLY_TEMPLATES.UNKNOWN,
        reason: 'Empty message or unsupported media without caption',
      };
    }

    const lower = text.toLowerCase().trim();
    // Strip trailing punctuation (. , ! ?) for exact keyword matching
    const cleanLower = lower.replace(/^[!.,?#\s]+|[!.,?#\s]+$/g, '');

    // Rule: CONFIRM_ORDER (Button click or text confirmation)
    const CONFIRM_REGEX = /^(confirm_order|confirm_image_order|confirm(\s*order)?|yes|y|ok|okay|proceed|approve|place\s*order|✅\s*confirm(\s*order)?)$/i;
    if (CONFIRM_REGEX.test(cleanLower)) {
      return {
        category: 'CONFIRM_ORDER',
        replyText: AUTO_REPLY_TEMPLATES.CONFIRM_ORDER,
        reason: 'Matched order confirmation request',
        detectedKeywords: [cleanLower],
      };
    }

    // Rule: EDIT_ORDER (Button click or text edit request)
    const EDIT_REGEX = /^(edit_order|edit_image_order|edit(\s*details|\s*order)?|change|modify|correction|update|✏️\s*edit(\s*details|\s*order)?)$/i;
    if (EDIT_REGEX.test(cleanLower)) {
      return {
        category: 'EDIT_ORDER',
        replyText: AUTO_REPLY_TEMPLATES.EDIT_ORDER,
        reason: 'Matched order edit request',
        detectedKeywords: [cleanLower],
      };
    }

    // Rule G: THANK YOU
    // Matches: "thank you", "thanks", "thank you so much", "thank u", "thx"
    const THANK_YOU_REGEX = /^(thank\s*you(\s+so\s+much)?|thanks(\s+a\s+lot)?|thank\s*u|thx)$/i;
    if (THANK_YOU_REGEX.test(cleanLower)) {
      return {
        category: 'THANK_YOU',
        replyText: AUTO_REPLY_TEMPLATES.THANK_YOU,
        reason: 'Matched thank-you expression',
        detectedKeywords: [cleanLower],
      };
    }

    // Rule A: GREETING
    // Matches: "hi", "hello", "hey", "good morning", "good afternoon", "good evening", "namaste"
    const GREETING_REGEX = /^(hi+|hello+|hey+|good\s*(morning|afternoon|evening)|namaste)$/i;
    if (GREETING_REGEX.test(cleanLower)) {
      return {
        category: 'GREETING',
        replyText: AUTO_REPLY_TEMPLATES.GREETING,
        reason: 'Matched standard greeting keyword',
        detectedKeywords: [cleanLower],
      };
    }

    // Direct Order ID match (e.g. "SO-101", "SO-2026-416713777", "STATUS:SO-2026-416713777")
    const orderIdMatch = text.match(/\b(SO-[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*)\b/i);

    // Rule 1: ORDER FORMAT (Menu Option 1)
    // Matches: "1", "1.", "#1", "option 1", "1. order format", "1. 📝 order format", "order format", "order template", "how to order", "format", "guide"
    const ORDER_FORMAT_REGEX = /^(1|1\.|#1|#1\.|option\s*1|1\.\s*📝?\s*order\s*format|order\s*format|order\s*template|how\s*to\s*order|format|order\s*guide|guide)$/i;
    if (ORDER_FORMAT_REGEX.test(cleanLower)) {
      return {
        category: 'ORDER_FORMAT',
        replyText: AUTO_REPLY_TEMPLATES.ORDER_FORMAT,
        reason: 'Matched menu option 1 (Order Format request)',
        detectedKeywords: [cleanLower],
      };
    }

    // Rule 2: ORDER STATUS & LIST OF ORDERS (Menu Option 2)
    // Matches: "2", "2.", "2. status", "2. order status", "2.📦 status", "option 2", "status", "order status", "track", "track order", "orders", "my orders", "list orders", "list of orders", "list"
    const ORDER_STATUS_REGEX = /^(2|2\.|2\.\s*status|2\.\s*order\s*status|2\.\s*📦\s*status|option\s*2|order\s*status|status|track\s*order|track|orders|my\s*orders|list\s*orders|list\s*of\s*orders|list|order\s*list)$/i;

    if (
      ORDER_STATUS_REGEX.test(cleanLower) ||
      cleanLower.startsWith('status ') ||
      cleanLower.startsWith('status:') ||
      cleanLower.startsWith('track ') ||
      cleanLower.startsWith('track:') ||
      orderIdMatch
    ) {
      const queriedOrderId = orderIdMatch ? orderIdMatch[1].toUpperCase() : undefined;
      return {
        category: 'ORDER_STATUS',
        replyText: AUTO_REPLY_TEMPLATES.ORDER_STATUS,
        reason: queriedOrderId ? `Order status request for ${queriedOrderId}` : 'Matched menu option 2 (List of orders request)',
        detectedKeywords: queriedOrderId ? [queriedOrderId] : [cleanLower],
        orderDetails: queriedOrderId ? { queriedOrderId } : undefined,
      };
    }

    // Rule 3: HELP & SUPPORT (Menu Option 3)
    // Matches: "3", "3.", "3. help", "3.❓ help", "option 3", "help", "menu", "support", "information", "info", "assistance"
    const HELP_REGEX = /^(3|3\.|3\.\s*help|3\.\s*❓\s*help|option\s*3|help|menu|support|information|info|assistance)$/i;
    if (HELP_REGEX.test(cleanLower)) {
      return {
        category: 'HELP',
        replyText: AUTO_REPLY_TEMPLATES.HELP,
        reason: 'Matched menu option 3 (Help and support request)',
        detectedKeywords: [cleanLower],
      };
    }

    // Rule: Explicit Order selection by index from an active recent orders list session (e.g. "#1", "#2", "order 1", "order #2", "select 1", or number > 3)
    const explicitIndexMatch = cleanLower.match(/^(?:#|order\s*#?\s*|select\s*#?\s*)(\d{1,3})$/i);
    const bareNumMatch = cleanLower.match(/^(\d{1,3})$/);
    const selectedNum = explicitIndexMatch
      ? parseInt(explicitIndexMatch[1], 10)
      : bareNumMatch && parseInt(bareNumMatch[1], 10) > 3
      ? parseInt(bareNumMatch[1], 10)
      : null;

    if (selectedNum !== null && RecentOrdersSessionService.hasActiveSession(phone)) {
      const matchedOrderId = RecentOrdersSessionService.getOrderByIndex(phone, selectedNum);
      if (matchedOrderId) {
        return {
          category: 'ORDER_STATUS',
          replyText: AUTO_REPLY_TEMPLATES.ORDER_STATUS,
          reason: `Selected order #${selectedNum} (${matchedOrderId}) from recent orders list`,
          detectedKeywords: [matchedOrderId],
          orderDetails: { queriedOrderId: matchedOrderId, selectedIndex: selectedNum },
        };
      }
    }


    // Rule E & F: LENS ORDER VALIDATION
    // Check if the message contains prescription details / optical order structure
    const hasOrderMarkers =
      /order\s*ref\s*:/i.test(text) ||
      /\b(r|re|right|od)\s*[:=]\s*[-+]?\d/i.test(text) ||
      /\b(l|le|left|os)\s*[:=]\s*[-+]?\d/i.test(text) ||
      /\b(sph|cyl|axis|add|bluecut|single\s*vision|progressive|bifocal)\b/i.test(text);

    if (hasOrderMarkers) {
      const parsedOrder = OrderParser.parse(text, phone);
      const validation = OrderValidator.validate(parsedOrder);

      if (parsedOrder.isOrder && validation.isValid) {
        return {
          category: 'VALID_ORDER',
          replyText: AUTO_REPLY_TEMPLATES.VALID_ORDER,
          reason: 'Valid optical lens order prescription detected',
          orderDetails: {
            rx: parsedOrder.order.rx,
            index: parsedOrder.order.index,
            coating: parsedOrder.order.coating,
            product: parsedOrder.order.product,
            lensType: parsedOrder.order.lensType,
            customerRefNo: parsedOrder.order.customerRefNo,
          },
        };
      } else {
        return {
          category: 'INVALID_ORDER',
          replyText: AUTO_REPLY_TEMPLATES.INVALID_ORDER,
          reason: validation.reason || 'Incomplete optical order format',
          detectedKeywords: parsedOrder.missingRequiredFields,
        };
      }
    }

    // Rule I: UNKNOWN MESSAGE
    // Default fallback when message does not match any recognized category
    return {
      category: 'UNKNOWN',
      replyText: AUTO_REPLY_TEMPLATES.UNKNOWN,
      reason: 'Unrecognized user message format',
    };
  }
}
