export interface EyePrescription {
  active?: boolean;
  sph: string | null;
  cyl: string | null;
  axis: string | number | null;
  addn?: string | number | null;
  dia?: string | number | null;
}

export interface RxPrescription {
  right: EyePrescription;
  left: EyePrescription;
}

export interface InternalOrder {
  phone: string;
  customerRefNo: string | null;
  product: string | null;
  lensType: string | null;
  coating: string | null;
  index: string | null;
  dia?: string | null;
  tintColor?: string | null;
  fittingType?: string | null;
  remarks?: string | null;
  rawMessage: string;
  rx: RxPrescription;
}

export interface ParsedOrderResult {
  isOrder: boolean;
  order: InternalOrder;
  confidence: number;
  detectedTokens?: {
    hasRightEye: boolean;
    hasLeftEye: boolean;
    hasIndex: boolean;
    hasCoating: boolean;
    hasLensType: boolean;
    hasProduct: boolean;
    hasRef: boolean;
    hasDia?: boolean;
    hasTintColor?: boolean;
    hasFittingType?: boolean;
    hasRemarks?: boolean;
  };
  missingRequiredFields: string[];
  warnings?: string[];
}

export type ParsedOrder = ParsedOrderResult;

export interface ValidationResult {
  isValid: boolean;
  reason?: string;
  missingFields?: string[];
}
