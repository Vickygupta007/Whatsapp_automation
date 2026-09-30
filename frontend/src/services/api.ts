import { AdminMetrics, MessageDetailsResponse, ProcessingStatus, SimulationResult, StoredMessage, StoredOrder } from '../types';

const API_BASE = '/api/admin';

export const api = {
  async getMetrics(): Promise<AdminMetrics> {
    const res = await fetch(`${API_BASE}/metrics`);
    if (!res.ok) throw new Error('Failed to fetch metrics');
    return res.json();
  },

  async getMessages(
    limit = 50,
    offset = 0,
    status?: ProcessingStatus,
    category?: string
  ): Promise<{ items: StoredMessage[]; total: number }> {
    const params = new URLSearchParams({
      limit: String(limit),
      offset: String(offset),
    });
    if (status) params.append('status', status);
    if (category && category !== 'ALL') params.append('category', category);

    const res = await fetch(`${API_BASE}/messages?${params.toString()}`);
    if (!res.ok) throw new Error('Failed to fetch messages');
    return res.json();
  },

  async getOrders(
    limit = 50,
    offset = 0
  ): Promise<{ items: StoredOrder[]; total: number }> {
    const params = new URLSearchParams({
      limit: String(limit),
      offset: String(offset),
    });

    const res = await fetch(`${API_BASE}/orders?${params.toString()}`);
    if (!res.ok) throw new Error('Failed to fetch orders');
    return res.json();
  },

  async getMessageDetails(messageId: string): Promise<MessageDetailsResponse> {
    const res = await fetch(`${API_BASE}/messages/${encodeURIComponent(messageId)}/details`);
    if (!res.ok) throw new Error('Failed to fetch execution details');
    return res.json();
  },

  async simulateMessage(data: {
    phone: string;
    text?: string;
    customerName?: string;
    messageType?: string;
    mediaId?: string;
  }): Promise<SimulationResult> {
    const res = await fetch(`${API_BASE}/simulate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Simulation request failed');
    }
    return res.json();
  },

  async getHealth(): Promise<Record<string, unknown>> {
    const res = await fetch('/health');
    if (!res.ok) throw new Error('Health check failed');
    return res.json();
  },
};
