import { EyePrescription, InternalOrder, ParsedOrderResult, RxPrescription } from '../types/order.js';
import { COATINGS, KNOWN_PRODUCTS, LENS_INDICES, LENS_TYPES } from './opticalPatterns.js';

export class OrderParser {
  /**
   * Main parsing method converting free-text WhatsApp messages into structured InternalOrder.
   */
  public static parse(rawMessage: string, phone: string): ParsedOrderResult {
    const cleanMsg = (rawMessage || '').trim();

    const partyName = this.extractPartyName(cleanMsg);
    const brand = this.extractBrand(cleanMsg);
    const rxType = this.extractRxType(cleanMsg);
    const lensCategory = this.extractLensCategory(cleanMsg);
    const rx = this.extractRx(cleanMsg);
    const index = this.extractIndex(cleanMsg, rx);
    const lensType = this.extractLensType(cleanMsg);
    const coating = this.extractCoating(cleanMsg);
    const product = this.extractProduct(cleanMsg);
    const customerRefNo = this.extractCustomerRef(cleanMsg);
    const dia = this.extractDia(cleanMsg);
    const colorName = this.extractColorName(cleanMsg);
    const tintColor = this.extractTintColor(cleanMsg) || colorName;
    const tintingName = this.extractTintingName(cleanMsg);
    const fittingType = this.extractFittingType(cleanMsg);
    const discount = this.extractDiscount(cleanMsg);
    const remarks = this.extractRemarks(cleanMsg);

    const hasRightEye = !!(rx.right.sph || rx.right.cyl || rx.right.axis || rx.right.prism);
    const hasLeftEye = !!(rx.left.sph || rx.left.cyl || rx.left.axis || rx.left.prism);
    const hasRx = hasRightEye || hasLeftEye;

    const opticalCharacteristicsCount = [
      hasRx,
      !!index,
      !!coating,
      !!lensType,
      !!product,
      !!dia,
      !!colorName,
      !!tintColor,
      !!tintingName,
      !!fittingType,
      !!remarks,
      !!brand,
      !!partyName,
      !!lensCategory,
    ].filter(Boolean).length;

    // A valid order requires RX details or at least 2 optical attributes, or explicit ORDER header
    const hasExplicitOrderHeader = /^\s*ORDER\b/i.test(cleanMsg);
    const isOrder = hasRx || opticalCharacteristicsCount >= 2 || hasExplicitOrderHeader;

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
      hasBrand: !!brand,
      hasParty: !!partyName,
      hasCategory: !!lensCategory,
    };

    const missingRequiredFields: string[] = [];
    if (!hasRx) missingRequiredFields.push('Prescription (SPH/CYL)');
    if (!index && !product) missingRequiredFields.push('Lens Index or Product');

    const internalOrder: InternalOrder = {
      phone,
      partyName,
      customerRefNo,
      brand,
      rxType,
      product: product || (lensType ? `${lensType} Lens` : null),
      productName: product || null,
      lensCategory,
      lensType: lensType || null,
      coating,
      index,
      colorName: colorName || tintColor,
      dia,
      tintColor,
      tintingName,
      fittingType,
      discount,
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

    // 1. Check for structured section block format:
    // e.g. "RIGHT EYE (OD)\nSPH: -1.00\nCYL: -0.50\n..." and "LEFT EYE (OS)\nSPH: -1.25\n..."
    const rightBlockRegex = /(?:^|\n)[\s*•_`-]*RIGHT(?:\s*EYE)?(?:\s*\((?:OD|RE)\)|\s*OD|\s*RE)?[^\S\r\n]*[:=]?\s*\n([\s\S]*?)(?=(?:\n[\s*•_`-]*LEFT(?:\s*EYE)?(?:\s*\((?:OS|LE)\)|\s*OS|\s*LE)?[^\S\r\n]*[:=]?\s*\n)|\n[\s*•_`-]*(?:Discount|Remark|Note|Ref|Party|Brand|Product)|$)/i;
    const leftBlockRegex = /(?:^|\n)[\s*•_`-]*LEFT(?:\s*EYE)?(?:\s*\((?:OS|LE)\)|\s*OS|\s*LE)?[^\S\r\n]*[:=]?\s*\n([\s\S]*?)(?=(?:\n[\s*•_`-]*RIGHT(?:\s*EYE)?(?:\s*\((?:OD|RE)\)|\s*OD|\s*RE)?[^\S\r\n]*[:=]?\s*\n)|\n[\s*•_`-]*(?:Discount|Remark|Note|Ref|Party|Brand|Product)|$)/i;

    const rightBlockMatch = rightBlockRegex.exec(message);
    const leftBlockMatch = leftBlockRegex.exec(message);

    if (rightBlockMatch || leftBlockMatch) {
      if (rightBlockMatch && rightBlockMatch[1]) {
        rx.right = this.parseEyeBlock(rightBlockMatch[1]);
      }
      if (leftBlockMatch && leftBlockMatch[1]) {
        rx.left = this.parseEyeBlock(leftBlockMatch[1]);
      }
    }

    // 2. Fallback to compact/inline format if structured blocks did not yield prescription
    if (!rx.right.sph && !rx.left.sph && !rx.right.cyl && !rx.left.cyl) {
      // Normalize commas to spaces
      const text = message.replace(/,/g, ' ');

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
    }

    // Extract Addition (Add / Addn) if common across eyes e.g. "*Add:* +2.00", "Add: 2.00", "Addn: +1.75"
    const addMatch = message.match(/(?:^|[\s*•_`-])(?:add(?:n|ition)?)[*\s]*[:=][*\s]*([+-]?\d+(?:\.\d+)?)/i);
    const commonAdd = addMatch && addMatch[1] ? this.formatDiopter(addMatch[1]) : null;

    if (commonAdd) {
      if (!rx.right.addn) rx.right.addn = commonAdd;
      if (!rx.left.addn) rx.left.addn = commonAdd;
    }

    rx.right.active = !!(rx.right.sph || rx.right.cyl || rx.right.axis || rx.right.prism);
    rx.left.active = !!(rx.left.sph || rx.left.cyl || rx.left.axis || rx.left.prism);

    return rx;
  }

  /**
   * Parses an eye block from structured multi-line text (e.g. RIGHT EYE (OD) section)
   */
  private static parseEyeBlock(blockText: string): EyePrescription {
    const res: EyePrescription = { sph: null, cyl: null, axis: null };
    if (!blockText) return res;

    const getField = (pattern: string): string | null => {
      const m = new RegExp(`(?:^|\\n)[\\s*•_\`-]*${pattern}[^\\S\\r\\n*]*[:=][^\\S\\r\\n*]*([^\\n\\r,;|•]+)`, 'i').exec(blockText);
      if (m && m[1]) {
        return this.cleanFieldValue(m[1]);
      }
      return null;
    };

    const sphVal = getField('(?:sph|sphere)');
    if (sphVal) res.sph = this.formatDiopter(sphVal);

    const cylVal = getField('(?:cyl|cylinder)');
    if (cylVal) res.cyl = this.formatDiopter(cylVal);

    const axisVal = getField('(?:axis|ax|x)');
    if (axisVal) {
      const parsedAxis = parseInt(axisVal.replace(/[^0-9]/g, ''), 10);
      if (!isNaN(parsedAxis)) res.axis = parsedAxis;
    }

    const addVal = getField('(?:add|addn|addition)');
    if (addVal) res.addn = this.formatDiopter(addVal);

    const corridorVal = getField('(?:corridor)');
    if (corridorVal) res.corridor = corridorVal;

    const etCtVal = getField('(?:et\\s*\\/\\s*ct|et|ct)');
    if (etCtVal) {
      if (/^et$/i.test(etCtVal) || /^ct$/i.test(etCtVal)) {
        res.etCtType = etCtVal.toUpperCase() as 'ET' | 'CT';
      } else {
        res.etCtVal = etCtVal;
      }
    }

    const mmVal = getField('(?:mm|ct\\s*mm|et\\s*mm)');
    if (mmVal) res.mm = mmVal;

    const prismVal = getField('(?:prism)');
    if (prismVal) res.prism = prismVal;

    const qtyVal = getField('(?:qty|quantity)');
    if (qtyVal) {
      const q = parseInt(qtyVal.replace(/[^0-9]/g, ''), 10);
      if (!isNaN(q) && q > 0) res.qty = q;
    }

    const diaVal = getField('(?:dia|diameter)');
    if (diaVal) res.dia = diaVal;

    const discVal = getField('(?:disc|discount)');
    if (discVal) res.disc = discVal;

    res.active = !!(res.sph || res.cyl || res.axis || res.prism);

    return res;
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
      const axisMatch = /\b(?:axis|ax|[xX×@*])\s*[:=]?\s*(\d{1,3})\b/i.exec(cleanSegment);

      if (sphMatch && sphMatch[1]) result.sph = this.formatDiopter(sphMatch[1]);
      if (cylMatch && cylMatch[1]) result.cyl = this.formatDiopter(cylMatch[1]);
      if (axisMatch && axisMatch[1]) result.axis = axisMatch[1];
    }

    // Check if an explicit axis is indicated by 'x', 'ax', 'axis', or '@' (e.g. "x 1", "x 90", "@ 180")
    if (!result.axis) {
      const explicitAxisMatch = /(?:axis|ax|[xX×@*])\s*[:=]?\s*(\d{1,3})\b/i.exec(cleanSegment);
      if (explicitAxisMatch) {
        const parsed = parseInt(explicitAxisMatch[1], 10);
        if (parsed >= 1 && parsed <= 180) {
          result.axis = String(parsed);
        }
      }
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

      let cylIndex = -1;
      if (!result.sph && numTokens.length >= 1) {
        result.sph = this.formatDiopter(numTokens[0]);
      }

      if (!result.cyl && numTokens.length >= 2) {
        // Second token is cylinder if it's signed or decimal (e.g. -0.50, +0.75, 0.50)
        // Ensure it's not an axis (axis is integer >= 1)
        const secondVal = parseFloat(numTokens[1]);
        if (numTokens[1].includes('.') || numTokens[1].startsWith('-') || numTokens[1].startsWith('+') || secondVal <= 6) {
          result.cyl = this.formatDiopter(numTokens[1]);
          cylIndex = 1;
        }
      }

      if (!result.axis) {
        // Axis is typically the integer token (1 to 180), usually token 2 or token 3
        const startIndex = cylIndex !== -1 ? cylIndex + 1 : 1;
        for (let i = startIndex; i < numTokens.length; i++) {
          const val = parseInt(numTokens[i], 10);
          if (!numTokens[i].includes('.') && !isNaN(val) && val >= 1 && val <= 180) {
            result.axis = String(val);
            break;
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
   * Extracts Lens Index (e.g., 1.50, 1.53, 1.56, 1.58, 1.59, 1.60, 1.61, 1.67, 1.74, 1.76, 1.80, 1.90)
   * Ensures that signed diopters like -1.50 or +1.50 are NOT matched as index!
   */
  private static extractIndex(message: string, rx?: RxPrescription): string | null {
    // 1. Explicit tag: Index: 1.53, *Index:* 1.56, Idx: 1.60, etc.
    const explicitMatch = /(?:^|[\s*•_`-])(?:index|idx|refractive\s*index|lens\s*index)[^\S\r\n*]*[:=][^\S\r\n*]*([^\n\r,;|•]+)/i.exec(message);
    if (explicitMatch && explicitMatch[1]) {
      const rawVal = explicitMatch[1].replace(/\s*[(_].*?[)_]/g, '').trim();
      const cleaned = this.cleanFieldValue(rawVal);
      if (cleaned && !this.isReservedKeyword(cleaned)) {
        // Check for named materials
        if (/\b(?:poly|polycarbonate)\b/i.test(cleaned)) return '1.59';
        if (/\b(?:trivex|phoenix)\b/i.test(cleaned)) return '1.53';
        if (/\b(?:cr-?39|standard(?:\s*plastic)?)\b/i.test(cleaned)) return '1.50';

        // Extract decimal number like 1.53, 1.56, 1.5, 1.60, 1.67, 1.74
        const numMatch = /\b([12]\.\d{1,3})\b/.exec(cleaned);
        if (numMatch) {
          const num = numMatch[1];
          // If 1 decimal digit like 1.5, 1.6, 1.7, standardize to 1.50, 1.60, 1.70
          if (/^[12]\.\d$/.test(num)) {
            return `${num}0`;
          }
          return num;
        }
        return cleaned;
      }
    }

    // 2. Scan for named materials in free text
    if (/\b(?:polycarbonate|poly(?:\s*lens)?)\b/i.test(message)) return '1.59';
    if (/\b(?:trivex|phoenix)\b/i.test(message)) return '1.53';
    if (/\b(?:cr-?39)\b/i.test(message)) return '1.50';

    // 3. Scan for indices in message that are NOT signed diopters (i.e. not preceded by - or +)
    // Check indices in reverse order of specificity
    const sortedIndices = [
      '1.90', '1.80', '1.76', '1.74', '1.70', '1.67', '1.66',
      '1.61', '1.60', '1.59', '1.58', '1.57', '1.56', '1.55',
      '1.54', '1.53', '1.50',
    ];

    for (const idx of sortedIndices) {
      // Must not be preceded by a + or - sign
      const regex = new RegExp(`(?<![+-])\\b${idx.replace('.', '\\.')}\\b`, 'i');
      if (regex.test(message)) {
        // Special case for powers matching index numbers (e.g. 1.50, 1.75, etc.)
        if (rx) {
          const isRightSphMatch = rx.right.sph === `-${idx}` || rx.right.sph === `+${idx}` || rx.right.sph === idx;
          const isLeftSphMatch = rx.left.sph === `-${idx}` || rx.left.sph === `+${idx}` || rx.left.sph === idx;
          const isRightCylMatch = rx.right.cyl === `-${idx}` || rx.right.cyl === `+${idx}` || rx.right.cyl === idx;
          const isLeftCylMatch = rx.left.cyl === `-${idx}` || rx.left.cyl === `+${idx}` || rx.left.cyl === idx;

          const count = (message.match(new RegExp(`\\b${idx.replace('.', '\\.')}\\b`, 'g')) || []).length;
          const rxCount = (isRightSphMatch ? 1 : 0) + (isLeftSphMatch ? 1 : 0) + (isRightCylMatch ? 1 : 0) + (isLeftCylMatch ? 1 : 0);
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
    // 1. Explicit tag: "Lens Type: <val>" or "Type: <val>" (ensuring it is not "RX Type:")
    const explicitLensType = /(?:^|[\n\r*•_`-])(?:lens\s*type)[^\S\r\n*]*[:=][^\S\r\n*]*([^\n\r]*)/i.exec(message);
    const typeLineMatch = explicitLensType || /(?:^|[\n\r*•_`-])(?<!\brx\s*)(?:type)[^\S\r\n*]*[:=][^\S\r\n*]*([^\n\r]*)/i.exec(message);
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
      const cleaned = this.cleanFieldValue(cleanedLine);
      if (cleaned && !this.isReservedKeyword(cleaned)) {
        if (/^arc$/i.test(cleaned)) return 'ARC';
        if (/^blue\s*mirror$/i.test(cleaned)) return 'BLUE MIRROR';
        if (/^blue\s*cut$/i.test(cleaned)) return 'BLUE CUT';
        if (/^uncote$|^uncoat$/i.test(cleaned)) return 'Uncote';
        if (/^hardcote$|^hardcoat$/i.test(cleaned)) return 'Hardcote';
        for (const item of COATINGS) {
          if (item.pattern.test(cleaned)) {
            return item.normalized;
          }
        }
        return cleaned;
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
    const tagMatch = /(?:^|[\s*•_`-])(?:product(?:\s*name)?|item|lens\s*name)[^\S\r\n*]*[:=][^\S\r\n*]*([^\n\r]*)/i.exec(message);
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
    let cleaned = val.replace(/^[\s*_`"':\u2014\u2013]+|[\s*_`"':\u2014\u2013]+$/g, '').trim();
    // Only strip leading hyphen if NOT followed by a digit (e.g. "- item" -> "item", but keep "-1.00")
    cleaned = cleaned.replace(/^-(?!\d)/, '').replace(/-(?!\d)$/, '').trim();
    if (
      !cleaned ||
      cleaned === '__' ||
      cleaned === '-' ||
      cleaned === '\u2014' ||
      cleaned === '\u2013' ||
      /^[—–-]+$/.test(cleaned) ||
      (cleaned.startsWith('[') && cleaned.endsWith(']')) ||
      cleaned.toLowerCase() === 'na' ||
      cleaned.toLowerCase() === 'n/a' ||
      cleaned.toLowerCase() === 'none' ||
      cleaned.toLowerCase() === 'nil' ||
      cleaned.toLowerCase() === 'null' ||
      cleaned.toLowerCase() === 'undefined' ||
      cleaned.toLowerCase() === 'customer name' ||
      cleaned.toLowerCase() === 'party name' ||
      cleaned.toLowerCase() === 'patient name' ||
      cleaned.toLowerCase() === 'patient name or job no'
    ) {
      return null;
    }
    return cleaned;
  }

  /**
   * Extracts Party Name (e.g. "Party: amk", "Party Name: Customer Name")
   */
  private static extractPartyName(message: string): string | null {
    const match = /(?:^|[\n\r*•_`-])(?:party(?:\s*name)?|client(?:\s*name)?)[^\S\r\n*]*[:=][^\S\r\n*]*([^\n\r,;|•]+)/i.exec(message);
    if (match && match[1]) {
      const clean = this.cleanFieldValue(match[1]);
      if (clean && !this.isReservedKeyword(clean)) return clean;
    }
    return null;
  }

  /**
   * Extracts Brand (e.g. "Brand: HYPE", "Brand: RIO")
   */
  private static extractBrand(message: string): string | null {
    const match = /(?:^|[\n\r*•_`-])(?:brand(?:\s*name)?|lens\s*brand)[^\S\r\n*]*[:=][^\S\r\n*]*([^\n\r,;|•]+)/i.exec(message);
    if (match && match[1]) {
      const clean = this.cleanFieldValue(match[1]);
      if (clean && !this.isReservedKeyword(clean)) return clean;
    }
    return null;
  }

  /**
   * Extracts RX Type (e.g. "RX Type: Prescription", "RX Type: Stock")
   */
  private static extractRxType(message: string): string | null {
    const match = /(?:^|[\n\r*•_`-])(?:rx\s*type|prescription\s*type)[^\S\r\n*]*[:=][^\S\r\n*]*([^\n\r,;|•]+)/i.exec(message);
    if (match && match[1]) {
      const clean = this.cleanFieldValue(match[1]);
      if (clean && !this.isReservedKeyword(clean)) return clean;
    }
    return null;
  }

  /**
   * Extracts Lens Category (e.g. "Lens Category: Single Vision", "Lens Category: Progressive")
   */
  private static extractLensCategory(message: string): string | null {
    const match = /(?:^|[\n\r*•_`-])(?:lens\s*category|category)[^\S\r\n*]*[:=][^\S\r\n*]*([^\n\r,;|•]+)/i.exec(message);
    if (match && match[1]) {
      const clean = this.cleanFieldValue(match[1]);
      if (clean && !this.isReservedKeyword(clean)) return clean;
    }
    return null;
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
   * Extracts Color Name (e.g. "Color: PHOTO BLUE", "Color: Blue", "Color Name: PHOTO BLUE")
   */
  private static extractColorName(message: string): string | null {
    const match = /(?:^|[\s*•_`-])(?:color(?:\s*name)?|colour(?:\s*name)?)[^\S\r\n*]*[:=][^\S\r\n*]*([^\n\r,;|•]+?)(?=[^\S\r\n]+(?:fitting|fit|dia|ref|product|index|coating|type|r:|l:|remark)|[\n\r,;|•]|$)/i.exec(message);
    if (match && match[1]) {
      const clean = this.cleanFieldValue(match[1]);
      if (clean && !this.isReservedKeyword(clean)) return clean;
    }

    return null;
  }

  /**
   * Extracts Tint / Color (e.g. "Tint/Color: Solid Grey 15%", "Tint: Brown 50%", "* Tint/Color: *grey*")
   */
  private static extractTintColor(message: string): string | null {
    const match = /(?:^|[\s*•_`-])(?:tint(?:\s*\/\s*color)?|tinting(?:\s*name)?|color)[^\S\r\n*]*[:=][^\S\r\n*]*([^\n\r,;|•]+?)(?=[^\S\r\n]+(?:fitting|fit|dia|ref|product|index|coating|type|r:|l:|remark)|[\n\r,;|•]|$)/i.exec(message);
    if (match && match[1]) {
      const clean = this.cleanFieldValue(match[1]);
      if (clean && !this.isReservedKeyword(clean)) return clean;
    }

    return null;
  }

  /**
   * Extracts Tinting Name (e.g. "Tinting: G-15", "Tinting Name: G-15")
   */
  private static extractTintingName(message: string): string | null {
    const match = /(?:^|[\s*•_`-])(?:tinting(?:\s*name)?)[^\S\r\n*]*[:=][^\S\r\n*]*([^\n\r,;|•]+?)(?=[^\S\r\n]+(?:fitting|fit|dia|ref|product|index|coating|type|r:|l:|remark)|[\n\r,;|•]|$)/i.exec(message);
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
   * Extracts Discount (e.g. "Discount: 0", "Discount: 10%", "Disc: 50")
   */
  private static extractDiscount(message: string): string | number | null {
    const match = /(?:^|[\s*•_`-])(?:discount|disc)[^\S\r\n*]*[:=][^\S\r\n*]*([^\n\r,;|•]+)/i.exec(message);
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
