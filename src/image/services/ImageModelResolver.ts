import type {
  ImageProviderId,
  ImageGenerationRequest,
  ImageGenerationRequestWithPreset,
  ImageModelInfo,
  ImageGenerationSettings,
  ImageFailureResponse,
} from '../../types/image';
import { getImageModelInfo } from '../config';
import type { ImagePresetManager } from './ImagePresetManager';

/**
 * Result of model resolution
 */
export interface ModelResolutionResult {
  providerId?: ImageProviderId;
  modelId?: string;
  modelInfo?: ImageModelInfo;
  settings?: ImageGenerationSettings;
  error?: ImageFailureResponse;
}

/**
 * Resolves model information from presets or direct IDs
 */
export class ImageModelResolver {
  constructor(
    private presetManager: ImagePresetManager
  ) {}

  /**
   * Resolves model information from a request
   *
   * @param request - The request (with preset or direct IDs)
   * @returns Resolution result
   */
  resolve(
    request: ImageGenerationRequest | ImageGenerationRequestWithPreset
  ): ModelResolutionResult {
    const reqWithPreset = request as ImageGenerationRequestWithPreset;

    // Check if using preset
    if (reqWithPreset.presetId) {
      const preset = this.presetManager.resolvePreset(reqWithPreset.presetId);
      if (!preset) {
        return {
          error: {
            object: 'error',
            providerId: 'unknown',
            error: {
              message: `Preset not found: ${reqWithPreset.presetId}`,
              code: 'PRESET_NOT_FOUND',
              type: 'validation_error',
              param: 'presetId',
            },
          },
        };
      }

      // Get model info
      const modelInfo = getImageModelInfo(preset.providerId, preset.modelId);
      if (!modelInfo) {
        return {
          error: {
            object: 'error',
            providerId: preset.providerId,
            modelId: preset.modelId,
            error: {
              message: `Model not found: ${preset.modelId} for provider ${preset.providerId}`,
              code: 'MODEL_NOT_FOUND',
              type: 'validation_error',
            },
          },
        };
      }

      return {
        providerId: preset.providerId,
        modelId: preset.modelId,
        modelInfo,
        settings: preset.settings,
      };
    }

    // Using direct provider ID and model ID
    const reqDirect = request as ImageGenerationRequest;
    if (!reqDirect.providerId || !reqDirect.modelId) {
      return {
        error: {
          object: 'error',
          providerId: reqDirect.providerId || 'unknown',
          modelId: reqDirect.modelId,
          error: {
            message: 'Either presetId or both providerId and modelId must be specified',
            code: 'MISSING_MODEL_INFO',
            type: 'validation_error',
          },
        },
      };
    }

    const modelInfo = getImageModelInfo(reqDirect.providerId, reqDirect.modelId);
    if (!modelInfo) {
      return {
        error: {
          object: 'error',
          providerId: reqDirect.providerId,
          modelId: reqDirect.modelId,
          error: {
            message: `Model not found: ${reqDirect.modelId} for provider ${reqDirect.providerId}`,
            code: 'MODEL_NOT_FOUND',
            type: 'validation_error',
          },
        },
      };
    }

    return {
      providerId: reqDirect.providerId,
      modelId: reqDirect.modelId,
      modelInfo,
    };
  }
}
