import type { PresetMode } from "../../types";

/**
 * Generic preset manager for managing presets across different services.
 * Handles loading, merging, and resolution of presets.
 *
 * @template TPreset - The preset type, must have an 'id' property
 */
export class PresetManager<TPreset extends { id: string }> {
  private presets: TPreset[];

  /**
   * Creates a new PresetManager
   *
   * @param defaultPresets - The default presets to load
   * @param customPresets - Optional custom presets to add or override
   * @param mode - How to handle custom presets ('extend' or 'replace')
   */
  constructor(
    defaultPresets: TPreset[],
    customPresets: TPreset[] = [],
    mode: PresetMode = 'extend'
  ) {
    // Initialize presets based on mode
    const finalPresets = new Map<string, TPreset>();

    if (mode === 'replace') {
      // Replace Mode: Only use custom presets.
      for (const preset of customPresets) {
        finalPresets.set(preset.id, preset);
      }
    } else {
      // Extend Mode: Load defaults first, then add/override.
      for (const preset of defaultPresets) {
        finalPresets.set(preset.id, preset);
      }
      for (const preset of customPresets) {
        finalPresets.set(preset.id, preset);
      }
    }

    this.presets = Array.from(finalPresets.values());
  }

  /**
   * Gets all configured presets
   *
   * @returns Array of presets
   */
  getPresets(): TPreset[] {
    return [...this.presets]; // Return a copy to prevent external modification
  }

  /**
   * Resolves a preset by ID
   *
   * @param presetId - The preset ID to resolve
   * @returns The preset if found, null otherwise
   */
  resolvePreset(presetId: string): TPreset | null {
    return this.presets.find(p => p.id === presetId) || null;
  }
}
