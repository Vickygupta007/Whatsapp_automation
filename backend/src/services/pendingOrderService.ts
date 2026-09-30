import { ParsedOrder } from '../types/optical.js';

export interface PendingDraftOrder {
  id: string;
  phone: string;
  party: any;
  order: ParsedOrder['order'];
  rawText?: string;
  mediaId?: string | null;
  messageId: string;
  createdAt: Date;
}

export class PendingOrderService {
  private static drafts = new Map<string, PendingDraftOrder>();

  /**
   * Saves a pending draft order awaiting customer confirmation.
   */
  public static savePendingOrder(draft: PendingDraftOrder): void {
    this.drafts.set(draft.phone, draft);
  }

  /**
   * Retrieves an active pending order for this customer phone number.
   * Auto-expires drafts older than 24 hours.
   */
  public static getPendingOrder(phone: string): PendingDraftOrder | undefined {
    const draft = this.drafts.get(phone);
    if (!draft) return undefined;

    const ageMs = Date.now() - draft.createdAt.getTime();
    if (ageMs > 24 * 60 * 60 * 1000) {
      this.drafts.delete(phone);
      return undefined;
    }

    return draft;
  }

  /**
   * Checks if customer has a pending draft order awaiting confirmation.
   */
  public static hasPendingOrder(phone: string): boolean {
    return Boolean(this.getPendingOrder(phone));
  }

  /**
   * Clears the pending draft order after confirmation or cancellation.
   */
  public static removePendingOrder(phone: string): boolean {
    return this.drafts.delete(phone);
  }

  /**
   * Clears all pending orders (used for testing).
   */
  public static clearAll(): void {
    this.drafts.clear();
  }
}
