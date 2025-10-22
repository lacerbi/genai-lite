import { PresetManager } from './PresetManager';

// Test preset type
interface TestPreset {
  id: string;
  name: string;
  value?: number;
}

describe('PresetManager (Generic)', () => {
  describe('constructor', () => {
    it('should initialize with default presets in extend mode', () => {
      const defaults: TestPreset[] = [
        { id: 'preset1', name: 'Preset 1' },
        { id: 'preset2', name: 'Preset 2' },
      ];

      const manager = new PresetManager(defaults);
      const presets = manager.getPresets();

      expect(presets).toHaveLength(2);
      expect(presets[0].id).toBe('preset1');
      expect(presets[1].id).toBe('preset2');
    });

    it('should merge custom presets with defaults in extend mode', () => {
      const defaults: TestPreset[] = [
        { id: 'preset1', name: 'Preset 1' },
        { id: 'preset2', name: 'Preset 2' },
      ];

      const custom: TestPreset[] = [
        { id: 'preset3', name: 'Custom Preset' },
      ];

      const manager = new PresetManager(defaults, custom, 'extend');
      const presets = manager.getPresets();

      expect(presets).toHaveLength(3);
      expect(presets.map(p => p.id)).toEqual(['preset1', 'preset2', 'preset3']);
    });

    it('should override default presets with custom ones having same ID in extend mode', () => {
      const defaults: TestPreset[] = [
        { id: 'preset1', name: 'Default Preset 1', value: 10 },
        { id: 'preset2', name: 'Default Preset 2', value: 20 },
      ];

      const custom: TestPreset[] = [
        { id: 'preset1', name: 'Custom Preset 1', value: 100 },
      ];

      const manager = new PresetManager(defaults, custom, 'extend');
      const presets = manager.getPresets();

      expect(presets).toHaveLength(2);
      const preset1 = presets.find(p => p.id === 'preset1');
      expect(preset1).toEqual({ id: 'preset1', name: 'Custom Preset 1', value: 100 });
    });

    it('should use only custom presets in replace mode', () => {
      const defaults: TestPreset[] = [
        { id: 'preset1', name: 'Default Preset 1' },
        { id: 'preset2', name: 'Default Preset 2' },
      ];

      const custom: TestPreset[] = [
        { id: 'custom1', name: 'Custom Preset 1' },
      ];

      const manager = new PresetManager(defaults, custom, 'replace');
      const presets = manager.getPresets();

      expect(presets).toHaveLength(1);
      expect(presets[0]).toEqual({ id: 'custom1', name: 'Custom Preset 1' });
    });

    it('should handle empty defaults in extend mode', () => {
      const custom: TestPreset[] = [
        { id: 'custom1', name: 'Custom Preset 1' },
      ];

      const manager = new PresetManager([], custom, 'extend');
      const presets = manager.getPresets();

      expect(presets).toHaveLength(1);
      expect(presets[0]).toEqual({ id: 'custom1', name: 'Custom Preset 1' });
    });

    it('should handle empty custom presets in extend mode', () => {
      const defaults: TestPreset[] = [
        { id: 'preset1', name: 'Preset 1' },
      ];

      const manager = new PresetManager(defaults, [], 'extend');
      const presets = manager.getPresets();

      expect(presets).toHaveLength(1);
      expect(presets[0]).toEqual({ id: 'preset1', name: 'Preset 1' });
    });

    it('should handle empty presets in replace mode', () => {
      const defaults: TestPreset[] = [
        { id: 'preset1', name: 'Preset 1' },
      ];

      const manager = new PresetManager(defaults, [], 'replace');
      const presets = manager.getPresets();

      expect(presets).toHaveLength(0);
    });

    it('should default to extend mode when mode is not specified', () => {
      const defaults: TestPreset[] = [
        { id: 'preset1', name: 'Preset 1' },
      ];

      const custom: TestPreset[] = [
        { id: 'preset2', name: 'Preset 2' },
      ];

      const manager = new PresetManager(defaults, custom);
      const presets = manager.getPresets();

      expect(presets).toHaveLength(2);
    });
  });

  describe('getPresets', () => {
    it('should return a copy of presets array', () => {
      const defaults: TestPreset[] = [
        { id: 'preset1', name: 'Preset 1' },
      ];

      const manager = new PresetManager(defaults);
      const presets1 = manager.getPresets();
      const presets2 = manager.getPresets();

      expect(presets1).not.toBe(presets2); // Different array instances
      expect(presets1).toEqual(presets2); // But same content
    });

    it('should prevent external modification of internal presets', () => {
      const defaults: TestPreset[] = [
        { id: 'preset1', name: 'Preset 1' },
      ];

      const manager = new PresetManager(defaults);
      const presets = manager.getPresets();

      // Modify the returned array
      presets.push({ id: 'preset2', name: 'Preset 2' });

      // Internal state should not be affected
      const presetsAgain = manager.getPresets();
      expect(presetsAgain).toHaveLength(1);
    });
  });

  describe('resolvePreset', () => {
    it('should resolve preset by ID', () => {
      const defaults: TestPreset[] = [
        { id: 'preset1', name: 'Preset 1' },
        { id: 'preset2', name: 'Preset 2' },
      ];

      const manager = new PresetManager(defaults);
      const resolved = manager.resolvePreset('preset1');

      expect(resolved).toEqual({ id: 'preset1', name: 'Preset 1' });
    });

    it('should return null for non-existent preset ID', () => {
      const defaults: TestPreset[] = [
        { id: 'preset1', name: 'Preset 1' },
      ];

      const manager = new PresetManager(defaults);
      const resolved = manager.resolvePreset('nonexistent');

      expect(resolved).toBeNull();
    });

    it('should resolve custom preset that overrides default', () => {
      const defaults: TestPreset[] = [
        { id: 'preset1', name: 'Default Preset', value: 10 },
      ];

      const custom: TestPreset[] = [
        { id: 'preset1', name: 'Custom Preset', value: 100 },
      ];

      const manager = new PresetManager(defaults, custom, 'extend');
      const resolved = manager.resolvePreset('preset1');

      expect(resolved).toEqual({ id: 'preset1', name: 'Custom Preset', value: 100 });
    });
  });

  describe('Type Safety', () => {
    it('should work with different preset types', () => {
      interface ComplexPreset {
        id: string;
        displayName: string;
        settings: {
          temperature: number;
          maxTokens: number;
        };
      }

      const defaults: ComplexPreset[] = [
        {
          id: 'complex1',
          displayName: 'Complex Preset',
          settings: { temperature: 0.7, maxTokens: 100 },
        },
      ];

      const manager = new PresetManager<ComplexPreset>(defaults);
      const presets = manager.getPresets();

      expect(presets[0].settings.temperature).toBe(0.7);
      expect(presets[0].settings.maxTokens).toBe(100);
    });
  });
});
