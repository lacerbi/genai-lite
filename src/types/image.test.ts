/**
 * Tests for image type definitions
 *
 * These tests verify that the type definitions are correctly structured
 * and can be used as expected.
 */

import type {
  ImageProviderId,
  ImageMimeType,
  ImageResponseFormat,
  ImageQuality,
  ImageStyle,
  DiffusionSampler,
  ImageProgressStage,
  ImageProgressCallback,
  DiffusionSettings,
  ImageGenerationSettings,
  ResolvedImageGenerationSettings,
  ImageUsage,
  GeneratedImage,
  ImageGenerationRequestBase,
  ImageGenerationRequest,
  ImageGenerationRequestWithPreset,
  ImageGenerationResponse,
  ImageFailureResponse,
  ImageProviderCapabilities,
  ImageModelInfo,
  ImageProviderInfo,
  ImagePreset,
  ImageProviderAdapterConfig,
  ImageProviderAdapter,
  PresetMode,
  ImageServiceOptions,
  CreatePromptResult,
} from './image';

describe('Image Type Definitions', () => {
  describe('Request Types', () => {
    it('should accept valid ImageGenerationRequest', () => {
      const request: ImageGenerationRequest = {
        providerId: 'openai-images',
        modelId: 'dall-e-3',
        prompt: 'A serene mountain lake at sunrise',
        count: 1,
      };

      expect(request.providerId).toBe('openai-images');
      expect(request.modelId).toBe('dall-e-3');
      expect(request.prompt).toBe('A serene mountain lake at sunrise');
      expect(request.count).toBe(1);
    });

    it('should accept ImageGenerationRequest with settings', () => {
      const request: ImageGenerationRequest = {
        providerId: 'openai-images',
        modelId: 'dall-e-3',
        prompt: 'A cyberpunk cityscape',
        settings: {
          width: 1024,
          height: 1024,
          quality: 'high',
          style: 'vivid',
          responseFormat: 'buffer',
        },
      };

      expect(request.settings?.width).toBe(1024);
      expect(request.settings?.height).toBe(1024);
      expect(request.settings?.quality).toBe('high');
    });

    it('should accept ImageGenerationRequest with diffusion settings', () => {
      const request: ImageGenerationRequest = {
        providerId: 'genai-electron-images',
        modelId: 'sdxl',
        prompt: 'A fantasy castle',
        settings: {
          width: 1024,
          height: 1024,
          diffusion: {
            negativePrompt: 'blurry, low quality',
            steps: 30,
            cfgScale: 7.5,
            seed: 42,
            sampler: 'dpm++2m',
          },
        },
      };

      expect(request.settings?.width).toBe(1024);
      expect(request.settings?.height).toBe(1024);
      expect(request.settings?.diffusion?.steps).toBe(30);
      expect(request.settings?.diffusion?.cfgScale).toBe(7.5);
      expect(request.settings?.diffusion?.sampler).toBe('dpm++2m');
    });

    it('should accept ImageGenerationRequestWithPreset', () => {
      const request: ImageGenerationRequestWithPreset = {
        presetId: 'openai-dalle3-quality',
        prompt: 'A futuristic vehicle',
      };

      expect(request.presetId).toBe('openai-dalle3-quality');
      expect(request.prompt).toBe('A futuristic vehicle');
    });
  });

  describe('Response Types', () => {
    it('should accept valid ImageGenerationResponse', () => {
      const response: ImageGenerationResponse = {
        object: 'image.result',
        created: Date.now(),
        providerId: 'openai-images',
        modelId: 'dall-e-3',
        data: [
          {
            index: 0,
            mimeType: 'image/png',
            data: Buffer.from('mock-image-data'),
            url: 'https://example.com/image.png',
            prompt: 'A serene mountain lake at sunrise',
          },
        ],
      };

      expect(response.object).toBe('image.result');
      expect(response.data).toHaveLength(1);
      expect(response.data[0].mimeType).toBe('image/png');
    });

    it('should accept ImageGenerationResponse with usage', () => {
      const response: ImageGenerationResponse = {
        object: 'image.result',
        created: Date.now(),
        providerId: 'genai-electron-images',
        modelId: 'sdxl',
        data: [
          {
            index: 0,
            mimeType: 'image/png',
            data: Buffer.from('mock-image-data'),
            seed: 42,
            width: 1024,
            height: 1024,
          },
        ],
        usage: {
          timeTaken: 5823,
          credits: 1,
        },
      };

      expect(response.usage?.timeTaken).toBe(5823);
      expect(response.usage?.credits).toBe(1);
    });

    it('should accept valid ImageFailureResponse', () => {
      const response: ImageFailureResponse = {
        object: 'error',
        providerId: 'openai-images',
        modelId: 'dall-e-3',
        error: {
          message: 'API key is invalid',
          code: 'INVALID_API_KEY',
          type: 'authentication_error',
        },
      };

      expect(response.object).toBe('error');
      expect(response.error.type).toBe('authentication_error');
      expect(response.error.code).toBe('INVALID_API_KEY');
    });
  });

  describe('Provider and Model Types', () => {
    it('should accept valid ImageProviderCapabilities', () => {
      const capabilities: ImageProviderCapabilities = {
        supportsMultipleImages: true,
        supportsB64Json: true,
        supportsHostedUrls: true,
        supportsProgressEvents: false,
        supportsNegativePrompt: false,
        defaultModelId: 'dall-e-3',
      };

      expect(capabilities.supportsMultipleImages).toBe(true);
      expect(capabilities.defaultModelId).toBe('dall-e-3');
    });

    it('should accept valid ImageModelInfo', () => {
      const modelInfo: ImageModelInfo = {
        id: 'dall-e-3',
        providerId: 'openai-images',
        displayName: 'DALL-E 3',
        description: 'Latest DALL-E model with improved quality',
        capabilities: {
          supportsMultipleImages: true,
          supportsB64Json: true,
          supportsHostedUrls: true,
          supportsProgressEvents: false,
          supportsNegativePrompt: false,
          defaultModelId: 'dall-e-3',
        },
      };

      expect(modelInfo.id).toBe('dall-e-3');
      expect(modelInfo.displayName).toBe('DALL-E 3');
    });

    it('should accept valid ImagePreset', () => {
      const preset: ImagePreset = {
        id: 'openai-dalle3-quality',
        displayName: 'DALL-E 3 (Quality)',
        providerId: 'openai-images',
        modelId: 'dall-e-3',
        settings: {
          width: 1024,
          height: 1024,
          quality: 'high',
          style: 'vivid',
        },
      };

      expect(preset.id).toBe('openai-dalle3-quality');
      expect(preset.settings?.width).toBe(1024);
      expect(preset.settings?.quality).toBe('high');
    });
  });

  describe('Settings Types', () => {
    it('should accept DiffusionSettings with progress callback', () => {
      const progressCallback: ImageProgressCallback = (progress) => {
        console.log(`${progress.stage}: ${progress.percentage}%`);
      };

      const settings: DiffusionSettings = {
        negativePrompt: 'blurry, low quality',
        steps: 30,
        cfgScale: 7.5,
        seed: 42,
        sampler: 'dpm++2m',
        onProgress: progressCallback,
      };

      expect(settings.steps).toBe(30);
      expect(settings.cfgScale).toBe(7.5);
      expect(settings.onProgress).toBe(progressCallback);
    });

    it('should accept all diffusion sampler types', () => {
      const samplers: DiffusionSampler[] = [
        'euler_a',
        'euler',
        'heun',
        'dpm2',
        'dpm++2s_a',
        'dpm++2m',
        'dpm++2mv2',
        'lcm',
      ];

      samplers.forEach((sampler) => {
        const settings: DiffusionSettings = {
          sampler,
        };
        expect(settings.sampler).toBe(sampler);
      });
    });

    it('should accept ResolvedImageGenerationSettings', () => {
      const settings: ResolvedImageGenerationSettings = {
        width: 1024,
        height: 1024,
        responseFormat: 'buffer',
        quality: 'high',
        style: 'vivid',
        diffusion: {
          negativePrompt: 'low quality',
          steps: 30,
          cfgScale: 7.5,
        },
      };

      expect(settings.width).toBe(1024);
      expect(settings.height).toBe(1024);
      expect(settings.diffusion?.steps).toBe(30);
      expect(settings.diffusion?.cfgScale).toBe(7.5);
    });
  });

  describe('Service Options Types', () => {
    it('should accept ImageServiceOptions with extend mode', () => {
      const options: ImageServiceOptions = {
        presets: [
          {
            id: 'custom-preset',
            displayName: 'Custom Preset',
            providerId: 'openai-images',
            modelId: 'dall-e-3',
            settings: {
              quality: 'high',
            },
          },
        ],
        presetMode: 'extend',
      };

      expect(options.presetMode).toBe('extend');
      expect(options.presets).toHaveLength(1);
    });

    it('should accept ImageServiceOptions with base URLs', () => {
      const options: ImageServiceOptions = {
        baseUrls: {
          'openai-images': 'https://api.openai.com/v1',
          'genai-electron-images': 'http://localhost:8081',
        },
      };

      expect(options.baseUrls?.['openai-images']).toBe('https://api.openai.com/v1');
      expect(options.baseUrls?.['genai-electron-images']).toBe('http://localhost:8081');
    });
  });

  describe('Adapter Types', () => {
    it('should accept ImageProviderAdapterConfig', () => {
      const config: ImageProviderAdapterConfig = {
        baseURL: 'https://api.example.com',
        timeout: 60000,
        checkHealth: true,
      };

      expect(config.baseURL).toBe('https://api.example.com');
      expect(config.timeout).toBe(60000);
      expect(config.checkHealth).toBe(true);
    });

    it('should define ImageProviderAdapter interface structure', () => {
      // This test verifies the interface can be implemented
      // We'll create a mock implementation in adapter tests
      const mockAdapter: Partial<ImageProviderAdapter> = {
        id: 'test-provider',
        supports: {
          supportsMultipleImages: true,
          supportsB64Json: true,
          supportsHostedUrls: false,
          supportsProgressEvents: false,
          supportsNegativePrompt: false,
          defaultModelId: 'test-model',
        },
      };

      expect(mockAdapter.id).toBe('test-provider');
      expect(mockAdapter.supports?.supportsMultipleImages).toBe(true);
    });
  });

  describe('Utility Types', () => {
    it('should accept CreatePromptResult', () => {
      const result: CreatePromptResult = {
        prompt: 'A beautiful sunset over the ocean',
        settings: {
          width: 1024,
          height: 1024,
          quality: 'high',
        },
      };

      expect(result.prompt).toBe('A beautiful sunset over the ocean');
      expect(result.settings?.width).toBe(1024);
      expect(result.settings?.quality).toBe('high');
    });
  });

  describe('Type Literals', () => {
    it('should accept all ImageMimeType values', () => {
      const mimeTypes: ImageMimeType[] = ['image/png', 'image/jpeg', 'image/webp'];

      mimeTypes.forEach((mimeType) => {
        const image: Pick<GeneratedImage, 'mimeType'> = {
          mimeType,
        };
        expect(image.mimeType).toBe(mimeType);
      });
    });

    it('should accept all ImageResponseFormat values', () => {
      const formats: ImageResponseFormat[] = ['b64_json', 'url', 'buffer'];

      formats.forEach((format) => {
        const settings: Pick<ImageGenerationSettings, 'responseFormat'> = {
          responseFormat: format,
        };
        expect(settings.responseFormat).toBe(format);
      });
    });

    it('should accept all ImageQuality values', () => {
      const qualities: ImageQuality[] = ['standard', 'high'];

      qualities.forEach((quality) => {
        const settings: Pick<ImageGenerationSettings, 'quality'> = {
          quality,
        };
        expect(settings.quality).toBe(quality);
      });
    });

    it('should accept all ImageStyle values', () => {
      const styles: ImageStyle[] = ['vivid', 'natural'];

      styles.forEach((style) => {
        const settings: Pick<ImageGenerationSettings, 'style'> = {
          style,
        };
        expect(settings.style).toBe(style);
      });
    });

    it('should accept all ImageProgressStage values', () => {
      const stages: ImageProgressStage[] = ['loading', 'diffusion', 'decoding'];

      stages.forEach((stage) => {
        expect(['loading', 'diffusion', 'decoding']).toContain(stage);
      });
    });

    it('should accept all PresetMode values', () => {
      const modes: PresetMode[] = ['extend', 'replace'];

      modes.forEach((mode) => {
        const options: Pick<ImageServiceOptions, 'presetMode'> = {
          presetMode: mode,
        };
        expect(options.presetMode).toBe(mode);
      });
    });
  });
});
