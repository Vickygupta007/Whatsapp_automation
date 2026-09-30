import { EyePrescription, InternalOrder, ParsedOrderResult, RxPrescription } from '../types/order.js';
import { COATINGS, KNOWN_PRODUCTS, LENS_INDICES, LENS_TYPES } from './opticalPatterns.js';

export class OrderParser {
  /**
   * Main parsing method converting free-text WhatsApp messages into structured InternalOrder.
   */
  public static parse(rawMessage: string, phone: string): ParsedOrderResult {
    const cleanMsg = (rawMessage || '').trim();

    const rx = this.extractRx(cleanMsg);
    const index = this.extractIndex(cleanMsg, rx);
    const lensType = this.extractLensType(cleanMsg);
    const coating = this.extractCoating(cleanMsg);
    const product = this.extractProduct(cleanMsg);
    const customerRefNo = this.extractCustomerRef(cleanMsg);
    const dia = this.extractDia(cleanMsg);
    const tintColor = this.extractTintColor(cleanMsg);
    const fittingType = this.extractFittingType(cleanMsg);
    const remarks = this.extractRemarks(cleanMsg);

    const hasRightEye = !!(rx.right.sph || rx.right.cyl || rx.right.axis);
    const hasLeftEye = !!(rx.left.sph || rx.left.cyl || rx.left.axis);
    const hasRx = hasRightEye || hasLeftEye;

    const opticalCharacteristicsCount = [
      hasRx,
      !!index,
      !!coating,
      !!lensType,
      !!product,
      !!dia,
      !!tintColor,
      !!fittingType,
      !!remarks,
    ].filter(Boolean).length;

    // A valid order requires RX details or at least 2 optical attributes
    const isOrder = hasRx || opticalCharacteristicsCount >= 2;

    const detectedTokens = {
      hasRightEye,
      hasLeftEye,
      hasIndex: !!index,
      hasCoating: !!coating,
      hasLensType: !!lensType,
      hasProduct: !!product,
      hasRef: !!customerRefNo,
      hasDia: !!dia,
      hasTintColor: !!tintColor,
      hasFittingType: !!fittingType,
      hasRemarks: !!remarks,
    };

    const missingRequiredFields: string[] = [];
    if (!hasRx) missingRequiredFields.push('Prescription (SPH/CYL)');
    if (!index && !product) missingRequiredFields.push('Lens Index or Product');

    const internalOrder: InternalOrder = {
      phone,
      customerRefNo,
      product: product || (lensType ? `${lensType} Lens` : null),
      lensType: lensType || null,
      coating,
      index,
      dia,
      tintColor,
      fittingType,
      remarks,
      rawMessage: cleanMsg,
      rx,
    };

    return {
      isOrder,
      order: internalOrder,
      confidence: this.calculateConfidence(detectedTokens),
      detectedTokens,
      missingRequiredFields,
    };
  }

  /**
   * Extracts Right (R/OD) and Left (L/OS) Eye Prescriptions
   */
  private static extractRx(message: string): RxPrescription {
    const rx: RxPrescription = {
      right: { sph: null, cyl: null, axis: null, addn: null },
      left: { sph: null, cyl: null, axis: null, addn: null },
    };

    // Normalize commas to spaces
    const text = message.replace(/,/g, ' ');

    // Extract Addition (Add / Addn) e.g. "*Add:* +2.00", "Add: 2.00", "Addn: +1.75"
    const addMatch = text.match(/(?:^|[\s*•_`-])(?:add(?:n|ition)?)[*\s]*[:=][*\s]*([+-]?\d+(?:\.\d+)?)/i);
    const commonAdd = addMatch && addMatch[1] ? this.formatDiopter(addMatch[1]) : null;

    // Boundary lookahead to stop before another field tag or newline
    const stopPattern = `(?=(?:[*•_\\s-]*(?:L|LE|OS|LEFT|R|RE|OD|RIGHT|ADD|ADDN|ADDITION|DIA|DIAMETER|TINT|COLOR|FIT|FITTING|REMARK|NOTES?)[*•_\\s]*[:=])|[\n\r]|$)`;

    const rightRegex = new RegExp(`(?:^|[\\s*•_\`-])(?:R|RE|OD|RIGHT)[^\\S\\r\\n*]*[:=][^\\S\\r\\n*]*([^\n\r]+?)${stopPattern}`, 'i');
    const leftRegex = new RegExp(`(?:^|[\\s*•_\`-])(?:L|LE|OS|LEFT)[^\\S\\r\\n*]*[:=][^\\S\\r\\n*]*([^\n\r]+?)${stopPattern}`, 'i');

    const rightMatch = rightRegex.exec(text);
    const leftMatch = leftRegex.exec(text);

    if (rightMatch && rightMatch[1]) {
      rx.right = this.parseEyeSegment(rightMatch[1]);
    }

    if (leftMatch && leftMatch[1]) {
      rx.left = this.parseEyeSegment(leftMatch[1]);
    }

    // Fallback without newlines if order is written on a single line
    if (!rx.right.sph && !rx.left.sph) {
      const fallbackRight = /(?:^|\s)(?:R|RE|OD|RIGHT)(?:\s*:|\s+)([\s\S]*?)(?=(?:(?:^|\s)(?:L|LE|OS|LEFT)(?:\s*:|\s+))|$)/i.exec(text);
      const fallbackLeft = /(?:^|\s)(?:L|LE|OS|LEFT)(?:\s*:|\s+)([\s\S]*?)(?=(?:(?:^|\s)(?:R|RE|OD|RIGHT)(?:\s*:|\s+))|$)/i.exec(text);
      if (fallbackRight && fallbackRight[1]) rx.right = this.parseEyeSegment(fallbackRight[1]);
      if (fallbackLeft && fallbackLeft[1]) rx.left = this.parseEyeSegment(fallbackLeft[1]);
    }

    // Fallback: If no R/L tags, check for isolated diopter power like "-1.50" or "+2.00"
    if (!rx.right.sph && !rx.left.sph) {
      const diopterRegex = /(^|\s)([+-]\d+(?:\.\d{1,2})?)\s*(?:d|sph)?/i;
      const match = diopterRegex.exec(text);
      if (match && match[2] && parseFloat(match[2]) !== 0) {
        rx.right.sph = this.formatDiopter(match[2]);
      }
    }

    if (commonAdd) {
      if (!rx.right.addn) rx.right.addn = commonAdd;
      if (!rx.left.addn) rx.left.addn = commonAdd;
    }

    return rx;
  }

  /**
   * Parses an individual eye segment like:
   * - "-1.50 -0.50 90"
   * - "-1.75 / -0.50 x 180"
   * - "SPH: -1.50 CYL: -0.50 AXIS: 90"
   * - "-1.50"
   */
  private static parseEyeSegment(segment: string): EyePrescription {
    const result: EyePrescription = { sph: null, cyl: null, axis: null };

    // Strip trailing optical specs/keywords
    const cleanSegment = segment
      .split(/(?:\b(?:blue\s*cut|bluecut|anti[- ]reflective|arc|single|bifocal|progressive|ref|patient|index|crizal|i\s*sight|sv|pal)\b)/i)[0]
      .trim();

    // 1. Check for explicit keyword labels: SPH, CYL, AXIS
    const hasExplicitLabels = /\b(sph|sphere|cyl|cylinder|axis|ax)\b/i.test(cleanSegment);

    if (hasExplicitLabels) {
      const sphMatch = /\b(?:sph|sphere)\s*[:=]?\s*([+-]?\d+(?:\.\d{1,2})?|plano|pl)\b/i.exec(cleanSegment);
      const cylMatch = /\b(?:cyl|cylinder)\s*[:=]?\s*([+-]?\d+(?:\.\d{1,2})?)\b/i.exec(cleanSegment);
      const axisMatch = /\b(?:axis|ax|x)\s*[:=]?\s*(\d{1,3})\b/i.exec(cleanSegment);

      if (sphMatch && sphMatch[1]) result.sph = this.formatDiopter(sphMatch[1]);
      if (cylMatch && cylMatch[1]) result.cyl = this.formatDiopter(cylMatch[1]);
      if (axisMatch && axisMatch[1]) result.axis = axisMatch[1];
    }

    // 2. Positional parsing: If fields are still missing, extract numeric/diopter tokens
    if (!result.sph || !result.cyl || !result.axis) {
      // Replace '/' or 'x' or 'X' or '×' with space to cleanly extract parts like "-1.75 / -0.50 x 180"
      const normalized = cleanSegment
        .replace(/[xX×/]/g, ' ')
        .replace(/[=:]/g, ' ');

      const rawTokens = normalized
        .split(/\s+/)
        .map((t) => t.trim())
        .filter((t) => t.length > 0);

      // Separate diopters/numbers from words
      const numTokens: string[] = [];
      for (const t of rawTokens) {
        if (/^[+-]?\d+(?:\.\d+)?$/i.test(t) || /^plano$|^pl$/i.test(t)) {
          numTokens.push(t);
        }
      }

      if (!result.sph && numTokens.length >= 1) {
        result.sph = this.formatDiopter(numTokens[0]);
      }

      if (!result.cyl && numTokens.length >= 2) {
        // Second token is cylinder if it's signed or decimal (e.g. -0.50, +0.75, 0.50)
        // Ensure it's not an axis (axis is integer >= 1)
        const secondVal = parseFloat(numTokens[1]);
        if (numTokens[1].includes('.') || numTokens[1].startsWith('-') || numTokens[1].startsWith('+') || secondVal <= 6) {
          result.cyl = this.formatDiopter(numTokens[1]);
        }
      }

      if (!result.axis) {
        // Axis is typically the integer token (1 to 180), usually token 2 or token 3
        for (let i = 1; i < numTokens.length; i++) {
          const val = parseInt(numTokens[i], 10);
          if (!numTokens[i].includes('.') && !isNaN(val) && val >= 1 && val <= 180) {
            // Make sure this token wasn't already used as cyl
            if (result.cyl !== this.formatDiopter(numTokens[i])) {
              result.axis = String(val);
              break;
            }
          }
        }
      }
    }

    return result;
  }

  /**
   * Standardizes diopter power strings (e.g., "-1.5" -> "-1.50", "plano" -> "0.00")
   */
  private static formatDiopter(val: string): string {
    const lower = val.toLowerCase().trim();
    if (lower === 'plano' || lower === 'pl') {
      return '0.00';
    }

    const num = parseFloat(val);
    if (isNaN(num)) return val;

    const formatted = num.toFixed(2);
    return num > 0 ? `+${formatted}` : formatted;
  }

  /**
   * Extracts Lens Index (e.g., 1.50, 1.56, 1.59, 1.60, 1.61, 1.67, 1.74)
   * Ensures that signed diopters like -1.50 or +1.50 are NOT matched as index!
   */
  private static isReservedKeyword(val: string): boolean {
    return /^(?:dia|diameter|tint|color|fitting|fit|type|lens\s*type|index|idx|coating|coat|ref|reference|patient|remark|remarks|special\s*remarks|notes?|r|l|od|os|sph|cyl|axis)$/i.test(val.trim());
  }

  /**
   * Extracts Lens Index (e.g., 1.50, 1.56, 1.59, 1.60, 1.61, 1.67, 1.74)
   * Ensures that signed diopters like -1.50 or +1.50 are NOT matched as index!
   */
  private static extractIndex(message: string, rx?: RxPrescription): string | null {
    // 1. Explicit "Index 1.56" or "*Index:* 1.56"
    const explicitMatch = /(?:index|idx)[^\S\r\n*]*[:=][^\S\r\n*]*([12]\.\d{2})/i.exec(message);
    if (explicitMatch && explicitMatch[1] && LENS_INDICES.includes(explicitMatch[1])) {
      return explicitMatch[1];
    }

    // 2. Scan for indices in message that are NOT signed diopters (i.e. not preceded by - or +)
    // Check indices in reverse order of specificity: 1.74, 1.67, 1.61, 1.60, 1.59, 1.56, 1.50
    const sortedIndices = ['1.74', '1.67', '1.61', '1.60', '1.59', '1.56', '1.50'];

    for (const idx of sortedIndices) {
      // Must not be preceded by a + or - sign
      const regex = new RegExp(`(?<![+-])\\b${idx.replace('.', '\\.')}\\b`, 'i');
      if (regex.test(message)) {
        // Special case for 1.50: verify it's not one of the extracted prescription powers
        if (idx === '1.50' && rx) {
          const isRightSph150 = rx.right.sph === '-1.50' || rx.right.sph === '+1.50' || rx.right.sph === '1.50';
          const isLeftSph150 = rx.left.sph === '-1.50' || rx.left.sph === '+1.50' || rx.left.sph === '1.50';
          // Count occurrences of "1.50" in message
          const count = (message.match(/1\.50/g) || []).length;
          const rxCount = (isRightSph150 ? 1 : 0) + (isLeftSph150 ? 1 : 0);
          if (count <= rxCount) {
            // It was part of the prescription, not an index
            continue;
          }
        }
        return idx;
      }
    }

    return null;
  }

  /**
   * Extracts Lens Type (Single Vision, Progressive, Bifocal, or custom)
   */
  private static extractLensType(message: string): string | null {
    // 1. Explicit tag: *Type:* Single Vision _(or Progressive / Bifocal / custom)_
    const typeLineMatch = /(?:^|[\s*•_`-])(?:type|lens\s*type)[^\S\r\n*]*[:=][^\S\r\n*]*([^\n\r]*)/i.exec(message);
    if (typeLineMatch) {
      const rawVal = typeLineMatch[1] ? typeLineMatch[1].replace(/\s*[(_].*?[)_]/g, '').trim() : '';
      const cleaned = this.cleanFieldValue(rawVal);
      if (!cleaned || this.isReservedKeyword(cleaned)) {
        // Explicit Type: tag was present but empty or invalid placeholder -> do NOT infer from elsewhere
        return null;
      }
      for (const item of LENS_TYPES) {
        if (item.pattern.test(cleaned)) {
          return item.normalized;
        }
      }
      // If user typed any other lens type after Type:, return that value
      return cleaned;
    }

    for (const item of LENS_TYPES) {
      if (item.pattern.test(message)) {
        return item.normalized;
      }
    }
    return null;
  }

  /**
   * Extracts Coating (Blue Cut, Anti Reflective, etc.)
   */
  private static extractCoating(message: string): string | null {
    // 1. Explicit tag: *Coating:* Blue Cut _(or HMC / SHMC / Hard Coat)_
    const coatLineMatch = /(?:^|[\s*•_`-])(?:coating|coat)[^\S\r\n*]*[:=][^\S\r\n*]*([^\n\r]+)/i.exec(message);
    if (coatLineMatch && coatLineMatch[1]) {
      const cleanedLine = coatLineMatch[1].replace(/\s*[(_].*?[)_]/g, '').trim();
      for (const item of COATINGS) {
        if (item.pattern.test(cleanedLine)) {
          return item.normalized;
        }
      }
    }

    for (const item of COATINGS) {
      if (item.pattern.test(message)) {
        return item.normalized;
      }
    }
    return null;
  }

  /**
   * Extracts Product or Brand Name
   */
  private static extractProduct(message: string): string | null {
    // Check for explicit "Product: <name>" or "*Product:* I SIGHT" tag
    const tagMatch = /(?:^|[\s*•_`-])(?:product|item|brand)[^\S\r\n*]*[:=][^\S\r\n*]*([^\n\r]*)/i.exec(message);
    if (tagMatch) {
      const rawVal = tagMatch[1] ? tagMatch[1].replace(/\s*[(_].*?[)_]/g, '').trim() : '';
      const cleaned = this.cleanFieldValue(rawVal);
      if (!cleaned || this.isReservedKeyword(cleaned)) {
        // Explicit Product: tag was present but empty -> do NOT infer from elsewhere
        return null;
      }
      for (const prod of KNOWN_PRODUCTS) {
        if (new RegExp(`^${prod}$`, 'i').test(cleaned)) {
          return prod;
        }
      }
      return cleaned;
    }

    for (const prod of KNOWN_PRODUCTS) {
      const regex = new RegExp(`\\b${prod.replace(/\\s+/g, '\\s+')}\\b`, 'i');
      if (regex.test(message)) {
        return prod;
      }
    }

    return null;
  }

  /**
   * Helper to strip markdown formatting (*, _, `, quotes) and empty placeholders (__, -, —, –).
   */
  private static cleanFieldValue(val: string | null | undefined): string | null {
    if (!val) return null;
    const cleaned = val.replace(/^[\s*_`"':\u2014\u2013-]+|[\s*_`"':\u2014\u2013-]+$/g, '').trim();
    if (
      !cleaned ||
      cleaned === '__' ||
      cleaned === '-' ||
      cleaned === '\u2014' ||
      cleaned === '\u2013' ||
      /^[—–-]+$/.test(cleaned) ||
      cleaned.toLowerCase() === 'na' ||
      cleaned.toLowerCase() === 'n/a' ||
      cleaned.toLowerCase() === 'none' ||
      cleaned.toLowerCase() === 'nil' ||
      cleaned.toLowerCase() === 'null' ||
      cleaned.toLowerCase() === 'undefined' ||
      cleaned.toLowerCase() === 'patient name' ||
      cleaned.toLowerCase() === 'patient name or job no'
    ) {
      return null;
    }
    return cleaned;
  }

  /**
   * Extracts Customer/Patient Reference (e.g. "Ref: ASH", "Ref: Sharma", "Patient: John Doe")
   */
  private static extractCustomerRef(message: string): string | null {
    // 1. n8n pattern: handles hyphenated IDs and stops cleanly before prescription tokens on same line
    const n8nRefMatch = message.match(/(?:^|[\s*•_`-])(?:ref|patient|pt|cust|frame)[^\S\r\n*]*[:=-][^\S\r\n*]*([^\n\r,;]+?)(?=[^\S\r\n]+(?:r:|l:|od:|os:|product:|index:|coating:|type:|dia:|tint|fitting|remark)|[\n\r,;]|$)/i);
    if (n8nRefMatch && n8nRefMatch[1]) {
      const candidate = this.cleanFieldValue(n8nRefMatch[1]);
      if (candidate && !this.isReservedKeyword(candidate) && !/^(sph|cyl|axis|right|left|bluecut|single|bifocal|1\.\d{2})$/i.test(candidate)) {
        return candidate;
      }
    }

    const patterns = [
      /(?:^|[\s*•_`-])(?:ref(?:erence)?(?:\s*no|\s*#)?|patient|pt|customer|name|client)[^\S\r\n*]*[:=-][^\S\r\n*]*([A-Za-z0-9_-]+)(?=[,\n\r|\s]|$)/i,
      /\bref\s+([A-Za-z0-9_-]+)/i,
    ];

    for (const pattern of patterns) {
      const match = pattern.exec(message);
      if (match && match[1]) {
        const candidate = this.cleanFieldValue(match[1]);
        if (candidate && !this.isReservedKeyword(candidate) && !/^(sph|cyl|axis|right|left|bluecut|single|bifocal|1\.\d{2})$/i.test(candidate)) {
          return candidate;
        }
      }
    }

    return null;
  }

  /**
   * Extracts Lens Diameter (e.g. "Dia: EX-50", "Dia: 65", "* Dia: *78*", "*Dia:* 70", "Diameter: 65mm")
   */
  private static extractDia(message: string): string | null {
    const match = /(?:^|[\s*•_`-])(?:dia(?:meter)?)[^\S\r\n*]*[:=][^\S\r\n*]*(?:[*_`"'][^\S\r\n]*)?([A-Za-z0-9_-]+)/i.exec(message);
    if (match && match[1]) {
      const val = this.cleanFieldValue(match[1]);
      if (val && !this.isReservedKeyword(val)) return val;
    }
    return null;
  }

  /**
   * Extracts Tint / Color (e.g. "Tint/Color: Solid Grey 15%", "Tint: Brown 50%", "* Tint/Color: *grey*")
   */
  private static extractTintColor(message: string): string | null {
    const match = /(?:^|[\s*•_`-])(?:tint(?:\s*\/\s*color)?|color)[^\S\r\n*]*[:=][^\S\r\n*]*([^\n\r,;|•]+?)(?=[^\S\r\n]+(?:fitting|fit|dia|ref|product|index|coating|type|r:|l:|remark)|[\n\r,;|•]|$)/i.exec(message);
    if (match && match[1]) {
      const clean = this.cleanFieldValue(match[1]);
      if (clean && !this.isReservedKeyword(clean)) return clean;
    }

    return null;
  }

  /**
   * Extracts Fitting Type (e.g. "Fitting Type: Full Rim", "Fitting: Rimless", "Fit: Rimless", "* Fitting Type: supra")
   */
  private static extractFittingType(message: string): string | null {
    const match = /(?:^|[\s*•_`-])(?:fitting(?:\s*type)?|fit)[^\S\r\n*]*[:=][^\S\r\n*]*([^\n\r,;|•]+?)(?=[^\S\r\n]+(?:tint|color|dia|ref|product|index|coating|type|r:|l:|remark)|[\n\r,;|•]|$)/i.exec(message);
    if (match && match[1]) {
      const clean = this.cleanFieldValue(match[1]);
      if (clean && !this.isReservedKeyword(clean)) return clean;
    }

    return null;
  }

  /**
   * Extracts Customer Remarks / Special Instructions (e.g. "Remark: qwert", "Remarks: Urgent order", "Note: AS THIN AS POSSIBLE")
   */
  private static extractRemarks(message: string): string | null {
    const match = /(?:^|[\s*•_`-])(?:remarks?|special\s*remarks?|notes?)[^\S\r\n*]*[:=][^\S\r\n*]*([^\n\r,;|•]+?)(?=[^\S\r\n]+(?:fitting|fit|tint|color|dia|ref|product|index|coating|type|r:|l:)|[\n\r,;|•]|$)/i.exec(message);
    if (match && match[1]) {
      const clean = this.cleanFieldValue(match[1]);
      if (clean && !this.isReservedKeyword(clean)) return clean;
    }

    return null;
  }

  private static calculateConfidence(detected: {
    hasRightEye: boolean;
    hasLeftEye: boolean;
    hasIndex: boolean;
    hasCoating: boolean;
    hasLensType: boolean;
    hasProduct: boolean;
    hasRef: boolean;
  }): number {
    let score = 0;
    if (detected.hasRightEye) score += 25;
    if (detected.hasLeftEye) score += 25;
    if (detected.hasIndex) score += 15;
    if (detected.hasCoating) score += 15;
    if (detected.hasLensType) score += 10;
    if (detected.hasProduct) score += 5;
    if (detected.hasRef) score += 5;
    return Math.min(100, score);
  }
}
