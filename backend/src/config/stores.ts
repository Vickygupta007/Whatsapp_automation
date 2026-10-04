import fs from 'fs';
import path from 'path';
import { config } from './env.js';
import { logger } from '../utils/logger.js';

export interface StoreErpConfig {
  type: 'rio-erp' | 'hostinger-optical' | 'mock';
  baseUrl?: string;
  apiKey?: string;
  authType?: 'api-key' | 'bearer' | 'basic';
  username?: string;
  password?: string;
  role?: string;
  useMock?: boolean;
}

export interface StoreConfig {
  id: string; // e.g., 'rio', 'site2'
  name: string; // e.g., 'Rio Optical', 'Vision Care'
  whatsappPhoneNumberId: string; // Meta Phone Number ID that receives/sends messages
  whatsappDisplayPhone?: string; // Display phone e.g. '917718043078'
  whatsappWabaId?: string; // Meta WhatsApp Business Account ID (WABA ID)
  whatsappAppId?: string; // Meta App ID
  whatsappAppSecret?: string; // Meta App Secret
  whatsappVerifyToken?: string; // Optional custom webhook verify token for this store
  whatsappAccessToken?: string; // Token if different from global WHATSAPP_ACCESS_TOKEN
  websiteUrl?: string; // Customer-facing website URL
  erp: StoreErpConfig;
}

export class StoreRegistry {
  private static stores: Map<string, StoreConfig> = new Map();
  private static initialized = false;
  private static lastMtime = 0;

  public static initialize(force = false): void {
    const candidatePaths = [
      path.resolve(process.cwd(), 'config/stores.json'),
      path.resolve(process.cwd(), 'backend/config/stores.json'),
      path.resolve(process.cwd(), '../config/stores.json'),
    ];
    const storesJsonPath = candidatePaths.find((p) => fs.existsSync(p));
    let currentMtime = 0;
    if (storesJsonPath) {
      try {
        currentMtime = fs.statSync(storesJsonPath).mtimeMs;
      } catch {
        currentMtime = 0;
      }
    }

    if (this.initialized && !force && currentMtime <= this.lastMtime) return;
    this.stores.clear();
    this.lastMtime = currentMtime;

    // 1. Default Store: Rio Optical (from existing .env)
    const defaultStore: StoreConfig = {
      id: 'rio',
      name: 'Rio Optical',
      whatsappPhoneNumberId: config.WHATSAPP_PHONE_NUMBER_ID || '1225478070642817',
      whatsappAccessToken: config.WHATSAPP_ACCESS_TOKEN,
      erp: {
        type: config.RIO_ERP_USE_MOCK ? 'mock' : 'rio-erp',
        baseUrl: config.RIO_ERP_BASE_URL,
        apiKey: config.RIO_ERP_API_KEY,
        authType: config.RIO_ERP_AUTH_TYPE,
        username: config.RIO_ERP_USERNAME,
        password: config.RIO_ERP_PASSWORD,
        useMock: config.RIO_ERP_USE_MOCK,
      },
    };
    this.stores.set(defaultStore.whatsappPhoneNumberId, defaultStore);
    this.stores.set(defaultStore.id, defaultStore);

    // 2. Load any additional stores from stores.json if present
    if (storesJsonPath) {
      try {
        const fileContent = fs.readFileSync(storesJsonPath, 'utf8');
        // Strip single-line and multi-line comments + trailing commas for easy editing
        const cleanContent = fileContent
          .replace(/\/\*[\s\S]*?\*\/|([^\\:]|^)\/\/.*$/gm, '$1')
          .replace(/,\s*([\]}])/g, '$1')
          .trim();

        if (cleanContent) {
          const customStores = JSON.parse(cleanContent) as StoreConfig[];
          if (Array.isArray(customStores)) {
            for (const s of customStores) {
              if (s.whatsappPhoneNumberId) {
                s.whatsappAccessToken = s.whatsappAccessToken || config.WHATSAPP_ACCESS_TOKEN;
                this.stores.set(s.whatsappPhoneNumberId, s);
                this.stores.set(s.id, s);
                logger.info(`[StoreRegistry] Registered additional store: "${s.name}" (ID: ${s.id}, PhoneID: ${s.whatsappPhoneNumberId})`);
              }
            }
          }
        }
      } catch (err) {
        logger.error(`[StoreRegistry] Failed to parse stores.json: ${String(err)}`);
      }
    }

    this.initialized = true;
  }

  /**
   * Registers a store dynamically at runtime
   */
  public static registerStore(store: StoreConfig): void {
    this.initialize();
    this.stores.set(store.whatsappPhoneNumberId, store);
    this.stores.set(store.id, store);
  }

  /**
   * Retrieves store configuration by WhatsApp Phone Number ID (from webhook metadata)
   */
  public static getStoreByPhoneNumberId(phoneNumberId?: string | null): StoreConfig {
    this.initialize();
    if (phoneNumberId && this.stores.has(phoneNumberId)) {
      return this.stores.get(phoneNumberId)!;
    }
    return this.getDefaultStore();
  }

  /**
   * Retrieves store configuration by Store ID (e.g. 'rio', 'site2')
   */
  public static getStoreById(storeId: string): StoreConfig | undefined {
    this.initialize();
    if (!storeId) return undefined;
    const normalized = storeId.toLowerCase().trim();
    if (this.stores.has(normalized)) {
      return this.stores.get(normalized);
    }
    for (const [key, store] of this.stores.entries()) {
      if (key.toLowerCase() === normalized || store.id.toLowerCase() === normalized) {
        return store;
      }
      if (store.id.toLowerCase().startsWith(normalized) || normalized.startsWith(store.id.toLowerCase())) {
        return store;
      }
    }
    return undefined;
  }

  /**
   * Checks whether a phone number ID belongs to any known store
   */
  public static isKnownPhoneNumberId(phoneNumberId?: string | null): boolean {
    this.initialize();
    if (!phoneNumberId) return false;
    return this.stores.has(phoneNumberId);
  }

  /**
   * Returns default store (Rio)
   */
  public static getDefaultStore(): StoreConfig {
    this.initialize();
    return this.stores.get('rio')!;
  }

  /**
   * Returns all unique registered stores
   */
  public static getAllStores(): StoreConfig[] {
    this.initialize();
    const unique = new Map<string, StoreConfig>();
    for (const store of this.stores.values()) {
      unique.set(store.id, store);
    }
    return Array.from(unique.values());
  }
}
