import { PresetManager } from './PresetManager';
import type { ModelPreset } from '../../types/presets';
import defaultPresets from '../../config/presets.json';

describe('PresetManager', () => {
  describe('Default behavior', () => {
    it('should load default presets when no options provided', () => {
      const manager = new PresetManager();
      const presets = manager.getPresets();
      
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

    it('should return a copy of presets to prevent external modification', () => {
      const manager = new PresetManager();
      const presets1 = manager.getPresets();
      const presets2 = manager.getPresets();
      
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
      
      const presets3 = manager.getPresets();
      expect(presets3).toHaveLength(defaultPresets.length);
    });
  });

  describe('Extend mode', () => {
    it('should add new presets to defaults in extend mode', () => {
      const customPresets: ModelPreset[] = [
        {
          id: 'custom-preset-1',
          displayName: 'Custom Preset 1',
          providerId: 'openai',
          modelId: 'gpt-4',
          settings: { temperature: 0.5 }
        }
      ];
      
      const manager = new PresetManager(customPresets, 'extend');
      
      const presets = manager.getPresets();
      expect(presets).toHaveLength(defaultPresets.length + 1);
      expect(presets).toContainEqual(expect.objectContaining({
        id: 'custom-preset-1',
        displayName: 'Custom Preset 1'
      }));
    });

    it('should override default presets with same ID in extend mode', () => {
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
      
      const manager = new PresetManager(customPresets, 'extend');
      
      const presets = manager.getPresets();
      const overriddenPreset = presets.find(p => p.id === existingPresetId);
      
      expect(presets).toHaveLength(defaultPresets.length);
      expect(overriddenPreset).toBeDefined();
      expect(overriddenPreset?.displayName).toBe('Overridden Preset');
      expect(overriddenPreset?.providerId).toBe('anthropic');
    });

    it('should use extend mode by default when mode not specified', () => {
      const customPresets: ModelPreset[] = [
        {
          id: 'custom-preset-default',
          displayName: 'Custom Default',
          providerId: 'gemini',
          modelId: 'gemini-2.0-flash',
          settings: { temperature: 0.3 }
        }
      ];
      
      const manager = new PresetManager(customPresets);
      
      const presets = manager.getPresets();
      expect(presets).toHaveLength(defaultPresets.length + 1);
    });
  });

  describe('Replace mode', () => {
    it('should use only custom presets in replace mode', () => {
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
      
      const manager = new PresetManager(customPresets, 'replace');
      
      const presets = manager.getPresets();
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

    it('should return empty array when replace mode with no custom presets', () => {
      const manager = new PresetManager([], 'replace');
      
      const presets = manager.getPresets();
      expect(presets).toHaveLength(0);
    });

    it('should handle undefined presets array in replace mode', () => {
      const manager = new PresetManager(undefined, 'replace');
      
      const presets = manager.getPresets();
      expect(presets).toHaveLength(0);
    });
  });

  describe('Edge cases', () => {
    it('should handle duplicate IDs within custom presets', () => {
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
      
      const manager = new PresetManager(customPresets, 'replace');
      
      const presets = manager.getPresets();
      const duplicatePresets = presets.filter(p => p.id === 'duplicate-id');
      
      // Last one should win
      expect(duplicatePresets).toHaveLength(1);
      expect(duplicatePresets[0].displayName).toBe('Second Preset');
    });

    it('should handle presets with complex settings including gemini safety settings', () => {
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
      
      const manager = new PresetManager(customPresets, 'replace');
      
      const presets = manager.getPresets();
      expect(presets).toHaveLength(1);
      expect(presets[0].settings.geminiSafetySettings).toHaveLength(2);
    });
  });

  describe('resolvePreset', () => {
    it('should find preset by ID', () => {
      const customPresets: ModelPreset[] = [
        {
          id: 'test-preset-1',
          displayName: 'Test Preset 1',
          providerId: 'openai',
          modelId: 'gpt-4',
          settings: {}
        }
      ];
      
      const manager = new PresetManager(customPresets, 'replace');
      const preset = manager.resolvePreset('test-preset-1');
      
      expect(preset).toBeDefined();
      expect(preset?.displayName).toBe('Test Preset 1');
    });

    it('should return null for non-existent preset', () => {
      const manager = new PresetManager();
      const preset = manager.resolvePreset('non-existent-preset');
      
      expect(preset).toBeNull();
    });

    it('should find default preset in extend mode', () => {
      const manager = new PresetManager();
      const firstDefaultPresetId = defaultPresets[0].id;
      const preset = manager.resolvePreset(firstDefaultPresetId);
      
      expect(preset).toBeDefined();
      expect(preset?.id).toBe(firstDefaultPresetId);
    });
  });
});