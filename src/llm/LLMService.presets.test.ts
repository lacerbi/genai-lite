import { LLMService, PresetMode, LLMServiceOptions } from './LLMService';
import type { ApiKeyProvider } from '../types';
import type { ModelPreset } from '../types/presets';
import defaultPresets from '../config/presets.json';

describe('LLMService Presets', () => {
  let mockApiKeyProvider: jest.MockedFunction<ApiKeyProvider>;
  
  beforeEach(() => {
    jest.clearAllMocks();
    mockApiKeyProvider = jest.fn().mockResolvedValue('test-api-key');
  });

  describe('Default behavior', () => {
    it('should load default presets when no options provided', async () => {
      const service = new LLMService(mockApiKeyProvider);
      const presets = service.getPresets();
      
      expect(presets).toHaveLength(defaultPresets.length);
      expect(presets).toEqual(expect.arrayContaining(
        defaultPresets.map(preset => expect.objectContaining({
          id: preset.id,
          displayName: preset.displayName,
          providerId: preset.providerId,
          modelId: preset.modelId
        }))
      ));
    });

    it('should return a copy of presets to prevent external modification', async () => {
      const service = new LLMService(mockApiKeyProvider);
      const presets1 = service.getPresets();
      const presets2 = service.getPresets();
      
      expect(presets1).not.toBe(presets2); // Different array instances
      expect(presets1).toEqual(presets2); // Same content
      
      // Modifying returned array should not affect service
      presets1.push({
        id: 'test-preset',
        displayName: 'Test',
        providerId: 'openai',
        modelId: 'gpt-4',
        settings: {}
      } as ModelPreset);
      
      const presets3 = service.getPresets();
      expect(presets3).toHaveLength(defaultPresets.length);
    });
  });

  describe('Extend mode', () => {
    it('should add new presets to defaults in extend mode', async () => {
      const customPresets: ModelPreset[] = [
        {
          id: 'custom-preset-1',
          displayName: 'Custom Preset 1',
          providerId: 'openai',
          modelId: 'gpt-4',
          settings: { temperature: 0.5 }
        }
      ];
      
      const service = new LLMService(mockApiKeyProvider, {
        presets: customPresets,
        presetMode: 'extend'
      });
      
      const presets = service.getPresets();
      expect(presets).toHaveLength(defaultPresets.length + 1);
      expect(presets).toContainEqual(expect.objectContaining({
        id: 'custom-preset-1',
        displayName: 'Custom Preset 1'
      }));
    });

    it('should override default presets with same ID in extend mode', async () => {
      const existingPresetId = defaultPresets[0].id;
      const customPresets: ModelPreset[] = [
        {
          id: existingPresetId,
          displayName: 'Overridden Preset',
          providerId: 'anthropic',
          modelId: 'claude-3-5-sonnet-20241022',
          settings: { temperature: 0.8 }
        }
      ];
      
      const service = new LLMService(mockApiKeyProvider, {
        presets: customPresets,
        presetMode: 'extend'
      });
      
      const presets = service.getPresets();
      const overriddenPreset = presets.find(p => p.id === existingPresetId);
      
      expect(presets).toHaveLength(defaultPresets.length);
      expect(overriddenPreset).toBeDefined();
      expect(overriddenPreset?.displayName).toBe('Overridden Preset');
      expect(overriddenPreset?.providerId).toBe('anthropic');
    });

    it('should use extend mode by default when mode not specified', async () => {
      const customPresets: ModelPreset[] = [
        {
          id: 'custom-preset-default',
          displayName: 'Custom Default',
          providerId: 'gemini',
          modelId: 'gemini-2.0-flash',
          settings: { temperature: 0.3 }
        }
      ];
      
      const service = new LLMService(mockApiKeyProvider, {
        presets: customPresets
        // presetMode not specified, should default to 'extend'
      });
      
      const presets = service.getPresets();
      expect(presets).toHaveLength(defaultPresets.length + 1);
    });
  });

  describe('Replace mode', () => {
    it('should use only custom presets in replace mode', async () => {
      const customPresets: ModelPreset[] = [
        {
          id: 'replace-preset-1',
          displayName: 'Replace Preset 1',
          providerId: 'openai',
          modelId: 'gpt-4',
          settings: { temperature: 0.5 }
        },
        {
          id: 'replace-preset-2',
          displayName: 'Replace Preset 2',
          providerId: 'anthropic',
          modelId: 'claude-3-5-sonnet-20241022',
          settings: { temperature: 0.3 }
        }
      ];
      
      const service = new LLMService(mockApiKeyProvider, {
        presets: customPresets,
        presetMode: 'replace'
      });
      
      const presets = service.getPresets();
      expect(presets).toHaveLength(2);
      expect(presets).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: 'replace-preset-1' }),
        expect.objectContaining({ id: 'replace-preset-2' })
      ]));
      
      // Should not contain any default presets
      const defaultPresetIds = defaultPresets.map(p => p.id);
      const actualPresetIds = presets.map(p => p.id);
      expect(actualPresetIds).not.toContain(expect.arrayContaining(defaultPresetIds));
    });

    it('should return empty array when replace mode with no custom presets', async () => {
      const service = new LLMService(mockApiKeyProvider, {
        presets: [],
        presetMode: 'replace'
      });
      
      const presets = service.getPresets();
      expect(presets).toHaveLength(0);
    });

    it('should handle undefined presets array in replace mode', async () => {
      const service = new LLMService(mockApiKeyProvider, {
        presetMode: 'replace'
        // presets not provided
      });
      
      const presets = service.getPresets();
      expect(presets).toHaveLength(0);
    });
  });

  describe('Edge cases', () => {
    it('should handle duplicate IDs within custom presets', async () => {
      const customPresets: ModelPreset[] = [
        {
          id: 'duplicate-id',
          displayName: 'First Preset',
          providerId: 'openai',
          modelId: 'gpt-4',
          settings: { temperature: 0.5 }
        },
        {
          id: 'duplicate-id',
          displayName: 'Second Preset',
          providerId: 'anthropic',
          modelId: 'claude-3-5-sonnet-20241022',
          settings: { temperature: 0.3 }
        }
      ];
      
      const service = new LLMService(mockApiKeyProvider, {
        presets: customPresets,
        presetMode: 'replace'
      });
      
      const presets = service.getPresets();
      const duplicatePresets = presets.filter(p => p.id === 'duplicate-id');
      
      // Last one should win
      expect(duplicatePresets).toHaveLength(1);
      expect(duplicatePresets[0].displayName).toBe('Second Preset');
    });

    it('should handle presets with complex settings including gemini safety settings', async () => {
      const customPresets: ModelPreset[] = [
        {
          id: 'gemini-complex',
          displayName: 'Gemini Complex',
          providerId: 'gemini',
          modelId: 'gemini-2.0-flash',
          settings: {
            temperature: 0.5,
            maxTokens: 2000,
            geminiSafetySettings: [
              { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
              { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' }
            ]
          }
        }
      ];
      
      const service = new LLMService(mockApiKeyProvider, {
        presets: customPresets,
        presetMode: 'replace'
      });
      
      const presets = service.getPresets();
      expect(presets).toHaveLength(1);
      expect(presets[0].settings.geminiSafetySettings).toHaveLength(2);
    });
  });
});