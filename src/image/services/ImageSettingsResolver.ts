import type {
  ImageGenerationSettings,
  ImageModelInfo,
  ResolvedImageGenerationSettings,
  DiffusionSettings,
} from '../../types/image';

/**
 * Resolves and merges image generation settings from multiple sources
 */
export class ImageSettingsResolver {
  /**
   * Resolves settings by merging defaults, preset settings, and request settings
   * Priority: Model defaults < Preset settings < Request settings
   *
   * @param modelInfo - Model information containing defaults
   * @param presetSettings - Settings from preset (if any)
   * @param requestSettings - Settings from request (if any)
   * @returns Resolved settings with all required fields
   */
  resolveSettings(
    modelInfo: ImageModelInfo,
    presetSettings?: ImageGenerationSettings,
    requestSettings?: ImageGenerationSettings
  ): ResolvedImageGenerationSettings {
    // Start with library defaults
    const defaults: Partial<ResolvedImageGenerationSettings> = {
      width: 1024,
      height: 1024,
      responseFormat: 'buffer',
      quality: 'standard',
      style: 'natural',
    };

    // Merge in model defaults
    const modelDefaults = modelInfo.defaultSettings || {};

    // Merge all settings (defaults < model < preset < request)
    const merged = {
      ...defaults,
      ...modelDefaults,
      ...(presetSettings || {}),
      ...(requestSettings || {}),
    };

    // Handle diffusion settings separately (deep merge)
    const diffusionSettings = this.mergeDiffusionSettings(
      modelDefaults.diffusion,
      presetSettings?.diffusion,
      requestSettings?.diffusion
    );

    // Build final resolved settings
    const resolved: ResolvedImageGenerationSettings = {
      width: merged.width || 1024,
      height: merged.height || 1024,
      responseFormat: merged.responseFormat || 'buffer',
      quality: merged.quality || 'standard',
      style: merged.style || 'natural',
      user: merged.user,
      n: merged.n,
    };

    if (diffusionSettings) {
      // Ensure required diffusion fields have defaults
      resolved.diffusion = {
        ...diffusionSettings,
        steps: diffusionSettings.steps || 20,
        cfgScale: diffusionSettings.cfgScale || 7.5,
      };
    }

    return resolved;
  }

  /**
   * Merges diffusion settings from multiple sources
   *
   * @param modelDefaults - Model default diffusion settings
   * @param presetSettings - Preset diffusion settings
   * @param requestSettings - Request diffusion settings
   * @returns Merged diffusion settings
   */
  private mergeDiffusionSettings(
    modelDefaults?: DiffusionSettings,
    presetSettings?: DiffusionSettings,
    requestSettings?: DiffusionSettings
  ): DiffusionSettings | undefined {
    if (!modelDefaults && !presetSettings && !requestSettings) {
      return undefined;
    }

    return {
      ...(modelDefaults || {}),
      ...(presetSettings || {}),
      ...(requestSettings || {}),
    };
  }
}
