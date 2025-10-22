import type { ImagePreset } from "../../types/image";
import rawDefaultImagePresets from "../../config/image-presets.json";

// Type assertion for the imported JSON
const defaultImagePresets = rawDefaultImagePresets as ImagePreset[];

/**
 * Defines how custom image presets interact with the default presets.
 * 'replace': Use only the custom presets provided. The default set is ignored.
 * 'extend': Use the default presets, and add/override them with the custom presets. This is the default behavior.
 */
export type PresetMode = 'replace' | 'extend';

/**
 * Manages image generation presets including loading, merging, and resolution
 */
export class ImagePresetManager {
  private presets: ImagePreset[];

  constructor(customPresets: ImagePreset[] = [], mode: PresetMode = 'extend') {
    // Initialize presets based on mode
    const finalPresets = new Map<string, ImagePreset>();

    if (mode === 'replace') {
      // Replace Mode: Only use custom presets.
      for (const preset of customPresets) {
        finalPresets.set(preset.id, preset);
      }
    } else {
      // Extend Mode: Load defaults first, then add/override.
      for (const preset of defaultImagePresets) {
        finalPresets.set(preset.id, preset);
      }
      for (const preset of customPresets) {
        finalPresets.set(preset.id, preset);
      }
    }

    this.presets = Array.from(finalPresets.values());
  }

  /**
   * Gets all configured image presets
   *
   * @returns Array of image presets
   */
  getPresets(): ImagePreset[] {
    return [...this.presets]; // Return a copy to prevent external modification
  }

  /**
   * Resolves a preset by ID
   *
   * @param presetId - The preset ID to resolve
   * @returns The preset if found, null otherwise
   */
  resolvePreset(presetId: string): ImagePreset | null {
    return this.presets.find(p => p.id === presetId) || null;
  }
}
