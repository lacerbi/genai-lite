import { ImageModelResolver } from './ImageModelResolver';
import { PresetManager } from '../../shared/services/PresetManager';
import type { ImageGenerationRequest, ImagePreset } from '../../types/image';

describe('ImageModelResolver', () => {
  let resolver: ImageModelResolver;
  let presetManager: PresetManager<ImagePreset>;

  beforeEach(() => {
    const customPresets: ImagePreset[] = [
      {
        id: 'test-preset',
        displayName: 'Test Preset',
        providerId: 'openai-images',
        modelId: 'dall-e-3',
        settings: {
          quality: 'high',
        },
      },
    ];
    presetManager = new PresetManager<ImagePreset>([], customPresets, 'replace');
    resolver = new ImageModelResolver(presetManager);
  });

  it('should resolve using preset ID', () => {
    const request = {
      presetId: 'test-preset',
      prompt: 'A sunset',
    };

    const result = resolver.resolve(request);

    expect(result.error).toBeUndefined();
    expect(result.providerId).toBe('openai-images');
    expect(result.modelId).toBe('dall-e-3');
    expect(result.modelInfo).toBeDefined();
    expect(result.settings?.quality).toBe('high');
  });

  it('should resolve using direct provider and model IDs', () => {
    const request: ImageGenerationRequest = {
      providerId: 'openai-images',
      modelId: 'dall-e-3',
      prompt: 'A sunset',
    };

    const result = resolver.resolve(request);

    expect(result.error).toBeUndefined();
    expect(result.providerId).toBe('openai-images');
    expect(result.modelId).toBe('dall-e-3');
    expect(result.modelInfo).toBeDefined();
  });

  it('should return error for non-existent preset', () => {
    const request = {
      presetId: 'non-existent',
      prompt: 'A sunset',
    };

    const result = resolver.resolve(request);

    expect(result.error).toBeDefined();
    expect(result.error?.error.code).toBe('PRESET_NOT_FOUND');
  });

  it('should return error for missing model info', () => {
    const request = {
      prompt: 'A sunset',
    } as any;

    const result = resolver.resolve(request);

    expect(result.error).toBeDefined();
    expect(result.error?.error.code).toBe('MISSING_MODEL_INFO');
  });
});
