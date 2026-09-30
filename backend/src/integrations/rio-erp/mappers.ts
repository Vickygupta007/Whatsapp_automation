import { CustomerLookupResult, RioErpCustomer, RioErpOrderRequest, RioErpOrderResponse, RioErpParty } from '../../types/erp.js';
import { InternalOrder } from '../../types/order.js';
import { to10DigitPhone } from '../../utils/phoneNormalizer.js';

export class RioErpMapper {
  /**
   * Maps internal normalized order object to Rio ERP order creation request payload
   * matching the exact n8n optical work order structure.
   */
  public static toErpOrderRequest(order: InternalOrder, party?: RioErpParty): RioErpOrderRequest {
    const cleanMsg = order.rawMessage || '';
    const addMatch = cleanMsg.match(/(?:^|[\s*•_`-])add(?:n|ition)?[*\s]*[:=][*\s]*([+-]?\d+(?:\.\d+)?)/i);
    const orderAdd = order.rx?.right?.addn || order.rx?.left?.addn;
    const addVal = orderAdd
      ? (typeof orderAdd === 'number' ? orderAdd : parseFloat(String(orderAdd)))
      : (addMatch ? parseFloat(addMatch[1]) : 0);

    const parseNum = (val: string | number | null | undefined): number | null => {
      if (val === null || val === undefined || val === '') return null;
      const num = typeof val === 'number' ? val : parseFloat(String(val).replace(/[^0-9.-]/g, ''));
      return isNaN(num) ? null : num;
    };

    const parseIntVal = (val: string | number | null | undefined): number | null => {
      if (val === null || val === undefined || val === '') return null;
      const num = typeof val === 'number' ? Math.round(val) : parseInt(String(val).replace(/[^0-9-]/g, ''), 10);
      return isNaN(num) ? null : num;
    };

    const rightSph = parseNum(order.rx.right.sph);
    const rightCyl = parseNum(order.rx.right.cyl);
    const rightAxis = parseIntVal(order.rx.right.axis);
    const hasRight = rightSph !== null || rightCyl !== null || rightAxis !== null;

    const leftSph = parseNum(order.rx.left.sph);
    const leftCyl = parseNum(order.rx.left.cyl);
    const leftAxis = parseIntVal(order.rx.left.axis);
    const hasLeft = leftSph !== null || leftCyl !== null || leftAxis !== null;

    const fallbackRef = 'WA-' + (party?.accountId || 'ORD') + '-' + Date.now().toString().slice(-4);
    const customerRefNo = order.customerRefNo || fallbackRef;

    const lower = cleanMsg.toLowerCase();
    const hasExplicitProduct = !!order.product && !order.product.endsWith(' Lens');
    let product = order.product ? order.product.trim() : null;
    if (!product || product.endsWith(' Lens')) {
      if (lower.includes('essilor')) product = 'ESSILOR';
      else if (lower.includes('crizal')) product = 'CRIZAL';
      else product = 'I SIGHT';
    }

    const dia = order.dia || null;
    const tintColor = order.tintColor || null;
    const fittingType = order.fittingType || null;
    const customerRemark = order.remarks || (order as any).remark || null;

    // Customer remarks should strictly reflect actual user instructions (or null/empty if none provided).
    // Optical parameters (Dia, Tint/Color, Fitting Type) are sent exclusively in their dedicated optical fields.
    const finalRemarks = customerRemark || null;

    return {
      phone: order.phone || (party?.mobileNumber as string) || '',
      customerRefNo,
      brand: hasExplicitProduct ? product : null,
      brandName: hasExplicitProduct ? product : null,
      product,
      productName: hasExplicitProduct ? product : null,
      hasExplicitProduct,
      lensBrand: hasExplicitProduct ? product : null,
      lensType: order.lensType || null,
      lensCategory: order.lensType || null,
      category: order.lensType || null,
      type: order.lensType || null,
      coating: order.coating || null,
      coatingName: order.coating || null,
      coatingType: order.coating || null,
      index: order.index || null,
      indexKey: order.index || null,
      lensIndex: order.index || null,
      dia,
      diameter: dia,
      tint: tintColor,
      color: tintColor,
      colorName: tintColor,
      tintColor,
      tinting: tintColor,
      tintingName: tintColor,
      colour: tintColor,
      fitting: fittingType,
      fittingType,
      fit: fittingType,
      frameType: fittingType,
      remarks: finalRemarks,
      remark: finalRemarks,
      specialRemark: finalRemarks,
      specialRemarks: finalRemarks,
      notes: finalRemarks,
      note: finalRemarks,
      rawMessage: order.rawMessage,
      rx: {
        right: {
          active: hasRight,
          sph: order.rx.right.sph ?? null,
          cyl: order.rx.right.cyl ?? null,
          axis: order.rx.right.axis ?? null,
          addn: addVal || null,
          dia,
          diameter: dia,
          color: tintColor,
          colorName: tintColor,
          tint: tintColor,
          fitting: fittingType,
          fittingType,
          fit: fittingType,
          remarks: finalRemarks,
          qty: 1,
        },
        left: {
          active: hasLeft,
          sph: order.rx.left.sph ?? null,
          cyl: order.rx.left.cyl ?? null,
          axis: order.rx.left.axis ?? null,
          addn: addVal || null,
          dia,
          diameter: dia,
          color: tintColor,
          colorName: tintColor,
          tint: tintColor,
          fitting: fittingType,
          fittingType,
          fit: fittingType,
          remarks: finalRemarks,
          qty: 1,
        },
      },
      details: {
        dia,
        diameter: dia,
        tint: tintColor,
        color: tintColor,
        colorName: tintColor,
        tintColor,
        tinting: tintColor,
        tintingName: tintColor,
        colour: tintColor,
        fitting: fittingType,
        fittingType,
        fit: fittingType,
        frameType: fittingType,
        remarks: finalRemarks,
        remark: finalRemarks,
        specialRemark: finalRemarks,
        specialRemarks: finalRemarks,
        notes: finalRemarks,
        note: finalRemarks,
        details: {
          dia,
          diameter: dia,
          tint: tintColor,
          color: tintColor,
          colorName: tintColor,
          tintColor,
          tinting: tintColor,
          tintingName: tintColor,
          colour: tintColor,
          fitting: fittingType,
          fittingType,
          fit: fittingType,
          frameType: fittingType,
          remarks: finalRemarks,
          remark: finalRemarks,
          specialRemark: finalRemarks,
          specialRemarks: finalRemarks,
          notes: finalRemarks,
          note: finalRemarks,
        },
      },
      metadata: {
        source: 'whatsapp_automation',
        submittedAt: new Date().toISOString(),
        dia,
        diameter: dia,
        tint: tintColor,
        color: tintColor,
        colorName: tintColor,
        tintColor,
        tinting: tintColor,
        tintingName: tintColor,
        colour: tintColor,
        fitting: fittingType,
        fittingType,
        fit: fittingType,
        frameType: fittingType,
        remarks: finalRemarks,
        remark: finalRemarks,
        specialRemark: finalRemarks,
        notes: finalRemarks,
      },
    };
  }

  /**
   * Adapts raw Rio ERP customer/party lookup response to internal CustomerLookupResult.
   */
  public static mapCustomerResponse(raw: Record<string, unknown>, phone: string): CustomerLookupResult {
    if (!raw) {
      return { found: false };
    }

    // Party object from n8n response: { found: true, party: { ... } }
    const rawParty = (raw.party || raw.customer || raw.data || raw) as Record<string, unknown>;
    const isFound = Boolean(
      raw.found === true ||
      rawParty?.accountId ||
      rawParty?.id ||
      (rawParty?.name && raw.found !== false)
    );

    if (!isFound) {
      return { found: false, rawResponse: raw };
    }

    const party: RioErpParty = {
      id: rawParty.id ? String(rawParty.id) : undefined,
      accountId: String(rawParty.accountId || rawParty.accountCode || rawParty.id || 'ACC-001'),
      name: String(rawParty.name || rawParty.customerName || 'Registered Customer'),
      contactPerson: rawParty.contactPerson ? String(rawParty.contactPerson) : undefined,
      mobileNumber: rawParty.mobileNumber ? String(rawParty.mobileNumber) : phone,
      companyId: rawParty.companyId ? String(rawParty.companyId) : undefined,
      companyName: rawParty.companyName ? String(rawParty.companyName) : 'Rio',
      labId: rawParty.labId ? String(rawParty.labId) : undefined,
      labName: String(rawParty.labName || 'Rio Central Lab'),
      partyType: rawParty.partyType ? String(rawParty.partyType) : undefined,
    };

    const customer: RioErpCustomer = {
      id: party.accountId,
      name: party.name,
      phone,
      accountCode: party.accountId,
      accountId: party.accountId,
      contactPerson: party.contactPerson,
      companyName: party.companyName,
      labName: party.labName,
      isRegistered: true,
      status: String(rawParty.status || 'ACTIVE'),
      customFields: raw,
    };

    return {
      found: true,
      customer,
      party,
      rawResponse: raw,
    };
  }

  /**
   * Adapts raw Rio ERP order creation response to internal RioErpOrderResponse.
   */
  public static mapOrderResponse(raw: Record<string, unknown>): RioErpOrderResponse {
    const orderId = String(
      raw.orderId ||
      raw.id ||
      raw.order_id ||
      raw.soNumber ||
      raw.workOrderNo ||
      `SO-${new Date().getFullYear()}-${Math.floor(10000 + Math.random() * 90000)}`
    );

    const rawParty = (raw.party || {}) as Record<string, unknown>;
    const party: RioErpParty | undefined = raw.party
      ? {
          accountId: String(rawParty.accountId || ''),
          name: String(rawParty.name || ''),
          labName: String(rawParty.labName || ''),
        }
      : undefined;

    const orderRef = raw.orderRef || raw.referenceNumber || raw.customerRefNo ? String(raw.orderRef || raw.referenceNumber || raw.customerRefNo) : undefined;

    return {
      success: raw.success !== false && raw.status !== 'FAILED',
      orderId,
      orderRef,
      status: String(raw.status || 'QUEUED'),
      message: raw.message ? String(raw.message) : 'Order queued in Rio ERP',
      party,
      createdAt: String(raw.createdAt || new Date().toISOString()),
      rawResponse: raw,
    };
  }
}
