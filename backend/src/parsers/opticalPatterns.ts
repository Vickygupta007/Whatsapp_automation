export const KNOWN_PRODUCTS = [
  'I SIGHT',
  'ISIGHT',
  'CRIZAL',
  'CRIZAL PREVENCIA',
  'CRIZAL SAPPHIRE',
  'CRIZAL ROCK',
  'CRIZAL EASY',
  'ESSILOR',
  'ZEISS',
  'DRIVESAFE',
  'KODAK',
  'HOYA',
  'NIKON',
  'VARILUX',
  'RODENSTOCK',
  'TRANSITIONS',
  'POLAROID',
  'TITAN',
  'VISION PRO',
];

export const LENS_TYPES: { pattern: RegExp; normalized: string }[] = [
  { pattern: /\b(single\s*vision|single-vision|\bsv\b)/i, normalized: 'Single Vision' },
  { pattern: /\b(progressive|\bpal\b|progressive\s*addition)/i, normalized: 'Progressive' },
  { pattern: /\b(bifocal|\bkt\b|d-bifocal|kryptok)/i, normalized: 'Bifocal' },
  { pattern: /\b(trifocal)/i, normalized: 'Trifocal' },
  { pattern: /\b(anti-fatigue|eyezen)/i, normalized: 'Anti-Fatigue' },
];

export const COATINGS: { pattern: RegExp; normalized: string }[] = [
  { pattern: /\b(blue\s*cut|bluecut|blue\s*block|blue-cut|uv420|blue-shield|blue\s*filter)\b/i, normalized: 'BLUE CUT' },
  { pattern: /\b(anti\s*reflective|anti-reflective|\barc\b|\bar\s*coating\b|\bar\b)/i, normalized: 'ANTI REFLECTIVE' },
  { pattern: /\b(crizal\s*sapphire|crizal\s*rock|crizal\s*prevencia|crizal\s*easy|crizal)\b/i, normalized: 'CRIZAL' },
  { pattern: /\b(hard\s*coat|hc|hardcoat)\b/i, normalized: 'HARD COAT' },
  { pattern: /\b(hmc|hard\s*multi\s*coat(?:ed)?)\b/i, normalized: 'HMC' },
  { pattern: /\b(shmc|super\s*hard\s*multi\s*coat(?:ed)?)\b/i, normalized: 'SHMC' },
  { pattern: /\b(photochromic|photogray|photobrown|transitions)\b/i, normalized: 'PHOTOCHROMIC' },
  { pattern: /\b(hydrophobic|super\s*hydrophobic)\b/i, normalized: 'HYDROPHOBIC' },
];

export const LENS_INDICES = [
  '1.50',
  '1.53', // Trivex / Phoenix
  '1.54',
  '1.55',
  '1.56',
  '1.57',
  '1.58',
  '1.59', // Polycarbonate
  '1.60',
  '1.61',
  '1.66',
  '1.67',
  '1.70',
  '1.74',
  '1.76',
  '1.80',
  '1.90',
];
