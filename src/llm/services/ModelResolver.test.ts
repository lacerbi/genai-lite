import { ModelResolver } from './ModelResolver';
import { PresetManager } from '../../shared/services/PresetManager';
import { AdapterRegistry } from '../../shared/services/AdapterRegistry';
import type { ModelPreset } from '../../types/presets';
import type { ILLMClientAdapter } from '../clients/types';
import type { ApiProviderId } from '../types';

describe('ModelResolver', () => {
  let resolver: ModelResolver;
  let mockPresetManager: jest.Mocked<PresetManager<ModelPreset>>;
  let mockAdapterRegistry: jest.Mocked<AdapterRegistry<ILLMClientAdapter, ApiProviderId>>;

  beforeEach(() => {
    mockPresetManager = {
      getPresets: jest.fn(),
      resolvePreset: jest.fn(),
    } as any;

    mockAdapterRegistry = {
      getAdapter: jest.fn(),
    } as any;

    resolver = new ModelResolver(mockPresetManager, mockAdapterRegistry);
  });

  describe('preset resolution', () => {
    it('should resolve model from valid preset', async () => {
      const mockPreset: ModelPreset = {
        id: 'test-preset',
        displayName: 'Test Preset',
        providerId: 'openai',
        modelId: 'gpt-4.1',
        settings: { temperature: 0.7 }
      };
      
      mockPresetManager.resolvePreset.mockReturnValue(mockPreset);

      const result = await resolver.resolve({ presetId: 'test-preset' });

      expect(mockPresetManager.resolvePreset).toHaveBeenCalledWith('test-preset');
      expect(result.error).toBeUndefined();
      expect(result.providerId).toBe('openai');
      expect(result.modelId).toBe('gpt-4.1');
      expect(result.modelInfo).toBeDefined();
      expect(result.settings).toEqual({ temperature: 0.7 });
    });

    it('should return error for non-existent preset', async () => {
      mockPresetManager.resolvePreset.mockReturnValue(null);

      const result = await resolver.resolve({ presetId: 'non-existent' });

      expect(result.error).toBeDefined();
      expect(result.error?.error.code).toBe('PRESET_NOT_FOUND');
      expect(result.error?.error.message).toContain('Preset not found: non-existent');
    });

    it('should return error for preset with invalid model', async () => {
      const mockPreset: ModelPreset = {
        id: 'invalid-model-preset',
        displayName: 'Invalid Model Preset',
        providerId: 'openai',
        modelId: 'invalid-model',
        settings: {}
      };
      
      mockPresetManager.resolvePreset.mockReturnValue(mockPreset);

      const result = await resolver.resolve({ presetId: 'invalid-model-preset' });

      expect(result.error).toBeDefined();
      expect(result.error?.error.code).toBe('MODEL_NOT_FOUND');
      expect(result.error?.error.message).toContain('Model not found for preset');
    });

    it('should merge preset settings with user settings', async () => {
      const mockPreset: ModelPreset = {
        id: 'test-preset',
        displayName: 'Test Preset',
        providerId: 'openai',
        modelId: 'gpt-4.1',
        settings: { 
          temperature: 0.7,
          maxTokens: 1000
        }
      };
      
      mockPresetManager.resolvePreset.mockReturnValue(mockPreset);

      const result = await resolver.resolve({ 
        presetId: 'test-preset',
        settings: { 
          temperature: 0.9,  // Override
          topP: 0.95        // New setting
        }
      });

      expect(result.settings).toEqual({
        temperature: 0.9,    // User override
        maxTokens: 1000,     // From preset
        topP: 0.95          // User addition
      });
    });
  });

  describe('direct model resolution', () => {
    it('should resolve model from valid provider and model IDs', async () => {
      const result = await resolver.resolve({
        providerId: 'openai',
        modelId: 'gpt-4.1'
      });

      expect(result.error).toBeUndefined();
      expect(result.providerId).toBe('openai');
      expect(result.modelId).toBe('gpt-4.1');
      expect(result.modelInfo).toBeDefined();
      expect(result.modelInfo?.id).toBe('gpt-4.1');
    });

    it('should return error when neither preset nor provider/model provided', async () => {
      const result = await resolver.resolve({});

      expect(result.error).toBeDefined();
      expect(result.error?.error.code).toBe('INVALID_MODEL_SELECTION');
      expect(result.error?.error.message).toContain('Either presetId or both providerId and modelId must be provided');
    });

    it('should return error when only providerId provided', async () => {
      const result = await resolver.resolve({ providerId: 'openai' });

      expect(result.error).toBeDefined();
      expect(result.error?.error.code).toBe('INVALID_MODEL_SELECTION');
    });

    it('should return error when only modelId provided', async () => {
      const result = await resolver.resolve({ modelId: 'gpt-4.1' });

      expect(result.error).toBeDefined();
      expect(result.error?.error.code).toBe('INVALID_MODEL_SELECTION');
    });

    it('should return error for unsupported provider', async () => {
      const result = await resolver.resolve({
        providerId: 'unsupported-provider',
        modelId: 'some-model'
      });

      expect(result.error).toBeDefined();
      expect(result.error?.error.code).toBe('UNSUPPORTED_PROVIDER');
      expect(result.error?.error.message).toContain('Unsupported provider');
      expect(result.error?.error.message).toContain('Supported providers:');
    });

    it('should create fallback model info for unknown models (with warning)', async () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

      const result = await resolver.resolve({
        providerId: 'openai',
        modelId: 'unsupported-model'
      });

      // Should succeed with fallback, not error
      expect(result.error).toBeUndefined();
      expect(result.modelInfo).toBeDefined();
      expect(result.modelInfo?.id).toBe('unsupported-model');
      expect(result.modelInfo?.providerId).toBe('openai');

      // Should warn about unknown model
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Unknown model "unsupported-model"')
      );

      consoleWarnSpy.mockRestore();
    });

    it('should silently create fallback for llamacpp unknown models (no warning)', async () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

      const result = await resolver.resolve({
        providerId: 'llamacpp',
        modelId: 'my-custom-gguf-model'
      });

      // Should succeed with fallback, not error
      expect(result.error).toBeUndefined();
      expect(result.modelInfo).toBeDefined();
      expect(result.modelInfo?.id).toBe('my-custom-gguf-model');
      expect(result.modelInfo?.providerId).toBe('llamacpp');

      // Should NOT warn (llamacpp allows unknown models silently)
      expect(consoleWarnSpy).not.toHaveBeenCalled();

      consoleWarnSpy.mockRestore();
    });

    it('should pass through user settings for direct resolution', async () => {
      const settings = {
        temperature: 0.8,
        maxTokens: 2000
      };

      const result = await resolver.resolve({
        providerId: 'openai',
        modelId: 'gpt-4.1',
        settings
      });

      expect(result.settings).toBe(settings); // Should be the same reference
    });
  });

  describe('priority handling', () => {
    it('should prioritize presetId over providerId/modelId when both provided', async () => {
      const mockPreset: ModelPreset = {
        id: 'test-preset',
        displayName: 'Test Preset',
        providerId: 'anthropic',
        modelId: 'claude-3-5-sonnet-20241022',
        settings: {}
      };
      
      mockPresetManager.resolvePreset.mockReturnValue(mockPreset);

      const result = await resolver.resolve({
        presetId: 'test-preset',
        providerId: 'openai',      // These should be ignored
        modelId: 'gpt-4.1'        // These should be ignored
      });

      expect(result.providerId).toBe('anthropic');
      expect(result.modelId).toBe('claude-3-5-sonnet-20241022');
    });
  });
});