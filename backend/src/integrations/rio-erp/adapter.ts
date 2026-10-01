import { config } from '../../config/env.js';
import {
  CustomerLookupResult,
  DeliveryTaskData,
  IRioErpClient,
  RioErpOrderRequest,
  RioErpOrderResponse,
  RioErpOrderStatusResponse,
  RioErpOrdersListResponse,
} from '../../types/erp.js';
import { logger } from '../../utils/logger.js';
import { LiveRioErpClient } from './client.js';
import { MockRioErpClient } from './mockClient.js';

import { StoreErpConfig, StoreRegistry } from '../../config/stores.js';

export class RioErpAdapter implements IRioErpClient {
  private client: IRioErpClient;
  public readonly isMock: boolean;

  constructor(customClientOrConfig?: IRioErpClient | StoreErpConfig) {
    if (customClientOrConfig && typeof (customClientOrConfig as any).findCustomerByPhone === 'function') {
      this.client = customClientOrConfig as IRioErpClient;
      this.isMock = customClientOrConfig instanceof MockRioErpClient;
      return;
    }

    const erpConfig = customClientOrConfig && 'type' in (customClientOrConfig as any) ? (customClientOrConfig as StoreErpConfig) : undefined;
    const shouldUseMock =
      erpConfig?.useMock ??
      (config.RIO_ERP_USE_MOCK ||
        !(erpConfig?.baseUrl || config.RIO_ERP_BASE_URL) ||
        (erpConfig?.baseUrl || config.RIO_ERP_BASE_URL).includes('example.com') ||
        process.env.NODE_ENV === 'test');

    if (shouldUseMock) {
      logger.info('Using MockRioErpClient for ERP integration');
      this.client = new MockRioErpClient();
      this.isMock = true;
    } else {
      const targetUrl = erpConfig?.baseUrl || config.RIO_ERP_BASE_URL;
      logger.info(`Using LiveRioErpClient connected to: ${targetUrl}`);
      this.client = new LiveRioErpClient(erpConfig);
      this.isMock = false;
    }
  }

  public async findCustomerByPhone(phone: string): Promise<CustomerLookupResult> {
    return this.client.findCustomerByPhone(phone);
  }

  public async createOrder(orderData: RioErpOrderRequest): Promise<RioErpOrderResponse> {
    return this.client.createOrder(orderData);
  }

  public async getOrderStatus(orderId: string): Promise<RioErpOrderStatusResponse> {
    return this.client.getOrderStatus(orderId);
  }

  public async getOrdersByPhone(phone: string): Promise<RioErpOrdersListResponse> {
    if (this.client.getOrdersByPhone) {
      return this.client.getOrdersByPhone(phone);
    }
    return { success: true, orders: [] };
  }

  public async getDeliveryTasks(): Promise<DeliveryTaskData[]> {
    if (this.client.getDeliveryTasks) {
      return this.client.getDeliveryTasks();
    }
    return [];
  }

  public async getDeliveryTaskByOrderId(orderId: string): Promise<DeliveryTaskData | null> {
    if (this.client.getDeliveryTaskByOrderId) {
      return this.client.getDeliveryTaskByOrderId(orderId);
    }
    return null;
  }

  public getRawClient(): IRioErpClient {
    return this.client;
  }
}

export class ErpAdapterFactory {
  private static adapters: Map<string, RioErpAdapter> = new Map();

  public static getAdapterForStore(storeId: string): RioErpAdapter {
    if (!this.adapters.has(storeId)) {
      const store = StoreRegistry.getStoreById(storeId);
      if (store) {
        this.adapters.set(storeId, new RioErpAdapter(store.erp));
      } else {
        this.adapters.set(storeId, new RioErpAdapter());
      }
    }
    return this.adapters.get(storeId)!;
  }

  public static clear(): void {
    this.adapters.clear();
  }
}
