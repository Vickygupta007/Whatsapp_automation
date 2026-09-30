import { beforeEach, describe, expect, it } from 'vitest';
import { WhatsAppClient } from '../src/integrations/whatsapp/client.js';
import { WhatsAppTemplates } from '../src/integrations/whatsapp/templates.js';

describe('WhatsApp Integration & Templates', () => {
  beforeEach(() => {
    WhatsAppClient.clearSentLog();
  });

  it('should interpolate and format order confirmation message', () => {
    const confirmation = WhatsAppTemplates.getOrderConfirmationMessage({
      orderId: 'SO-2026-00123',
      accountName: 'ABC Optical',
      product: 'I SIGHT',
      customerRef: 'Sharma',
    });

    expect(confirmation).toContain('SO-2026-00123');
    expect(confirmation).toContain('ABC Optical');
    expect(confirmation).toContain('I SIGHT');
    expect(confirmation).toContain('Sharma');
    expect(confirmation).toContain('Rio ERP');
  });

  it('should return non-empty unregistered customer warning message', () => {
    const msg = WhatsAppTemplates.getUnregisteredMessage();
    expect(msg).toContain('not registered');
    expect(msg).toContain('contact support');
  });

  it('should return non-empty invalid order format help message', () => {
    const msg = WhatsAppTemplates.getInvalidOrderHelpMessage();
    expect(msg).toContain('format');
    expect(msg).toContain('Example');
  });

  it('should dispatch simulated message and append to sent log in mock mode', async () => {
    const phone = '919876543210';
    const text = 'Test message from Vitest';

    const result = await WhatsAppClient.sendMessage(phone, text);
    expect(result.success).toBe(true);

    const sent = WhatsAppClient.sentMessagesLog;
    expect(sent.length).toBe(1);
    expect(sent[0].phone).toBe('919876543210');
    expect(sent[0].message).toBe(text);
  });
});
