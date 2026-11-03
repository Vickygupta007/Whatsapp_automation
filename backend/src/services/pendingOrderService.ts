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
  index?: number;
}

export class PendingOrderService {
  // Map of normalized phone number -> Map of draftId -> PendingDraftOrder
  private static draftsByPhone = new Map<string, Map<string, PendingDraftOrder>>();

  /**
   * Saves a pending draft order awaiting customer confirmation.
   * If customer already has drafts, preserves existing drafts so multiple
   * prescription images (5-10 slips) can be queued and confirmed independently.
   */
  public static savePendingOrder(draft: PendingDraftOrder): string {
    const cleanPhone = (draft.phone || '').replace(/\D/g, '');
    let customerDrafts = this.draftsByPhone.get(cleanPhone);
    if (!customerDrafts) {
      customerDrafts = new Map<string, PendingDraftOrder>();
      this.draftsByPhone.set(cleanPhone, customerDrafts);
    }

    // Clean up expired drafts (> 24 hours)
    const now = Date.now();
    for (const [id, d] of customerDrafts.entries()) {
      if (now - d.createdAt.getTime() > 24 * 60 * 60 * 1000) {
        customerDrafts.delete(id);
      }
    }

    // Determine 1-based index (#1, #2, #3...)
    if (!draft.index) {
      // Check if updating an existing draft with the same patient Ref during an Edit
      let existingId: string | null = null;
      if (draft.order.customerRefNo) {
        const refLower = draft.order.customerRefNo.trim().toLowerCase();
        for (const [id, d] of customerDrafts.entries()) {
          if (d.order.customerRefNo && d.order.customerRefNo.trim().toLowerCase() === refLower) {
            existingId = id;
            draft.index = d.index;
            break;
          }
        }
      }

      if (!draft.index) {
        draft.index = customerDrafts.size + 1;
      }
      if (existingId) {
        draft.id = existingId;
      }
    }

    customerDrafts.set(draft.id, draft);
    return draft.id;
  }

  /**
   * Retrieves an active pending order for this customer.
   * Matches by:
   * 1. draftId (e.g. "draft_173000_abcd")
   * 2. Index number (e.g. "1", "2", "#1")
   * 3. Patient reference (e.g. "Sharma", "Patel")
   * If targetIdOrRef is omitted:
   * - returns the latest draft (or sole draft)
   */
  public static getPendingOrder(phone: string, targetIdOrRef?: string | null): PendingDraftOrder | undefined {
    const cleanPhone = (phone || '').replace(/\D/g, '');
    const customerDrafts = this.draftsByPhone.get(cleanPhone);
    if (!customerDrafts || customerDrafts.size === 0) return undefined;

    const allDrafts = Array.from(customerDrafts.values()).sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
    );

    if (!targetIdOrRef || !targetIdOrRef.trim()) {
      return allDrafts[allDrafts.length - 1];
    }

    const query = targetIdOrRef.trim().toLowerCase().replace(/^[#\s]+/, '');

    // 1. Direct draft ID match
    if (customerDrafts.has(targetIdOrRef.trim())) {
      return customerDrafts.get(targetIdOrRef.trim());
    }

    // 2. Numeric index match (e.g. "1", "2")
    const num = parseInt(query, 10);
    if (!isNaN(num) && num >= 1 && num <= allDrafts.length) {
      return allDrafts[num - 1];
    }

    // 3. Search by customerRefNo (e.g. "Sharma")
    const matchByRef = allDrafts.find((d) => {
      const ref = (d.order.customerRefNo || '').trim().toLowerCase();
      return ref && (ref === query || ref.includes(query) || query.includes(ref));
    });
    if (matchByRef) return matchByRef;

    // 4. Substring ID match
    const matchById = allDrafts.find((d) => d.id.toLowerCase().includes(query));
    if (matchById) return matchById;

    // Fallback to latest draft
    return allDrafts[allDrafts.length - 1];
  }

  /**
   * Returns all active pending drafts for this customer in chronological order.
   */
  public static getAllPendingOrders(phone: string): PendingDraftOrder[] {
    const cleanPhone = (phone || '').replace(/\D/g, '');
    const customerDrafts = this.draftsByPhone.get(cleanPhone);
    if (!customerDrafts) return [];
    return Array.from(customerDrafts.values()).sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
    );
  }

  /**
   * Checks if customer has any active pending order awaiting confirmation.
   */
  public static hasPendingOrder(phone: string): boolean {
    return this.getAllPendingOrders(phone).length > 0;
  }

  /**
   * Removes a specific draft order after confirmation.
   * If draftId is omitted, removes the matching or latest draft.
   */
  public static removePendingOrder(phone: string, draftId?: string): boolean {
    const cleanPhone = (phone || '').replace(/\D/g, '');
    const customerDrafts = this.draftsByPhone.get(cleanPhone);
    if (!customerDrafts || customerDrafts.size === 0) return false;

    if (draftId && customerDrafts.has(draftId)) {
      customerDrafts.delete(draftId);
      if (customerDrafts.size === 0) {
        this.draftsByPhone.delete(cleanPhone);
      }
      return true;
    }

    const target = this.getPendingOrder(phone, draftId);
    if (target) {
      customerDrafts.delete(target.id);
      if (customerDrafts.size === 0) {
        this.draftsByPhone.delete(cleanPhone);
      }
      return true;
    }

    return false;
  }

  /**
   * Clears all pending orders for this customer phone.
   */
  public static clearCustomerOrders(phone: string): void {
    const cleanPhone = (phone || '').replace(/\D/g, '');
    this.draftsByPhone.delete(cleanPhone);
  }

  /**
   * Clears all pending orders globally (used for testing).
   */
  public static clearAll(): void {
    this.draftsByPhone.clear();
  }
}
