import { ImagePresetManager } from './ImagePresetManager';
import type { ImagePreset } from '../../types/image';

describe('ImagePresetManager', () => {
  describe('constructor and getPresets', () => {
    it('should load default presets in extend mode (default)', () => {
      const manager = new ImagePresetManager();
      const presets = manager.getPresets();

      // Should return an array (empty for now, will be populated in Phase 6)
      expect(Array.isArray(presets)).toBe(true);
    });

    it('should extend default presets with custom presets', () => {
      const customPresets: ImagePreset[] = [
        {
          id: 'custom-preset-1',
          displayName: 'Custom Preset 1',
          providerId: 'openai-images',
          modelId: 'dall-e-3',
          settings: {
            quality: 'high',
          },
        },
      ];

      const manager = new ImagePresetManager(customPresets, 'extend');
      const presets = manager.getPresets();

      // Should include the custom preset
      const customPreset = presets.find((p) => p.id === 'custom-preset-1');
      expect(customPreset).toBeDefined();
      expect(customPreset?.displayName).toBe('Custom Preset 1');
    });

    it('should replace default presets in replace mode', () => {
      const customPresets: ImagePreset[] = [
        {
          id: 'custom-preset-1',
          displayName: 'Custom Preset 1',
          providerId: 'openai-images',
          modelId: 'dall-e-3',
        },
        {
          id: 'custom-preset-2',
          displayName: 'Custom Preset 2',
          providerId: 'electron-diffusion',
          modelId: 'sdxl',
        },
      ];

      const manager = new ImagePresetManager(customPresets, 'replace');
      const presets = manager.getPresets();

      // Should only have custom presets
      expect(presets).toHaveLength(2);
      expect(presets.find((p) => p.id === 'custom-preset-1')).toBeDefined();
      expect(presets.find((p) => p.id === 'custom-preset-2')).toBeDefined();
    });

    it('should override default presets with same ID in extend mode', () => {
      // Assuming there will be a default preset with id 'openai-dalle3-standard'
      // For now, we'll test the override mechanism
      const customPresets: ImagePreset[] = [
        {
          id: 'test-preset',
          displayName: 'Original',
          providerId: 'openai-images',
          modelId: 'dall-e-3',
        },
      ];

      const manager1 = new ImagePresetManager(customPresets, 'extend');

      const overridePresets: ImagePreset[] = [
        {
          id: 'test-preset',
          displayName: 'Overridden',
          providerId: 'openai-images',
          modelId: 'dall-e-3',
          settings: {
            quality: 'high',
          },
        },
      ];

      const manager2 = new ImagePresetManager([...customPresets, ...overridePresets], 'extend');
      const presets = manager2.getPresets();

      const preset = presets.find((p) => p.id === 'test-preset');
      expect(preset?.displayName).toBe('Overridden');
      expect(preset?.settings?.quality).toBe('high');
    });

    it('should return a copy of presets to prevent external modification', () => {
      const manager = new ImagePresetManager();
      const presets1 = manager.getPresets();
      const presets2 = manager.getPresets();

      expect(presets1).not.toBe(presets2); // Different references
      expect(presets1).toEqual(presets2); // But same content
    });
  });

  describe('resolvePreset', () => {
    it('should resolve preset by ID', () => {
      const customPresets: ImagePreset[] = [
        {
          id: 'test-preset',
          displayName: 'Test Preset',
          providerId: 'openai-images',
          modelId: 'dall-e-3',
          settings: {
            quality: 'high',
            size: '1024x1024',
          },
        },
      ];

      const manager = new ImagePresetManager(customPresets, 'replace');
      const preset = manager.resolvePreset('test-preset');

      expect(preset).toBeDefined();
      expect(preset?.id).toBe('test-preset');
      expect(preset?.displayName).toBe('Test Preset');
      expect(preset?.settings?.quality).toBe('high');
    });

    it('should return null for non-existent preset ID', () => {
      const manager = new ImagePresetManager();
      const preset = manager.resolvePreset('non-existent-preset');

      expect(preset).toBeNull();
    });

    it('should resolve preset with all optional fields', () => {
      const customPresets: ImagePreset[] = [
        {
          id: 'full-preset',
          displayName: 'Full Preset',
          providerId: 'openai-images',
          modelId: 'dall-e-3',
          promptPrefix: 'A high-quality, detailed image of',
          settings: {
            quality: 'high',
            style: 'vivid',
            size: '1792x1024',
          },
        },
      ];

      const manager = new ImagePresetManager(customPresets, 'replace');
      const preset = manager.resolvePreset('full-preset');

      expect(preset?.promptPrefix).toBe('A high-quality, detailed image of');
      expect(preset?.settings?.style).toBe('vivid');
    });

    it('should resolve preset with diffusion settings', () => {
      const customPresets: ImagePreset[] = [
        {
          id: 'diffusion-preset',
          displayName: 'Diffusion Preset',
          providerId: 'electron-diffusion',
          modelId: 'sdxl',
          settings: {
            diffusion: {
              steps: 30,
              cfgScale: 7.5,
              sampler: 'dpm++2m',
              width: 1024,
              height: 1024,
            },
          },
        },
      ];

      const manager = new ImagePresetManager(customPresets, 'replace');
      const preset = manager.resolvePreset('diffusion-preset');

      expect(preset?.settings?.diffusion?.steps).toBe(30);
      expect(preset?.settings?.diffusion?.cfgScale).toBe(7.5);
      expect(preset?.settings?.diffusion?.sampler).toBe('dpm++2m');
    });
  });

  describe('edge cases', () => {
    it('should handle empty custom presets array', () => {
      const manager = new ImagePresetManager([], 'replace');
      const presets = manager.getPresets();

      expect(presets).toHaveLength(0);
    });

    it('should handle undefined custom presets (use defaults)', () => {
      const manager = new ImagePresetManager(undefined, 'extend');
      const presets = manager.getPresets();

      expect(Array.isArray(presets)).toBe(true);
    });

    it('should handle undefined mode (default to extend)', () => {
      const customPresets: ImagePreset[] = [
        {
          id: 'test',
          displayName: 'Test',
          providerId: 'openai-images',
          modelId: 'dall-e-3',
        },
      ];

      const manager = new ImagePresetManager(customPresets);
      const presets = manager.getPresets();

      // Should include custom preset (proving extend mode was used)
      expect(presets.find((p) => p.id === 'test')).toBeDefined();
    });
  });
});
