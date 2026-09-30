import { describe, expect, it } from 'vitest';
import { RioErpMapper } from '../src/integrations/rio-erp/mappers.js';
import { MockRioErpClient } from '../src/integrations/rio-erp/mockClient.js';
import { OrderParser } from '../src/parsers/orderParser.js';

describe('Rio ERP Order Integration & Mapper', () => {
  const client = new MockRioErpClient();

  it('should correctly map InternalOrder to RioErpOrderRequest', () => {
    const raw = 'R: -1.50 L: -2.00 Bluecut 1.56 Ref: Sharma';
    const parsed = OrderParser.parse(raw, '919876543210');
    const erpRequest = RioErpMapper.toErpOrderRequest(parsed.order);

    expect(erpRequest.phone).toBe('919876543210');
    expect(erpRequest.customerRefNo).toBe('Sharma');
    expect(erpRequest.index).toBe('1.56');
    expect(erpRequest.coating).toBe('BLUE CUT');
    expect(erpRequest.rx.right.sph).toBe('-1.50');
    expect(erpRequest.rx.left.sph).toBe('-2.00');
    expect(erpRequest.metadata?.source).toBe('whatsapp_automation');
  });

  it('should successfully submit an order and receive an ERP Order ID', async () => {
    const raw = 'R: -1.50 L: -2.00 Bluecut 1.56 Ref: Sharma';
    const parsed = OrderParser.parse(raw, '919876543210');
    const erpRequest = RioErpMapper.toErpOrderRequest(parsed.order);

    const response = await client.createOrder(erpRequest);

    expect(response.success).toBe(true);
    expect(response.orderId).toMatch(/^SO-\d{4}-\d{5}$/);
    expect(response.status).toBe('QUEUED');
    expect(response.orderRef).toBe('Sharma');
  });

  it('should map Dia, Tint/Color, and Fitting Type into RioErpOrderRequest payload and details', () => {
    const raw = `Ref: Sharma R: -1.50/-0.50x90 L: -2.00/-0.50x85 Bluecut 1.56*
* Dia: *78*
* Tint/Color: *grey*
* Fitting Type: supra`;
    const parsed = OrderParser.parse(raw, '919876543210');
    const erpRequest = RioErpMapper.toErpOrderRequest(parsed.order);

    expect(erpRequest.dia).toBe('78');
    expect(erpRequest.tintColor).toBe('grey');
    expect(erpRequest.fittingType).toBe('supra');
    expect(erpRequest.rx.right?.dia).toBe('78');
    expect(erpRequest.rx.left?.dia).toBe('78');
    expect(erpRequest.details?.dia).toBe('78');
    expect((erpRequest.details?.details as Record<string, unknown>)?.tintColor).toBe('grey');
    expect((erpRequest.details?.details as Record<string, unknown>)?.fittingType).toBe('supra');
    expect(erpRequest.remarks).toBeNull();
  });

  it('should map custom customer Remark into RioErpOrderRequest remarks and specialRemark fields', () => {
    const raw = `*ORDER*
• Ref: akl
• Product: Bluecut 1.56
• R: -1.00 / -0.50 x 90
• L: -1.25 / -0.25 x 180
• Dia: 60
• Tint/Color: PHOTO BLUE
• Remark: qwert`;
    const parsed = OrderParser.parse(raw, '919876543210');
    expect(parsed.order.remarks).toBe('qwert');

    const erpRequest = RioErpMapper.toErpOrderRequest(parsed.order);
    expect(erpRequest.remarks).toBe('qwert');
    expect(erpRequest.specialRemark).toBe('qwert');
    expect(erpRequest.details?.remarks).toBe('qwert');
    expect((erpRequest.details?.details as Record<string, unknown>)?.remarks).toBe('qwert');
  });
});
