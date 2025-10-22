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
      size: '1024x1024',
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
    let diffusionSettings = this.mergeDiffusionSettings(
      modelDefaults.diffusion,
      presetSettings?.diffusion,
      requestSettings?.diffusion
    );

    // Parse size string into width/height for diffusion if this is a diffusion provider
    // and size was explicitly provided in request settings
    if (modelInfo.capabilities.supportsNegativePrompt && requestSettings?.size) {
      const sizeInfo = this.parseSizeString(requestSettings.size);
      if (sizeInfo) {
        // Initialize diffusion settings if not present
        if (!diffusionSettings) {
          diffusionSettings = {};
        }
        // Only override if not explicitly set in diffusion settings
        if (!diffusionSettings.width) diffusionSettings.width = sizeInfo.width;
        if (!diffusionSettings.height) diffusionSettings.height = sizeInfo.height;
      }
    }

    // Build final resolved settings
    const resolved: ResolvedImageGenerationSettings = {
      size: merged.size || '1024x1024',
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
        width: diffusionSettings.width || 512,
        height: diffusionSettings.height || 512,
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

  /**
   * Parses a size string like "1024x768" into width and height
   *
   * @param sizeString - Size string in format "WIDTHxHEIGHT"
   * @returns Object with width and height, or null if invalid
   */
  parseSizeString(sizeString: string): { width: number; height: number } | null {
    const match = sizeString.match(/^(\d+)x(\d+)$/);
    if (!match) {
      return null;
    }

    const width = parseInt(match[1], 10);
    const height = parseInt(match[2], 10);

    return { width, height };
  }
}
