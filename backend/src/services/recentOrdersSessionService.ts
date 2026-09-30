import { logger } from '../utils/logger.js';

export interface SessionOrder {
  orderId: string;
  customerRefNo?: string | null;
  product?: string | null;
  status?: string | null;
}

interface CustomerOrderSession {
  orders: SessionOrder[];
  expiresAt: number;
}

export class RecentOrdersSessionService {
  private static sessions = new Map<string, CustomerOrderSession>();
  private static readonly DEFAULT_TTL_MS = 30 * 60 * 1000; // 30 minutes

  private static normalizePhone(phone: string): string {
    return phone.replace(/\D/g, '').slice(-10);
  }

  public static setRecentOrders(
    phone: string,
    orders: SessionOrder[],
    ttlMs: number = this.DEFAULT_TTL_MS
  ): void {
    const key = this.normalizePhone(phone);
    this.sessions.set(key, {
      orders,
      expiresAt: Date.now() + ttlMs,
    });
    logger.info(`[RecentOrdersSessionService] Cached ${orders.length} orders for phone: ${key}`);
  }

  public static getRecentOrders(phone: string): SessionOrder[] | null {
    const key = this.normalizePhone(phone);
    const session = this.sessions.get(key);
    if (!session) return null;

    if (Date.now() > session.expiresAt) {
      this.sessions.delete(key);
      return null;
    }

    return session.orders;
  }

  public static getOrderByIndex(phone: string, index: number): string | null {
    const orders = this.getRecentOrders(phone);
    if (!orders || orders.length === 0) return null;

    const zeroBased = index - 1;
    if (zeroBased >= 0 && zeroBased < orders.length) {
      return orders[zeroBased].orderId;
    }

    return null;
  }

  public static hasActiveSession(phone: string): boolean {
    return this.getRecentOrders(phone) !== null;
  }

  public static clearSession(phone: string): void {
    const key = this.normalizePhone(phone);
    this.sessions.delete(key);
  }

  public static clearAll(): void {
    this.sessions.clear();
  }
}
