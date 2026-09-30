import {
  CustomerLookupResult,
  DeliveryTaskData,
  IRioErpClient,
  RioErpCustomer,
  RioErpOrderRequest,
  RioErpOrderResponse,
  RioErpOrderStatusData,
  RioErpOrderStatusResponse,
  RioErpOrdersListResponse,
} from '../../types/erp.js';
import { logger } from '../../utils/logger.js';
import { normalizePhone } from '../../utils/phoneNormalizer.js';

export class MockRioErpClient implements IRioErpClient {
  private orders: Map<string, RioErpOrderStatusData> = new Map([
    [
      'SO-2026-999999999',
      {
        id: 'mock_del_order_000',
        orderId: 'SO-2026-999999999',
        customerRefNo: 'ASH-DELIVERED',
        customer: 'Ash',
        orderDate: '2026-09-24T05:00',
        status: 'Delivered',
        pendingAt: 'Delivered',
        company: 'Rio',
        labLocation: 'RIO-AHMEDABAD',
        product: 'I SIGHT',
        lensType: 'Single Vision',
        coating: 'BLUE CUT',
        amount: 0,
        challanNo: null,
      },
    ],
    [
      'SO-2026-479435957',
      {
        id: 'ca4d55b8-07f7-4447-a87e-89974d9d3c76',
        orderId: 'SO-2026-479435957',
        customerRefNo: 'WA-100023-0086',
        customer: 'Ash',
        orderDate: '2026-09-25T06:17',
        status: 'In Progress',
        pendingAt: 'Blocking',
        company: 'Rio',
        labLocation: 'RIO-AHMEDABAD',
        product: 'I SIGHT',
        lensType: 'Progressive',
        coating: 'ARC',
        amount: 0,
        challanNo: null,
      },
    ],
    [
      'SO-2026-581335720',
      {
        id: 'fa4d55b8-07f7-4447-a87e-89974d9d3c99',
        orderId: 'SO-2026-581335720',
        customerRefNo: 'ASH',
        customer: 'Ash',
        orderDate: '2026-09-25T07:15',
        status: 'In Progress',
        pendingAt: 'Surface Polishing',
        company: 'Rio',
        labLocation: 'RIO-AHMEDABAD',
        product: 'I SIGHT',
        lensType: 'Single Vision',
        coating: 'BLUE CUT',
        amount: 0,
        challanNo: null,
      },
    ],
    [
      'SO-2026-00124',
      {
        id: 'ba4d55b8-07f7-4447-a87e-89974d9d3c01',
        orderId: 'SO-2026-00124',
        customerRefNo: 'Sharma',
        customer: 'ABC Optical',
        orderDate: '2026-09-25T05:30',
        status: 'In Progress',
        pendingAt: 'Edging & Fitting',
        company: 'Rio',
        labLocation: 'RIO-AHMEDABAD',
        product: 'I SIGHT',
        lensType: 'Single Vision',
        coating: 'BLUE CUT',
        amount: 0,
        challanNo: null,
      },
    ],
  ]);
  private deliveryTasks: Map<string, DeliveryTaskData> = new Map([
    [
      'SO-2026-999999999',
      {
        id: 'DEL_000',
        invoiceNo: 'SO-2026-999999999',
        customerName: 'Ash',
        shopName: 'Ash Optics',
        deliveryAddress: 'Shop 1, Main Road',
        status: 'Delivered',
        taskType: 'DELIVERY',
        deliveryBoyId: 'DB101',
      },
    ],
    [
      'SO-2026-479435957',
      {
        id: 'DEL_001',
        invoiceNo: 'SO-2026-479435957',
        customerName: 'Ash',
        shopName: 'Ash Optics',
        deliveryAddress: 'Shop 1, Main Road',
        status: 'Out for Delivery',
        taskType: 'DELIVERY',
        deliveryBoyId: 'DB101',
      },
    ],
    [
      'SO-2026-581335720',
      {
        id: 'DEL_002',
        invoiceNo: 'SO-2026-581335720',
        customerName: 'Ash',
        shopName: 'Ash Optics',
        deliveryAddress: 'Shop 1, Main Road',
        status: 'Pending Pickup',
        taskType: 'DELIVERY',
        deliveryBoyId: 'DB101',
      },
    ],
    [
      'SO-2026-00124',
      {
        id: 'DEL_003',
        invoiceNo: 'SO-2026-00124',
        customerName: 'ABC Optical',
        shopName: 'ABC Optical',
        deliveryAddress: 'Connaught Place, Delhi',
        status: 'Delivered',
        taskType: 'DELIVERY',
        deliveryBoyId: 'DB102',
      },
    ],
  ]);
  private registeredCustomers: Map<string, RioErpCustomer> = new Map([
    [
      '919876543210',
      {
        id: 'CUST-RIO-1001',
        name: 'ABC Optical',
        phone: '919876543210',
        accountCode: 'ACC-ABC-01',
        email: 'orders@abcoptical.example.com',
        isRegistered: true,
        status: 'ACTIVE',
      },
    ],
    [
      '919999988888',
      {
        id: 'CUST-RIO-1002',
        name: 'Vision World Opticians',
        phone: '919999988888',
        accountCode: 'ACC-VW-02',
        email: 'info@visionworld.example.com',
        isRegistered: true,
        status: 'ACTIVE',
      },
    ],
    [
      '918888877777',
      {
        id: 'CUST-RIO-1003',
        name: 'ClearSight Eyecare',
        phone: '918888877777',
        accountCode: 'ACC-CS-03',
        email: 'orders@clearsight.example.com',
        isRegistered: true,
        status: 'ACTIVE',
      },
    ],
    [
      '918355866239',
      {
        id: 'CUST-RIO-1004',
        name: 'Vicky Gupta (Vision Opticals)',
        phone: '918355866239',
        accountCode: 'ACC-VG-04',
        email: 'vicky@example.com',
        isRegistered: true,
        status: 'ACTIVE',
      },
    ],
    [
      '917718043078',
      {
        id: '8e33e207-cdaa-48c7-ba18-1e8b9ab83831',
        name: 'Ash',
        phone: '917718043078',
        accountCode: '100023',
        accountId: '100023',
        labName: 'RIO-AHMEDABAD',
        email: 'ash@example.com',
        isRegistered: true,
        status: 'ACTIVE',
      },
    ],
  ]);

  private orderCounter = 123;

  public async findCustomerByPhone(phone: string): Promise<CustomerLookupResult> {
    const cleanDigits = phone.replace(/\D/g, '');
    const phone10 = cleanDigits.slice(-10);
    const normalized = normalizePhone(phone);
    logger.debug(`[MockRioErpClient] Looking up customer by phone: ${phone10} / ${normalized}`);

    let customer = this.registeredCustomers.get(normalized);
    if (!customer) {
      for (const [key, val] of this.registeredCustomers.entries()) {
        if (key.slice(-10) === phone10) {
          customer = val;
          break;
        }
      }
    }

    if (customer) {
      const party = {
        id: customer.id,
        accountId: customer.accountCode || customer.accountId || customer.id,
        name: customer.name,
        labName: customer.labName || 'RIO-AHMEDABAD',
        mobileNumber: customer.phone,
      };
      return {
        found: true,
        customer: {
          ...customer,
          accountId: party.accountId,
          labName: party.labName,
        },
        party,
        rawResponse: { mock: true, found: true, customer, party },
      };
    }

    return {
      found: false,
      rawResponse: { mock: true, found: false, message: 'Customer not found in Rio ERP' },
    };
  }

  public async createOrder(orderData: RioErpOrderRequest): Promise<RioErpOrderResponse> {
    this.orderCounter += 1;
    const year = new Date().getFullYear();
    const orderId = `SO-${year}-${String(this.orderCounter).padStart(5, '0')}`;

    const cleanDigits = orderData.phone.replace(/\D/g, '');
    const phone10 = cleanDigits.slice(-10);

    let customer: RioErpCustomer | undefined;
    for (const [key, val] of this.registeredCustomers.entries()) {
      if (key.slice(-10) === phone10) {
        customer = val;
        break;
      }
    }

    const party = {
      accountId: customer?.accountCode || customer?.accountId || customer?.id || '100023',
      name: customer?.name || 'Ash',
      labName: customer?.labName || 'RIO-AHMEDABAD',
    };

    logger.info(`[MockRioErpClient] Created order in Mock Rio ERP: ${orderId}`, {
      phone: orderData.phone,
      product: orderData.product,
      ref: orderData.customerRefNo,
      party,
    });

    this.orders.set(orderId, {
      id: `mock_order_${Date.now()}`,
      orderId,
      customerRefNo: orderData.customerRefNo || `WA-${party.accountId}`,
      customer: party.name,
      orderDate: new Date().toISOString().substring(0, 16).replace('T', ' '),
      status: 'In Progress',
      pendingAt: 'Queue / Intake',
      company: 'Rio',
      labLocation: party.labName,
      product: orderData.product || 'I SIGHT',
      lensType: orderData.lensType || 'Single Vision',
      coating: orderData.coating || 'BLUE CUT',
      index: orderData.index || null,
      amount: 0,
      challanNo: null,
    });

    return {
      success: true,
      orderId,
      orderRef: orderData.customerRefNo || undefined,
      status: 'QUEUED',
      message: 'Work order successfully queued in Rio ERP',
      party,
      createdAt: new Date().toISOString(),
      rawResponse: {
        mock: true,
        orderId,
        status: 'QUEUED',
        orderData,
        party,
      },
    };
  }

  public async getOrderStatus(orderId: string): Promise<RioErpOrderStatusResponse> {
    const cleanOrderId = orderId.trim();
    logger.debug(`[MockRioErpClient] Looking up order status for: ${cleanOrderId}`);

    const order = this.orders.get(cleanOrderId);
    if (order) {
      return {
        success: true,
        order,
        rawResponse: { mock: true, order },
      };
    }

    return {
      success: false,
      message: `Order "${cleanOrderId}" not found.`,
      rawResponse: { mock: true, message: `Order "${cleanOrderId}" not found.` },
    };
  }

  public async getOrdersByPhone(phone: string): Promise<RioErpOrdersListResponse> {
    const cleanDigits = phone.replace(/\D/g, '');
    const phone10 = cleanDigits.slice(-10);
    logger.debug(`[MockRioErpClient] Querying orders for phone: ${phone10}`);

    let customer: RioErpCustomer | undefined;
    for (const [key, val] of this.registeredCustomers.entries()) {
      if (key.slice(-10) === phone10) {
        customer = val;
        break;
      }
    }

    if (!customer || phone10 === '9999988888') {
      return {
        success: true,
        orders: [],
        rawResponse: { mock: true, orders: [] },
      };
    }

    const customerName = (customer.name || '').toLowerCase();
    const orders = Array.from(this.orders.values()).filter(
      (ord) => (ord.customer || '').toLowerCase().includes(customerName) || ord.customer === customer.name
    );

    return {
      success: true,
      orders,
      rawResponse: { mock: true, orders },
    };
  }

  /**
   * Helper to register a test customer dynamically (e.g. for tests or simulator)
   */
  public registerTestCustomer(customer: RioErpCustomer): void {
    const normalized = normalizePhone(customer.phone);
    this.registeredCustomers.set(normalized, { ...customer, phone: normalized });
  }

  public setDeliveryTask(task: DeliveryTaskData): void {
    this.deliveryTasks.set(task.invoiceNo, task);
  }

  public clearDeliveryTasks(): void {
    this.deliveryTasks.clear();
  }

  public async getDeliveryTasks(): Promise<DeliveryTaskData[]> {
    return Array.from(this.deliveryTasks.values());
  }

  public async getDeliveryTaskByOrderId(orderId: string): Promise<DeliveryTaskData | null> {
    const clean = orderId.trim().toLowerCase();
    for (const [key, val] of this.deliveryTasks.entries()) {
      if (key.trim().toLowerCase() === clean || (val.id && val.id.trim().toLowerCase() === clean)) {
        return val;
      }
    }
    return null;
  }
}

