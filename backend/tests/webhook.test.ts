import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { config } from '../src/config/env.js';
import { AppRepository } from '../src/database/repository.js';

describe('Meta WhatsApp Webhook Verification and Ingestion', () => {
  const app = createApp();

  beforeEach(() => {
    AppRepository.clearMemoryStore();
  });

  describe('GET /whatsapp-cloud-inbound (Verification)', () => {
    it('should return challenge with HTTP 200 when hub.verify_token matches', async () => {
      const challenge = 'random_challenge_code_12345';
      const response = await request(app)
        .get('/whatsapp-cloud-inbound')
        .query({
          'hub.mode': 'subscribe',
          'hub.verify_token': config.WHATSAPP_VERIFY_TOKEN,
          'hub.challenge': challenge,
        });

      expect(response.status).toBe(200);
      expect(response.text).toBe(challenge);
    });

    it('should return 403 Forbidden when hub.verify_token is incorrect', async () => {
      const response = await request(app)
        .get('/whatsapp-cloud-inbound')
        .query({
          'hub.mode': 'subscribe',
          'hub.verify_token': 'wrong_invalid_token',
          'hub.challenge': '12345',
        });

      expect(response.status).toBe(403);
    });

    it('should return 403 Forbidden when hub.mode is not subscribe', async () => {
      const response = await request(app)
        .get('/whatsapp-cloud-inbound')
        .query({
          'hub.mode': 'invalid_mode',
          'hub.verify_token': config.WHATSAPP_VERIFY_TOKEN,
          'hub.challenge': '12345',
        });

      expect(response.status).toBe(403);
    });
  });

  describe('POST /whatsapp-cloud-inbound (Message Ingestion)', () => {
    it('should acknowledge valid incoming message webhook with HTTP 200 EVENT_RECEIVED', async () => {
      const payload = {
        object: 'whatsapp_business_account',
        entry: [
          {
            id: '123456789',
            changes: [
              {
                value: {
                  messaging_product: 'whatsapp',
                  metadata: {
                    display_phone_number: '1234567890',
                    phone_number_id: '987654321',
                  },
                  contacts: [
                    {
                      profile: { name: 'Dr. Sharma' },
                      wa_id: '919876543210',
                    },
                  ],
                  messages: [
                    {
                      from: '919876543210',
                      id: 'wamid.HBgLMTEwMDAwMDAwMhUCMRIA',
                      timestamp: '1700000000',
                      type: 'text',
                      text: { body: 'R: -1.50 L: -2.00 Bluecut 1.56 Ref: Sharma' },
                    },
                  ],
                },
                field: 'messages',
              },
            ],
          },
        ],
      };

      const response = await request(app)
        .post('/whatsapp-cloud-inbound')
        .send(payload);

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('EVENT_RECEIVED');
    });

    it('should safely handle unsupported message types (e.g. image/document/audio)', async () => {
      const payload = {
        object: 'whatsapp_business_account',
        entry: [
          {
            id: '123456789',
            changes: [
              {
                value: {
                  messaging_product: 'whatsapp',
                  metadata: {
                    display_phone_number: '1234567890',
                    phone_number_id: '987654321',
                  },
                  contacts: [{ profile: { name: 'Customer' }, wa_id: '919876543210' }],
                  messages: [
                    {
                      from: '919876543210',
                      id: 'wamid.MEDIA_TEST_001',
                      timestamp: '1700000000',
                      type: 'image',
                      image: { id: 'media_id_9999' },
                    },
                  ],
                },
                field: 'messages',
              },
            ],
          },
        ],
      };

      const response = await request(app)
        .post('/whatsapp-cloud-inbound')
        .send(payload);

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('EVENT_RECEIVED');
    });

    it('should safely ignore non-whatsapp objects and empty payloads without crashing', async () => {
      const response = await request(app)
        .post('/whatsapp-cloud-inbound')
        .send({ object: 'page', entry: [] });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('EVENT_RECEIVED');
    });

    it('should extract recipientPhoneNumberId and recognize registered store phone numbers', async () => {
      const { StoreRegistry } = await import('../src/config/stores.js');
      StoreRegistry.registerStore({
        id: 'friend_store',
        name: 'Friend Optical',
        whatsappPhoneNumberId: '9988776655443322',
        erp: {
          type: 'mock',
          useMock: true,
        },
      });

      const { NormalizationService } = await import('../src/services/normalizationService.js');
      const payload: any = {
        object: 'whatsapp_business_account',
        entry: [
          {
            id: '123456789',
            changes: [
              {
                value: {
                  messaging_product: 'whatsapp',
                  metadata: {
                    display_phone_number: '919988776655',
                    phone_number_id: '9988776655443322',
                  },
                  messages: [
                    {
                      from: '919876543210',
                      id: 'wamid.MULTI_STORE_TEST',
                      timestamp: '1710000000',
                      type: 'text',
                      text: { body: 'R: -1.00 Index: 1.56' },
                    },
                  ],
                },
                field: 'messages',
              },
            ],
          },
        ],
      };

      const normalized = NormalizationService.extractAndNormalize(payload);
      expect(normalized).toHaveLength(1);
      expect(normalized[0].recipientPhoneNumberId).toBe('9988776655443322');
      expect(normalized[0].displayPhoneNumber).toBe('919988776655');

      const store = StoreRegistry.getStoreByPhoneNumberId(normalized[0].recipientPhoneNumberId);
      expect(store.id).toBe('friend_store');
      expect(store.name).toBe('Friend Optical');
    });
  });
});
