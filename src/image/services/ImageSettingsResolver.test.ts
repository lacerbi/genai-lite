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
          width: 1024,
          height: 1024,
          quality: 'standard',
          style: 'vivid',
        },
      };

      const resolved = resolver.resolveSettings(modelInfo, undefined, undefined);

      expect(resolved.width).toBe(1024);
      expect(resolved.height).toBe(1024);
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
          width: 1024,
          height: 1024,
          quality: 'standard',
        },
      };

      const presetSettings: ImageGenerationSettings = {
        quality: 'high',
        style: 'natural',
      };

      const resolved = resolver.resolveSettings(modelInfo, presetSettings, undefined);

      expect(resolved.width).toBe(1024); // From model default
      expect(resolved.height).toBe(1024); // From model default
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
          width: 1024,
          height: 1024,
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

      expect(resolved.width).toBe(1024); // From model default
      expect(resolved.height).toBe(1024); // From model default
      expect(resolved.quality).toBe('high'); // From preset
      expect(resolved.style).toBe('vivid'); // From request (highest priority)
      expect(resolved.responseFormat).toBe('b64_json'); // From request
    });

    it('should apply diffusion defaults', () => {
      const modelInfo: ImageModelInfo = {
        id: 'sdxl',
        providerId: 'genai-electron-images',
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
      expect(resolved.width).toBe(1024); // Library default
      expect(resolved.height).toBe(1024); // Library default
    });

    it('should merge diffusion settings deeply', () => {
      const modelInfo: ImageModelInfo = {
        id: 'sdxl',
        providerId: 'genai-electron-images',
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
});
