import { ImageRequestValidator } from './ImageRequestValidator';
import type { ImageGenerationRequest } from '../../types/image';

describe('ImageRequestValidator', () => {
  let validator: ImageRequestValidator;

  beforeEach(() => {
    validator = new ImageRequestValidator();
  });

  describe('validateRequestStructure', () => {
    it('should accept valid request with all required fields', () => {
      const request: ImageGenerationRequest = {
        providerId: 'openai-images',
        modelId: 'dall-e-3',
        prompt: 'A beautiful sunset',
      };

      const result = validator.validateRequestStructure(request);

      expect(result).toBeNull();
    });

    it('should accept request with optional fields', () => {
      const request: ImageGenerationRequest = {
        providerId: 'genai-electron-images',
        modelId: 'sdxl',
        prompt: 'A mountain landscape',
        count: 2,
        presetId: 'my-preset',
        settings: {
          quality: 'high',
        },
        metadata: {
          userId: '123',
        },
      };

      const result = validator.validateRequestStructure(request);

      expect(result).toBeNull();
    });

    it('should reject request with missing provider ID', () => {
      const request = {
        modelId: 'dall-e-3',
        prompt: 'A beautiful sunset',
      } as ImageGenerationRequest;

      const result = validator.validateRequestStructure(request);

      expect(result).not.toBeNull();
      expect(result?.error.type).toBe('validation_error');
      expect(result?.error.message).toContain('providerId');
    });

    it('should reject request with missing model ID', () => {
      const request = {
        providerId: 'openai-images',
        prompt: 'A beautiful sunset',
      } as ImageGenerationRequest;

      const result = validator.validateRequestStructure(request);

      expect(result).not.toBeNull();
      expect(result?.error.type).toBe('validation_error');
      expect(result?.error.message).toContain('modelId');
    });

    it('should reject request with missing prompt', () => {
      const request = {
        providerId: 'openai-images',
        modelId: 'dall-e-3',
      } as ImageGenerationRequest;

      const result = validator.validateRequestStructure(request);

      expect(result).not.toBeNull();
      expect(result?.error.type).toBe('validation_error');
      expect(result?.error.message).toContain('prompt');
    });

    it('should reject request with empty prompt', () => {
      const request: ImageGenerationRequest = {
        providerId: 'openai-images',
        modelId: 'dall-e-3',
        prompt: '',
      };

      const result = validator.validateRequestStructure(request);

      expect(result).not.toBeNull();
      expect(result?.error.type).toBe('validation_error');
      expect(result?.error.message).toContain('empty');
    });

    it('should reject request with whitespace-only prompt', () => {
      const request: ImageGenerationRequest = {
        providerId: 'openai-images',
        modelId: 'dall-e-3',
        prompt: '   \n  \t  ',
      };

      const result = validator.validateRequestStructure(request);

      expect(result).not.toBeNull();
      expect(result?.error.type).toBe('validation_error');
      expect(result?.error.message).toContain('empty');
    });

    it('should reject request with non-string prompt', () => {
      const request = {
        providerId: 'openai-images',
        modelId: 'dall-e-3',
        prompt: 123,
      } as any;

      const result = validator.validateRequestStructure(request);

      expect(result).not.toBeNull();
      expect(result?.error.type).toBe('validation_error');
    });
  });

  describe('validateCount', () => {
    it('should accept valid count parameter', () => {
      const request: ImageGenerationRequest = {
        providerId: 'openai-images',
        modelId: 'dall-e-3',
        prompt: 'A sunset',
        count: 3,
      };

      const result = validator.validateRequestStructure(request);

      expect(result).toBeNull();
    });

    it('should accept request without count (defaults to 1)', () => {
      const request: ImageGenerationRequest = {
        providerId: 'openai-images',
        modelId: 'dall-e-3',
        prompt: 'A sunset',
      };

      const result = validator.validateRequestStructure(request);

      expect(result).toBeNull();
    });

    it('should reject count of zero', () => {
      const request: ImageGenerationRequest = {
        providerId: 'openai-images',
        modelId: 'dall-e-3',
        prompt: 'A sunset',
        count: 0,
      };

      const result = validator.validateRequestStructure(request);

      expect(result).not.toBeNull();
      expect(result?.error.message).toContain('count');
      expect(result?.error.message).toContain('positive');
    });

    it('should reject negative count', () => {
      const request: ImageGenerationRequest = {
        providerId: 'openai-images',
        modelId: 'dall-e-3',
        prompt: 'A sunset',
        count: -1,
      };

      const result = validator.validateRequestStructure(request);

      expect(result).not.toBeNull();
      expect(result?.error.message).toContain('count');
      expect(result?.error.message).toContain('positive');
    });

    it('should reject non-integer count', () => {
      const request: ImageGenerationRequest = {
        providerId: 'openai-images',
        modelId: 'dall-e-3',
        prompt: 'A sunset',
        count: 2.5,
      };

      const result = validator.validateRequestStructure(request);

      expect(result).not.toBeNull();
      expect(result?.error.message).toContain('count');
      expect(result?.error.message).toContain('integer');
    });

    it('should reject excessive count (>10)', () => {
      const request: ImageGenerationRequest = {
        providerId: 'openai-images',
        modelId: 'dall-e-3',
        prompt: 'A sunset',
        count: 11,
      };

      const result = validator.validateRequestStructure(request);

      expect(result).not.toBeNull();
      expect(result?.error.message).toContain('count');
      expect(result?.error.message).toContain('10');
    });
  });

  describe('validateSettings', () => {
    it('should accept valid settings', () => {
      const request: ImageGenerationRequest = {
        providerId: 'openai-images',
        modelId: 'dall-e-3',
        prompt: 'A sunset',
        settings: {
          size: '1024x1024',
          quality: 'high',
          style: 'vivid',
          responseFormat: 'buffer',
        },
      };

      const result = validator.validateRequestStructure(request);

      expect(result).toBeNull();
    });

    it('should accept valid diffusion settings', () => {
      const request: ImageGenerationRequest = {
        providerId: 'genai-electron-images',
        modelId: 'sdxl',
        prompt: 'A landscape',
        settings: {
          diffusion: {
            steps: 30,
            cfgScale: 7.5,
            seed: 42,
            sampler: 'dpm++2m',
            width: 1024,
            height: 1024,
          },
        },
      };

      const result = validator.validateRequestStructure(request);

      expect(result).toBeNull();
    });

    it('should reject invalid diffusion steps (too low)', () => {
      const request: ImageGenerationRequest = {
        providerId: 'genai-electron-images',
        modelId: 'sdxl',
        prompt: 'A landscape',
        settings: {
          diffusion: {
            steps: 0,
          },
        },
      };

      const result = validator.validateRequestStructure(request);

      expect(result).not.toBeNull();
      expect(result?.error.message).toContain('steps');
    });

    it('should reject invalid diffusion steps (too high)', () => {
      const request: ImageGenerationRequest = {
        providerId: 'genai-electron-images',
        modelId: 'sdxl',
        prompt: 'A landscape',
        settings: {
          diffusion: {
            steps: 151,
          },
        },
      };

      const result = validator.validateRequestStructure(request);

      expect(result).not.toBeNull();
      expect(result?.error.message).toContain('steps');
    });

    it('should reject invalid diffusion cfgScale (too low)', () => {
      const request: ImageGenerationRequest = {
        providerId: 'genai-electron-images',
        modelId: 'sdxl',
        prompt: 'A landscape',
        settings: {
          diffusion: {
            cfgScale: 0,
          },
        },
      };

      const result = validator.validateRequestStructure(request);

      expect(result).not.toBeNull();
      expect(result?.error.message).toContain('cfgScale');
    });

    it('should reject invalid diffusion cfgScale (too high)', () => {
      const request: ImageGenerationRequest = {
        providerId: 'genai-electron-images',
        modelId: 'sdxl',
        prompt: 'A landscape',
        settings: {
          diffusion: {
            cfgScale: 31,
          },
        },
      };

      const result = validator.validateRequestStructure(request);

      expect(result).not.toBeNull();
      expect(result?.error.message).toContain('cfgScale');
    });

    it('should reject invalid diffusion dimensions (too small)', () => {
      const request: ImageGenerationRequest = {
        providerId: 'genai-electron-images',
        modelId: 'sdxl',
        prompt: 'A landscape',
        settings: {
          diffusion: {
            width: 63,
            height: 64,
          },
        },
      };

      const result = validator.validateRequestStructure(request);

      expect(result).not.toBeNull();
      expect(result?.error.message).toContain('width');
    });

    it('should reject invalid diffusion dimensions (too large)', () => {
      const request: ImageGenerationRequest = {
        providerId: 'genai-electron-images',
        modelId: 'sdxl',
        prompt: 'A landscape',
        settings: {
          diffusion: {
            width: 2049,
          },
        },
      };

      const result = validator.validateRequestStructure(request);

      expect(result).not.toBeNull();
      expect(result?.error.message).toContain('width');
    });
  });

  describe('error response format', () => {
    it('should return properly formatted error response', () => {
      const request = {
        providerId: 'openai-images',
        modelId: 'dall-e-3',
      } as ImageGenerationRequest;

      const result = validator.validateRequestStructure(request);

      expect(result).not.toBeNull();
      expect(result?.object).toBe('error');
      expect(result?.providerId).toBe('openai-images');
      expect(result?.modelId).toBe('dall-e-3');
      expect(result?.error).toBeDefined();
      expect(result?.error.message).toBeDefined();
      expect(result?.error.code).toBeDefined();
      expect(result?.error.type).toBe('validation_error');
    });
  });
});
