import type {
  LLMFailureResponse,
  LLMSettings,
  ModelInfo,
  ApiProviderId
} from "../types";
import type { ILLMClientAdapter } from "../clients/types";
import type { ModelPreset } from "../../types/presets";
import type { Logger } from "../../logging/types";
import { createDefaultLogger } from "../../logging/defaultLogger";
import { PresetManager } from "../../shared/services/PresetManager";
import { AdapterRegistry } from "../../shared/services/AdapterRegistry";
import {
  SUPPORTED_PROVIDERS,
  isProviderSupported,
  getModelById,
  getProviderById,
  createFallbackModelInfo
} from "../config";
import type { LlamaCppClientAdapter } from "../clients/LlamaCppClientAdapter";

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
  adapterPreparationState?: unknown;
  error?: LLMFailureResponse;
}

/**
 * Options controlling model resolution side effects.
 */
export interface ModelResolutionOptions {
  /**
   * Whether resolution may query local provider adapters for dynamic model
   * capabilities and an opaque preparation snapshot. Defaults to true for
   * sendMessage(), but public capability preflight uses false so it remains
   * no-network/no-adapter.
   */
  detectLocalCapabilities?: boolean;
}

/**
 * Resolves model information from presets or direct provider/model IDs
 */
export class ModelResolver {
  private logger: Logger;

  constructor(
    private presetManager: PresetManager<ModelPreset>,
    private adapterRegistry: AdapterRegistry<ILLMClientAdapter, ApiProviderId>,
    logger?: Logger
  ) {
    this.logger = logger ?? createDefaultLogger();
  }

  /**
   * Resolves model information from either a preset ID or provider/model IDs
   *
   * @param options Options containing either presetId or providerId/modelId
   * @returns Resolved model info and settings or error response
   */
  async resolve(
    options: ModelSelectionOptions,
    resolutionOptions: ModelResolutionOptions = {}
  ): Promise<ModelResolution> {
    const detectLocalCapabilities = resolutionOptions.detectLocalCapabilities !== false;

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

      let modelInfo = getModelById(preset.modelId, preset.providerId);
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

      // Overlay detected GGUF capabilities for llama.cpp presets (the server decides
      // which model is actually loaded, regardless of the preset's modelId)
      let adapterPreparationState: unknown;
      if (preset.providerId === 'llamacpp' && detectLocalCapabilities) {
        const detected = await this.detectLlamaCppCapabilities(
          preset.modelId
        );
        if (detected.capabilities) {
          modelInfo = { ...modelInfo, ...detected.capabilities };
        }
        adapterPreparationState = detected.preparationState;
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
        settings,
        ...(adapterPreparationState !== undefined && {
          adapterPreparationState,
        }),
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

    // For llamacpp, try to detect the loaded GGUF model's capabilities from the
    // adapter. This runs even when the registry lookup succeeded (the documented
    // `modelId: 'llamacpp'` usage matches the generic registry entry): the server
    // decides which model is actually loaded, so detected capabilities and vendor
    // default settings must overlay whatever the registry says.
    let detectedCapabilities: Partial<ModelInfo> | undefined;
    let adapterPreparationState: unknown;
    if (options.providerId === 'llamacpp' && detectLocalCapabilities) {
      const detected = await this.detectLlamaCppCapabilities(
        options.modelId
      );
      detectedCapabilities = detected.capabilities;
      adapterPreparationState = detected.preparationState;
    }

    if (modelInfo) {
      if (detectedCapabilities) {
        // Overlay detected capabilities onto the registry entry (detection wins:
        // it reflects the model actually loaded on the server)
        modelInfo = { ...modelInfo, ...detectedCapabilities };
      }
    } else {
      // Check if provider allows unknown models
      const provider = getProviderById(options.providerId);

      // Unknown OpenRouter models: assume reasoning-capable (optimistic). OpenRouter
      // ignores the reasoning param for models that don't support it, and rejecting
      // here would block reasoning on all unregistered OpenRouter models.
      if (options.providerId === 'openrouter' && !detectedCapabilities) {
        detectedCapabilities = {
          reasoning: {
            supported: true,
            enabledByDefault: false,
            canDisable: true,
          },
        };
      }

      if (provider?.allowUnknownModels) {
        // Flexible provider (e.g., llamacpp) - silent fallback with detected capabilities
        modelInfo = createFallbackModelInfo(options.modelId, options.providerId, detectedCapabilities);
      } else {
        // Strict provider - warn but allow
        this.logger.warn(
          `Unknown model "${options.modelId}" for provider "${options.providerId}". ` +
          `Using default settings. This may fail at the provider API if the model doesn't exist.`
        );
        modelInfo = createFallbackModelInfo(options.modelId, options.providerId, detectedCapabilities);
      }
    }

    return {
      providerId: options.providerId,
      modelId: options.modelId,
      modelInfo,
      settings: options.settings,
      ...(adapterPreparationState !== undefined && {
        adapterPreparationState,
      }),
    };
  }

  /**
   * Asks the llama.cpp adapter which GGUF model the server has loaded and returns
   * its detected capabilities (cached inside the adapter). Returns undefined when
   * the server is unreachable or the model is not recognized.
   */
  private async detectLlamaCppCapabilities(
    modelId?: string
  ): Promise<{
    capabilities?: Partial<ModelInfo>;
    preparationState?: unknown;
  }> {
    try {
      const adapter = this.adapterRegistry.getAdapter('llamacpp') as any;
      if (
        adapter &&
        typeof adapter.getPreparationSnapshot === "function"
      ) {
        const snapshot = await adapter.getPreparationSnapshot(modelId);
        return {
          capabilities: snapshot.detectedCaps || undefined,
          preparationState: snapshot,
        };
      }
      if (adapter && typeof adapter.getModelCapabilities === 'function') {
        const capabilities = await adapter.getModelCapabilities(modelId);
        return { capabilities: capabilities || undefined };
      }
    } catch (error) {
      this.logger.warn('Failed to detect GGUF model capabilities:', error);
    }
    return {};
  }
}
