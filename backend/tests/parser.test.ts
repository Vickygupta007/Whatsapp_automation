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

  it('should correctly parse various index values including 1.50, 1.53, 1.56, 1.60, 1.67, 1.74, and material names', () => {
    // 1.53 (Trivex)
    const res153 = OrderParser.parse('R: -1.00 L: -1.00 Index: 1.53 Coating: HMC', dummyPhone);
    expect(res153.order.index).toBe('1.53');

    // 1.50 standard
    const res150 = OrderParser.parse('R: -1.00 L: -1.00 Index: 1.50 Coating: ARC', dummyPhone);
    expect(res150.order.index).toBe('1.50');

    // 1.5 shorthand -> 1.50
    const res15 = OrderParser.parse('R: -1.00 L: -1.00 Index: 1.5 Coating: ARC', dummyPhone);
    expect(res15.order.index).toBe('1.50');

    // 1.6 shorthand -> 1.60
    const res16 = OrderParser.parse('R: -1.00 L: -1.00 Index: 1.6 Coating: Bluecut', dummyPhone);
    expect(res16.order.index).toBe('1.60');

    // 1.58
    const res158 = OrderParser.parse('R: -1.00 L: -1.00 Index: 1.58 Coating: ARC', dummyPhone);
    expect(res158.order.index).toBe('1.58');

    // 1.67
    const res167 = OrderParser.parse('R: -1.00 L: -1.00 Index: 1.67 Coating: Bluecut', dummyPhone);
    expect(res167.order.index).toBe('1.67');

    // 1.74
    const res174 = OrderParser.parse('R: -1.00 L: -1.00 Index: 1.74 Coating: Bluecut', dummyPhone);
    expect(res174.order.index).toBe('1.74');

    // 1.76
    const res176 = OrderParser.parse('R: -1.00 L: -1.00 Index: 1.76 Coating: Bluecut', dummyPhone);
    expect(res176.order.index).toBe('1.76');

    // Named material: Trivex -> 1.53
    const resTrivex = OrderParser.parse('R: -1.00 L: -1.00 Index: Trivex Coating: ARC', dummyPhone);
    expect(resTrivex.order.index).toBe('1.53');

    // Named material: Poly -> 1.59
    const resPoly = OrderParser.parse('R: -1.00 L: -1.00 Index: Polycarbonate Coating: Blue Cut', dummyPhone);
    expect(resPoly.order.index).toBe('1.59');

    // Named material: CR-39 -> 1.50
    const resCR = OrderParser.parse('R: -1.00 L: -1.00 Index: CR-39 Coating: ARC', dummyPhone);
    expect(resCR.order.index).toBe('1.50');
  });

  it('should not confuse prescription diopter powers with lens index when no explicit index is given', () => {
    const raw = 'R: -1.50 L: -1.50 Bluecut';
    const result = OrderParser.parse(raw, dummyPhone);
    expect(result.order.rx.right.sph).toBe('-1.50');
    expect(result.order.rx.left.sph).toBe('-1.50');
    expect(result.order.index).toBeNull();
  });

  it('should parse full structured optical order format matching exact Rio fields', () => {
    const raw = `ORDER

Party: amk

Brand: HYPE
RX Type: Prescription
Product: HYPE B B
Lens Category: Single Vision
Index: 1.56
Lens Type: White
Coating: ARC
Color: PHOTO BLUE
Dia: 70
Tinting: G-15
Fitting: Supra

RIGHT EYE (OD)
SPH: -1.00
CYL: -0.50
AXIS: 90
ADD: +2.00
CORRIDOR: 14
ET/CT: ET
MM: 2.0
PRISM: 1.0
QTY: 1

LEFT EYE (OS)
SPH: -1.25
CYL: -0.75
AXIS: 85
ADD: +2.00
CORRIDOR: 14
ET/CT: ET
MM: 2.0
PRISM: 1.0
QTY: 1

Discount: 0
Remark: Urgent`;

    const result = OrderParser.parse(raw, dummyPhone);

    expect(result.isOrder).toBe(true);
    expect(result.order.partyName).toBe('amk');
    expect(result.order.brand).toBe('HYPE');
    expect(result.order.rxType).toBe('Prescription');
    expect(result.order.product).toBe('HYPE B B');
    expect(result.order.lensCategory).toBe('Single Vision');
    expect(result.order.index).toBe('1.56');
    expect(result.order.lensType).toBe('White');
    expect(result.order.coating).toBe('ARC');
    expect(result.order.colorName).toBe('PHOTO BLUE');
    expect(result.order.dia).toBe('70');
    expect(result.order.tintingName).toBe('G-15');
    expect(result.order.fittingType).toBe('Supra');
    expect(result.order.discount).toBe('0');
    expect(result.order.remarks).toBe('Urgent');

    // Right Eye (OD)
    expect(result.order.rx.right.sph).toBe('-1.00');
    expect(result.order.rx.right.cyl).toBe('-0.50');
    expect(result.order.rx.right.axis).toBe(90);
    expect(result.order.rx.right.addn).toBe('+2.00');
    expect(result.order.rx.right.corridor).toBe('14');
    expect(result.order.rx.right.etCtType).toBe('ET');
    expect(result.order.rx.right.mm).toBe('2.0');
    expect(result.order.rx.right.prism).toBe('1.0');
    expect(result.order.rx.right.qty).toBe(1);

    // Left Eye (OS)
    expect(result.order.rx.left.sph).toBe('-1.25');
    expect(result.order.rx.left.cyl).toBe('-0.75');
    expect(result.order.rx.left.axis).toBe(85);
    expect(result.order.rx.left.addn).toBe('+2.00');
    expect(result.order.rx.left.corridor).toBe('14');
    expect(result.order.rx.left.etCtType).toBe('ET');
    expect(result.order.rx.left.mm).toBe('2.0');
    expect(result.order.rx.left.prism).toBe('1.0');
    expect(result.order.rx.left.qty).toBe(1);
  });

  it('should preserve exact values and keep omitted fields as null without injecting defaults', () => {
    const raw = `ORDER
Party: amk
Product: I SIGHT FF
Index: 1.56
Coating: ARC
Fitting: Supra
Color: Blue

RIGHT EYE (OD)
SPH: -1.00

LEFT EYE (OS)
SPH: -1.00`;

    const result = OrderParser.parse(raw, dummyPhone);

    expect(result.isOrder).toBe(true);
    expect(result.order.partyName).toBe('amk');
    expect(result.order.product).toBe('I SIGHT FF');
    expect(result.order.index).toBe('1.56');
    expect(result.order.coating).toBe('ARC');
    expect(result.order.fittingType).toBe('Supra');
    expect(result.order.colorName).toBe('Blue');

    // Strict non-defaulting verification:
    expect(result.order.lensType).toBeNull(); // Must NOT default to 'White'
    expect(result.order.dia).toBeNull(); // Must NOT default to 70 or 75
    expect(result.order.tintingName).toBeNull(); // Must NOT default to G-15
    expect(result.order.brand).toBeNull(); // Must NOT default
    expect(result.order.remarks).toBeNull(); // Must NOT default
  });
});


