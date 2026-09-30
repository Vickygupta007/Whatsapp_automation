import { config } from '../../config/env.js';
import {
  CustomerLookupResult,
  IRioErpClient,
  RioErpOrderRequest,
  RioErpOrderResponse,
  RioErpOrderStatusResponse,
  RioErpOrdersListResponse,
} from '../../types/erp.js';
import { logger } from '../../utils/logger.js';
import { LiveRioErpClient } from './client.js';
import { MockRioErpClient } from './mockClient.js';

export class RioErpAdapter implements IRioErpClient {
  private client: IRioErpClient;
  public readonly isMock: boolean;

  constructor(customClient?: IRioErpClient) {
    if (customClient) {
      this.client = customClient;
      this.isMock = customClient instanceof MockRioErpClient;
      return;
    }

    const shouldUseMock =
      config.RIO_ERP_USE_MOCK ||
      !config.RIO_ERP_BASE_URL ||
      config.RIO_ERP_BASE_URL.includes('example.com') ||
      process.env.NODE_ENV === 'test';

    if (shouldUseMock) {
      logger.info('Using MockRioErpClient for Rio ERP integration');
      this.client = new MockRioErpClient();
      this.isMock = true;
    } else {
      logger.info(`Using LiveRioErpClient connected to: ${config.RIO_ERP_BASE_URL}`);
      this.client = new LiveRioErpClient();
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

  public getRawClient(): IRioErpClient {
    return this.client;
  }
}
