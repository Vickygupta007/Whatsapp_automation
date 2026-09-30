type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

const SENSITIVE_KEYS = [
  'token',
  'accesstoken',
  'access_token',
  'verifytoken',
  'verify_token',
  'password',
  'secret',
  'apikey',
  'api_key',
  'authorization',
];

function sanitize(data: unknown): unknown {
  if (!data || typeof data !== 'object') {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map(sanitize);
  }

  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    const lower = key.toLowerCase();
    if (SENSITIVE_KEYS.some((sensitive) => lower.includes(sensitive))) {
      sanitized[key] = '***REDACTED***';
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitize(value);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

function formatLog(level: LogLevel, message: string, meta?: unknown) {
  const timestamp = new Date().toISOString();
  const metaStr = meta ? ` | Meta: ${JSON.stringify(sanitize(meta))}` : '';
  return `[${timestamp}] [${level}] ${message}${metaStr}`;
}

export const logger = {
  debug: (message: string, meta?: unknown) => {
    if (process.env.NODE_ENV !== 'production') {
      console.debug(formatLog('DEBUG', message, meta));
    }
  },
  info: (message: string, meta?: unknown) => {
    console.info(formatLog('INFO', message, meta));
  },
  warn: (message: string, meta?: unknown) => {
    console.warn(formatLog('WARN', message, meta));
  },
  error: (message: string, meta?: unknown) => {
    console.error(formatLog('ERROR', message, meta));
  },
};
