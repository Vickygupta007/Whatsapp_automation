import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { config } from '../src/config/env.js';
import { ImageOcrService } from '../src/services/imageOcrService.js';

describe('ImageOcrService - Google Cloud Vision API Integration', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should return null when GOOGLE_VISION_API_KEY is not configured', async () => {
    const origKey = config.GOOGLE_VISION_API_KEY;
    (config as any).GOOGLE_VISION_API_KEY = '';

    const fakeBuffer = Buffer.from('fake-image-bytes');
    const result = await ImageOcrService.callGoogleCloudVision(fakeBuffer);

    expect(result).toBeNull();
    (config as any).GOOGLE_VISION_API_KEY = origKey;
  });

  it('should call Google Cloud Vision DOCUMENT_TEXT_DETECTION and return extracted full text', async () => {
    const origKey = config.GOOGLE_VISION_API_KEY;
    (config as any).GOOGLE_VISION_API_KEY = 'test_google_vision_api_key_123';

    const mockVisionResponse = {
      data: {
        responses: [
          {
            fullTextAnnotation: {
              text: 'ORDER\nRef: SHARMA-101\nProduct: HYPE B B\nIndex: 1.56\nR: -1.50 / -0.50 x 90\nL: -2.00 / -0.25 x 85',
            },
          },
        ],
      },
    };

    const postSpy = vi.spyOn(axios, 'post').mockResolvedValueOnce(mockVisionResponse as any);

    const fakeBuffer = Buffer.from('sample-prescription-data');
    const result = await ImageOcrService.callGoogleCloudVision(fakeBuffer);

    expect(postSpy).toHaveBeenCalledWith(
      'https://vision.googleapis.com/v1/images:annotate?key=test_google_vision_api_key_123',
      expect.objectContaining({
        requests: [
          expect.objectContaining({
            features: [
              { type: 'DOCUMENT_TEXT_DETECTION' },
              { type: 'TEXT_DETECTION' },
            ],
          }),
        ],
      }),
      expect.anything()
    );

    expect(result).toContain('Ref: SHARMA-101');
    expect(result).toContain('R: -1.50 / -0.50 x 90');

    (config as any).GOOGLE_VISION_API_KEY = origKey;
  });

  it('should parse prescription directly from Google Cloud Vision OCR in hybrid pipeline', async () => {
    const origKey = config.GOOGLE_VISION_API_KEY;
    (config as any).GOOGLE_VISION_API_KEY = 'test_google_vision_api_key_123';

    vi.spyOn(ImageOcrService, 'callGoogleCloudVision').mockResolvedValueOnce(
      'ORDER\nRef: PATIENT-MUM\nProduct: HYPE B B\nIndex: 1.56\nCoating: HMC\nR: -1.25 / -0.50 x 90\nL: -1.50 / -0.75 x 80'
    );

    const fakeBuffer = Buffer.from('prescription-image');
    const parsed = await ImageOcrService.extractPrescriptionFromImage(fakeBuffer, 'image/jpeg', null, '918452016415');

    expect(parsed).not.toBeNull();
    expect(parsed?.isOrder).toBe(true);
    expect(parsed?.order.customerRefNo).toBe('PATIENT-MUM');
    expect(parsed?.order.rx.right.sph).toBe('-1.25');
    expect(parsed?.order.rx.right.cyl).toBe('-0.50');
    expect(String(parsed?.order.rx.right.axis)).toBe('90');
    expect(parsed?.order.rx.left.sph).toBe('-1.50');
    expect(parsed?.order.rx.left.cyl).toBe('-0.75');
    expect(String(parsed?.order.rx.left.axis)).toBe('80');

    (config as any).GOOGLE_VISION_API_KEY = origKey;
  });

  it('should gracefully handle Vision API errors without crashing', async () => {
    const origKey = config.GOOGLE_VISION_API_KEY;
    (config as any).GOOGLE_VISION_API_KEY = 'test_google_vision_api_key_123';

    vi.spyOn(axios, 'post').mockRejectedValueOnce(new Error('Network connection timeout to Vision API'));

    const fakeBuffer = Buffer.from('prescription-image');
    const result = await ImageOcrService.callGoogleCloudVision(fakeBuffer);

    expect(result).toBeNull();
    (config as any).GOOGLE_VISION_API_KEY = origKey;
  });

  it('should call Claude Sonnet 5.5 Vision API as primary and extract optical prescription JSON', async () => {
    const origKey = config.ANTHROPIC_API_KEY;
    (config as any).ANTHROPIC_API_KEY = 'sk-ant-test-key-123';

    const mockClaudeResponse = {
      data: {
        content: [
          {
            text: JSON.stringify({
              isPrescription: true,
              customerRef: 'PATIENT-CLAUDE-01',
              product: 'HYPE B B',
              lensType: 'Single Vision',
              coating: 'BLUE CUT',
              index: '1.56',
              dia: '75',
              tintColor: 'Grey',
              fittingType: 'supra',
              remarks: 'Urgent',
              right: { sph: '-1.00', cyl: '-0.50', axis: 90, add: '+2.00' },
              left: { sph: '-1.25', cyl: '-0.75', axis: 85, add: '+2.00' }
            })
          }
        ]
      }
    };

    const postSpy = vi.spyOn(axios, 'post').mockResolvedValueOnce(mockClaudeResponse as any);

    const fakeBuffer = Buffer.from('prescription-image-sample');
    const extracted = await ImageOcrService.callClaudeSonnetVision(fakeBuffer, 'image/jpeg', null);

    expect(postSpy).toHaveBeenCalledWith(
      'https://api.anthropic.com/v1/messages',
      expect.objectContaining({
        model: 'claude-sonnet-5-5',
        messages: expect.arrayContaining([
          expect.objectContaining({
            role: 'user',
            content: expect.arrayContaining([
              expect.objectContaining({ type: 'image' }),
              expect.objectContaining({ type: 'text' })
            ])
          })
        ])
      }),
      expect.objectContaining({
        headers: expect.objectContaining({
          'x-api-key': 'sk-ant-test-key-123',
          'anthropic-version': '2023-06-01'
        })
      })
    );

    expect(extracted).not.toBeNull();
    expect(extracted?.customerRef).toBe('PATIENT-CLAUDE-01');
    expect(extracted?.product).toBe('HYPE B B');
    expect(extracted?.right?.sph).toBe('-1.00');
    expect(extracted?.left?.sph).toBe('-1.25');

    (config as any).ANTHROPIC_API_KEY = origKey;
  });

  it('should gracefully handle Claude Sonnet failure and return null', async () => {
    const origKey = config.ANTHROPIC_API_KEY;
    (config as any).ANTHROPIC_API_KEY = 'sk-ant-test-key-123';

    vi.spyOn(axios, 'post').mockRejectedValue(new Error('Anthropic API 401 Unauthorized'));

    const fakeBuffer = Buffer.from('prescription-image');
    const result = await ImageOcrService.callClaudeSonnetVision(fakeBuffer, 'image/jpeg');

    expect(result).toBeNull();
    (config as any).ANTHROPIC_API_KEY = origKey;
  });
});
