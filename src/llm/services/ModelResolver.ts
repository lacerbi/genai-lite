import type {
  LLMFailureResponse,
  LLMSettings,
  ModelInfo,
  ApiProviderId
} from "../types";
import { PresetManager } from "./PresetManager";
import {
  SUPPORTED_PROVIDERS,
  isProviderSupported,
  getModelById,
  getProviderById,
  createFallbackModelInfo
} from "../config";

/**
 * Options for model selection
 */
export interface ModelSelectionOptions {
  presetId?: string;
  providerId?: string;
  modelId?: string;
  settings?: LLMSettings;
}

/**
 * Result of model resolution
 */
export interface ModelResolution {
  providerId?: string;
  modelId?: string;
  modelInfo?: ModelInfo;
  settings?: LLMSettings;
  error?: LLMFailureResponse;
}

/**
 * Resolves model information from presets or direct provider/model IDs
 */
export class ModelResolver {
  constructor(private presetManager: PresetManager) {}

  /**
   * Resolves model information from either a preset ID or provider/model IDs
   * 
   * @param options Options containing either presetId or providerId/modelId
   * @returns Resolved model info and settings or error response
   */
  resolve(options: ModelSelectionOptions): ModelResolution {
    // If presetId is provided, use it
    if (options.presetId) {
      const preset = this.presetManager.resolvePreset(options.presetId);
      if (!preset) {
        return {
          error: {
            provider: 'unknown' as any,
            model: 'unknown',
            error: {
              message: `Preset not found: ${options.presetId}`,
              code: 'PRESET_NOT_FOUND',
              type: 'validation_error',
            },
            object: 'error',
          }
        };
      }

      const modelInfo = getModelById(preset.modelId, preset.providerId);
      if (!modelInfo) {
        return {
          error: {
            provider: preset.providerId as any,
            model: preset.modelId,
            error: {
              message: `Model not found for preset: ${options.presetId}`,
              code: 'MODEL_NOT_FOUND',
              type: 'validation_error',
            },
            object: 'error',
          }
        };
      }

      // Merge preset settings with user settings
      const settings = {
        ...preset.settings,
        ...options.settings
      };

      return {
        providerId: preset.providerId,
        modelId: preset.modelId,
        modelInfo,
        settings
      };
    }

    // Otherwise, use providerId and modelId
    if (!options.providerId || !options.modelId) {
      return {
        error: {
          provider: (options.providerId || 'unknown') as any,
          model: options.modelId || 'unknown',
          error: {
            message: 'Either presetId or both providerId and modelId must be provided',
            code: 'INVALID_MODEL_SELECTION',
            type: 'validation_error',
          },
          object: 'error',
        }
      };
    }

    // Check if provider is supported first
    if (!isProviderSupported(options.providerId)) {
      return {
        error: {
          provider: options.providerId as any,
          model: options.modelId,
          error: {
            message: `Unsupported provider: ${options.providerId}. Supported providers: ${SUPPORTED_PROVIDERS.map((p) => p.id).join(', ')}`,
            code: 'UNSUPPORTED_PROVIDER',
            type: 'validation_error',
          },
          object: 'error',
        }
      };
    }

    let modelInfo = getModelById(options.modelId, options.providerId);
    if (!modelInfo) {
      // Check if provider allows unknown models
      const provider = getProviderById(options.providerId);

      if (provider?.allowUnknownModels) {
        // Flexible provider (e.g., llamacpp) - silent fallback
        modelInfo = createFallbackModelInfo(options.modelId, options.providerId);
      } else {
        // Strict provider - warn but allow
        console.warn(
          `⚠️  Unknown model "${options.modelId}" for provider "${options.providerId}". ` +
          `Using default settings. This may fail at the provider API if the model doesn't exist.`
        );
        modelInfo = createFallbackModelInfo(options.modelId, options.providerId);
      }
    }

    return {
      providerId: options.providerId,
      modelId: options.modelId,
      modelInfo,
      settings: options.settings
    };
  }
}