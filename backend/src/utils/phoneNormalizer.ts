/**
 * Normalizes phone numbers consistently for Rio ERP lookup and WhatsApp API.
 * - Strips whitespace, hyphens, parentheses, plus sign.
 * - If 10 digits (e.g. Indian mobile number without country code), standardizes to 91XXXXXXXXXX.
 * - Ensures only digits are preserved.
 */
export function normalizePhone(rawPhone: string): string {
  if (!rawPhone) return '';

  // Remove any non-digit characters
  let digits = rawPhone.replace(/\D/g, '');

  // If phone starts with '00', replace with country code without zeros
  if (digits.startsWith('00')) {
    digits = digits.substring(2);
  }

  // If 10 digits, assume standard Indian mobile and prefix 91
  if (digits.length === 10) {
    digits = `91${digits}`;
  }

  // If 11 digits starting with 0, replace leading 0 with 91
  if (digits.length === 11 && digits.startsWith('0')) {
    digits = `91${digits.substring(1)}`;
  }

  return digits;
}

export function isValidPhone(phone: string): boolean {
  const normalized = normalizePhone(phone);
  // Valid international mobile number is typically 10 to 15 digits
  return /^\d{10,15}$/.test(normalized);
}

/**
 * Normalizes a phone number to its last 10 digits (standard Indian mobile format)
 * as required by Rio ERP Party Lookup and Order APIs.
 */
export function to10DigitPhone(phone: string): string {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  return digits.slice(-10);
}
