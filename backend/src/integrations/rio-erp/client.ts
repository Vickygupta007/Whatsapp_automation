import axios, { AxiosInstance } from 'axios';
import { config } from '../../config/env.js';
import { CustomerLookupResult, DeliveryTaskData, IRioErpClient, RioErpOrderRequest, RioErpOrderResponse, RioErpOrderStatusResponse, RioErpOrdersListResponse } from '../../types/erp.js';
import { logger } from '../../utils/logger.js';
import { normalizePhone } from '../../utils/phoneNormalizer.js';
import { RioErpMapper } from './mappers.js';

import { StoreErpConfig } from '../../config/stores.js';

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

    try {
      // Endpoint from n8n: POST /api/integrations/whatsapp/lookup-party
      const response = await this.http.post('/api/integrations/whatsapp/lookup-party', { phone: phone10 });
      return RioErpMapper.mapCustomerResponse(response.data as Record<string, unknown>, normalized);
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        if (err.response?.status === 404) {
          return { found: false, rawResponse: err.response?.data };
        }
        logger.error(`[LiveRioErpClient] Party lookup failed: ${err.message}`, {
          status: err.response?.status,
          data: err.response?.data,
        });
      } else {
        logger.error(`[LiveRioErpClient] Unexpected party lookup error: ${String(err)}`);
      }
      throw err;
    }
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
      // so Rio ERP Order Details Modal displays them right away with accurate amounts without manual Edit/Save.
      if (orderResponse.success && orderResponse.orderId) {
        const syncResult = await this.syncRioErpOrderDetails(orderResponse.orderId, orderData);
        if (syncResult && syncResult.amount) {
          orderResponse.amount = syncResult.amount;
        }
      }

      return orderResponse;
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        logger.error(`[LiveRioErpClient] Order creation failed: ${err.message}`, {
          status: err.response?.status,
          data: err.response?.data,
        });
      } else {
        logger.error(`[LiveRioErpClient] Unexpected order creation error: ${String(err)}`);
      }
      throw err;
    }
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
      // Product & Brand: Only use user-entered product; do not fallback to existing.product (which Rio ERP defaults to 'I SIGHT')
      const hasExplicitProduct = (orderData as any).hasExplicitProduct ?? (
        !!orderData.product && orderData.product !== 'I SIGHT' && !orderData.product.endsWith(' Lens')
      );
      const rawProduct = hasExplicitProduct ? (orderData.product || orderData.productName) : null;
      const targetProduct = (rawProduct && cleanOrDash(rawProduct) !== '-')
        ? cleanOrDash(rawProduct)
        : '-';

      const rawBrand = hasExplicitProduct ? (orderData.brand || orderData.brandName || rawProduct) : null;
      const targetBrand = (rawBrand && cleanOrDash(rawBrand) !== '-')
        ? cleanOrDash(rawBrand)
        : '-';

      // Coating: Only use user-entered coating; do not fallback to existing.coating (which Rio ERP defaults to 'ARC')
      // If omitted, pass null so Rio ERP updates coating to 'Uncote' (Uncoated) instead of defaulting to 'ARC'
      const rawCoating = orderData.coating || orderData.coatingName;
      const targetCoating = (rawCoating && cleanOrDash(rawCoating) !== '-')
        ? cleanOrDash(rawCoating)
        : null;

      // Index: Only use user-entered index; if omitted, MUST be null (NOT '-') so Rio ERP does not reject with 400 Bad Request
      const rawIndex = orderData.index || orderData.indexKey;
      const targetIndex = (rawIndex && cleanOrDash(rawIndex) !== '-')
        ? cleanOrDash(rawIndex)
        : null;

      // Lens Type: Only use user-entered lensType; do not fallback to existing.lensType (which Rio ERP defaults to 'Single Vision')
      const rawLensType = orderData.lensType || orderData.lensCategory || (orderData as any).type;
      const targetLensType = (rawLensType && cleanOrDash(rawLensType) !== '-')
        ? cleanOrDash(rawLensType)
        : '-';

      const targetCustomerRefNo = cleanOrDash(orderData.customerRefNo || existing.customerRefNo);

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

      // Calculate live pricing using Rio ERP's rate calculation engine
      let calculatedAmount: number = Number(existing.amount) || 0;
      let calculatedFinancials: Record<string, unknown> = (existingDetails.financials as Record<string, unknown>) || {};
      let calculatedRateBreakdown: Record<string, unknown> = (existingDetails.rateBreakdown as Record<string, unknown>) || {};

      try {
        const pricingRes = await axios.post(
          `${config.RIO_ERP_BASE_URL}/api/pricing/calculate-rates`,
          {
            brand: targetBrand !== '-' ? targetBrand : 'I SIGHT',
            lensName: targetProduct !== '-' ? targetProduct : 'I SIGHT FF',
            productName: targetProduct !== '-' ? targetProduct : 'I SIGHT FF',
            lensCategory: targetLensType !== '-' ? targetLensType : 'Single Vision',
            lensType: targetLensType !== '-' ? targetLensType : 'I SIGHT',
            lensIndex: targetIndex || '1.50',
            coating: targetCoating || 'I Sight HC',
            colorName: targetColor !== '-' ? targetColor : undefined,
            dia: targetDia !== '-' ? targetDia : undefined,
            fittingType: targetFitting !== '-' ? targetFitting : 'None (Uncut Lenses)',
            partyId: existing.partyId,
            partyType: existing.partyType || 'retailer',
            partyName: existing.partyName || existing.customer,
            rightActive: orderData.rx?.right?.active ?? true,
            rightSph: orderData.rx?.right?.sph ? String(orderData.rx.right.sph) : '0.00',
            rightCyl: orderData.rx?.right?.cyl ? String(orderData.rx.right.cyl) : '0.00',
            rightAxis: orderData.rx?.right?.axis !== undefined && orderData.rx?.right?.axis !== null ? String(orderData.rx.right.axis) : '',
            rightAddn: orderData.rx?.right?.addn ? String(orderData.rx.right.addn) : '',
            rightQty: orderData.rx?.right?.qty || 1,
            leftActive: orderData.rx?.left?.active ?? true,
            leftSph: orderData.rx?.left?.sph ? String(orderData.rx.left.sph) : '0.00',
            leftCyl: orderData.rx?.left?.cyl ? String(orderData.rx.left.cyl) : '0.00',
            leftAxis: orderData.rx?.left?.axis !== undefined && orderData.rx?.left?.axis !== null ? String(orderData.rx.left.axis) : '',
            leftAddn: orderData.rx?.left?.addn ? String(orderData.rx.left.addn) : '',
            leftQty: orderData.rx?.left?.qty || 1,
            taxRate: 5,
          },
          { timeout: 6000 }
        );

        if (pricingRes.data && pricingRes.data.success) {
          const rates = pricingRes.data;
          const subTotal = Number(rates.subTotal) || 0;
          const taxAmount = Number(rates.taxAmount) || 0;
          const grandTotal = Number(rates.grandTotal) || (subTotal + taxAmount);

          if (grandTotal > 0) {
            calculatedAmount = grandTotal;
            calculatedRateBreakdown = rates;
            calculatedFinancials = {
              lensBaseSubTotal: Number(rates.baseSalePrice) || subTotal,
              grossSubTotal: subTotal,
              subTotal: subTotal,
              specialCharges: Number(rates.specialCharges) || 0,
              fittingCharge: Number(rates.serviceChargesDetails?.fitCharge) || 0,
              prismCharge: (Number(rates.rightDetails?.prismExtra) || 0) + (Number(rates.leftDetails?.prismExtra) || 0),
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
          }
        }
      } catch (rateErr: unknown) {
        logger.warn(`[LiveRioErpClient] Non-blocking rate calculation note for ${orderId}: ${String(rateErr)}`);
      }

      const updatedDetails: Record<string, unknown> = {
        ...existingDetails,
        color: targetColor,
        colorName: targetColor,
        tint: targetColor,
        tintColor: targetColor,
        dia: targetDia,
        diameter: targetDia,
        fitting: targetFitting,
        fittingType: targetFitting,
        fit: targetFitting,
        frameType: targetFitting,
        remarks: targetRemarks,
        remark: targetRemarks,
        specialRemark: targetRemarks,
        specialRemarks: targetRemarks,
        notes: targetRemarks,
        note: targetRemarks,
        brand: targetBrand,
        product: targetProduct,
        coating: targetCoating,
        coatingType: targetCoating,
        coatingName: targetCoating,
        index: targetIndex,
        indexKey: targetIndex,
        lensIndex: targetIndex,
        lensType: targetLensType,
        customerRefNo: targetCustomerRefNo,
        amount: calculatedAmount > 0 ? calculatedAmount : existing.amount,
        grandTotal: calculatedAmount > 0 ? calculatedAmount : existing.grandTotal,
        financials: calculatedFinancials,
        rateBreakdown: calculatedRateBreakdown,
      };

      if (updatedDetails.right && typeof updatedDetails.right === 'object') {
        const r = { ...(updatedDetails.right as Record<string, unknown>) };
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
        brand: targetBrand,
        brandName: targetBrand,
        product: targetProduct,
        productName: targetProduct,
        coating: targetCoating,
        coatingType: targetCoating,
        coatingName: targetCoating,
        index: targetIndex,
        indexKey: targetIndex,
        lensIndex: targetIndex,
        lensType: targetLensType,
        lensCategory: targetLensType,
        category: targetLensType,
        type: targetLensType,
        customerRefNo: targetCustomerRefNo,
        custRefNo: targetCustomerRefNo,
        partyRefNo: targetCustomerRefNo,
        color: targetColor,
        colorName: targetColor,
        dia: targetDia,
        fitting: targetFitting,
        fittingType: targetFitting,
        remarks: targetRemarks,
        remark: targetRemarks,
        specialRemark: targetRemarks,
        specialRemarks: targetRemarks,
        notes: targetRemarks,
        note: targetRemarks,
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
      }

      return {
        success: true,
        order,
        rawResponse: response.data,
      };
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        if (err.response?.status === 404) {
          return {
            success: false,
            message: err.response?.data?.message || `Order "${cleanOrderId}" not found.`,
            rawResponse: err.response?.data,
          };
        }
        logger.error(`[LiveRioErpClient] Order status query failed: ${err.message}`, {
          status: err.response?.status,
          data: err.response?.data,
        });
      } else {
        logger.error(`[LiveRioErpClient] Unexpected order status query error: ${String(err)}`);
      }
      throw err;
    }
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

