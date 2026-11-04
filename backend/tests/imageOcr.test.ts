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
  describe('Smart Tiered Vision Routing (Gemini Free -> Claude Sonnet Escalation)', () => {
    it('should correctly identify confident extraction vs complex/unclear extraction', () => {
      // Confident extraction
      expect(ImageOcrService.isExtractionConfident({
        isPrescription: true,
        readability: 'clear',
        right: { sph: '-1.00', cyl: '0.00', axis: 0 },
        left: { sph: '-1.25', cyl: '0.00', axis: 0 }
      })).toBe(true);

      // Flagged as complex_or_unclear by Gemini
      expect(ImageOcrService.isExtractionConfident({
        isPrescription: true,
        readability: 'complex_or_unclear',
        right: { sph: '-1.00', cyl: '0.00', axis: 0 },
        left: { sph: '-1.25', cyl: '0.00', axis: 0 }
      })).toBe(false);

      // Missing all optical powers
      expect(ImageOcrService.isExtractionConfident({
        isPrescription: true,
        readability: 'clear',
        right: { sph: null, cyl: null },
        left: { sph: null, cyl: null }
      })).toBe(false);

      // Ambiguous / Question mark in powers
      expect(ImageOcrService.isExtractionConfident({
        isPrescription: true,
        readability: 'clear',
        right: { sph: '-1.00?', cyl: '0.00', axis: 0 },
        left: { sph: 'unclear', cyl: '0.00', axis: 0 }
      })).toBe(false);
    });

    it('should route clear normal images to Gemini (Free Tier) without calling Claude', async () => {
      const origNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      const origGeminiKey = config.GEMINI_API_KEY;
      const origClaudeKey = config.ANTHROPIC_API_KEY;
      (config as any).GEMINI_API_KEY = 'test-gemini-key';
      (config as any).ANTHROPIC_API_KEY = 'test-claude-key';

      const geminiSpy = vi.spyOn(ImageOcrService, 'callGeminiVision').mockResolvedValueOnce({
        isPrescription: true,
        readability: 'clear',
        customerRef: 'CLEAR-PATIENT',
        product: 'I SIGHT',
        right: { sph: '-2.00', cyl: '-0.50', axis: 90 },
        left: { sph: '-1.75', cyl: '0.00', axis: 0 }
      });

      const claudeSpy = vi.spyOn(ImageOcrService, 'callClaudeSonnetVision');

      const fakeBuffer = Buffer.from('clear-prescription-image');
      const result = await ImageOcrService.extractPrescriptionFromImage(fakeBuffer, 'image/jpeg', null, '919876543210');

      expect(geminiSpy).toHaveBeenCalled();
      expect(claudeSpy).not.toHaveBeenCalled();
      expect(result).not.toBeNull();
      expect(result?.order.customerRefNo).toBe('CLEAR-PATIENT');
      expect(result?.order.rx.right.sph).toBe('-2.00');

      process.env.NODE_ENV = origNodeEnv;
      (config as any).GEMINI_API_KEY = origGeminiKey;
      (config as any).ANTHROPIC_API_KEY = origClaudeKey;
    });

    it('should automatically escalate complex or unclear handwriting from Gemini to Claude Sonnet 5.5', async () => {
      const origNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      const origGeminiKey = config.GEMINI_API_KEY;
      const origClaudeKey = config.ANTHROPIC_API_KEY;
      (config as any).GEMINI_API_KEY = 'test-gemini-key';
      (config as any).ANTHROPIC_API_KEY = 'test-claude-key';

      // Gemini flags image as complex / unclear
      vi.spyOn(ImageOcrService, 'callGeminiVision').mockResolvedValueOnce({
        isPrescription: true,
        readability: 'complex_or_unclear',
        customerRef: 'MESSY-HANDWRITING',
        right: { sph: 'unclear?', cyl: null },
        left: { sph: null, cyl: null }
      });

      // Claude Sonnet resolves it with high precision
      const claudeSpy = vi.spyOn(ImageOcrService, 'callClaudeSonnetVision').mockResolvedValueOnce({
        isPrescription: true,
        customerRef: 'MESSY-HANDWRITING',
        product: 'HYPE B B',
        right: { sph: '+1.50', cyl: '-0.50', axis: 45 },
        left: { sph: '+1.75', cyl: '-0.75', axis: 135 }
      });

      const fakeBuffer = Buffer.from('messy-handwriting-image');
      const result = await ImageOcrService.extractPrescriptionFromImage(fakeBuffer, 'image/jpeg', null, '919876543210');

      expect(claudeSpy).toHaveBeenCalled();
      expect(result).not.toBeNull();
      expect(result?.order.customerRefNo).toBe('MESSY-HANDWRITING');
      expect(result?.order.product).toBe('HYPE B B');
      expect(result?.order.rx.right.sph).toBe('+1.50');
      expect(result?.order.rx.left.sph).toBe('+1.75');

      process.env.NODE_ENV = origNodeEnv;
      (config as any).GEMINI_API_KEY = origGeminiKey;
      (config as any).ANTHROPIC_API_KEY = origClaudeKey;
    });

    it('should call Groq Vision API and extract optical prescription JSON', async () => {
      const origGroqKey = config.GROQ_API_KEY;
      (config as any).GROQ_API_KEY = 'test-groq-key';

      const mockGroqResponse = {
        data: {
          choices: [
            {
              message: {
                content: JSON.stringify({
                  isPrescription: true,
                  readability: 'clear',
                  customerRef: 'GROQ-PATIENT-01',
                  product: 'I SIGHT',
                  lensType: 'Single Vision',
                  coating: 'BLUE CUT',
                  index: '1.56',
                  dia: '70',
                  right: { sph: '-2.00', cyl: '-0.50', axis: 90, add: null },
                  left: { sph: '-2.50', cyl: '-0.25', axis: 180, add: null },
                }),
              },
            },
          ],
        },
      };

      const postSpy = vi.spyOn(axios, 'post').mockResolvedValueOnce(mockGroqResponse as any);

      const fakeBuffer = Buffer.from('groq-test-image');
      const result = await ImageOcrService.callGroqVision(fakeBuffer, 'image/jpeg');

      expect(postSpy).toHaveBeenCalledWith(
        'https://api.groq.com/openai/v1/chat/completions',
        expect.objectContaining({
          model: 'qwen/qwen3.8-27b',
          response_format: { type: 'json_object' },
        }),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-groq-key',
          }),
        })
      );

      expect(result).not.toBeNull();
      expect(result?.isPrescription).toBe(true);
      expect(result?.customerRef).toBe('GROQ-PATIENT-01');
      expect(result?.product).toBe('I SIGHT');
      expect(result?.right?.sph).toBe('-2.00');
      expect(result?.left?.sph).toBe('-2.50');

      (config as any).GROQ_API_KEY = origGroqKey;
    });

    it('should use Groq Vision as ultra-fast tier in multi-engine cascading pipeline', async () => {
      const origNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      const origGroqKey = config.GROQ_API_KEY;
      (config as any).GROQ_API_KEY = 'test-groq-key';

      const groqSpy = vi.spyOn(ImageOcrService, 'callGroqVision').mockResolvedValueOnce({
        isPrescription: true,
        readability: 'clear',
        customerRef: 'GROQ-FAST-01',
        product: 'XD ORBIT',
        lensType: 'Progressive',
        right: { sph: '+1.00', cyl: '-0.50', axis: 90 },
        left: { sph: '+1.25', cyl: '-0.75', axis: 80 }
      });

      const fakeBuffer = Buffer.from('groq-fast-image');
      const result = await ImageOcrService.extractPrescriptionFromImage(fakeBuffer, 'image/jpeg', null, '919876543210');

      expect(groqSpy).toHaveBeenCalled();
      expect(result).not.toBeNull();
      expect(result?.order.customerRefNo).toBe('GROQ-FAST-01');
      expect(result?.order.product).toBe('XD ORBIT');
      expect(result?.order.rx.right.sph).toBe('+1.00');

      process.env.NODE_ENV = origNodeEnv;
      (config as any).GROQ_API_KEY = origGroqKey;
    });
  });
});
