import { ImageSettingsResolver } from './ImageSettingsResolver';
import type { ImageGenerationSettings, ImageModelInfo, ResolvedImageGenerationSettings } from '../../types/image';

describe('ImageSettingsResolver', () => {
  let resolver: ImageSettingsResolver;

  beforeEach(() => {
    resolver = new ImageSettingsResolver();
  });

  describe('resolveSettings', () => {
    it('should apply defaults when no settings provided', () => {
      const modelInfo: ImageModelInfo = {
        id: 'dall-e-3',
        providerId: 'openai-images',
        displayName: 'DALL-E 3',
        capabilities: {
          supportsMultipleImages: true,
          supportsB64Json: true,
          supportsHostedUrls: true,
          supportsProgressEvents: false,
          supportsNegativePrompt: false,
          defaultModelId: 'dall-e-3',
        },
        defaultSettings: {
          size: '1024x1024',
          quality: 'standard',
          style: 'vivid',
        },
      };

      const resolved = resolver.resolveSettings(modelInfo, undefined, undefined);

      expect(resolved.size).toBe('1024x1024');
      expect(resolved.quality).toBe('standard');
      expect(resolved.style).toBe('vivid');
      expect(resolved.responseFormat).toBe('buffer'); // Library default
    });

    it('should merge preset settings with defaults', () => {
      const modelInfo: ImageModelInfo = {
        id: 'dall-e-3',
        providerId: 'openai-images',
        displayName: 'DALL-E 3',
        capabilities: {
          supportsMultipleImages: true,
          supportsB64Json: true,
          supportsHostedUrls: true,
          supportsProgressEvents: false,
          supportsNegativePrompt: false,
          defaultModelId: 'dall-e-3',
        },
        defaultSettings: {
          size: '1024x1024',
          quality: 'standard',
        },
      };

      const presetSettings: ImageGenerationSettings = {
        quality: 'high',
        style: 'natural',
      };

      const resolved = resolver.resolveSettings(modelInfo, presetSettings, undefined);

      expect(resolved.size).toBe('1024x1024'); // From model default
      expect(resolved.quality).toBe('high'); // From preset (overrides default)
      expect(resolved.style).toBe('natural'); // From preset
    });

    it('should merge request settings with preset and defaults', () => {
      const modelInfo: ImageModelInfo = {
        id: 'dall-e-3',
        providerId: 'openai-images',
        displayName: 'DALL-E 3',
        capabilities: {
          supportsMultipleImages: true,
          supportsB64Json: true,
          supportsHostedUrls: true,
          supportsProgressEvents: false,
          supportsNegativePrompt: false,
          defaultModelId: 'dall-e-3',
        },
        defaultSettings: {
          size: '1024x1024',
          quality: 'standard',
        },
      };

      const presetSettings: ImageGenerationSettings = {
        quality: 'high',
      };

      const requestSettings: ImageGenerationSettings = {
        style: 'vivid',
        responseFormat: 'b64_json',
      };

      const resolved = resolver.resolveSettings(modelInfo, presetSettings, requestSettings);

      expect(resolved.size).toBe('1024x1024'); // From model default
      expect(resolved.quality).toBe('high'); // From preset
      expect(resolved.style).toBe('vivid'); // From request (highest priority)
      expect(resolved.responseFormat).toBe('b64_json'); // From request
    });

    it('should parse size string into diffusion dimensions', () => {
      const modelInfo: ImageModelInfo = {
        id: 'sdxl',
        providerId: 'electron-diffusion',
        displayName: 'SDXL',
        capabilities: {
          supportsMultipleImages: true,
          supportsB64Json: true,
          supportsHostedUrls: false,
          supportsProgressEvents: true,
          supportsNegativePrompt: true,
          defaultModelId: 'sdxl',
        },
        defaultSettings: {
          size: '1024x1024',
        },
      };

      const requestSettings: ImageGenerationSettings = {
        size: '768x512',
      };

      const resolved = resolver.resolveSettings(modelInfo, undefined, requestSettings);

      expect(resolved.size).toBe('768x512');
      expect(resolved.diffusion?.width).toBe(768);
      expect(resolved.diffusion?.height).toBe(512);
    });

    it('should apply diffusion defaults', () => {
      const modelInfo: ImageModelInfo = {
        id: 'sdxl',
        providerId: 'electron-diffusion',
        displayName: 'SDXL',
        capabilities: {
          supportsMultipleImages: true,
          supportsB64Json: true,
          supportsHostedUrls: false,
          supportsProgressEvents: true,
          supportsNegativePrompt: true,
          defaultModelId: 'sdxl',
        },
        defaultSettings: {
          diffusion: {
            steps: 25,
            cfgScale: 8.0,
          },
        },
      };

      const resolved = resolver.resolveSettings(modelInfo, undefined, undefined);

      expect(resolved.diffusion?.steps).toBe(25);
      expect(resolved.diffusion?.cfgScale).toBe(8.0);
      expect(resolved.diffusion?.width).toBe(512); // Library default
      expect(resolved.diffusion?.height).toBe(512); // Library default
    });

    it('should merge diffusion settings deeply', () => {
      const modelInfo: ImageModelInfo = {
        id: 'sdxl',
        providerId: 'electron-diffusion',
        displayName: 'SDXL',
        capabilities: {
          supportsMultipleImages: true,
          supportsB64Json: true,
          supportsHostedUrls: false,
          supportsProgressEvents: true,
          supportsNegativePrompt: true,
          defaultModelId: 'sdxl',
        },
        defaultSettings: {
          diffusion: {
            steps: 20,
            cfgScale: 7.5,
          },
        },
      };

      const presetSettings: ImageGenerationSettings = {
        diffusion: {
          steps: 30,
          sampler: 'dpm++2m',
        },
      };

      const requestSettings: ImageGenerationSettings = {
        diffusion: {
          cfgScale: 9.0,
          seed: 42,
        },
      };

      const resolved = resolver.resolveSettings(modelInfo, presetSettings, requestSettings);

      expect(resolved.diffusion?.steps).toBe(30); // From preset
      expect(resolved.diffusion?.cfgScale).toBe(9.0); // From request (highest priority)
      expect(resolved.diffusion?.sampler).toBe('dpm++2m'); // From preset
      expect(resolved.diffusion?.seed).toBe(42); // From request
    });
  });

  describe('parseSizeString', () => {
    it('should parse standard size strings', () => {
      const sizes = [
        { input: '256x256', expected: { width: 256, height: 256 } },
        { input: '512x512', expected: { width: 512, height: 512 } },
        { input: '1024x1024', expected: { width: 1024, height: 1024 } },
        { input: '768x512', expected: { width: 768, height: 512 } },
        { input: '1792x1024', expected: { width: 1792, height: 1024 } },
      ];

      sizes.forEach(({ input, expected }) => {
        const result = resolver.parseSizeString(input);
        expect(result).toEqual(expected);
      });
    });

    it('should return null for invalid size strings', () => {
      const invalidSizes = ['invalid', '1024', 'x1024', '1024x', 'abc x def'];

      invalidSizes.forEach((input) => {
        const result = resolver.parseSizeString(input);
        expect(result).toBeNull();
      });
    });
  });
});
