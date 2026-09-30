import { describe, expect, it } from 'vitest';
import { OrderParser } from '../src/parsers/orderParser.js';
import { OrderValidator } from '../src/validators/orderValidator.js';

describe('OrderValidator', () => {
  const dummyPhone = '919876543210';

  it('should validate complete valid optical order', () => {
    const parsed = OrderParser.parse('R: -1.50 L: -2.00 Bluecut 1.56 Ref: Sharma', dummyPhone);
    const validation = OrderValidator.validate(parsed);

    expect(validation.isValid).toBe(true);
  });

  it('should reject casual greetings or general questions', () => {
    const parsed = OrderParser.parse('Hi, when will my invoice be ready?', dummyPhone);
    const validation = OrderValidator.validate(parsed);

    expect(validation.isValid).toBe(false);
    expect(validation.reason).toContain('does not contain recognizable optical order details');
  });

  it('should reject prescription when cylinder is specified without axis', () => {
    // Manually constructed invalid prescription
    const parsed = OrderParser.parse('R: SPH -1.50 CYL -0.50 L: -2.00 Bluecut 1.56', dummyPhone);
    // Right eye has CYL -0.50 but no axis
    const validation = OrderValidator.validate(parsed);

    expect(validation.isValid).toBe(false);
    expect(validation.reason).toContain('Axis');
  });

  it('should accept valid prescription when CYL has associated Axis', () => {
    const parsed = OrderParser.parse('R: SPH -1.50 CYL -0.50 AXIS 90 L: -2.00 Bluecut 1.56', dummyPhone);
    const validation = OrderValidator.validate(parsed);

    expect(validation.isValid).toBe(true);
  });
});
