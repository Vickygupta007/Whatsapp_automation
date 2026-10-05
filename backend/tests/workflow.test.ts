import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppRepository } from '../src/database/repository.js';
import { MockRioErpClient } from '../src/integrations/rio-erp/mockClient.js';
import { WhatsAppClient } from '../src/integrations/whatsapp/client.js';
import { NormalizationService } from '../src/services/normalizationService.js';
import { WorkflowService } from '../src/services/workflowService.js';
import { AUTO_REPLY_TEMPLATES } from '../src/types/classifier.js';
import { MetaWebhookPayload, NormalizedMessage } from '../src/types/webhook.js';

describe('WhatsApp Auto-Reply System - 12 Core Test Suites', () => {
  let mockErp: MockRioErpClient;
  let workflow: WorkflowService;
  const registeredPhone = '917718043078'; // Ash in MockRioErpClient
  const unregisteredPhone = '919900000000';

  beforeEach(() => {
    AppRepository.clearMemoryStore();
    WhatsAppClient.clearSentLog();
    mockErp = new MockRioErpClient();
    workflow = new WorkflowService(mockErp);
  });

  // Test 1: Greeting messages
  it('1. Greeting messages: should classify greeting and reply with greeting menu', async () => {
    const greetings = ['Hello', 'Hi', 'Hey', 'Good morning', 'Good afternoon', 'Good evening', 'Namaste'];
    const erpSpy = vi.spyOn(mockErp, 'createOrder');

    for (let i = 0; i < greetings.length; i++) {
      const msg: NormalizedMessage = {
        phone: registeredPhone,
        customerName: 'Optician',
        messageId: `wamid.GREETING_TEST_${i}`,
        messageType: 'text',
        text: greetings[i],
        mediaId: null,
        rawPayload: {},
      };

      const result = await workflow.processNormalizedMessage(msg);
      expect(result.category).toBe('GREETING');
      expect(result.status).toBe('REPLY_SENT');
      expect(result.replyText).toContain('👋 Hello Optician,');
      expect(result.replyText).toContain('Welcome to Rio Digital Lenses 👓');
      expect(result.replyText).toContain('🏢 Account:');
      expect(result.replyText).toContain('🏭 Assigned Lab:');
      expect(result.replyText).toContain('1.📝 ORDER FORMAT — Text ordering guide');
      expect(result.erpOrderId).toBeUndefined();
    }

    // Verify WhatsApp messages were dispatched with exact template
    expect(WhatsAppClient.sentMessagesLog.length).toBe(greetings.length);
    expect(WhatsAppClient.sentMessagesLog[0].message).toContain('👋 Hello Optician,');
    expect(WhatsAppClient.sentMessagesLog[0].message).toContain('Welcome to Rio Digital Lenses 👓');
    expect(WhatsAppClient.sentMessagesLog[0].message).toContain('1.📝 ORDER FORMAT — Text ordering guide');
    // Ensure no ERP order creation API was called
    expect(erpSpy).not.toHaveBeenCalled();
  });

  // Test 2: Help requests
  it('2. Help requests: should classify help/menu requests and reply with help menu', async () => {
    const helpInputs = ['Help', 'Menu', 'Information', 'Support', '3'];
    const erpSpy = vi.spyOn(mockErp, 'createOrder');

    for (let i = 0; i < helpInputs.length; i++) {
      const msg: NormalizedMessage = {
        phone: registeredPhone,
        customerName: 'Optician',
        messageId: `wamid.HELP_TEST_${i}`,
        messageType: 'text',
        text: helpInputs[i],
        mediaId: null,
        rawPayload: {},
      };

      const result = await workflow.processNormalizedMessage(msg);
      expect(result.category).toBe('HELP');
      expect(result.replyText).toBe(AUTO_REPLY_TEMPLATES.HELP);
      expect(result.status).toBe('REPLY_SENT');
    }

    expect(WhatsAppClient.sentMessagesLog[0].message).toContain('ℹ️ *Rio Digital Lenses — Help*');
    expect(WhatsAppClient.sentMessagesLog[0].message).toContain('Track Order');
    expect(erpSpy).not.toHaveBeenCalled();
  });

  // Test 3: Order format requests
  it('3. Order format requests: should reply with order format template', async () => {
    const formatInputs = ['Order format', 'Order template', 'How to order', 'Format', '1'];
    const erpSpy = vi.spyOn(mockErp, 'createOrder');

    for (let i = 0; i < formatInputs.length; i++) {
      const msg: NormalizedMessage = {
        phone: registeredPhone,
        customerName: 'Optician',
        messageId: `wamid.FORMAT_TEST_${i}`,
        messageType: 'text',
        text: formatInputs[i],
        mediaId: null,
        rawPayload: {},
      };

      const result = await workflow.processNormalizedMessage(msg);
      expect(result.category).toBe('ORDER_FORMAT');
      expect(result.replyText).toBe(AUTO_REPLY_TEMPLATES.ORDER_FORMAT);
      expect(result.status).toBe('REPLY_SENT');
    }

    expect(WhatsAppClient.sentMessagesLog[0].message).toContain('Order Format Guide');
    expect(WhatsAppClient.sentMessagesLog[0].message).toContain('Party:');
    expect(erpSpy).not.toHaveBeenCalled();
  });

  // Test 4: Order status requests
  it('4. Order status requests: should fetch live Rio ERP order status or return instructions', async () => {
    const statusInputsWithoutId = ['Order status', 'Status', 'Track order', '2'];
    const erpCreateSpy = vi.spyOn(mockErp, 'createOrder');

    for (let i = 0; i < statusInputsWithoutId.length; i++) {
      const msg: NormalizedMessage = {
        phone: '919999988888', // Customer with no prior orders in memory
        customerName: 'Vision World',
        messageId: `wamid.STATUS_NO_ID_${i}`,
        messageType: 'text',
        text: statusInputsWithoutId[i],
        mediaId: null,
        rawPayload: {},
      };

      const result = await workflow.processNormalizedMessage(msg);
      expect(result.category).toBe('ORDER_STATUS');
      expect(result.replyText).toContain('Track Your Order');
      expect(result.replyText).toContain('STATUS <Order ID>');
      expect(result.status).toBe('REPLY_SENT');
    }

    // Now test with a real order ID (SO-2026-479435957)
    const erpStatusSpy = vi.spyOn(mockErp, 'getOrderStatus');
    const msgWithId: NormalizedMessage = {
      phone: registeredPhone,
      customerName: 'Ash',
      messageId: 'wamid.STATUS_WITH_REAL_ID',
      messageType: 'text',
      text: 'STATUS SO-2026-479435957',
      mediaId: null,
      rawPayload: {},
    };

    const resultWithId = await workflow.processNormalizedMessage(msgWithId);
    expect(resultWithId.category).toBe('ORDER_STATUS');
    expect(erpStatusSpy).toHaveBeenCalledWith('SO-2026-479435957');
    expect(resultWithId.replyText).toContain('ORDER STATUS');
    expect(resultWithId.replyText).toContain('SO-2026-479435957');
    expect(resultWithId.replyText).toContain('Blocking');
    expect(resultWithId.replyText).toContain('RIO-AHMEDABAD');
    expect(resultWithId.replyText).toContain('Out for Delivery');

    // Test with a non-existent order ID
    const msgNotFound: NormalizedMessage = {
      phone: registeredPhone,
      customerName: 'Ash',
      messageId: 'wamid.STATUS_NOT_FOUND',
      messageType: 'text',
      text: 'STATUS SO-2026-99999',
      mediaId: null,
      rawPayload: {},
    };
    const resultNotFound = await workflow.processNormalizedMessage(msgNotFound);
    expect(resultNotFound.replyText).toContain('Order Not Found');
    expect(resultNotFound.replyText).toContain('SO-2026-99999');

    // Ensure createOrder was never called for status queries
    expect(erpCreateSpy).not.toHaveBeenCalled();
  });

  // Test 5: Valid lens order messages
  it('5. Valid lens order messages: should verify order details with buttons first, then create order in Rio ERP upon customer confirmation', async () => {
    WhatsAppClient.clearSentLog();
    const erpSpy = vi.spyOn(mockErp, 'createOrder');
    const validOrderText = `ORDER Ref: ASH
R: -1.00 / -0.50 × 90
L: -1.25 / -0.25 × 180
Bluecut 1.56 Progressive Add: +2.00`;

    const msg: NormalizedMessage = {
      phone: registeredPhone,
      customerName: 'ABC Optical',
      messageId: 'wamid.VALID_ORDER_TEST_001',
      messageType: 'text',
      text: validOrderText,
      mediaId: null,
      rawPayload: {},
    };

    // Step 1: Customer sends text order -> receives verification card with interactive buttons
    const result = await workflow.processNormalizedMessage(msg);

    expect(result.category).toBe('ORDER_VERIFICATION');
    expect(result.status).toBe('REPLY_SENT');
    expect(erpSpy).not.toHaveBeenCalled();

    // Verify verification card details and buttons
    const sentVerification = WhatsAppClient.sentMessagesLog;
    expect(sentVerification.length).toBe(1);
    expect(sentVerification[0].message).toContain('VERIFY ORDER DETAILS');
    expect(sentVerification[0].message).toContain('*Ref:* *ASH*');
    expect(sentVerification[0].message).toContain('SPH: *-1.00*');
    expect(sentVerification[0].message).toContain('SPH: *-1.25*');
    expect(sentVerification[0].buttons).toEqual([
      { id: 'confirm_order', title: '✅ Confirm Order' },
      { id: 'edit_order', title: '✏️ Edit Details' },
    ]);

    // Step 2: Customer taps "Confirm Order" button -> creates order in Rio ERP and returns receipt
    WhatsAppClient.clearSentLog();
    const confirmMsg: NormalizedMessage = {
      phone: registeredPhone,
      customerName: 'ABC Optical',
      messageId: 'wamid.VALID_ORDER_CONFIRM_001',
      messageType: 'interactive',
      text: 'confirm_order',
      mediaId: null,
      rawPayload: {},
    };

    const confirmResult = await workflow.processNormalizedMessage(confirmMsg);

    expect(confirmResult.category).toBe('CONFIRM_ORDER');
    expect(confirmResult.status).toBe('CONFIRMATION_SENT');
    expect(confirmResult.erpOrderId).toMatch(/^SO-\d{4}-\d{5}$/);
    expect(confirmResult.orderId).toBeDefined();

    // Verify ERP order creation API was called with exact n8n request format
    expect(erpSpy).toHaveBeenCalledTimes(1);
    const calledPayload = erpSpy.mock.calls[0][0];
    expect(calledPayload.phone).toBe(registeredPhone);
    expect(calledPayload.customerRefNo).toBe('ASH');
    expect(calledPayload.index).toBe('1.56');
    expect(calledPayload.coating).toBe('BLUE CUT');
    expect(calledPayload.product).toBe('I SIGHT');
    expect(calledPayload.rx.right?.sph).toBe('-1.00');
    expect(calledPayload.rx.left?.sph).toBe('-1.25');

    // Verify WhatsApp reply is the Order Confirmation receipt from n8n workflow
    const sentConfirm = WhatsAppClient.sentMessagesLog;
    expect(sentConfirm.length).toBe(1);
    expect(sentConfirm[0].message).toContain('ORDER CONFIRMED');
    expect(sentConfirm[0].message).toContain(confirmResult.erpOrderId!);
    expect(sentConfirm[0].message).toContain('Your order has been placed in Rio ERP');

    erpSpy.mockRestore();
  });

  // Test 6: Invalid lens order messages
  it('6. Invalid lens order messages: should reply with invalid format warning and template instructions', async () => {
    const erpSpy = vi.spyOn(mockErp, 'createOrder');
    // Incomplete order details (has order reference / eye markers but missing cylinder, axis, or left eye)
    const incompleteOrderText = `ORDER Ref: ASH
R: -1.00 cyl`;

    const msg: NormalizedMessage = {
      phone: registeredPhone,
      customerName: 'ABC Optical',
      messageId: 'wamid.INVALID_ORDER_TEST_001',
      messageType: 'text',
      text: incompleteOrderText,
      mediaId: null,
      rawPayload: {},
    };

    const result = await workflow.processNormalizedMessage(msg);

    expect(result.category).toBe('INVALID_ORDER');
    expect(result.replyText).toBe(AUTO_REPLY_TEMPLATES.INVALID_ORDER);
    expect(result.status).toBe('REPLY_SENT');
    expect(erpSpy).not.toHaveBeenCalled();

    const sent = WhatsAppClient.sentMessagesLog;
    expect(sent.length).toBe(1);
    expect(sent[0].message).toContain('Prescription Incomplete');
    expect(sent[0].message).toContain('Right (OD) & Left (OS)');
  });

  // Test 7: Thank-you messages
  it('7. Thank-you messages: should acknowledge thank-you messages', async () => {
    const thanksInputs = ['Thank you', 'Thanks', 'Thank you so much', 'thank u', 'thx'];
    const erpSpy = vi.spyOn(mockErp, 'createOrder');

    for (let i = 0; i < thanksInputs.length; i++) {
      const msg: NormalizedMessage = {
        phone: registeredPhone,
        customerName: 'Optician',
        messageId: `wamid.THANKS_TEST_${i}`,
        messageType: 'text',
        text: thanksInputs[i],
        mediaId: null,
        rawPayload: {},
      };

      const result = await workflow.processNormalizedMessage(msg);
      expect(result.category).toBe('THANK_YOU');
      expect(result.replyText).toBe(AUTO_REPLY_TEMPLATES.THANK_YOU);
      expect(result.status).toBe('REPLY_SENT');
    }

    expect(WhatsAppClient.sentMessagesLog[0].message).toContain("You're Welcome!");
    expect(WhatsAppClient.sentMessagesLog[0].message).toContain('Thank you for choosing Rio Digital Lenses');
    expect(erpSpy).not.toHaveBeenCalled();
  });

  // Test 8: Unregistered customers
  it('8. Unregistered customers: should notify customer to register with lab ERP', async () => {
    const erpSpy = vi.spyOn(mockErp, 'createOrder');
    const msg: NormalizedMessage = {
      phone: unregisteredPhone,
      customerName: 'Unregistered User',
      messageId: 'wamid.UNREGISTERED_TEST_001',
      messageType: 'text',
      text: 'Hi I want to order lenses',
      mediaId: null,
      rawPayload: {},
    };

    const result = await workflow.processNormalizedMessage(msg);

    expect(result.category).toBe('UNREGISTERED_CUSTOMER');
    expect(result.replyText).toBe(AUTO_REPLY_TEMPLATES.UNREGISTERED_CUSTOMER);
    expect(result.status).toBe('REPLY_SENT');
    expect(erpSpy).not.toHaveBeenCalled();

    const sent = WhatsAppClient.sentMessagesLog;
    expect(sent.length).toBe(1);
    expect(sent[0].phone).toBe(unregisteredPhone);
    expect(sent[0].message).toContain('Account Not Registered');
    expect(sent[0].message).toContain('Rio Digital Lenses lab coordinator');
  });

  // Test 9: Unknown messages
  it('9. Unknown messages: should send fallback guidance reply for unrecognized messages', async () => {
    const erpSpy = vi.spyOn(mockErp, 'createOrder');
    const msg: NormalizedMessage = {
      phone: registeredPhone,
      customerName: 'Optician',
      messageId: 'wamid.UNKNOWN_TEST_001',
      messageType: 'text',
      text: 'Can I visit your office in Mumbai tomorrow morning at 10 AM?',
      mediaId: null,
      rawPayload: {},
    };

    const result = await workflow.processNormalizedMessage(msg);

    expect(result.category).toBe('UNKNOWN');
    expect(result.replyText).toBe(AUTO_REPLY_TEMPLATES.UNKNOWN);
    expect(result.status).toBe('REPLY_SENT');
    expect(erpSpy).not.toHaveBeenCalled();

    const sent = WhatsAppClient.sentMessagesLog;
    expect(sent.length).toBe(1);
    expect(sent[0].message).toContain('Welcome to Rio Digital Lenses');
    expect(sent[0].message).toContain("didn't quite catch that");
    expect(sent[0].message).toContain('HELP');
  });

  // Test 10: Duplicate webhook events
  it('10. Duplicate webhook events: should ignore repeated webhook events without duplicate replies', async () => {
    const msg: NormalizedMessage = {
      phone: registeredPhone,
      customerName: 'ABC Optical',
      messageId: 'wamid.DUPLICATE_WEBHOOK_EVENT_100',
      messageType: 'text',
      text: 'Hello',
      mediaId: null,
      rawPayload: {},
    };

    // First attempt: succeeds and sends reply
    const firstResult = await workflow.processNormalizedMessage(msg);
    expect(firstResult.status).toBe('REPLY_SENT');
    expect(WhatsAppClient.sentMessagesLog.length).toBe(1);

    // Second attempt with exact same messageId: duplicate skipped
    const secondResult = await workflow.processNormalizedMessage(msg);
    expect(secondResult.status).toBe('DUPLICATE_IGNORED');

    // WhatsApp send log must still have only 1 message sent!
    expect(WhatsAppClient.sentMessagesLog.length).toBe(1);

    // Verify processing log records duplicate rejection
    const logs = await AppRepository.getMessageDetails(msg.messageId);
    const skippedLog = logs.logs.find((l) => l.step === 'WEBHOOK' && l.status === 'SKIPPED');
    expect(skippedLog).toBeDefined();
  });

  // Test 11: WhatsApp API failures
  it('11. WhatsApp API failures: should gracefully catch API failure and log REPLY_FAILED', async () => {
    // Force WhatsApp client to throw an error simulating rate limit or Meta outage
    const sendSpy = vi.spyOn(WhatsAppClient, 'sendMessage').mockRejectedValueOnce(
      new Error('Meta WhatsApp Cloud API Error: (#131056) Pair rate limit exceeded')
    );

    const msg: NormalizedMessage = {
      phone: registeredPhone,
      customerName: 'ABC Optical',
      messageId: 'wamid.API_FAILURE_TEST_001',
      messageType: 'text',
      text: 'Order format',
      mediaId: null,
      rawPayload: {},
    };

    const result = await workflow.processNormalizedMessage(msg);

    // Status is REPLY_FAILED, application does not crash
    expect(result.status).toBe('REPLY_FAILED');
    expect(result.error).toContain('Pair rate limit exceeded');

    // Verify logs recorded failed WHATSAPP_REPLY step
    const replyLog = result.logs.find((l) => l.step === 'WHATSAPP_REPLY');
    expect(replyLog).toBeDefined();
    expect(replyLog?.status).toBe('FAILED');
    expect(replyLog?.errorMessage).toContain('Pair rate limit exceeded');

    sendSpy.mockRestore();
  });

  // Test 12: Non-message webhook events
  it('12. Non-message webhook events: should ignore delivery and read receipts without triggering replies', () => {
    // Sample delivery receipt payload from Meta Cloud API
    const deliveryReceiptPayload: MetaWebhookPayload = {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: '1778348136538191',
          changes: [
            {
              field: 'messages',
              value: {
                messaging_product: 'whatsapp',
                metadata: {
                  display_phone_number: '9137951037',
                  phone_number_id: '1327525300446181',
                },
                statuses: [
                  {
                    id: 'wamid.HBgLMTIzNDU2Nzg5',
                    status: 'delivered',
                    timestamp: '1700000000',
                    recipient_id: '919876543210',
                  },
                ],
              },
            },
          ],
        },
      ],
    };

    // Extracting messages from receipt payload must return empty array
    const extracted = NormalizationService.extractAndNormalize(deliveryReceiptPayload);
    expect(extracted.length).toBe(0);
    // WhatsApp client has sent 0 messages
    expect(WhatsAppClient.sentMessagesLog.length).toBe(0);
  });

  // Test 13: Prescription Image Orders - Verification & Confirmation Flow
  it('13. Prescription Image Orders: should verify prescription from image and request confirmation before punching order', async () => {
    const erpSpy = vi.spyOn(mockErp, 'createOrder');

    // Step A: Customer sends prescription image
    const imageMsg: NormalizedMessage = {
      phone: registeredPhone,
      customerName: 'Ash',
      messageId: 'wamid.IMAGE_ORDER_TEST_001',
      messageType: 'image',
      text: null,
      mediaId: 'mock_prescription_media_123',
      rawPayload: {},
    };

    const result = await workflow.processNormalizedMessage(imageMsg);

    expect(result.category).toBe('IMAGE_ORDER_VERIFICATION');
    expect(result.status).toBe('REPLY_SENT');
    // Order should NOT be placed in Rio ERP yet until customer confirms
    expect(erpSpy).toHaveBeenCalledTimes(0);

    // Verify verification prompt with buttons was sent
    expect(WhatsAppClient.sentMessagesLog.length).toBe(1);
    const sentVerification = WhatsAppClient.sentMessagesLog[0];
    expect(sentVerification.phone).toBe(registeredPhone);
    expect(sentVerification.message).toContain('👓 *VERIFY PRESCRIPTION*');
    expect(sentVerification.message).toContain('✅ Confirm Order');
    expect(sentVerification.message).toContain('✏️ Edit Details');

    // Step B: Customer clicks "✅ Confirm Order" (or sends CONFIRM)
    WhatsAppClient.clearSentLog();
    const confirmMsg: NormalizedMessage = {
      phone: registeredPhone,
      customerName: 'Ash',
      messageId: 'wamid.IMAGE_CONFIRM_TEST_001',
      messageType: 'interactive',
      text: 'confirm_order',
      mediaId: null,
      rawPayload: {},
    };

    const confirmResult = await workflow.processNormalizedMessage(confirmMsg);

    expect(confirmResult.category).toBe('CONFIRM_ORDER');
    expect(confirmResult.status).toBe('CONFIRMATION_SENT');
    expect(erpSpy).toHaveBeenCalledTimes(1);

    // Verify WhatsApp order receipt confirmation was dispatched
    expect(WhatsAppClient.sentMessagesLog.length).toBe(1);
    const sentConfirm = WhatsAppClient.sentMessagesLog[0];
    expect(sentConfirm.phone).toBe(registeredPhone);
    expect(sentConfirm.message).toContain('ORDER CONFIRMED');
    expect(sentConfirm.message).toContain('SO-2026-');

    erpSpy.mockRestore();
  });

  // Test 14: Customer requests to edit pending order
  it('14. Prescription Image Orders: should provide edit instructions when customer requests to edit details', async () => {
    const editMsg: NormalizedMessage = {
      phone: registeredPhone,
      customerName: 'Ash',
      messageId: 'wamid.IMAGE_EDIT_TEST_001',
      messageType: 'interactive',
      text: 'edit_order',
      mediaId: null,
      rawPayload: {},
    };

    const editResult = await workflow.processNormalizedMessage(editMsg);

    expect(editResult.category).toBe('EDIT_ORDER');
    expect(editResult.status).toBe('REPLY_SENT');
    expect(WhatsAppClient.sentMessagesLog.length).toBe(1);
    expect(WhatsAppClient.sentMessagesLog[0].message).toContain('✏️ *Edit Prescription*');
  });

  // Test 15: Show all order IDs when customer asks for status
  it('15. Order Status Selection: should display all customer order IDs when customer asks for STATUS and remove number reply instructions', async () => {
    WhatsAppClient.clearSentLog();

    const statusMsg: NormalizedMessage = {
      phone: registeredPhone,
      customerName: 'Ash',
      messageId: 'wamid.STATUS_LIST_001',
      messageType: 'text',
      text: 'STATUS',
      mediaId: null,
      rawPayload: {},
    };

    const statusResult = await workflow.processNormalizedMessage(statusMsg);

    expect(statusResult.category).toBe('ORDER_STATUS');
    expect(statusResult.status).toBe('REPLY_SENT');
    expect(statusResult.replyText).toContain('Your Active Orders');
    expect(statusResult.replyText).toContain('SO-2026-');
    expect(WhatsAppClient.sentMessagesLog.length).toBe(1);
    expect(WhatsAppClient.sentMessagesLog[0].message).toContain('Your Active Orders');
  });

  // Test 16: Customer selects order by number (e.g. "1") and sees live status
  it('16. Order Status Selection: should show live order status when customer selects an order by number', async () => {
    WhatsAppClient.clearSentLog();

    // 1. Customer asks for status first
    const listMsg: NormalizedMessage = {
      phone: registeredPhone,
      customerName: 'Ash',
      messageId: 'wamid.STATUS_INIT_002',
      messageType: 'text',
      text: 'STATUS',
      mediaId: null,
      rawPayload: {},
    };
    await workflow.processNormalizedMessage(listMsg);
    WhatsAppClient.clearSentLog();

    // 2. Customer selects order 1 by sending "order 1"
    const selectMsg: NormalizedMessage = {
      phone: registeredPhone,
      customerName: 'Ash',
      messageId: 'wamid.STATUS_SELECT_002',
      messageType: 'text',
      text: 'order 1',
      mediaId: null,
      rawPayload: {},
    };

    const selectResult = await workflow.processNormalizedMessage(selectMsg);

    expect(selectResult.category).toBe('ORDER_STATUS');
    expect(selectResult.status).toBe('REPLY_SENT');
    expect(selectResult.replyText).toContain('ORDER STATUS');
    expect(selectResult.replyText).toContain('SO-2026-');
    expect(selectResult.replyText).toContain('Details:');

    expect(selectResult.replyText).toContain('Lab:');
  });

  // Test 17: Image Orders with Dia, Tint/Color, and Fitting Type
  it('17. Image Orders with Specifications: should extract and pass Dia, Tint/Color, and Fitting Type to Rio ERP payload upon confirmation', async () => {
    WhatsAppClient.clearSentLog();
    const erpSpy = vi.spyOn(mockErp, 'createOrder');

    // Step A: Customer uploads prescription photo with specifications
    const imageMsg: NormalizedMessage = {
      phone: registeredPhone,
      customerName: 'Ash',
      messageId: 'wamid.IMAGE_SPECS_001',
      messageType: 'image',
      text: 'specs order',
      mediaId: 'mock_specs_image_123',
      rawPayload: {},
    };

    const result = await workflow.processNormalizedMessage(imageMsg);

    expect(result.category).toBe('IMAGE_ORDER_VERIFICATION');
    expect(result.status).toBe('REPLY_SENT');

    // Verification WhatsApp prompt should display Dia, Tint/Color, and Fitting
    expect(WhatsAppClient.sentMessagesLog.length).toBe(1);
    const sentVerification = WhatsAppClient.sentMessagesLog[0];
    expect(sentVerification.message).toContain('• Dia: *75*');
    expect(sentVerification.message).toContain('• Tint/Color: *Blue*');
    expect(sentVerification.message).toContain('• Fitting: *supra*');

    // Step B: Customer confirms order
    WhatsAppClient.clearSentLog();
    const confirmMsg: NormalizedMessage = {
      phone: registeredPhone,
      customerName: 'Ash',
      messageId: 'wamid.IMAGE_SPECS_CONFIRM_001',
      messageType: 'interactive',
      text: 'confirm_order',
      mediaId: null,
      rawPayload: {},
    };

    const confirmResult = await workflow.processNormalizedMessage(confirmMsg);

    expect(confirmResult.category).toBe('CONFIRM_ORDER');
    expect(confirmResult.status).toBe('CONFIRMATION_SENT');
    expect(erpSpy).toHaveBeenCalledTimes(1);

    // Verify ERP order payload contains Dia, Tint/Color, and Fitting across all fields
    const calledPayload = erpSpy.mock.calls[0][0];
    expect(calledPayload.dia).toBe('75');
    expect(calledPayload.color).toBe('Blue');
    expect(calledPayload.fittingType).toBe('supra');
    expect(calledPayload.details?.dia).toBe('75');
    expect(calledPayload.details?.color).toBe('Blue');
    expect(calledPayload.details?.fittingType).toBe('supra');

    // Verify confirmation message sent to customer on WhatsApp
    expect(WhatsAppClient.sentMessagesLog.length).toBe(1);
    const sentConfirm = WhatsAppClient.sentMessagesLog[0];
    expect(sentConfirm.message).toContain('ORDER CONFIRMED');
    expect(sentConfirm.message).toContain('• Dia: *75*');
    expect(sentConfirm.message).toContain('• Tint/Color: *Blue*');
    expect(sentConfirm.message).toContain('• Fitting: *supra*');

    erpSpy.mockRestore();
  });

  // Test 18: Interactive List for >3 orders & strict customer order filtering
  it('18. Customer Order Isolation & Interactive List: should send interactive list with only the customer orders when count > 3', async () => {
    WhatsAppClient.clearSentLog();
    const listSpy = vi.spyOn(WhatsAppClient, 'sendInteractiveList');

    // Add 4 orders specifically for ABC Optical in mockErp
    const abcOrders = [
      { orderId: 'SO-2026-ABC01', customer: 'ABC Optical', product: 'I SIGHT', status: 'Draft' },
      { orderId: 'SO-2026-ABC02', customer: 'ABC Optical', product: 'XD ORBIT', status: 'Draft' },
      { orderId: 'SO-2026-ABC03', customer: 'ABC Optical', product: 'BIFOCAL', status: 'In Progress' },
      { orderId: 'SO-2026-ABC04', customer: 'ABC Optical', product: 'I-BOOSTER', status: 'Approved' },
    ];
    // And an order for a different customer that should NEVER be visible to ABC Optical
    const otherOrder = { orderId: 'SO-2026-OTHER99', customer: 'Other Customer', product: 'SINGLE VISION', status: 'Draft' };

    vi.spyOn(mockErp, 'getOrdersByPhone').mockResolvedValueOnce({
      success: true,
      orders: [...abcOrders, otherOrder] as any,
    });

    const abcPhone = '919876543210'; // ABC Optical in MockRioErpClient

    const statusMsg: NormalizedMessage = {
      phone: abcPhone,
      customerName: 'ABC Optical',
      messageId: 'wamid.STATUS_LIST_ABC',
      messageType: 'text',
      text: 'STATUS',
      mediaId: null,
      rawPayload: {},
    };

    const statusResult = await workflow.processNormalizedMessage(statusMsg);

    expect(statusResult.category).toBe('ORDER_STATUS');
    // Should NOT contain the other customer's order
    expect(statusResult.replyText).not.toContain('SO-2026-OTHER99');
    // Should contain all 4 ABC orders
    expect(statusResult.replyText).toContain('SO-2026-ABC01');
    expect(statusResult.replyText).toContain('SO-2026-ABC04');

    // Since there are 4 orders (> 3), WhatsApp interactive list should be sent so customer can tap ANY order
    expect(listSpy).toHaveBeenCalledTimes(1);
    const [sentPhone, sentBody, sentButtonText, sentSections] = listSpy.mock.calls[0];
    expect(sentPhone).toBe(abcPhone);
    expect(sentButtonText).toBe('📋 Select Order');
    expect(sentSections[0].rows.length).toBe(4);
    expect(sentSections[0].rows.map((r: { id: string }) => r.id)).toEqual([
      'STATUS:SO-2026-ABC01',
      'STATUS:SO-2026-ABC02',
      'STATUS:SO-2026-ABC03',
      'STATUS:SO-2026-ABC04',
    ]);

    // Customer taps an order in the interactive list
    WhatsAppClient.clearSentLog();
    const tapMsg: NormalizedMessage = {
      phone: abcPhone,
      customerName: 'ABC Optical',
      messageId: 'wamid.TAP_ORDER_01',
      messageType: 'interactive',
      text: 'STATUS:SO-2026-ABC01',
      mediaId: null,
      rawPayload: {},
    };

    const tapResult = await workflow.processNormalizedMessage(tapMsg);
    expect(tapResult.category).toBe('ORDER_STATUS');
    expect(tapResult.status).toBe('REPLY_SENT');

    listSpy.mockRestore();
  });

  // Test 19: Order Format & Orders with Customer Remarks
  it('19. Customer Remarks: should include Remark in ORDER_FORMAT guide and forward custom remark to Rio ERP and confirmation receipt', async () => {
    WhatsAppClient.clearSentLog();
    const erpSpy = vi.spyOn(mockErp, 'createOrder');

    // Step A: Customer requests ORDER FORMAT guide
    const formatMsg: NormalizedMessage = {
      phone: registeredPhone,
      customerName: 'Ash',
      messageId: 'wamid.FORMAT_REMARK_001',
      messageType: 'text',
      text: 'ORDER FORMAT',
      mediaId: null,
      rawPayload: {},
    };

    const formatResult = await workflow.processNormalizedMessage(formatMsg);
    expect(formatResult.category).toBe('ORDER_FORMAT');
    expect(formatResult.replyText).toContain('Remark:');
    expect(WhatsAppClient.sentMessagesLog[0].message).toContain('Remark:');

    // Step B: Customer places order including Remark: qwert -> receives verification prompt
    WhatsAppClient.clearSentLog();
    const orderMsg: NormalizedMessage = {
      phone: registeredPhone,
      customerName: 'Ash',
      messageId: 'wamid.ORDER_REMARK_001',
      messageType: 'text',
      text: `*ORDER*
• Ref: akl
• Product: Bluecut 1.56
• R: -1.00 / -0.50 x 90
• L: -1.25 / -0.25 x 180
• Dia: 60
• Tint/Color: PHOTO BLUE
• Remark: qwert`,
      mediaId: null,
      rawPayload: {},
    };

    const orderResult = await workflow.processNormalizedMessage(orderMsg);
    expect(orderResult.category).toBe('ORDER_VERIFICATION');
    expect(orderResult.status).toBe('REPLY_SENT');
    expect(erpSpy).not.toHaveBeenCalled();

    // Verify verification card contains Remark: qwert
    expect(WhatsAppClient.sentMessagesLog.length).toBe(1);
    expect(WhatsAppClient.sentMessagesLog[0].message).toContain('• Remark: *qwert*');
    expect(WhatsAppClient.sentMessagesLog[0].buttons).toEqual([
      { id: 'confirm_order', title: '✅ Confirm Order' },
      { id: 'edit_order', title: '✏️ Edit Details' },
    ]);

    // Step C: Customer confirms order via button
    WhatsAppClient.clearSentLog();
    const confirmMsg: NormalizedMessage = {
      phone: registeredPhone,
      customerName: 'Ash',
      messageId: 'wamid.CONFIRM_REMARK_001',
      messageType: 'interactive',
      text: 'confirm_order',
      mediaId: null,
      rawPayload: {},
    };

    const confirmResult = await workflow.processNormalizedMessage(confirmMsg);
    expect(confirmResult.category).toBe('CONFIRM_ORDER');
    expect(confirmResult.status).toBe('CONFIRMATION_SENT');
    expect(erpSpy).toHaveBeenCalledTimes(1);

    // Verify Rio ERP payload includes remarks: qwert across root, details, and details.details
    const calledPayload = erpSpy.mock.calls[0][0];
    expect(calledPayload.remarks).toBe('qwert');
    expect(calledPayload.specialRemark).toBe('qwert');
    expect(calledPayload.details?.remarks).toBe('qwert');
    expect((calledPayload.details?.details as Record<string, unknown>)?.remarks).toBe('qwert');

    // Verify WhatsApp order confirmation receipt includes • Remark: *qwert*
    expect(WhatsAppClient.sentMessagesLog.length).toBe(1);
    const sentConfirm = WhatsAppClient.sentMessagesLog[0];
    expect(sentConfirm.message).toContain('✅ *ORDER CONFIRMED*');
    expect(sentConfirm.message).toContain('• Remark: *qwert*');

    erpSpy.mockRestore();
  });

  // Test 20: Menu Options 1, 2, 3
  it('20. Menu Options 1, 2, 3: "1" must show ORDER_FORMAT guide, "2" or "status" must show recent orders list, "3" must show HELP message', async () => {
    WhatsAppClient.clearSentLog();

    // Option 1 -> ORDER_FORMAT
    const msg1: NormalizedMessage = {
      phone: registeredPhone,
      customerName: 'Ash',
      messageId: 'wamid.MENU_1',
      messageType: 'text',
      text: '1',
      mediaId: null,
      rawPayload: {},
    };
    const res1 = await workflow.processNormalizedMessage(msg1);
    expect(res1.category).toBe('ORDER_FORMAT');
    expect(res1.replyText).toContain('Order Format Guide');
    expect(res1.replyText).toContain('Party:');

    // Option 2 -> ORDER_STATUS (List of orders)
    const msg2: NormalizedMessage = {
      phone: registeredPhone,
      customerName: 'Ash',
      messageId: 'wamid.MENU_2',
      messageType: 'text',
      text: '2',
      mediaId: null,
      rawPayload: {},
    };
    const res2 = await workflow.processNormalizedMessage(msg2);
    expect(res2.category).toBe('ORDER_STATUS');
    expect(res2.replyText).toContain('Your Active Orders');

    // "status" -> ORDER_STATUS (List of orders)
    const msgStatus: NormalizedMessage = {
      phone: registeredPhone,
      customerName: 'Ash',
      messageId: 'wamid.MENU_STATUS',
      messageType: 'text',
      text: 'status',
      mediaId: null,
      rawPayload: {},
    };
    const resStatus = await workflow.processNormalizedMessage(msgStatus);
    expect(resStatus.category).toBe('ORDER_STATUS');
    expect(resStatus.replyText).toContain('Your Active Orders');

    // Option 3 -> HELP
    const msg3: NormalizedMessage = {
      phone: registeredPhone,
      customerName: 'Ash',
      messageId: 'wamid.MENU_3',
      messageType: 'text',
      text: '3',
      mediaId: null,
      rawPayload: {},
    };
    const res3 = await workflow.processNormalizedMessage(msg3);
    expect(res3.category).toBe('HELP');
    expect(res3.replyText).toContain('Help');
  });

  // Test 21: Delivery Status Filtering and Customer Isolation
  it('21. WhatsApp Delivery Status: should filter out Delivered orders and show ONLY active orders for "2" and "STATUS"', async () => {
    WhatsAppClient.clearSentLog();

    // Customer Ash has:
    // Order A: SO-2026-999999999 -> Delivered
    // Order B: SO-2026-479435957 -> Out for Delivery
    // Order C: SO-2026-581335720 -> Pending Pickup

    // 1. Send: "2"
    const msg2: NormalizedMessage = {
      phone: registeredPhone, // Ash: 917718043078
      customerName: 'Ash',
      messageId: 'wamid.DELIVERY_TEST_2',
      messageType: 'text',
      text: '2',
      mediaId: null,
      rawPayload: {},
    };
    const res2 = await workflow.processNormalizedMessage(msg2);

    expect(res2.category).toBe('ORDER_STATUS');
    expect(res2.replyText).toContain('Your Active Orders');
    // Order B -> Out for Delivery MUST appear
    expect(res2.replyText).toContain('SO-2026-479435957');
    expect(res2.replyText).toContain('Out for Delivery');
    // Order C -> Pending Pickup MUST appear
    expect(res2.replyText).toContain('SO-2026-581335720');
    expect(res2.replyText).toContain('Pending Pickup');
    // Order A -> Delivered MUST NOT appear
    expect(res2.replyText).not.toContain('SO-2026-999999999');

    // 2. Send: "STATUS" -> Expected result must be identical
    const msgStatus: NormalizedMessage = {
      phone: registeredPhone,
      customerName: 'Ash',
      messageId: 'wamid.DELIVERY_TEST_STATUS',
      messageType: 'text',
      text: 'STATUS',
      mediaId: null,
      rawPayload: {},
    };
    const resStatus = await workflow.processNormalizedMessage(msgStatus);
    expect(resStatus.replyText).toBe(res2.replyText);

    // 3. Test a customer where all orders are Delivered
    // ABC Optical ('919876543210') only has SO-2026-00124 with status 'Delivered'
    const msgAllDelivered: NormalizedMessage = {
      phone: '919876543210',
      customerName: 'ABC Optical',
      messageId: 'wamid.DELIVERY_ALL_DELIVERED',
      messageType: 'text',
      text: 'STATUS',
      mediaId: null,
      rawPayload: {},
    };
    const resAllDelivered = await workflow.processNormalizedMessage(msgAllDelivered);
    expect(resAllDelivered.replyText).toBe('✅ You have no active orders. All your orders have been delivered.');

    // Also verify "2" returns the same message for customer with all orders delivered
    const msgAllDelivered2: NormalizedMessage = {
      phone: '919876543210',
      customerName: 'ABC Optical',
      messageId: 'wamid.DELIVERY_ALL_DELIVERED_2',
      messageType: 'text',
      text: '2',
      mediaId: null,
      rawPayload: {},
    };
    const resAllDelivered2 = await workflow.processNormalizedMessage(msgAllDelivered2);
    expect(resAllDelivered2.replyText).toBe('✅ You have no active orders. All your orders have been delivered.');

    // 4. Verify Customer Isolation:
    // Customer A (Ash) must NEVER see Customer B's (ABC Optical) order details
    const msgCrossCustomer: NormalizedMessage = {
      phone: registeredPhone, // Ash
      customerName: 'Ash',
      messageId: 'wamid.SECURITY_CROSS_CUSTOMER',
      messageType: 'text',
      text: 'SO-2026-00124', // ABC Optical's order
      mediaId: null,
      rawPayload: {},
    };
    const resCross = await workflow.processNormalizedMessage(msgCrossCustomer);
    expect(resCross.replyText).toContain('Order Not Found');
    expect(resCross.replyText).not.toContain('Edging & Fitting');
    expect(resCross.replyText).not.toContain('ABC Optical');
  });
});



