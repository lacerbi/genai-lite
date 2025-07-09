import type { ModelPreset } from "../../types/presets";
import defaultPresets from "../../config/presets.json";

/**
 * Defines how custom presets interact with the default presets.
 * 'replace': Use only the custom presets provided. The default set is ignored.
 * 'extend': Use the default presets, and add/override them with the custom presets. This is the default behavior.
 */
export type PresetMode = 'replace' | 'extend';

/**
 * Manages model presets including loading, merging, and resolution
 */
export class PresetManager {
  private presets: ModelPreset[];

  constructor(customPresets: ModelPreset[] = [], mode: PresetMode = 'extend') {
    // Initialize presets based on mode
    const finalPresets = new Map<string, ModelPreset>();

    if (mode === 'replace') {
      // Replace Mode: Only use custom presets.
      for (const preset of customPresets) {
        finalPresets.set(preset.id, preset);
      }
    } else {
      // Extend Mode: Load defaults first, then add/override.
      for (const preset of defaultPresets) {
        finalPresets.set(preset.id, preset as ModelPreset);
      }
      for (const preset of customPresets) {
        finalPresets.set(preset.id, preset);
      }
    }
    
    this.presets = Array.from(finalPresets.values());
  }

  /**
   * Gets all configured model presets
   * 
   * @returns Array of model presets
   */
  getPresets(): ModelPreset[] {
    return [...this.presets]; // Return a copy to prevent external modification
  }

  /**
   * Resolves a preset by ID
   * 
   * @param presetId - The preset ID to resolve
   * @returns The preset if found, null otherwise
   */
  resolvePreset(presetId: string): ModelPreset | null {
    return this.presets.find(p => p.id === presetId) || null;
  }
}