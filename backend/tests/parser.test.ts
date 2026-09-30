import { describe, expect, it } from 'vitest';
import { OrderParser } from '../src/parsers/orderParser.js';

describe('OrderParser (Rule-Based Deterministic Optical Parsing)', () => {
  const dummyPhone = '919876543210';

  it('should parse simple optical format: R: -1.50 L: -2.00 Bluecut 1.56', () => {
    const raw = 'R: -1.50 L: -2.00 Bluecut 1.56';
    const result = OrderParser.parse(raw, dummyPhone);

    expect(result.isOrder).toBe(true);
    expect(result.order.rx.right.sph).toBe('-1.50');
    expect(result.order.rx.left.sph).toBe('-2.00');
    expect(result.order.coating).toBe('BLUE CUT');
    expect(result.order.index).toBe('1.56');
  });

  it('should parse compound prescription with CYL, AXIS, Lens Type and Ref', () => {
    const raw = 'R -1.50 -0.50 90 L -2.00 -1.00 180 Single Vision Blue Cut 1.56 Ref: Sharma';
    const result = OrderParser.parse(raw, dummyPhone);

    expect(result.isOrder).toBe(true);
    // Right Eye
    expect(result.order.rx.right.sph).toBe('-1.50');
    expect(result.order.rx.right.cyl).toBe('-0.50');
    expect(result.order.rx.right.axis).toBe('90');

    // Left Eye
    expect(result.order.rx.left.sph).toBe('-2.00');
    expect(result.order.rx.left.cyl).toBe('-1.00');
    expect(result.order.rx.left.axis).toBe('180');

    // Optical Specs
    expect(result.order.lensType).toBe('Single Vision');
    expect(result.order.coating).toBe('BLUE CUT');
    expect(result.order.index).toBe('1.56');
    expect(result.order.customerRefNo).toBe('Sharma');
  });

  it('should parse OD / OS notation with slash and x separator: OD: -2.00 OS: -1.75 / -0.50 x 180 1.67 Bluecut', () => {
    const raw = 'OD: -2.00 OS: -1.75 / -0.50 x 180 1.67 Bluecut';
    const result = OrderParser.parse(raw, dummyPhone);

    expect(result.isOrder).toBe(true);
    expect(result.order.rx.right.sph).toBe('-2.00');
    expect(result.order.rx.left.sph).toBe('-1.75');
    expect(result.order.rx.left.cyl).toBe('-0.50');
    expect(result.order.rx.left.axis).toBe('180');
    expect(result.order.index).toBe('1.67');
    expect(result.order.coating).toBe('BLUE CUT');
  });

  it('should parse explicitly labeled prescription tokens: SPH, CYL, AXIS, Product', () => {
    const raw = 'R: SPH -1.50 CYL -0.50 AXIS 90 | L: SPH -2.00 CYL -0.75 AXIS 180 I SIGHT 1.56 SV';
    const result = OrderParser.parse(raw, dummyPhone);

    expect(result.isOrder).toBe(true);
    expect(result.order.rx.right.sph).toBe('-1.50');
    expect(result.order.rx.right.cyl).toBe('-0.50');
    expect(result.order.rx.right.axis).toBe('90');

    expect(result.order.rx.left.sph).toBe('-2.00');
    expect(result.order.rx.left.cyl).toBe('-0.75');
    expect(result.order.rx.left.axis).toBe('180');

    expect(result.order.product).toBe('I SIGHT');
    expect(result.order.lensType).toBe('Single Vision');
    expect(result.order.index).toBe('1.56');
  });

  it('should extract plus powers correctly (+2.25)', () => {
    const raw = 'R: +2.25 L: +1.75 Anti-reflective 1.60 Ref: Verma';
    const result = OrderParser.parse(raw, dummyPhone);

    expect(result.isOrder).toBe(true);
    expect(result.order.rx.right.sph).toBe('+2.25');
    expect(result.order.rx.left.sph).toBe('+1.75');
    expect(result.order.coating).toBe('ANTI REFLECTIVE');
    expect(result.order.index).toBe('1.60');
    expect(result.order.customerRefNo).toBe('Verma');
  });

  it('should extract Dia, Tint/Color, and Fitting Type when present', () => {
    const raw = `ORDER
• Ref: ASH
• Product: Bluecut 1.56
• R: -1.00 / -0.50 x 90
• L: -1.25 / -0.25 x 180
• Add: +2.00
• Dia: EX-50
• Tint/Color: Solid Grey 15%
• Fitting Type: Full Rim`;
    const result = OrderParser.parse(raw, dummyPhone);

    expect(result.isOrder).toBe(true);
    expect(result.order.customerRefNo).toBe('ASH');
    expect(result.order.dia).toBe('EX-50');
    expect(result.order.tintColor).toBe('Solid Grey 15%');
    expect(result.order.fittingType).toBe('Full Rim');
  });

  it('should cleanly extract Dia, Tint/Color, and Fitting Type with WhatsApp asterisks formatting', () => {
    const raw = `Ref: Sharma R: -1.50/-0.50x90 L: -2.00/-0.50x85 Bluecut 1.56*
* Dia: *78*
* Tint/Color: *grey*
* Fitting Type: supra`;
    const result = OrderParser.parse(raw, dummyPhone);

    expect(result.isOrder).toBe(true);
    expect(result.order.customerRefNo).toBe('Sharma');
    expect(result.order.dia).toBe('78');
    expect(result.order.tintColor).toBe('grey');
    expect(result.order.fittingType).toBe('supra');
  });

  it('should correctly extract Dia, Tint/Color, and Fitting Type when formatted inline on single line', () => {
    const raw = 'Ref: Patel R: -1.50 L: -2.00 Bluecut 1.56 Dia: 70 Tint/Color: G-15 25% Fitting Type: Rimless';
    const result = OrderParser.parse(raw, dummyPhone);

    expect(result.isOrder).toBe(true);
    expect(result.order.customerRefNo).toBe('Patel');
    expect(result.order.dia).toBe('70');
    expect(result.order.tintColor).toBe('G-15 25%');
    expect(result.order.fittingType).toBe('Rimless');
  });

  it('should cleanly treat empty fields and dashes as null and not bleed across newlines', () => {
    const raw = `Ref: Sharma
Product: I SIGHT
R: -1.50 / -0.50 x 90
L: -2.00 / -0.50 x 85
Dia:
Tint:
Fitting: Full Rim
Type: Single Vision
Index: 1.56
Coating: Blue Cut
Remark: —`;
    const result = OrderParser.parse(raw, dummyPhone);

    expect(result.isOrder).toBe(true);
    expect(result.order.customerRefNo).toBe('Sharma');
    expect(result.order.product).toBe('I SIGHT');
    expect(result.order.lensType).toBe('Single Vision');
    expect(result.order.index).toBe('1.56');
    expect(result.order.coating).toBe('BLUE CUT');
    expect(result.order.dia).toBeNull();
    expect(result.order.tintColor).toBeNull();
    expect(result.order.fittingType).toBe('Full Rim');
    expect(result.order.remarks).toBeNull();
  });
});

