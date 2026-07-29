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

    it('should overlay detected GGUF capabilities on the generic llamacpp registry entry', async () => {
      const detectedCaps = {
        reasoning: { supported: true, enabledByDefault: false, canDisable: true },
        localReasoning: { toggleKwarg: 'enable_thinking' },
        defaultSettings: { temperature: 1.0, topK: 64 },
        maxTokens: 8192,
      };
      mockAdapterRegistry.getAdapter.mockReturnValue({
        getModelCapabilities: jest.fn().mockResolvedValue(detectedCaps),
      } as any);

      const result = await resolver.resolve({ providerId: 'llamacpp', modelId: 'llamacpp' });

      expect(result.error).toBeUndefined();
      expect(result.modelInfo?.id).toBe('llamacpp');
      expect(result.modelInfo?.defaultSettings).toEqual({ temperature: 1.0, topK: 64 });
      expect(result.modelInfo?.localReasoning?.toggleKwarg).toBe('enable_thinking');
      expect(result.modelInfo?.maxTokens).toBe(8192);
      // Registry-entry fields not overridden by detection survive
      expect(result.modelInfo?.structuredOutput?.supported).toBe(true);
    });

    it("carries one llama.cpp resolution snapshot into adapter preparation", async () => {
      const snapshot = {
        kind: "llamacpp-preparation-v1",
        selectedModel: "llamacpp",
        detectedCaps: {
          defaultSettings: { temperature: 0.6 },
          localReasoning: { toggleKwarg: "enable_thinking" },
        },
        stateBinding: {
          serverStateFingerprint: "state-a",
          chatTemplateFingerprint: "template-a",
          metadata: { model: "model-a.gguf", buildInfo: "{}" },
        },
      };
      const getPreparationSnapshot = jest
        .fn()
        .mockResolvedValue(snapshot);
      const getModelCapabilities = jest.fn();
      mockAdapterRegistry.getAdapter.mockReturnValue({
        getPreparationSnapshot,
        getModelCapabilities,
      } as any);

      const result = await resolver.resolve({
        providerId: "llamacpp",
        modelId: "llamacpp",
      });

      expect(getPreparationSnapshot).toHaveBeenCalledWith("llamacpp");
      expect(getModelCapabilities).not.toHaveBeenCalled();
      expect(result.adapterPreparationState).toBe(snapshot);
      expect(result.modelInfo?.defaultSettings).toEqual({
        temperature: 0.6,
      });
    });

    it('should keep the generic llamacpp entry unchanged when detection fails', async () => {
      mockAdapterRegistry.getAdapter.mockReturnValue({
        getModelCapabilities: jest.fn().mockResolvedValue(null),
      } as any);

      const result = await resolver.resolve({ providerId: 'llamacpp', modelId: 'llamacpp' });

      expect(result.error).toBeUndefined();
      expect(result.modelInfo?.defaultSettings).toBeUndefined();
      expect(result.modelInfo?.maxTokens).toBe(4096); // registry value
    });

    it('should apply detected capabilities to llamacpp presets', async () => {
      mockPresetManager.resolvePreset.mockReturnValue({
        id: 'llamacpp-local-thinking',
        displayName: 'Local (Thinking)',
        providerId: 'llamacpp',
        modelId: 'llamacpp',
        settings: { reasoning: { enabled: true } },
      });
      mockAdapterRegistry.getAdapter.mockReturnValue({
        getModelCapabilities: jest.fn().mockResolvedValue({
          defaultSettings: { temperature: 1.0 },
        }),
      } as any);

      const result = await resolver.resolve({ presetId: 'llamacpp-local-thinking' });

      expect(result.error).toBeUndefined();
      expect(result.modelInfo?.defaultSettings).toEqual({ temperature: 1.0 });
      expect(result.settings).toEqual({ reasoning: { enabled: true } });
    });

    it('should assume reasoning support for unknown OpenRouter models', async () => {
      const result = await resolver.resolve({
        providerId: 'openrouter',
        modelId: 'some-vendor/some-model',
      });

      expect(result.error).toBeUndefined();
      expect(result.modelInfo?.reasoning?.supported).toBe(true);
      expect(result.modelInfo?.reasoning?.enabledByDefault).toBe(false);
      expect(result.modelInfo?.reasoning?.canDisable).toBe(true);
    });

    it('should not add optimistic reasoning to registered OpenRouter models', async () => {
      const result = await resolver.resolve({
        providerId: 'openrouter',
        modelId: 'google/gemma-3-27b-it:free',
      });

      expect(result.error).toBeUndefined();
      expect(result.modelInfo?.reasoning).toBeUndefined();
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
