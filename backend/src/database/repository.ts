import { PipelineStep, ProcessingStatus, StepStatus } from '../types/pipeline.js';
import { getPrismaClient } from './db.js';

export interface AdminMetrics {
  totalMessagesReceived: number;
  totalRepliesSent: number;
  successfulReplies: number;
  failedReplies: number;
  duplicateMessagesIgnored: number;
  totalMessages: number;
  ordersCreated: number;
  invalidOrders: number;
  unregisteredCustomers: number;
  failedExecutions: number;
}

export interface StoredMessage {
  id: string;
  messageId: string;
  phone: string;
  customerName: string | null;
  messageType: string;
  textContent: string | null;
  mediaId: string | null;
  category?: string | null;
  replyText?: string | null;
  replyStatus?: string | null;
  status: ProcessingStatus;
  rawPayload: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface StoredOrder {
  id: string;
  messageId: string;
  erpOrderId: string | null;
  erpOrderRef: string | null;
  phone: string;
  customerRefNo: string | null;
  product: string | null;
  lensType: string | null;
  coating: string | null;
  index: string | null;
  rxData: unknown;
  rawMessage: string;
  status: ProcessingStatus;
  erpRequestPayload: unknown;
  erpResponsePayload: unknown;
  createdAt: Date;
  updatedAt: Date;
  storeId?: string | null;
}

export interface StoredProcessingLog {
  id: string;
  messageId: string;
  orderId: string | null;
  step: PipelineStep;
  status: StepStatus;
  details: Record<string, unknown> | null;
  errorType: string | null;
  errorMessage: string | null;
  createdAt: Date;
}

// In-Memory store for offline fallback and automated unit tests
class InMemoryRepository {
  public webhookEvents: Array<{ id: string; messageId: string; eventType: string; payload: unknown; createdAt: Date }> = [];
  public messages: Map<string, StoredMessage> = new Map();
  public orders: Map<string, StoredOrder> = new Map();
  public logs: StoredProcessingLog[] = [];

  clear() {
    this.webhookEvents = [];
    this.messages.clear();
    this.orders.clear();
    this.logs = [];
  }
}

const memStore = new InMemoryRepository();

export class AppRepository {
  private static knownPartiesCache = new Map<string, any>([
    [
      '8355866239',
      {
        id: 'ffffcc24-db81-487d-be2e-4b6fbaedb946',
        name: 'amk',
        accountId: '100027',
        labId: '81bdc55a-3dae-4caf-8907-e6c586a18836',
        labName: 'RIO-AHMEDABAD',
        companyId: 'cc610efd-99a9-400f-b9ee-077cd202696c',
        companyName: 'Rio',
        partyType: 'retailer',
        mobileNumber: '8355866239',
        contactPerson: 'amk',
      },
    ],
    [
      '7718043078',
      {
        id: '8e33e207-cdaa-48c7-ba18-1e8b9ab83831',
        name: 'Ash',
        accountId: '100023',
        labId: '81bdc55a-3dae-4caf-8907-e6c586a18836',
        labName: 'RIO-AHMEDABAD',
        companyId: 'cc610efd-99a9-400f-b9ee-077cd202696c',
        companyName: 'Rio',
        partyType: 'retailer',
        mobileNumber: '7718043078',
        contactPerson: 'Ash',
      },
    ],
  ]);

  /**
   * Cache a known verified customer party for resilient lookup
   */
  public static saveKnownParty(phone: string, party: any): void {
    const cleanDigits = phone.replace(/\D/g, '');
    const phone10 = cleanDigits.slice(-10);
    if (phone10 && party) {
      this.knownPartiesCache.set(phone10, party);
    }
  }

  /**
   * Find last known registered party for a phone number across cache and database logs
   */
  public static async findLastKnownParty(phone: string): Promise<any | null> {
    const cleanDigits = phone.replace(/\D/g, '');
    const phone10 = cleanDigits.slice(-10);

    // 1. Check in-memory party cache
    if (this.knownPartiesCache.has(phone10)) {
      return this.knownPartiesCache.get(phone10);
    }

    // 2. Query Prisma processing logs for recent successful CUSTOMER_LOOKUP
    const prisma = await getPrismaClient();
    if (prisma) {
      try {
        const logs = await prisma.processingLog.findMany({
          where: {
            step: 'CUSTOMER_LOOKUP',
            status: 'SUCCESS',
          },
          orderBy: { createdAt: 'desc' },
          take: 50,
        });

        for (const log of logs) {
          const details = log.details as Record<string, any> | null;
          if (details?.found && details?.party) {
            const logPhone = String(details.phone || details.party.mobileNumber || '').replace(/\D/g, '').slice(-10);
            if (logPhone === phone10) {
              this.knownPartiesCache.set(phone10, details.party);
              return details.party;
            }
          }
        }
      } catch {
        // Fallback
      }
    }

    // 3. Check memStore processing logs
    for (const log of memStore.logs) {
      if (log.step === 'CUSTOMER_LOOKUP' && log.status === 'SUCCESS') {
        const details = log.details as Record<string, any> | null;
        if (details?.found && details?.party) {
          const logPhone = String(details.phone || details.party.mobileNumber || '').replace(/\D/g, '').slice(-10);
          if (logPhone === phone10) {
            this.knownPartiesCache.set(phone10, details.party);
            return details.party;
          }
        }
      }
    }

    return null;
  }

  /**
   * Clears in-memory data (useful for test isolation).
   */
  public static clearMemoryStore(): void {
    memStore.clear();
  }

  /**
   * Check if this messageId was already processed or is currently stored
   */
  public static async isMessageDuplicate(messageId: string): Promise<boolean> {
    const prisma = await getPrismaClient();
    if (prisma) {
      try {
        const found = await prisma.message.findUnique({
          where: { messageId },
          select: { id: true },
        });
        return !!found;
      } catch {
        // Fallback to in-memory check
      }
    }
    return memStore.messages.has(messageId);
  }

  /**
   * Save incoming webhook event
   */
  public static async saveWebhookEvent(
    messageId: string,
    eventType: string,
    payload: Record<string, unknown>
  ): Promise<void> {
    const prisma = await getPrismaClient();
    if (prisma) {
      try {
        await prisma.webhookEvent.create({
          data: {
            messageId,
            eventType,
            payload: payload as object,
          },
        });
        return;
      } catch {
        // Fallback
      }
    }

    memStore.webhookEvents.push({
      id: `wh_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      messageId,
      eventType,
      payload,
      createdAt: new Date(),
    });
  }

  /**
   * Create message entry
   */
  public static async createMessage(data: {
    messageId: string;
    phone: string;
    customerName?: string | null;
    messageType: string;
    textContent?: string | null;
    mediaId?: string | null;
    category?: string | null;
    replyText?: string | null;
    replyStatus?: string | null;
    rawPayload: Record<string, unknown>;
    status: ProcessingStatus;
  }): Promise<StoredMessage> {
    const prisma = await getPrismaClient();
    if (prisma) {
      try {
        const created = await prisma.message.create({
          data: {
            messageId: data.messageId,
            phone: data.phone,
            customerName: data.customerName ?? null,
            messageType: data.messageType,
            textContent: data.textContent ?? null,
            mediaId: data.mediaId ?? null,
            category: data.category ?? null,
            replyText: data.replyText ?? null,
            replyStatus: data.replyStatus ?? null,
            rawPayload: data.rawPayload as object,
            status: data.status,
          },
        });
        return created as StoredMessage;
      } catch {
        // Fallback
      }
    }

    const stored: StoredMessage = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      messageId: data.messageId,
      phone: data.phone,
      customerName: data.customerName ?? null,
      messageType: data.messageType,
      textContent: data.textContent ?? null,
      mediaId: data.mediaId ?? null,
      category: data.category ?? null,
      replyText: data.replyText ?? null,
      replyStatus: data.replyStatus ?? null,
      status: data.status,
      rawPayload: data.rawPayload,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    memStore.messages.set(data.messageId, stored);
    return stored;
  }

  /**
   * Update message processing status
   */
  public static async updateMessageStatus(
    messageId: string,
    status: ProcessingStatus
  ): Promise<void> {
    const prisma = await getPrismaClient();
    if (prisma) {
      try {
        await prisma.message.update({
          where: { messageId },
          data: { status },
        });
        return;
      } catch {
        // Fallback
      }
    }

    const msg = memStore.messages.get(messageId);
    if (msg) {
      msg.status = status;
      msg.updatedAt = new Date();
    }
  }

  /**
   * Update message reply details and status
   */
  public static async updateMessageReply(
    messageId: string,
    data: {
      category?: string;
      replyText?: string;
      replyStatus?: string;
      status?: ProcessingStatus;
    }
  ): Promise<void> {
    const prisma = await getPrismaClient();
    if (prisma) {
      try {
        await prisma.message.update({
          where: { messageId },
          data: {
            category: data.category,
            replyText: data.replyText,
            replyStatus: data.replyStatus,
            status: data.status,
          },
        });
        return;
      } catch {
        // Fallback
      }
    }

    const msg = memStore.messages.get(messageId);
    if (msg) {
      if (data.category !== undefined) msg.category = data.category;
      if (data.replyText !== undefined) msg.replyText = data.replyText;
      if (data.replyStatus !== undefined) msg.replyStatus = data.replyStatus;
      if (data.status !== undefined) msg.status = data.status;
      msg.updatedAt = new Date();
    }
  }

  /**
   * Create order record
   */
  public static async createOrder(data: {
    messageId: string;
    phone: string;
    customerRefNo?: string | null;
    product?: string | null;
    lensType?: string | null;
    coating?: string | null;
    index?: string | null;
    rxData?: unknown;
    rawMessage: string;
    status: ProcessingStatus;
    storeId?: string | null;
  }): Promise<{ id: string }> {
    const prisma = await getPrismaClient();
    if (prisma) {
      try {
        const order = await prisma.order.create({
          data: {
            messageId: data.messageId,
            phone: data.phone,
            customerRefNo: data.customerRefNo ?? null,
            product: data.product ?? null,
            lensType: data.lensType ?? null,
            coating: data.coating ?? null,
            index: data.index ?? null,
            rxData: (data.rxData ?? null) as object,
            rawMessage: data.rawMessage,
            status: data.status,
          },
          select: { id: true },
        });
        return { id: order.id };
      } catch {
        // Fallback
      }
    }

    const id = `ord_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const stored: StoredOrder = {
      id,
      messageId: data.messageId,
      erpOrderId: null,
      erpOrderRef: null,
      phone: data.phone,
      customerRefNo: data.customerRefNo ?? null,
      product: data.product ?? null,
      lensType: data.lensType ?? null,
      coating: data.coating ?? null,
      index: data.index ?? null,
      rxData: data.rxData,
      rawMessage: data.rawMessage,
      status: data.status,
      erpRequestPayload: null,
      erpResponsePayload: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      storeId: data.storeId ?? null,
    };
    memStore.orders.set(id, stored);
    return { id };
  }

  /**
   * Update order with Rio ERP result
   */
  public static async updateOrderWithErpResult(
    orderId: string,
    erpOrderId: string,
    erpOrderRef: string,
    status: ProcessingStatus,
    erpRequestPayload?: unknown,
    erpResponsePayload?: unknown
  ): Promise<void> {
    const prisma = await getPrismaClient();
    if (prisma) {
      try {
        await prisma.order.update({
          where: { id: orderId },
          data: {
            erpOrderId,
            erpOrderRef,
            status,
            erpRequestPayload: (erpRequestPayload ?? null) as object,
            erpResponsePayload: (erpResponsePayload ?? null) as object,
          },
        });
        return;
      } catch {
        // Fallback
      }
    }

    const order = memStore.orders.get(orderId);
    if (order) {
      order.erpOrderId = erpOrderId;
      order.erpOrderRef = erpOrderRef;
      order.status = status;
      order.erpRequestPayload = erpRequestPayload ?? null;
      order.erpResponsePayload = erpResponsePayload ?? null;
      order.updatedAt = new Date();
    }
  }

  /**
   * Find the most recent order for a phone number
   */
  public static async findLatestOrderByPhone(phone: string): Promise<StoredOrder | null> {
    const cleanDigits = phone.replace(/\D/g, '');
    const phone10 = cleanDigits.slice(-10);

    const prisma = await getPrismaClient();
    if (prisma) {
      try {
        const order = await prisma.order.findFirst({
          where: {
            phone: { contains: phone10 },
            erpOrderId: { not: null },
          },
          orderBy: { createdAt: 'desc' },
        });
        if (order) {
          return {
            id: order.id,
            messageId: order.messageId,
            erpOrderId: order.erpOrderId,
            erpOrderRef: order.erpOrderRef,
            phone: order.phone,
            customerRefNo: order.customerRefNo,
            product: order.product,
            lensType: order.lensType,
            coating: order.coating,
            index: order.index,
            rxData: order.rxData,
            rawMessage: order.rawMessage,
            status: order.status as ProcessingStatus,
            erpRequestPayload: order.erpRequestPayload,
            erpResponsePayload: order.erpResponsePayload,
            createdAt: order.createdAt,
            updatedAt: order.updatedAt,
          };
        }
      } catch {
        // Fallback to memStore
      }
    }

    const orders = Array.from(memStore.orders.values())
      .filter((o) => o.phone.replace(/\D/g, '').slice(-10) === phone10 && o.erpOrderId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    return orders[0] || null;
  }

  /**
   * Find recent orders for a phone number
   */
  public static async findAllOrdersByPhone(phone: string, limit = 200): Promise<StoredOrder[]> {
    const cleanDigits = phone.replace(/\D/g, '');
    const phone10 = cleanDigits.slice(-10);

    const prisma = await getPrismaClient();
    if (prisma) {
      try {
        const orders = await prisma.order.findMany({
          where: {
            phone: { contains: phone10 },
            erpOrderId: { not: null },
          },
          include: {
            message: {
              select: { rawPayload: true },
            },
          },
          orderBy: { createdAt: 'desc' },
          take: limit,
        });
        return orders.map((order) => {
          const raw = order.message?.rawPayload as Record<string, any> | null;
          let storeId: string | null = (raw?.storeId as string) || null;
          if (!storeId && raw?.recipientPhoneNumberId) {
            if (raw.recipientPhoneNumberId === '1273435872528900') {
              storeId = 'arco';
            } else if (raw.recipientPhoneNumberId === '1327525300446181' || raw.recipientPhoneNumberId === '1225478070642817') {
              storeId = 'rio';
            }
          }
          return {
            id: order.id,
            messageId: order.messageId,
            erpOrderId: order.erpOrderId,
            erpOrderRef: order.erpOrderRef,
            phone: order.phone,
            customerRefNo: order.customerRefNo,
            product: order.product,
            lensType: order.lensType,
            coating: order.coating,
            index: order.index,
            rxData: order.rxData,
            rawMessage: order.rawMessage,
            status: order.status as ProcessingStatus,
            erpRequestPayload: order.erpRequestPayload,
            erpResponsePayload: order.erpResponsePayload,
            createdAt: order.createdAt,
            updatedAt: order.updatedAt,
            storeId,
          };
        });
      } catch {
        // Fallback to memStore
      }
    }

    return Array.from(memStore.orders.values())
      .filter((o) => o.phone.replace(/\D/g, '').slice(-10) === phone10 && o.erpOrderId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
  }

  /**
   * Find an order by its Rio ERP order ID
   */
  public static async findOrderByErpOrderId(erpOrderId: string): Promise<StoredOrder | null> {
    const cleanId = erpOrderId.trim();
    const prisma = await getPrismaClient();
    if (prisma) {
      try {
        const order = await prisma.order.findFirst({
          where: {
            OR: [
              { erpOrderId: cleanId },
              { erpOrderId: cleanId.toUpperCase() },
            ],
          },
          include: {
            message: {
              select: { rawPayload: true },
            },
          },
          orderBy: { createdAt: 'desc' },
        });
        if (order) {
          const raw = order.message?.rawPayload as Record<string, any> | null;
          let storeId: string | null = (raw?.storeId as string) || null;
          if (!storeId && raw?.recipientPhoneNumberId) {
            if (raw.recipientPhoneNumberId === '1273435872528900') {
              storeId = 'arco';
            } else if (raw.recipientPhoneNumberId === '1327525300446181' || raw.recipientPhoneNumberId === '1225478070642817') {
              storeId = 'rio';
            }
          }
          return {
            id: order.id,
            messageId: order.messageId,
            erpOrderId: order.erpOrderId,
            erpOrderRef: order.erpOrderRef,
            phone: order.phone,
            customerRefNo: order.customerRefNo,
            product: order.product,
            lensType: order.lensType,
            coating: order.coating,
            index: order.index,
            rxData: order.rxData,
            rawMessage: order.rawMessage,
            status: order.status as ProcessingStatus,
            erpRequestPayload: order.erpRequestPayload,
            erpResponsePayload: order.erpResponsePayload,
            createdAt: order.createdAt,
            updatedAt: order.updatedAt,
            storeId,
          };
        }
      } catch {
        // Fallback
      }
    }

    const order = Array.from(memStore.orders.values()).find(
      (o) => o.erpOrderId === cleanId || o.erpOrderId?.toUpperCase() === cleanId.toUpperCase()
    );
    return order || null;
  }

  /**
   * Add a step log entry
   */
  public static async addProcessingLog(data: {
    messageId: string;
    orderId?: string | null;
    step: PipelineStep;
    status: StepStatus;
    details?: Record<string, unknown>;
    errorType?: string;
    errorMessage?: string;
  }): Promise<void> {
    const prisma = await getPrismaClient();
    if (prisma) {
      try {
        await prisma.processingLog.create({
          data: {
            messageId: data.messageId,
            orderId: data.orderId ?? null,
            step: data.step,
            status: data.status,
            details: (data.details ?? null) as object,
            errorType: data.errorType ?? null,
            errorMessage: data.errorMessage ?? null,
          },
        });
        return;
      } catch {
        // Fallback
      }
    }

    memStore.logs.push({
      id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      messageId: data.messageId,
      orderId: data.orderId ?? null,
      step: data.step,
      status: data.status,
      details: data.details ?? null,
      errorType: data.errorType ?? null,
      errorMessage: data.errorMessage ?? null,
      createdAt: new Date(),
    });
  }

  /**
   * Get metrics for Admin Dashboard
   */
  public static async getMetrics(): Promise<AdminMetrics> {
    const prisma = await getPrismaClient();
    if (prisma) {
      try {
        const filterOld = {
          NOT: {
            rawPayload: {
              path: ['entry', '0', 'changes', '0', 'value', 'metadata', 'phone_number_id'],
              equals: '1225478070642817',
            },
          },
        };

        const [
          totalMessagesReceived,
          successfulReplies,
          failedReplies,
          duplicateMessagesIgnored,
          ordersCreated,
          invalidOrders,
          unregisteredCustomers,
          failedExecutions,
        ] = await Promise.all([
          prisma.message.count({ where: filterOld }),
          prisma.message.count({
            where: {
              ...filterOld,
              OR: [
                { replyStatus: 'SENT' },
                { status: 'REPLY_SENT' },
                { status: 'CONFIRMATION_SENT' },
              ],
            },
          }),
          prisma.message.count({
            where: {
              ...filterOld,
              OR: [
                { replyStatus: 'FAILED' },
                { status: 'REPLY_FAILED' },
              ],
            },
          }),
          prisma.processingLog.count({
            where: {
              step: 'WEBHOOK',
              status: 'SKIPPED',
            },
          }),
          prisma.order.count(),
          prisma.message.count({ where: { ...filterOld, status: 'INVALID_ORDER' } }),
          prisma.message.count({ where: { ...filterOld, status: 'CUSTOMER_NOT_FOUND' } }),
          prisma.message.count({ where: { ...filterOld, status: 'FAILED' } }),
        ]);

        const totalRepliesSent = successfulReplies + failedReplies;

        return {
          totalMessagesReceived,
          totalRepliesSent,
          successfulReplies,
          failedReplies,
          duplicateMessagesIgnored,
          totalMessages: totalMessagesReceived,
          ordersCreated,
          invalidOrders,
          unregisteredCustomers,
          failedExecutions,
        };
      } catch {
        // Fallback
      }
    }

    const messages = Array.from(memStore.messages.values()).filter((m) => {
      const pId = (m.rawPayload as Record<string, unknown> | null)?.entry as Array<{ changes?: Array<{ value?: { metadata?: { phone_number_id?: string } } }> }> | undefined;
      return pId?.[0]?.changes?.[0]?.value?.metadata?.phone_number_id !== '1225478070642817';
    });
    const successfulReplies = messages.filter(
      (m) => m.replyStatus === 'SENT' || m.status === 'REPLY_SENT' || m.status === 'CONFIRMATION_SENT'
    ).length;
    const failedReplies = messages.filter(
      (m) => m.replyStatus === 'FAILED' || m.status === 'REPLY_FAILED'
    ).length;
    const duplicateMessagesIgnored = memStore.logs.filter(
      (l) => l.step === 'WEBHOOK' && l.status === 'SKIPPED'
    ).length;
    const totalMessagesReceived = messages.length;
    const totalRepliesSent = successfulReplies + failedReplies;

    return {
      totalMessagesReceived,
      totalRepliesSent,
      successfulReplies,
      failedReplies,
      duplicateMessagesIgnored,
      totalMessages: totalMessagesReceived,
      ordersCreated: messages.filter(
        (m) => m.status === 'ORDER_CREATED' || m.status === 'CONFIRMATION_SENT'
      ).length,
      invalidOrders: messages.filter((m) => m.status === 'INVALID_ORDER').length,
      unregisteredCustomers: messages.filter((m) => m.status === 'CUSTOMER_NOT_FOUND').length,
      failedExecutions: messages.filter((m) => m.status === 'FAILED').length,
    };
  }

  /**
   * Get paginated messages for Admin Dashboard
   */
  public static async getMessages(
    limit = 50,
    offset = 0,
    status?: ProcessingStatus,
    category?: string
  ): Promise<{ items: StoredMessage[]; total: number }> {
    const prisma = await getPrismaClient();
    if (prisma) {
      try {
        const where: Record<string, unknown> = {
          NOT: {
            rawPayload: {
              path: ['entry', '0', 'changes', '0', 'value', 'metadata', 'phone_number_id'],
              equals: '1225478070642817',
            },
          },
        };
        if (status) {
          where.status = status;
        }
        if (category && category !== 'ALL') {
          where.category = category;
        }

        const [items, total] = await Promise.all([
          prisma.message.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            take: limit,
            skip: offset,
          }),
          prisma.message.count({ where }),
        ]);
        return { items: items as unknown as StoredMessage[], total };
      } catch {
        // Fallback
      }
    }

    let all = Array.from(memStore.messages.values())
      .filter((m) => {
        const pId = (m.rawPayload as Record<string, unknown> | null)?.entry as Array<{ changes?: Array<{ value?: { metadata?: { phone_number_id?: string } } }> }> | undefined;
        return pId?.[0]?.changes?.[0]?.value?.metadata?.phone_number_id !== '1225478070642817';
      })
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    if (status) {
      all = all.filter((m) => m.status === status);
    }
    if (category && category !== 'ALL') {
      all = all.filter((m) => m.category === category);
    }
    return {
      items: all.slice(offset, offset + limit),
      total: all.length,
    };
  }

  /**
   * Get orders for Admin Dashboard
   */
  public static async getOrders(
    limit = 50,
    offset = 0
  ): Promise<{ items: StoredOrder[]; total: number }> {
    const prisma = await getPrismaClient();
    if (prisma) {
      try {
        const [items, total] = await Promise.all([
          prisma.order.findMany({
            orderBy: { createdAt: 'desc' },
            take: limit,
            skip: offset,
          }),
          prisma.order.count(),
        ]);
        return { items: items as unknown as StoredOrder[], total };
      } catch {
        // Fallback
      }
    }

    const all = Array.from(memStore.orders.values()).sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
    );
    return {
      items: all.slice(offset, offset + limit),
      total: all.length,
    };
  }

  /**
   * Get execution details (message + order + all step logs) for a messageId or internal ID
   */
  public static async getMessageDetails(identifier: string): Promise<{
    message: StoredMessage | null;
    order: StoredOrder | null;
    logs: StoredProcessingLog[];
  }> {
    const prisma = await getPrismaClient();
    if (prisma) {
      try {
        const message = await prisma.message.findFirst({
          where: {
            OR: [
              { messageId: identifier },
              { id: identifier },
            ],
          },
        });

        const targetMessageId = message?.messageId || identifier;

        const [order, logs] = await Promise.all([
          prisma.order.findFirst({ where: { messageId: targetMessageId } }),
          prisma.processingLog.findMany({
            where: { messageId: targetMessageId },
            orderBy: { createdAt: 'asc' },
          }),
        ]);

        return {
          message: message as unknown as StoredMessage | null,
          order: order as unknown as StoredOrder | null,
          logs: logs as unknown as StoredProcessingLog[],
        };
      } catch {
        // Fallback
      }
    }

    const message =
      memStore.messages.get(identifier) ??
      Array.from(memStore.messages.values()).find((m) => m.id === identifier) ??
      null;
    const targetMsgId = message?.messageId || identifier;
    const order =
      Array.from(memStore.orders.values()).find((o) => o.messageId === targetMsgId) ?? null;
    const logs = memStore.logs
      .filter((l) => l.messageId === targetMsgId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

    return { message, order, logs };
  }
}
