import dotenv from 'dotenv';
import path from 'path';
import { z } from 'zod';

// Load .env from backend directory or project root
// Reloaded: 2026-09-28 Rio ERP & Gemini Vision Active
dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), 'backend/.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });


const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  CORS_ORIGIN: z.string().default('*'),
  DATABASE_URL: z.string().default('postgresql://postgres:postgres@localhost:5432/postgres?schema=public'),

  // Rio ERP Configuration (from n8n workflow)
  RIO_ERP_BASE_URL: z.string().default('http://200.234.35.179:3000'),
  RIO_ERP_API_KEY: z.string().default('rio_whatsapp_secret_key_2026'),
  RIO_ERP_USERNAME: z.string().default(''),
  RIO_ERP_PASSWORD: z.string().default(''),
  RIO_ERP_AUTH_TYPE: z.enum(['api-key', 'bearer', 'basic']).default('api-key'),
  RIO_ERP_USE_MOCK: z.preprocess((val) => val === 'true' || val === true || val === undefined, z.boolean()).default(true),

  // WhatsApp Cloud API Configuration
  WHATSAPP_API_BASE_URL: z.string().default('https://graph.facebook.com/v19.0'),
  WHATSAPP_PHONE_NUMBER_ID: z.string().default('1225478070642817'),
  WHATSAPP_ACCESS_TOKEN: z.string().default(''),
  WHATSAPP_VERIFY_TOKEN: z.string().default('rio_erp_verify_2026'),
  WHATSAPP_USE_MOCK: z.preprocess((val) => val === 'true' || val === true, z.boolean()).default(false),

  // Gemini Vision AI Configuration for Prescription Image Recognition
  GEMINI_API_KEY: z.string().default(''),

  // Ngrok Public Webhook Tunnel Configuration
  NGROK_ENABLED: z.preprocess((val) => val === undefined || val === 'true' || val === true, z.boolean()).default(true),
  NGROK_DOMAIN: z.string().default('grill-reptilian-paying.ngrok-free.dev'),

  // Configurable message templates
  MSG_UNREGISTERED_CUSTOMER: z.string().default(
    'Your WhatsApp number is not registered. Please contact support/customer service to register your account.'
  ),
  MSG_INVALID_ORDER_HELP: z.string().default(
    'Please send your order in the required format. Example: Product, lens type, coating, index and prescription details (e.g., R: -1.50 L: -2.00 Bluecut 1.56 Ref: Sharma).'
  ),
  MSG_ORDER_CONFIRMATION_TEMPLATE: z.string().default(
    'Order Placed: {orderId}\nAccount: {accountName}\nProduct: {product}\nRef: {customerRef}\n\nYour work order has been queued in Rio ERP.'
  ),
});

export type EnvConfig = z.infer<typeof envSchema>;

export const config: EnvConfig = envSchema.parse(process.env);
