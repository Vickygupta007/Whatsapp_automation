import { describe, expect, it } from 'vitest';
import { MockRioErpClient } from '../src/integrations/rio-erp/mockClient.js';

describe('Rio ERP Customer Lookup', () => {
  const client = new MockRioErpClient();

  it('should find registered customer by phone number', async () => {
    const result = await client.findCustomerByPhone('919876543210');

    expect(result.found).toBe(true);
    expect(result.customer).toBeDefined();
    expect(result.customer?.name).toBe('ABC Optical');
    expect(result.customer?.isRegistered).toBe(true);
  });

  it('should find registered customer when phone is provided without country code (10 digits)', async () => {
    const result = await client.findCustomerByPhone('9876543210');

    expect(result.found).toBe(true);
    expect(result.customer?.name).toBe('ABC Optical');
  });

  it('should return found = false for unregistered phone number', async () => {
    const result = await client.findCustomerByPhone('919111111111');

    expect(result.found).toBe(false);
    expect(result.customer).toBeUndefined();
  });
});
