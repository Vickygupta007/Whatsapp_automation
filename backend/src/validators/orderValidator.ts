import { ParsedOrderResult, ValidationResult } from '../types/order.js';

export class OrderValidator {
  /**
   * Validates if a parsed order contains the necessary optical information
   * to be safely processed and submitted to Rio ERP.
   */
  public static validate(parsed: ParsedOrderResult): ValidationResult {
    if (!parsed.isOrder) {
      return {
        isValid: false,
        reason: 'Message does not contain recognizable optical order details or prescription.',
        missingFields: ['Prescription (R/L power)', 'Lens specifications'],
      };
    }

    const { order } = parsed;
    const hasRight = !!(order.rx.right.sph || order.rx.right.cyl);
    const hasLeft = !!(order.rx.left.sph || order.rx.left.cyl);

    // An optical work order must have prescription power for at least one eye
    if (!hasRight && !hasLeft) {
      return {
        isValid: false,
        reason: 'Missing eye prescription powers (SPH/CYL) for both right and left eyes.',
        missingFields: ['Right eye (R) or Left eye (L) prescription'],
      };
    }

    // Cylindrical power requires an Axis value (1 to 180)
    if (order.rx.right.cyl && !order.rx.right.axis) {
      return {
        isValid: false,
        reason: 'Right eye cylinder (CYL) specified without Axis angle (1-180).',
        missingFields: ['Right eye Axis (e.g. 90 or 180)'],
      };
    }

    if (order.rx.left.cyl && !order.rx.left.axis) {
      return {
        isValid: false,
        reason: 'Left eye cylinder (CYL) specified without Axis angle (1-180).',
        missingFields: ['Left eye Axis (e.g. 90 or 180)'],
      };
    }

    // Check for lens index or product designation
    if (!order.index && !order.product && !order.coating) {
      return {
        isValid: false,
        reason: 'Missing lens material/index or coating specification.',
        missingFields: ['Lens Index (e.g. 1.56, 1.60) or Coating'],
      };
    }

    return {
      isValid: true,
    };
  }
}
