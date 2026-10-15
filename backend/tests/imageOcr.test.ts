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
});
