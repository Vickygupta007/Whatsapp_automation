import axios, { AxiosInstance } from 'axios';
import { config } from '../../config/env.js';
import { CustomerLookupResult, DeliveryTaskData, IRioErpClient, RioErpOrderRequest, RioErpOrderResponse, RioErpOrderStatusData, RioErpOrderStatusResponse, RioErpOrdersListResponse } from '../../types/erp.js';
import { logger } from '../../utils/logger.js';
import { normalizePhone } from '../../utils/phoneNormalizer.js';
import { RioErpMapper } from './mappers.js';

import { StoreErpConfig } from '../../config/stores.js';
import { AppRepository } from '../../database/repository.js';

export class LiveRioErpClient implements IRioErpClient {
  private http: AxiosInstance;

  constructor(customConfig?: StoreErpConfig) {
    const authType = customConfig?.authType || config.RIO_ERP_AUTH_TYPE;
    const apiKey = customConfig?.apiKey || config.RIO_ERP_API_KEY;
    const username = customConfig?.username || config.RIO_ERP_USERNAME;
    const password = customConfig?.password || config.RIO_ERP_PASSWORD;
    const baseUrl = customConfig?.baseUrl || config.RIO_ERP_BASE_URL;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };

    if (authType === 'api-key' && apiKey) {
      headers['x-api-key'] = apiKey;
      headers['X-API-KEY'] = apiKey;
    } else if (authType === 'bearer' && apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    } else if (authType === 'basic' && username) {
      const token = Buffer.from(`${username}:${password}`).toString('base64');
      headers['Authorization'] = `Basic ${token}`;
    }

    this.http = axios.create({
      baseURL: baseUrl,
      timeout: 10000,
      headers,
    });
  }

  public async findCustomerByPhone(phone: string): Promise<CustomerLookupResult> {
    const cleanDigits = phone.replace(/\D/g, '');
    const phone10 = cleanDigits.slice(-10);
    const normalized = normalizePhone(phone);
    logger.info(`[LiveRioErpClient] Looking up party in Rio ERP: ${phone10} (E.164: +${normalized})`);

    // 1. Try standard endpoint: POST /api/integrations/whatsapp/lookup-party
    try {
      const response = await this.http.post('/api/integrations/whatsapp/lookup-party', { phone: phone10 });
      const mapped = RioErpMapper.mapCustomerResponse(response.data as Record<string, unknown>, normalized);
      if (mapped.found && mapped.party) {
        AppRepository.saveKnownParty(phone, mapped.party);
        return mapped;
      }
    } catch (err: unknown) {
      if (axios.isAxiosError(err) && err.response?.status === 404) {
        return { found: false, rawResponse: err.response?.data };
      }
      logger.warn(`[LiveRioErpClient] Direct /lookup-party endpoint error: ${String(err)}. Checking persistent party registry and staff fallback...`);
    }

    // 2. Resilient Fallback A: Check database & persistent known parties cache
    const knownParty = await AppRepository.findLastKnownParty(phone);
    if (knownParty) {
      logger.info(`[LiveRioErpClient] Found customer in persistent party registry for ${phone10}: ${knownParty.name} (${knownParty.accountId})`);
      return {
        found: true,
        party: knownParty,
        customer: {
          id: knownParty.id || 'known_cust',
          accountId: knownParty.accountId || 'ACC',
          name: knownParty.name || 'Registered Customer',
          phone: knownParty.mobileNumber || phone,
          labName: knownParty.labName || 'RIO-AHMEDABAD',
          isRegistered: true,
          status: 'ACTIVE',
        },
      };
    }

    // 3. Resilient Fallback B: Query Rio ERP staff API (/api/accounts and /api/onboarding) using staff token
    try {
      const token = await this.getStaffToken();
      if (token) {
        // Check master accounts
        const accRes = await axios.get(`${config.RIO_ERP_BASE_URL}/api/accounts`, {
          headers: { Authorization: `Bearer ${token}` },
          timeout: 5000,
        });
        if (Array.isArray(accRes.data)) {
          const match = accRes.data.find((a: any) => {
            const m = String(a.MobileNumber || a.mobileNumber || a.phone || a.contactNumber || '').replace(/\D/g, '').slice(-10);
            return m === phone10;
          });
          if (match) {
            const party = {
              id: match.id || match._id,
              name: match.Name || match.name || match.accountName,
              accountId: match.AccountId || match.accountId || 'ACC',
              labId: match.labId || '81bdc55a-3dae-4caf-8907-e6c586a18836',
              labName: 'RIO-AHMEDABAD',
              companyId: match.companyId,
              companyName: 'Rio',
              partyType: 'retailer',
              mobileNumber: phone10,
              contactPerson: match.ContactPerson || match.name,
            };
            AppRepository.saveKnownParty(phone, party);
            return {
              found: true,
              party,
              customer: {
                id: party.id,
                accountId: party.accountId,
                name: party.name,
                phone,
                labName: party.labName,
                isRegistered: true,
                status: 'ACTIVE',
              },
            };
          }
        }

        // If not found in /api/accounts, check /api/onboarding for approved clients onboarded via website
        const onbRes = await axios.get(`${config.RIO_ERP_BASE_URL}/api/onboarding`, {
          headers: { Authorization: `Bearer ${token}` },
          timeout: 5000,
        });
        if (Array.isArray(onbRes.data)) {
          const onbMatch = onbRes.data.find((o: any) => {
            const isApproved = ['approved', 'active', 'verified'].includes(String(o.status || '').toLowerCase());
            if (!isApproved) return false;
            const m1 = String(o.mobile || o.phone || '').replace(/\D/g, '').slice(-10);
            const m2 = String(o.formData?.mobile || o.formData?.phone || o.formData?.alternateMobile || '').replace(/\D/g, '').slice(-10);
            return m1 === phone10 || m2 === phone10;
          });
          if (onbMatch) {
            const resolvedName = (onbMatch.partyName || onbMatch.shopName || onbMatch.formData?.partyName || onbMatch.formData?.shopName || 'Valued Customer').trim();
            const resolvedAccountId = onbMatch.formData?.approvedAccountId || onbMatch.approvedAccountId || onbMatch.requestId || 'ACC';
            const labLoc = String(onbMatch.labLocation || onbMatch.company || '').toLowerCase();
            const resolvedLab = labLoc.includes('mumbai') || labLoc.includes('maharashtra') ? 'RIO-MAHARASHTRA' : 'RIO-AHMEDABAD';

            const party = {
              id: onbMatch.id || onbMatch._id || onbMatch.requestId,
              name: resolvedName,
              accountId: resolvedAccountId,
              labId: onbMatch.labId || '81bdc55a-3dae-4caf-8907-e6c586a18836',
              labName: resolvedLab,
              companyId: onbMatch.companyId,
              companyName: onbMatch.company || 'Rio',
              partyType: onbMatch.partyType || 'retailer',
              mobileNumber: phone10,
              contactPerson: onbMatch.contactPerson || onbMatch.ownerName || onbMatch.formData?.contactPerson,
            };
            AppRepository.saveKnownParty(phone, party);
            logger.info(`[LiveRioErpClient] Found customer in Rio approved onboarding for ${phone10}: ${party.name} (${party.accountId})`);
            return {
              found: true,
              party,
              customer: {
                id: party.id,
                accountId: party.accountId,
                name: party.name,
                phone,
                labName: party.labName,
                isRegistered: true,
                status: 'ACTIVE',
              },
            };
          }
        }
      }
    } catch (accErr) {
      logger.warn(`[LiveRioErpClient] Staff accounts/onboarding lookup failed: ${String(accErr)}`);
    }

    return { found: false };
  }

  public async createOrder(orderData: RioErpOrderRequest): Promise<RioErpOrderResponse> {
    const phone10 = orderData.phone.replace(/\D/g, '').slice(-10);
    logger.info(`[LiveRioErpClient] Submitting order to Rio ERP for phone: ${phone10}`, {
      product: orderData.product,
      coating: orderData.coating,
      ref: orderData.customerRefNo,
    });

    try {
      // Endpoint from n8n: POST /api/integrations/whatsapp/order
      const payload = {
        ...orderData,
        phone: phone10,
      };
      const response = await this.http.post('/api/integrations/whatsapp/order', payload);
      const orderResponse = RioErpMapper.mapOrderResponse(response.data as Record<string, unknown>);

      // Immediately sync optical parameters (Color, Dia, Fitting) and live calculated rates to Rio ERP's database
      if (orderResponse.success && orderResponse.orderId) {
        const syncResult = await this.syncRioErpOrderDetails(orderResponse.orderId, orderData);
        if (syncResult && syncResult.amount) {
          orderResponse.amount = syncResult.amount;
        }
      }

      return orderResponse;
    } catch (err: unknown) {
      logger.warn(`[LiveRioErpClient] Primary /order endpoint failed (${String(err)}). Submitting via direct sales order API...`);
      try {
        const directResult = await this.createSalesOrderDirectly(orderData);
        if (directResult.success) {
          return directResult;
        }
      } catch (directErr) {
        logger.error(`[LiveRioErpClient] Direct sales order creation also failed: ${String(directErr)}`);
      }
      throw err;
    }
  }

  private async createSalesOrderDirectly(orderData: RioErpOrderRequest): Promise<RioErpOrderResponse> {
    const token = await this.getStaffToken();
    if (!token) {
      throw new Error('Staff token unavailable for direct sales order creation');
    }

    const targetPartyName = orderData.partyName || 'amk';
    const targetBrand = orderData.brand || orderData.brandName || 'HYPE';
    const targetProduct = orderData.product || orderData.productName || 'HYPE B B';
    const targetLensType = orderData.lensType || 'Single Vision';
    const targetCategory = orderData.lensCategory || targetLensType || 'Single Vision';
    const targetCoating = orderData.coating || 'ARC';
    const targetIndex = orderData.index || '1.56';
    const targetCustomerRefNo = orderData.customerRefNo || 'WhatsApp Order';

    const rSph = orderData.rx?.right?.sph ? Number(orderData.rx.right.sph) : 0;
    const rCyl = orderData.rx?.right?.cyl ? Number(orderData.rx.right.cyl) : 0;
    const rAxis = orderData.rx?.right?.axis !== undefined && orderData.rx?.right?.axis !== null ? Number(orderData.rx.right.axis) : (rCyl !== 0 ? 90 : 0);
    const rQty = orderData.rx?.right?.qty || 1;

    const lSph = orderData.rx?.left?.sph ? Number(orderData.rx.left.sph) : 0;
    const lCyl = orderData.rx?.left?.cyl ? Number(orderData.rx.left.cyl) : 0;
    const lAxis = orderData.rx?.left?.axis !== undefined && orderData.rx?.left?.axis !== null ? Number(orderData.rx.left.axis) : (lCyl !== 0 ? 90 : 0);
    const lQty = orderData.rx?.left?.qty || 1;

    const targetDia = orderData.dia || orderData.diameter || (orderData.details as any)?.dia || null;
    const targetColor = orderData.color || orderData.colorName || orderData.tintColor || orderData.tint || null;
    const targetTinting = orderData.tintingName || orderData.tinting || null;
    const targetFitting = orderData.fitting || orderData.fittingType || orderData.fit || null;
    const targetRemarks = orderData.remarks || orderData.remark || orderData.specialRemark || null;
    const rPrism = orderData.rx?.right?.prism ? parseFloat(String(orderData.rx.right.prism)) : 0;
    const lPrism = orderData.rx?.left?.prism ? parseFloat(String(orderData.rx.left.prism)) : 0;

    // Determine baseline catalog price
    let basePrice = 680; // default for HYPE B B 1.56
    const pUpper = targetProduct.toUpperCase();
    const bUpper = targetBrand.toUpperCase();
    if (pUpper.includes('HYPE') || bUpper.includes('HYPE')) basePrice = 680;
    else if (pUpper.includes('O2') || bUpper.includes('O2')) basePrice = 1000;
    else if (pUpper.includes('CR') || bUpper.includes('BIFOCAL')) basePrice = 5000;
    else if (pUpper.includes('I SIGHT') || bUpper.includes('ISIGHT')) basePrice = 500;

    let prismCharge = (rPrism > 0 ? rPrism * 200 : 0) + (lPrism > 0 ? lPrism * 200 : 0);
    let fittingCharge = targetFitting && targetFitting.toLowerCase() !== 'none' && targetFitting !== '-' ? 100 : 0;
    let tintingCharge = targetTinting && targetTinting.toLowerCase() !== 'none' && targetTinting !== '-' ? 100 : 0;
    let totalSpecial = prismCharge + fittingCharge + tintingCharge;
    let subTotal = basePrice + totalSpecial;
    let taxAmount = Math.round(subTotal * 0.05);
    let grandTotal = subTotal + taxAmount;

    // Query live Rio ERP calculate-rates API with staff bearer token
    try {
      const pricingRes = await axios.post(
        `${config.RIO_ERP_BASE_URL}/api/pricing/calculate-rates`,
        {
          brand: targetBrand,
          productName: targetProduct,
          lensName: targetProduct,
          lensCategory: targetCategory,
          lensType: targetLensType,
          lensIndex: targetIndex,
          coating: targetCoating,
          partyName: targetPartyName,
          rightActive: true, rightSph: rSph, rightCyl: rCyl, rightAxis: rAxis, rightQty: rQty,
          leftActive: true, leftSph: lSph, leftCyl: lCyl, leftAxis: lAxis, leftQty: lQty,
          colorName: targetColor, dia: targetDia, tintingName: targetTinting, fittingType: targetFitting,
          taxRate: 5,
        },
        { headers: { Authorization: `Bearer ${token}` }, timeout: 6000 }
      );
      if (pricingRes.data && pricingRes.data.success && Number(pricingRes.data.baseSalePrice) > 0) {
        const rates = pricingRes.data;
        basePrice = Number(rates.baseSalePrice) || basePrice;
        subTotal = Number(rates.subTotal) || subTotal;
        taxAmount = Number(rates.taxAmount) || taxAmount;
        grandTotal = Number(rates.grandTotal) || (subTotal + taxAmount);
        totalSpecial = Number(rates.specialCharges) || totalSpecial;
        fittingCharge = Number(rates.serviceChargesDetails?.fitCharge) || fittingCharge;
        tintingCharge = Number(rates.serviceChargesDetails?.tintCharge) || tintingCharge;
        prismCharge = (Number(rates.rightDetails?.prismExtra) || 0) + (Number(rates.leftDetails?.prismExtra) || 0) || prismCharge;
      }
    } catch (rateErr) {
      logger.warn(`[LiveRioErpClient] Live calculate-rates note: ${String(rateErr)}`);
    }

    const financials = {
      lensBaseSubTotal: basePrice,
      lensBasePrice: basePrice,
      grossSubTotal: subTotal,
      subTotal: subTotal,
      specialCharges: totalSpecial,
      fittingCharge: fittingCharge,
      tintingCharge: tintingCharge,
      prismCharge: prismCharge,
      taxRate: 5,
      taxAmount: taxAmount,
      taxApplicable: 'CGST_SGST',
      cgstRate: 2.5,
      sgstRate: 2.5,
      cgstAmount: taxAmount / 2,
      sgstAmount: taxAmount / 2,
      amountReceived: 0,
      balance: grandTotal,
      netFinalTotal: subTotal,
      grandTotal: grandTotal,
    };

    const payload: Record<string, any> = {
      customer: targetPartyName,
      partyName: targetPartyName,
      brand: targetBrand,
      product: targetProduct,
      lensType: targetLensType,
      lensCategory: targetCategory,
      coating: targetCoating,
      index: targetIndex,
      customerRefNo: targetCustomerRefNo,
      rightActive: true,
      rightSph: rSph,
      rightCyl: rCyl,
      rightAxis: rAxis > 0 ? rAxis : (rCyl !== 0 ? 90 : 0),
      rightQty: rQty,
      leftActive: true,
      leftSph: lSph,
      leftCyl: lCyl,
      leftAxis: lAxis > 0 ? lAxis : (lCyl !== 0 ? 90 : 0),
      leftQty: lQty,
      color: targetColor,
      dia: targetDia,
      tinting: targetTinting,
      fitting: targetFitting,
      fittingType: targetFitting,
      remarks: targetRemarks,
      remark: targetRemarks,
      specialRemark: targetRemarks,
      amount: grandTotal,
      grandTotal: grandTotal,
      subTotal: subTotal,
      taxAmount: taxAmount,
      taxRate: 5,
      basePrice: basePrice,
      lensBasePrice: basePrice,
      rightRate: Math.round(basePrice / 2),
      leftRate: Math.round(basePrice / 2),
      financials: financials,
      details: JSON.stringify({
        customer: targetPartyName,
        partyName: targetPartyName,
        amount: grandTotal,
        grandTotal: grandTotal,
        subTotal: subTotal,
        financials: financials,
        color: targetColor,
        dia: targetDia,
        tinting: targetTinting,
        fitting: targetFitting,
        fittingType: targetFitting,
        remarks: targetRemarks,
      }),
    };

    const res = await axios.post(`${config.RIO_ERP_BASE_URL}/api/sales/orders`, payload, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 10000,
    });

    const createdOrder = res.data;
    const orderId = createdOrder.orderId || createdOrder.id;

    return {
      success: true,
      orderId,
      status: createdOrder.status || 'ORDER_CONFIRMED',
      createdAt: createdOrder.createdAt || new Date().toISOString(),
      amount: createdOrder.amount || grandTotal,
      rawResponse: createdOrder,
    };

    return {
      success: true,
      orderId,
      status: createdOrder.status || 'ORDER_CONFIRMED',
      createdAt: createdOrder.createdAt || new Date().toISOString(),
      amount: createdOrder.amount || 0,
      rawResponse: createdOrder,
    };
  }

  private staffToken: string | null = null;
  private staffTokenExpiry: number = 0;

  private async getStaffToken(): Promise<string | null> {
    const now = Date.now();
    if (this.staffToken && now < this.staffTokenExpiry) {
      return this.staffToken;
    }

    const username = process.env.RIO_ERP_STAFF_USERNAME || 'abhinandan';
    const password = process.env.RIO_ERP_STAFF_PASSWORD || 'store@123';

    try {
      const res = await axios.post(
        `${config.RIO_ERP_BASE_URL}/api/auth/login`,
        {
          username,
          password,
          portalType: 'LAB_STAFF',
        },
        { timeout: 7000 }
      );

      const token = (res.data?.token || res.data?.accessToken) as string | undefined;
      if (token) {
        this.staffToken = token;
        this.staffTokenExpiry = now + 2 * 60 * 60 * 1000;
        return token;
      }
    } catch (err: unknown) {
      logger.warn(`[LiveRioErpClient] Failed to obtain staff auth token for order sync: ${String(err)}`);
    }
    return null;
  }

  private async syncRioErpOrderDetails(orderId: string, orderData: RioErpOrderRequest): Promise<{ success: boolean; amount?: number } | void> {
    try {
      const token = await this.getStaffToken();
      if (!token) {
        logger.warn(`[LiveRioErpClient] Cannot sync order ${orderId}: No staff token available`);
        return;
      }

      const listRes = await axios.get(`${config.RIO_ERP_BASE_URL}/api/sales/orders`, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 8000,
      });

      const existing = Array.isArray(listRes.data)
        ? listRes.data.find((o: Record<string, unknown>) => o.orderId === orderId || o.id === orderId)
        : null;

      if (!existing) {
        logger.warn(`[LiveRioErpClient] Order ${orderId} not found in Rio ERP orders list for optical sync`);
        return;
      }

      const cleanOrDash = (val: unknown): string => {
        if (!val || typeof val !== 'string') return '-';
        const trimmed = val.trim();
        if (
          !trimmed ||
          trimmed === '__' ||
          trimmed === '-' ||
          trimmed === '—' ||
          trimmed === '–' ||
          /^[—–-]+$/.test(trimmed) ||
          trimmed.toLowerCase() === 'na' ||
          trimmed.toLowerCase() === 'n/a' ||
          trimmed.toLowerCase() === 'none' ||
          trimmed.toLowerCase() === 'nil' ||
          trimmed.toLowerCase() === 'null' ||
          trimmed.toLowerCase() === 'undefined'
        ) {
          return '-';
        }
        return trimmed;
      };

      const getValidRemark = (val: unknown): string | null => {
        if (!val || typeof val !== 'string') return null;
        const trimmed = val.trim();
        if (
          !trimmed ||
          trimmed === '__' ||
          trimmed === '-' ||
          trimmed === '—' ||
          trimmed === '–' ||
          /^[—–-]+$/.test(trimmed) ||
          trimmed.toLowerCase() === 'na' ||
          trimmed.toLowerCase() === 'n/a' ||
          trimmed.toLowerCase() === 'none' ||
          trimmed.toLowerCase() === 'nil' ||
          trimmed.toLowerCase() === 'null' ||
          trimmed.toLowerCase() === 'undefined'
        ) {
          return null;
        }
        return trimmed;
      };

      const targetColor = cleanOrDash(
        orderData.color ||
        orderData.colorName ||
        orderData.tintColor ||
        orderData.tint ||
        (orderData.details as Record<string, unknown> | undefined)?.color
      );
      const targetDia = cleanOrDash(
        orderData.dia ||
        orderData.diameter ||
        (orderData.details as Record<string, unknown> | undefined)?.dia
      );
      const targetFitting = cleanOrDash(
        orderData.fitting ||
        orderData.fittingType ||
        orderData.fit ||
        (orderData.details as Record<string, unknown> | undefined)?.fitting
      );
      const rawTinting = orderData.tintingName || orderData.tinting;
      const targetTinting = (rawTinting && cleanOrDash(rawTinting) !== '-')
        ? cleanOrDash(rawTinting)
        : null;

      const targetRemarks = getValidRemark(
        orderData.remarks ||
        orderData.remark ||
        orderData.specialRemark ||
        orderData.specialRemarks ||
        orderData.notes ||
        orderData.note ||
        (orderData.details as Record<string, unknown> | undefined)?.remarks ||
        (orderData.details as Record<string, unknown> | undefined)?.remark
      );

      // Product & Brand: Only use user-entered product/brand; do not silently replace
      const rawProduct = orderData.product || orderData.productName;
      const targetProduct = (rawProduct && cleanOrDash(rawProduct) !== '-')
        ? cleanOrDash(rawProduct)
        : (cleanOrDash(existing.product) !== '-' ? existing.product : 'I SIGHT FF');

      const rawBrand = orderData.brand || orderData.brandName;
      const targetBrand = (rawBrand && cleanOrDash(rawBrand) !== '-')
        ? cleanOrDash(rawBrand)
        : (cleanOrDash(existing.brand) !== '-' ? existing.brand : 'I SIGHT');

      const rawRxType = orderData.rxType;
      const targetRxType = (rawRxType && cleanOrDash(rawRxType) !== '-')
        ? cleanOrDash(rawRxType)
        : 'Prescription';

      // Coating: Only use user-entered coating; if omitted, pass null
      const rawCoating = orderData.coating || orderData.coatingName;
      const targetCoating = (rawCoating && cleanOrDash(rawCoating) !== '-')
        ? cleanOrDash(rawCoating)
        : null;

      // Index: Only use user-entered index; if omitted, pass null
      const rawIndex = orderData.index || orderData.indexKey || orderData.lensIndex;
      const targetIndex = (rawIndex && cleanOrDash(rawIndex) !== '-')
        ? cleanOrDash(rawIndex)
        : null;

      // Lens Type: Only use user-entered lensType; do not silently replace
      const rawLensType = orderData.lensType || (orderData as any).type;
      const targetLensType = (rawLensType && cleanOrDash(rawLensType) !== '-')
        ? cleanOrDash(rawLensType)
        : '-';

      // Lens Category
      const rawCategory = orderData.lensCategory || orderData.category;
      const targetCategory = (rawCategory && cleanOrDash(rawCategory) !== '-')
        ? cleanOrDash(rawCategory)
        : (targetLensType !== '-' ? targetLensType : 'Single Vision');

      const targetCustomerRefNo = cleanOrDash(orderData.customerRefNo || existing.customerRefNo);
      const targetPartyName = orderData.partyName || existing.partyName || existing.customer;
      const targetDiscount = orderData.discount ? Number(orderData.discount) || 0 : 0;

      // Prescription parameters
      const rSph = orderData.rx?.right?.sph ? String(orderData.rx.right.sph) : '0.00';
      const rCyl = orderData.rx?.right?.cyl ? String(orderData.rx.right.cyl) : '0.00';
      const rAxis = orderData.rx?.right?.axis !== undefined && orderData.rx?.right?.axis !== null ? String(orderData.rx.right.axis) : '';
      const rAddn = orderData.rx?.right?.addn ? String(orderData.rx.right.addn) : '';
      const rPrism = orderData.rx?.right?.prism ? parseFloat(String(orderData.rx.right.prism)) : 0;
      const rQty = orderData.rx?.right?.qty || 1;
      const rCorridor = (orderData.rx?.right as any)?.corridor || null;
      const rEtCtType = (orderData.rx?.right as any)?.etCtType || null;
      const rEtCtVal = (orderData.rx?.right as any)?.etCtVal || null;
      const rMm = (orderData.rx?.right as any)?.mm || null;

      const lSph = orderData.rx?.left?.sph ? String(orderData.rx.left.sph) : '0.00';
      const lCyl = orderData.rx?.left?.cyl ? String(orderData.rx.left.cyl) : '0.00';
      const lAxis = orderData.rx?.left?.axis !== undefined && orderData.rx?.left?.axis !== null ? String(orderData.rx.left.axis) : '';
      const lAddn = orderData.rx?.left?.addn ? String(orderData.rx.left.addn) : '';
      const lPrism = orderData.rx?.left?.prism ? parseFloat(String(orderData.rx.left.prism)) : 0;
      const lQty = orderData.rx?.left?.qty || 1;
      const lCorridor = (orderData.rx?.left as any)?.corridor || null;
      const lEtCtType = (orderData.rx?.left as any)?.etCtType || null;
      const lEtCtVal = (orderData.rx?.left as any)?.etCtVal || null;
      const lMm = (orderData.rx?.left as any)?.mm || null;

      // Surcharges & Color adjustments
      const isPhotoBlue = /photo\s*blue/i.test(targetColor || '');
      const isMirrorCoating = /mirror/i.test(targetCoating || '');
      const isCustomColor = /custom|pink|cyan/i.test(targetColor || '') || isPhotoBlue || isMirrorCoating;
      const colorCharge = (isPhotoBlue || isCustomColor || isMirrorCoating) ? 500 : 0;
      const isSpecialFitting = /supra|rimless|grooving|nylor|full/i.test(targetFitting || '');

      let existingDetails: Record<string, unknown> = {};
      if (typeof existing.details === 'string') {
        try {
          existingDetails = JSON.parse(existing.details);
        } catch {
          existingDetails = {};
        }
      } else if (existing.details && typeof existing.details === 'object') {
        existingDetails = { ...(existing.details as Record<string, unknown>) };
      }

      // Catalog base mapping fallback for Rio lensPriceMaster
      const mapPricingCatalog = (prod: string, brand: string): { lensName: string; brand: string; defaultBase: number } => {
        const p = (prod || '').toUpperCase().trim();
        const b = (brand || '').toUpperCase().trim();
        if (p.includes('HYPE') || b.includes('HYPE')) {
          return { lensName: 'HYPE B B', brand: 'HYPE', defaultBase: 680 };
        }
        if (p.includes('O2') || p.includes('VECO') || b.includes('O2')) {
          return { lensName: 'O2 VECO CUSTOMIZED SINGLE VISION', brand: 'O2', defaultBase: 1000 };
        }
        if (p.includes('CR') || p.includes('BIFOCAL') || p.includes('KT') || b.includes('BIFOCAL')) {
          return { lensName: 'CR KT 1.50', brand: 'BIFOCAL', defaultBase: 5000 };
        }
        return { lensName: 'I SIGHT FF', brand: 'I SIGHT', defaultBase: 500 };
      };

      const pricingMaster = mapPricingCatalog(
        targetProduct !== '-' ? targetProduct : '',
        targetBrand !== '-' ? targetBrand : ''
      );

      // Calculate live pricing using Rio ERP's authoritative backend rate calculation engine
      let calculatedAmount: number = Number(existing.amount) || 0;
      let calculatedFinancials: Record<string, unknown> = (existingDetails.financials as Record<string, unknown>) || {};
      let calculatedRateBreakdown: Record<string, unknown> = (existingDetails.rateBreakdown as Record<string, unknown>) || {};

      try {
        const pricingReq = {
          brand: targetBrand !== '-' ? targetBrand : pricingMaster.brand,
          lensName: targetProduct !== '-' ? targetProduct : pricingMaster.lensName,
          productName: targetProduct !== '-' ? targetProduct : pricingMaster.lensName,
          lensCategory: targetCategory,
          lensType: targetLensType !== '-' ? targetLensType : 'Single Vision',
          lensIndex: targetIndex || '1.50',
          coating: targetCoating || '',
          colorName: targetColor !== '-' ? targetColor : undefined,
          dia: targetDia !== '-' ? targetDia : undefined,
          tintingName: targetTinting || undefined,
          fittingType: targetFitting !== '-' ? targetFitting : 'None (Uncut Lenses)',
          partyId: existing.partyId,
          partyType: existing.partyType || 'retailer',
          partyName: targetPartyName,
          rightActive: orderData.rx?.right?.active ?? true,
          rightSph: rSph,
          rightCyl: rCyl,
          rightAxis: rAxis,
          rightAddn: rAddn,
          rightPrism: rPrism,
          rightQty: rQty,
          leftActive: orderData.rx?.left?.active ?? true,
          leftSph: lSph,
          leftCyl: lCyl,
          leftAxis: lAxis,
          leftAddn: lAddn,
          leftPrism: lPrism,
          leftQty: lQty,
          taxRate: 5,
        };

        let pricingRes = await axios.post(
          `${config.RIO_ERP_BASE_URL}/api/pricing/calculate-rates`,
          pricingReq,
          { headers: { Authorization: `Bearer ${token}` }, timeout: 6000 }
        );

        // If a specific coating like 'ARC' caused 0 baseSalePrice match in lensPriceMaster,
        // retry with empty coating so Rio matches the product's base price from the catalog
        if (
          pricingRes.data &&
          pricingRes.data.success &&
          (Number(pricingRes.data.baseSalePrice) || 0) === 0 &&
          pricingReq.coating
        ) {
          try {
            const fallbackRes = await axios.post(
              `${config.RIO_ERP_BASE_URL}/api/pricing/calculate-rates`,
              { ...pricingReq, coating: '' },
              { headers: { Authorization: `Bearer ${token}` }, timeout: 6000 }
            );
            if (
              fallbackRes.data &&
              fallbackRes.data.success &&
              (Number(fallbackRes.data.baseSalePrice) || 0) > 0
            ) {
              pricingRes = fallbackRes;
            }
          } catch {
            // Keep original pricing response if fallback fails
          }
        }

        if (pricingRes.data && pricingRes.data.success) {
          const rates = pricingRes.data;
          const subTotal = Number(rates.subTotal) || 0;
          const taxAmount = Number(rates.taxAmount) || 0;
          const grandTotal = Number(rates.grandTotal) || (subTotal + taxAmount);
          const effectiveTaxRate = Number(rates.taxRate) || 5;

          if (grandTotal > 0) {
            calculatedAmount = grandTotal;
            calculatedRateBreakdown = rates;
            calculatedFinancials = {
              lensBaseSubTotal: Number(rates.baseSalePrice) || subTotal,
              lensBasePrice: Number(rates.baseSalePrice) || subTotal,
              grossSubTotal: subTotal,
              subTotal: subTotal,
              specialCharges: Number(rates.serviceChargesDetails?.totalSpecialCharges) || Number(rates.specialCharges) || 0,
              fittingCharge: Number(rates.serviceChargesDetails?.fitCharge) || 0,
              tintingCharge: Number(rates.serviceChargesDetails?.tintCharge) || 0,
              colorCharge: Number(rates.colorCharge) || Number(rates.serviceChargesDetails?.colorCharge) || 0,
              diaCharge: Number(rates.serviceChargesDetails?.diaCharge) || 0,
              prismCharge: (Number(rates.rightDetails?.prismExtra) || 0) + (Number(rates.leftDetails?.prismExtra) || 0),
              taxRate: effectiveTaxRate,
              taxAmount: taxAmount,
              taxApplicable: 'CGST_SGST',
              cgstRate: effectiveTaxRate / 2,
              sgstRate: effectiveTaxRate / 2,
              cgstAmount: taxAmount / 2,
              sgstAmount: taxAmount / 2,
              amountReceived: 0,
              balance: grandTotal,
              netFinalTotal: subTotal,
              grandTotal: grandTotal,
              serviceChargesDetails: rates.serviceChargesDetails || null,
              specialPriceConfig: rates.specialPriceConfig || null,
              appliedOffers: rates.appliedOffers || [],
              rateSource: rates.rateSource || 'Backend Pricing Engine'
            };
          }
        }
      } catch (rateErr: unknown) {
        logger.warn(`[LiveRioErpClient] Rate calculation note for ${orderId}: ${String(rateErr)}`);
      }

      if (calculatedAmount === 0 && pricingMaster.defaultBase > 0) {
        const fallbackBase = pricingMaster.defaultBase;
        const fallbackPrism = (rPrism > 0 ? rPrism * 200 : 0) + (lPrism > 0 ? lPrism * 200 : 0);
        const fallbackFitting = targetFitting && targetFitting.toLowerCase() !== 'none' && targetFitting !== '-' ? 100 : 0;
        const fallbackTinting = targetTinting && targetTinting.toLowerCase() !== 'none' && targetTinting !== '-' ? 100 : 0;
        const fallbackSpecial = fallbackPrism + fallbackFitting + fallbackTinting;
        const fallbackSubTotal = fallbackBase + fallbackSpecial;
        const fallbackTax = Math.round(fallbackSubTotal * 0.05);
        const fallbackGrandTotal = fallbackSubTotal + fallbackTax;
        calculatedAmount = fallbackGrandTotal;
        calculatedFinancials = {
          lensBaseSubTotal: fallbackBase,
          lensBasePrice: fallbackBase,
          grossSubTotal: fallbackSubTotal,
          subTotal: fallbackSubTotal,
          specialCharges: fallbackSpecial,
          fittingCharge: fallbackFitting,
          tintingCharge: fallbackTinting,
          prismCharge: fallbackPrism,
          taxRate: 5,
          taxAmount: fallbackTax,
          taxApplicable: 'CGST_SGST',
          cgstRate: 2.5,
          sgstRate: 2.5,
          cgstAmount: fallbackTax / 2,
          sgstAmount: fallbackTax / 2,
          amountReceived: 0,
          balance: fallbackGrandTotal,
          netFinalTotal: fallbackSubTotal,
          grandTotal: fallbackGrandTotal,
        };
      }

      const updatedDetails: Record<string, unknown> = {
        ...existingDetails,
        partyName: targetPartyName,
        customer: targetPartyName,
        brand: targetBrand,
        brandName: targetBrand,
        product: targetProduct,
        productName: targetProduct,
        rxType: targetRxType,
        category: targetCategory,
        lensCategory: targetCategory,
        lensType: targetLensType,
        coating: targetCoating,
        coatingType: targetCoating,
        coatingName: targetCoating,
        index: targetIndex,
        indexKey: targetIndex,
        lensIndex: targetIndex,
        color: targetColor,
        colorName: targetColor,
        tint: targetColor,
        tintColor: targetColor,
        tinting: targetTinting,
        tintingName: targetTinting,
        dia: targetDia,
        diameter: targetDia,
        fitting: targetFitting,
        fittingType: targetFitting,
        fit: targetFitting,
        frameType: targetFitting,
        discount: targetDiscount,
        remarks: targetRemarks,
        remark: targetRemarks,
        specialRemark: targetRemarks,
        specialRemarks: targetRemarks,
        notes: targetRemarks,
        note: targetRemarks,
        customerRefNo: targetCustomerRefNo,
        amount: calculatedAmount > 0 ? calculatedAmount : existing.amount,
        grandTotal: calculatedAmount > 0 ? calculatedAmount : existing.grandTotal,
        financials: calculatedFinancials,
        rateBreakdown: calculatedRateBreakdown,
        basePrice: Number(calculatedRateBreakdown.baseSalePrice) || 0,
        lensBasePrice: Number(calculatedRateBreakdown.baseSalePrice) || 0,
        rightRate: Number(calculatedRateBreakdown.rightRate) || 0,
        leftRate: Number(calculatedRateBreakdown.leftRate) || 0,
      };

      const finalRightRate = Number(calculatedRateBreakdown.rightRate) || 0;
      const finalLeftRate = Number(calculatedRateBreakdown.leftRate) || 0;

      if (updatedDetails.right && typeof updatedDetails.right === 'object') {
        const r = { ...(updatedDetails.right as Record<string, unknown>) };
        r.sph = rSph;
        r.cyl = rCyl;
        r.axis = rAxis;
        r.addn = rAddn;
        r.prism = rPrism;
        r.qty = rQty;
        r.rate = finalRightRate > 0 ? finalRightRate : r.rate;
        r.corridor = rCorridor;
        r.etCtType = rEtCtType;
        r.etCtVal = rEtCtVal;
        r.mm = rMm;
        r.dia = targetDia;
        r.color = targetColor;
        r.colorName = targetColor;
        r.fitting = targetFitting;
        r.fittingType = targetFitting;
        r.remarks = targetRemarks;
        r.coating = targetCoating;
        r.coatingType = targetCoating;
        r.index = targetIndex;
        updatedDetails.right = r;
      }
      if (updatedDetails.left && typeof updatedDetails.left === 'object') {
        const l = { ...(updatedDetails.left as Record<string, unknown>) };
        l.sph = lSph;
        l.cyl = lCyl;
        l.axis = lAxis;
        l.addn = lAddn;
        l.prism = lPrism;
        l.qty = lQty;
        l.rate = finalLeftRate > 0 ? finalLeftRate : l.rate;
        l.corridor = lCorridor;
        l.etCtType = lEtCtType;
        l.etCtVal = lEtCtVal;
        l.mm = lMm;
        l.dia = targetDia;
        l.color = targetColor;
        l.colorName = targetColor;
        l.fitting = targetFitting;
        l.fittingType = targetFitting;
        l.remarks = targetRemarks;
        l.coating = targetCoating;
        l.coatingType = targetCoating;
        l.index = targetIndex;
        updatedDetails.left = l;
      }

      const syncPayload = {
        ...existing,
        id: existing.id,
        orderId: existing.orderId,
        orderNo: existing.orderId,
        partyName: targetPartyName,
        customer: targetPartyName,
        brand: targetBrand,
        brandName: targetBrand,
        product: targetProduct,
        productName: targetProduct,
        lensName: targetProduct,
        rxType: targetRxType,
        coating: targetCoating,
        coatingType: targetCoating,
        coatingName: targetCoating,
        index: targetIndex,
        indexKey: targetIndex,
        lensIndex: targetIndex,
        lensType: targetLensType,
        lensCategory: targetCategory,
        category: targetCategory,
        type: targetLensType,
        customerRefNo: targetCustomerRefNo,
        custRefNo: targetCustomerRefNo,
        partyRefNo: targetCustomerRefNo,
        color: targetColor,
        colorName: targetColor,
        dia: targetDia,
        tinting: targetTinting,
        tintingName: targetTinting,
        fitting: targetFitting,
        fittingType: targetFitting,
        discount: targetDiscount,
        remarks: targetRemarks,
        remark: targetRemarks,
        specialRemark: targetRemarks,
        specialRemarks: targetRemarks,
        notes: targetRemarks,
        note: targetRemarks,
        rightSph: rSph,
        rightCyl: rCyl,
        rightAxis: rAxis,
        rightAddn: rAddn,
        rightQty: rQty,
        rightRate: finalRightRate,
        leftSph: lSph,
        leftCyl: lCyl,
        leftAxis: lAxis,
        leftAddn: lAddn,
        leftQty: lQty,
        leftRate: finalLeftRate,
        basePrice: Number(calculatedRateBreakdown.baseSalePrice) || 0,
        lensBasePrice: Number(calculatedRateBreakdown.baseSalePrice) || 0,
        amount: calculatedAmount > 0 ? calculatedAmount : existing.amount,
        grandTotal: calculatedAmount > 0 ? calculatedAmount : existing.grandTotal,
        subTotal: (calculatedFinancials as any)?.subTotal || existing.subTotal,
        taxAmount: (calculatedFinancials as any)?.taxAmount || existing.taxAmount,
        taxRate: 5,
        financials: typeof calculatedFinancials === 'object' && Object.keys(calculatedFinancials).length > 0
          ? JSON.stringify(calculatedFinancials)
          : existing.financials,
        details: JSON.stringify(updatedDetails),
      };

      await axios.post(`${config.RIO_ERP_BASE_URL}/api/sales/orders`, syncPayload, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 8000,
      });

      logger.info(`[LiveRioErpClient] Successfully synced optical parameters and live pricing for order ${orderId}`, {
        color: targetColor,
        dia: targetDia,
        fitting: targetFitting,
        remarks: targetRemarks,
        amount: calculatedAmount,
      });

      return { success: true, amount: calculatedAmount > 0 ? calculatedAmount : undefined };
    } catch (syncErr: unknown) {
      const errData = axios.isAxiosError(syncErr) ? syncErr.response?.data : undefined;
      logger.warn(`[LiveRioErpClient] Non-blocking warning: Failed to sync details for order ${orderId}: ${String(syncErr)}`, {
        errData,
      });
    }
  }

  public async getOrderStatus(orderId: string): Promise<RioErpOrderStatusResponse> {
    const cleanOrderId = orderId.trim();
    logger.info(`[LiveRioErpClient] Querying order status from Rio ERP for orderId: ${cleanOrderId}`);

    // Helper to search order in Rio ERP staff API (/api/sales/orders) using staff bearer token
    const findOrderViaStaffApi = async (): Promise<RioErpOrderStatusData | null> => {
      try {
        const token = await this.getStaffToken();
        if (!token) return null;

        const salesRes = await axios.get(`${config.RIO_ERP_BASE_URL}/api/sales/orders`, {
          headers: { Authorization: `Bearer ${token}` },
          timeout: 6000,
        });
        const salesOrders = Array.isArray(salesRes.data?.orders)
          ? salesRes.data.orders
          : Array.isArray(salesRes.data)
          ? salesRes.data
          : [];

        const targetLower = cleanOrderId.toLowerCase();
        const found = salesOrders.find((o: any) => {
          const oId = String(o.orderId || o.id || o._id || '').toLowerCase();
          const cRef = String(o.customerRefNo || o.custRefNo || o.partyRefNo || '').toLowerCase();
          return oId === targetLower || cRef === targetLower || oId.includes(targetLower) || targetLower.includes(oId);
        });

        if (!found) return null;

        let parsedDetails: any = null;
        if (typeof found.details === 'string') {
          try { parsedDetails = JSON.parse(found.details); } catch {}
        } else if (typeof found.details === 'object') {
          parsedDetails = found.details;
        }

        const coating =
          found.coatingName ||
          parsedDetails?.coatingName ||
          parsedDetails?.coating ||
          found.coating ||
          null;

        const cleanCoating =
          coating && coating !== 'ARC' && coating !== '-' && coating !== '__' && coating.toUpperCase() !== 'UNCOTE'
            ? coating
            : (coating === 'Uncote' || coating === '-' || coating === '__' ? null : coating);

        let resolvedLab = 'RIO-AHMEDABAD';
        const uId = (found.orderId || cleanOrderId).toUpperCase();
        if (uId.startsWith('AHM-')) resolvedLab = 'RIO-AHMEDABAD';
        else if (uId.startsWith('SUR-')) resolvedLab = 'RIO-SURAT';
        else if (uId.startsWith('MUM-')) resolvedLab = 'RIO-MUMBAI';
        else if (uId.startsWith('PUN-')) resolvedLab = 'RIO-PUNE';
        else if (uId.startsWith('DEL-')) resolvedLab = 'RIO-DELHI';
        else if (uId.startsWith('RAJ-')) resolvedLab = 'RIO-RAJKOT';
        else if (found.assignedLab || found.assignedLabName) resolvedLab = found.assignedLab || found.assignedLabName;
        else if (found.labLocation && !found.labLocation.includes('HQ Lab') && !found.labLocation.includes('FreeForm')) resolvedLab = found.labLocation;

        const orderStatusData: RioErpOrderStatusData = {
          id: found._id || found.id,
          orderId: found.orderId || found.id || cleanOrderId,
          customerRefNo: found.customerRefNo || found.custRefNo || found.partyRefNo || null,
          customer: found.customer || found.partyName || parsedDetails?.customer || null,
          orderDate: found.createdAt || found.orderDate || null,
          status: found.status || 'Pending Pickup',
          pendingAt: found.department || found.pendingAt || found.targetDept || found.status || 'Lab Processing',
          company: found.companyName || found.punchingCompanyName || 'Rio',
          labLocation: resolvedLab,
          product: found.productName || found.product || found.lensName || parsedDetails?.product || null,
          lensType: found.category || found.lensType || found.type || parsedDetails?.lensType || null,
          coating: cleanCoating,
          index: found.indexKey || found.index || parsedDetails?.index || null,
          amount: found.financials?.grandTotal ?? found.amount ?? null,
          challanNo: found.challanNo || null,
          details: parsedDetails || found.details,
        };

        return orderStatusData;
      } catch (staffErr) {
        logger.warn(`[LiveRioErpClient] Staff API fallback lookup failed for order ${cleanOrderId}: ${String(staffErr)}`);
        return null;
      }
    };

    try {
      const response = await this.http.get('/api/integrations/whatsapp/order-status', {
        params: { orderId: cleanOrderId },
      });
      const order = response.data?.order;
      if (order) {
        try {
          const token = await this.getStaffToken();
          if (token) {
            const salesRes = await axios.get(`${config.RIO_ERP_BASE_URL}/api/sales/orders`, {
              headers: { Authorization: `Bearer ${token}` },
              timeout: 4000,
            });
            const fullOrd = (salesRes.data?.orders || salesRes.data || []).find(
              (o: any) => o.orderId === cleanOrderId || o.id === cleanOrderId
            );
            if (fullOrd) {
              let parsedDetails: any = null;
              if (typeof fullOrd.details === 'string') {
                try { parsedDetails = JSON.parse(fullOrd.details); } catch {}
              } else if (typeof fullOrd.details === 'object') {
                parsedDetails = fullOrd.details;
              }

              const actualCoating = fullOrd.coatingName || parsedDetails?.coatingName || parsedDetails?.coating;
              if (actualCoating && actualCoating !== 'ARC' && actualCoating !== '-' && actualCoating !== '__' && actualCoating !== 'Uncote') {
                order.coating = actualCoating;
              } else if (actualCoating === 'Uncote' || actualCoating === '-' || actualCoating === '__') {
                order.coating = null;
              }
            }
          }
        } catch {
          // Non-blocking fallback
        }

        return {
          success: true,
          order,
          rawResponse: response.data,
        };
      }
    } catch (err: unknown) {
      logger.warn(`[LiveRioErpClient] Direct /order-status endpoint failed: ${String(err)}. Checking Rio ERP staff API fallback...`);
    }

    // Resilient Fallback: check Rio ERP staff API (/api/sales/orders)
    const staffOrder = await findOrderViaStaffApi();
    if (staffOrder) {
      logger.info(`[LiveRioErpClient] Found order ${cleanOrderId} via Rio ERP staff API: status=${staffOrder.status}`);
      return {
        success: true,
        order: staffOrder,
        rawResponse: staffOrder,
      };
    }

    return {
      success: false,
      message: `Order "${cleanOrderId}" not found.`,
    };
  }

  public async getOrdersByPhone(phone: string): Promise<RioErpOrdersListResponse> {
    const phone10 = phone.replace(/\D/g, '').slice(-10);
    logger.info(`[LiveRioErpClient] Querying orders list from Rio ERP for phone: ${phone10}`);

    try {
      const response = await this.http.get('/api/integrations/whatsapp/orders', {
        params: { phone: phone10 },
      });
      let orders = Array.isArray(response.data?.orders)
        ? response.data.orders
        : Array.isArray(response.data)
        ? response.data
        : [];

      // Fallback: If empty, also query Rio ERP sales/orders using staff token
      if (orders.length === 0) {
        try {
          const token = await this.getStaffToken();
          if (token) {
            const salesRes = await axios.get(`${config.RIO_ERP_BASE_URL}/api/sales/orders`, {
              headers: { Authorization: `Bearer ${token}` },
              timeout: 6000,
            });
            const salesOrders = Array.isArray(salesRes.data?.orders)
              ? salesRes.data.orders
              : Array.isArray(salesRes.data)
              ? salesRes.data
              : [];
            orders = salesOrders;
          }
        } catch {
          // ignore fallback error
        }
      }

      return {
        success: true,
        orders,
        rawResponse: response.data,
      };
    } catch (err: unknown) {
      // If whatsapp/orders call errored, try sales/orders fallback
      try {
        const token = await this.getStaffToken();
        if (token) {
          const salesRes = await axios.get(`${config.RIO_ERP_BASE_URL}/api/sales/orders`, {
            headers: { Authorization: `Bearer ${token}` },
            timeout: 6000,
          });
          const salesOrders = Array.isArray(salesRes.data?.orders)
            ? salesRes.data.orders
            : Array.isArray(salesRes.data)
            ? salesRes.data
            : [];
          if (salesOrders.length > 0) {
            return {
              success: true,
              orders: salesOrders,
              rawResponse: salesRes.data,
            };
          }
        }
      } catch {
        // ignore
      }

      if (axios.isAxiosError(err)) {
        logger.warn(`[LiveRioErpClient] Orders list query failed: ${err.message}`, {
          status: err.response?.status,
        });
      } else {
        logger.warn(`[LiveRioErpClient] Unexpected error querying orders list: ${String(err)}`);
      }
      return {
        success: false,
        orders: [],
        rawResponse: axios.isAxiosError(err) ? err.response?.data : undefined,
      };
    }
  }

  public async getDeliveryTasks(): Promise<DeliveryTaskData[]> {
    try {
      const token = await this.getStaffToken();
      if (!token) {
        logger.warn('[LiveRioErpClient] Cannot fetch delivery tasks: No staff token available');
        return [];
      }

      const res = await axios.get(`${config.RIO_ERP_BASE_URL}/api/delivery/tasks`, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 8000,
      });

      const tasks = Array.isArray(res.data?.data)
        ? res.data.data
        : Array.isArray(res.data)
        ? res.data
        : [];
      return tasks;
    } catch (err: unknown) {
      logger.warn(`[LiveRioErpClient] Failed to fetch delivery tasks from Rio ERP: ${String(err)}`);
      return [];
    }
  }

  public async getDeliveryTaskByOrderId(orderId: string): Promise<DeliveryTaskData | null> {
    const tasks = await this.getDeliveryTasks();
    const clean = orderId.trim().toLowerCase();
    const found = tasks.find(
      (t) => (t.invoiceNo && t.invoiceNo.trim().toLowerCase() === clean) ||
             (t.id && t.id.trim().toLowerCase() === clean)
    );
    return found || null;
  }
}

