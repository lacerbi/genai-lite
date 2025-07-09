// AI Summary: Main process service for LLM operations, integrating with ApiKeyProvider for secure key access.
// Orchestrates LLM requests through provider-specific client adapters with proper error handling.

import type { ApiKeyProvider } from '../types';
import type {
  LLMChatRequest,
  LLMChatRequestWithPreset,
  LLMResponse,
  LLMFailureResponse,
  ProviderInfo,
  ModelInfo,
  ApiProviderId,
  LLMSettings,
  PrepareMessageOptions,
  PrepareMessageResult,
  ModelContext,
  LLMMessage,
} from "./types";
import type {
  ILLMClientAdapter,
  InternalLLMChatRequest,
} from "./clients/types";
import type { ModelPreset } from "../types/presets";
import { MockClientAdapter } from "./clients/MockClientAdapter";
import { OpenAIClientAdapter } from "./clients/OpenAIClientAdapter";
import { AnthropicClientAdapter } from "./clients/AnthropicClientAdapter";
import {
  SUPPORTED_PROVIDERS,
  SUPPORTED_MODELS,
  DEFAULT_LLM_SETTINGS,
  ADAPTER_CONSTRUCTORS,
  ADAPTER_CONFIGS,
  getProviderById,
  getModelById,
  getModelsByProvider,
  isProviderSupported,
  isModelSupported,
  getDefaultSettingsForModel,
  validateLLMSettings,
} from "./config";
import defaultPresets from "../config/presets.json";
import { renderTemplate } from "../prompting/template";

/**
 * Defines how custom presets interact with the default presets.
 * 'replace': Use only the custom presets provided. The default set is ignored.
 * 'extend': Use the default presets, and add/override them with the custom presets. This is the default behavior.
 */
export type PresetMode = 'replace' | 'extend';

/**
 * Options for configuring the LLMService
 */
export interface LLMServiceOptions {
  /** An array of custom presets to integrate. */
  presets?: ModelPreset[];
  /** The strategy for integrating custom presets. Defaults to 'extend'. */
  presetMode?: PresetMode;
}

/**
 * Main process service for LLM operations
 *
 * This service:
 * - Manages LLM provider client adapters
 * - Integrates with ApiKeyServiceMain for secure API key access
 * - Validates requests and applies default settings
 * - Routes requests to appropriate provider adapters
 * - Handles errors and provides standardized responses
 * - Provides configurable model presets for common use cases
 */
export class LLMService {
  private getApiKey: ApiKeyProvider;
  private clientAdapters: Map<ApiProviderId, ILLMClientAdapter>;
  private mockClientAdapter: MockClientAdapter;
  private presets: ModelPreset[];

  constructor(getApiKey: ApiKeyProvider, options: LLMServiceOptions = {}) {
    this.getApiKey = getApiKey;
    this.clientAdapters = new Map();
    this.mockClientAdapter = new MockClientAdapter();

    // Initialize presets based on mode
    const finalPresets = new Map<string, ModelPreset>();
    const customPresets = options.presets || [];
    const mode = options.presetMode || 'extend';

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

    // Dynamically register client adapters based on configuration
    let registeredCount = 0;
    const successfullyRegisteredProviders: ApiProviderId[] = [];

    for (const provider of SUPPORTED_PROVIDERS) {
      const AdapterClass = ADAPTER_CONSTRUCTORS[provider.id];
      if (AdapterClass) {
        try {
          const adapterConfig = ADAPTER_CONFIGS[provider.id];
          const adapterInstance = new AdapterClass(adapterConfig);
          this.registerClientAdapter(provider.id, adapterInstance);
          registeredCount++;
          successfullyRegisteredProviders.push(provider.id);
        } catch (error) {
          console.error(
            `LLMService: Failed to instantiate adapter for provider '${provider.id}'. This provider will use the mock adapter. Error:`,
            error
          );
        }
      } else {
        console.warn(
          `LLMService: No adapter constructor found for supported provider '${provider.id}'. This provider will use the mock adapter as a fallback.`
        );
      }
    }

    if (registeredCount > 0) {
      console.log(
        `LLMService: Initialized with ${registeredCount} dynamically registered adapter(s) for: ${successfullyRegisteredProviders.join(
          ", "
        )}.`
      );
    } else {
      console.log(
        `LLMService: No real adapters were dynamically registered. All providers will use the mock adapter.`
      );
    }
  }

  /**
   * Gets list of supported LLM providers
   *
   * @returns Promise resolving to array of provider information
   */
  async getProviders(): Promise<ProviderInfo[]> {
    console.log("LLMService.getProviders called");
    return [...SUPPORTED_PROVIDERS]; // Return a copy to prevent external modification
  }

  /**
   * Gets list of supported models for a specific provider
   *
   * @param providerId - The provider ID to get models for
   * @returns Promise resolving to array of model information
   */
  async getModels(providerId: ApiProviderId): Promise<ModelInfo[]> {
    console.log(`LLMService.getModels called for provider: ${providerId}`);

    // Validate provider exists
    if (!isProviderSupported(providerId)) {
      console.warn(`Requested models for unsupported provider: ${providerId}`);
      return [];
    }

    const models = getModelsByProvider(providerId);
    console.log(`Found ${models.length} models for provider: ${providerId}`);

    return [...models]; // Return a copy to prevent external modification
  }

  /**
   * Sends a chat message to an LLM provider
   *
   * @param request - The LLM chat request
   * @returns Promise resolving to either success or failure response
   */
  async sendMessage(
    request: LLMChatRequest | LLMChatRequestWithPreset
  ): Promise<LLMResponse | LLMFailureResponse> {
    console.log(
      `LLMService.sendMessage called with presetId: ${(request as LLMChatRequestWithPreset).presetId}, provider: ${request.providerId}, model: ${request.modelId}`
    );

    try {
      // Resolve model information from preset or direct IDs
      const resolved = this.resolveModelInfo(request);
      if (resolved.error) {
        return resolved.error;
      }

      const { providerId, modelId, modelInfo, settings: resolvedSettings } = resolved;

      // Create a proper LLMChatRequest with resolved values
      const resolvedRequest: LLMChatRequest = {
        ...request,
        providerId: providerId!,
        modelId: modelId!,
      };

      // Provider and model validation already done by resolveModelInfo

      // Validate basic request structure
      const structureValidationResult = this.validateRequestStructure(resolvedRequest);
      if (structureValidationResult) {
        return structureValidationResult;
      }

      // Validate settings if provided  
      const combinedSettings = { ...resolvedSettings, ...request.settings };
      if (combinedSettings) {
        const settingsValidationErrors = validateLLMSettings(combinedSettings);
        if (settingsValidationErrors.length > 0) {
          return {
            provider: providerId!,
            model: modelId!,
            error: {
              message: `Invalid settings: ${settingsValidationErrors.join(
                ", "
              )}`,
              code: "INVALID_SETTINGS",
              type: "validation_error",
            },
            object: "error",
          };
        }
      }

      // Apply model-specific defaults and merge with user settings
      const finalSettings = this.mergeSettingsForModel(
        modelId!,
        providerId!,
        combinedSettings
      );

      // Validate reasoning settings for model capabilities
      const reasoningValidation = this.validateReasoningSettings(
        modelInfo!,
        finalSettings.reasoning,
        resolvedRequest
      );
      if (reasoningValidation) {
        return reasoningValidation;
      }

      // Filter out unsupported parameters based on model and provider configuration
      let filteredSettings = { ...finalSettings }; // Create a mutable copy

      // Get provider info for parameter filtering (modelInfo is already available from earlier validation)
      const providerInfo = getProviderById(providerId!);

      const paramsToExclude = new Set<keyof LLMSettings>();

      // Add provider-level exclusions
      if (providerInfo?.unsupportedParameters) {
        providerInfo.unsupportedParameters.forEach((param: keyof LLMSettings) =>
          paramsToExclude.add(param)
        );
      }
      // Add model-level exclusions (these will be added to any provider-level ones)
      if (modelInfo?.unsupportedParameters) {
        modelInfo.unsupportedParameters.forEach((param: keyof LLMSettings) =>
          paramsToExclude.add(param)
        );
      }

      if (paramsToExclude.size > 0) {
        console.log(
          `LLMService: Potential parameters to exclude for provider '${providerId}', model '${modelId}':`,
          Array.from(paramsToExclude)
        );
      }

      paramsToExclude.forEach((param) => {
        // Check if the parameter key actually exists in filteredSettings before trying to delete
        // (it might have been undefined initially and thus not part of finalSettings depending on merge logic)
        // Using 'in' operator is robust for checking presence of properties, including those from prototype chain.
        // For direct properties of an object, hasOwnProperty is more specific.
        // Given finalSettings is Required<LLMSettings>, all keys should be present, potentially as undefined.
        if (param in filteredSettings) {
          console.log(
            `LLMService: Removing excluded parameter '${String(
              param
            )}' for provider '${providerId}', model '${
              modelId
            }'. Value was:`,
            filteredSettings[param]
          );
          delete (filteredSettings as Partial<LLMSettings>)[param]; // Cast to allow deletion
        } else {
          // This case should ideally not happen if finalSettings truly is Required<LLMSettings>
          // and mergeSettingsForModel ensures all keys are present (even if undefined).
          console.log(
            `LLMService: Parameter '${String(
              param
            )}' marked for exclusion was not found in settings for provider '${
              providerId
            }', model '${modelId}'.`
          );
        }
      });

      // Handle reasoning settings for models that don't support it
      // This happens after validateReasoningSettings so we know it's safe to strip
      if (!modelInfo!.reasoning?.supported && filteredSettings.reasoning) {
        console.log(
          `LLMService: Removing reasoning settings for non-reasoning model ${modelId}`
        );
        delete (filteredSettings as Partial<LLMSettings>).reasoning;
      }

      const internalRequest: InternalLLMChatRequest = {
        ...resolvedRequest,
        settings: filteredSettings,
      };

      console.log(
        `Processing LLM request with (potentially filtered) settings:`,
        {
          provider: providerId,
          model: modelId,
          settings: filteredSettings,
          messageCount: resolvedRequest.messages.length,
        }
      );

      console.log(
        `Processing LLM request: ${resolvedRequest.messages.length} messages, model: ${modelId}`
      );

      // Get client adapter
      const clientAdapter = this.getClientAdapter(providerId!);

      // Use ApiKeyProvider to get the API key and make the request
      try {
        const apiKey = await this.getApiKey(providerId!);
        if (!apiKey) {
          return {
            provider: providerId!,
            model: modelId!,
            error: {
              message: `API key for provider '${providerId}' could not be retrieved. Ensure your ApiKeyProvider is configured correctly.`,
              code: "API_KEY_ERROR",
              type: "authentication_error",
            },
            object: "error",
          };
        }

        console.log(
          `Making LLM request with ${clientAdapter.constructor.name} for provider: ${providerId}`
        );
        const result = await clientAdapter.sendMessage(internalRequest, apiKey);

        console.log(
          `LLM request completed successfully for model: ${modelId}`
        );
        return result;
      } catch (error) {
        console.error("Error in LLMService.sendMessage:", error);
        return {
          provider: providerId!,
          model: modelId!,
          error: {
            message:
              error instanceof Error
                ? error.message
                : "An unknown error occurred during message sending.",
            code: "PROVIDER_ERROR",
            type: "server_error",
            providerError: error,
          },
          object: "error",
        };
      }
    } catch (error) {
      console.error("Error in LLMService.sendMessage (outer):", error);

      return {
        provider: request.providerId || (request as LLMChatRequestWithPreset).presetId || 'unknown',
        model: request.modelId || (request as LLMChatRequestWithPreset).presetId || 'unknown',
        error: {
          message:
            error instanceof Error
              ? error.message
              : "An unknown error occurred.",
          code: "UNEXPECTED_ERROR",
          type: "server_error",
          providerError: error,
        },
        object: "error",
      };
    }
  }

  /**
   * Validates basic LLM request structure
   *
   * @param request - The request to validate
   * @returns LLMFailureResponse if validation fails, null if valid
   */
  private validateRequestStructure(
    request: LLMChatRequest | LLMChatRequestWithPreset
  ): LLMFailureResponse | null {
    // Basic request structure validation
    if (
      !request.messages ||
      !Array.isArray(request.messages) ||
      request.messages.length === 0
    ) {
      return {
        provider: request.providerId || (request as LLMChatRequestWithPreset).presetId || 'unknown',
        model: request.modelId || (request as LLMChatRequestWithPreset).presetId || 'unknown',
        error: {
          message: "Request must contain at least one message",
          code: "INVALID_REQUEST",
          type: "validation_error",
        },
        object: "error",
      };
    }

    // Validate message structure
    for (let i = 0; i < request.messages.length; i++) {
      const message = request.messages[i];
      if (!message.role || !message.content) {
        return {
          provider: request.providerId || ('presetId' in request ? request.presetId : undefined) || 'unknown',
          model: request.modelId || ('presetId' in request ? request.presetId : undefined) || 'unknown',
          error: {
            message: `Message at index ${i} must have both 'role' and 'content' properties`,
            code: "INVALID_MESSAGE",
            type: "validation_error",
          },
          object: "error",
        };
      }

      if (!["user", "assistant", "system"].includes(message.role)) {
        return {
          provider: request.providerId || ('presetId' in request ? request.presetId : undefined) || 'unknown',
          model: request.modelId || ('presetId' in request ? request.presetId : undefined) || 'unknown',
          error: {
            message: `Invalid message role '${message.role}' at index ${i}. Must be 'user', 'assistant', or 'system'`,
            code: "INVALID_MESSAGE_ROLE",
            type: "validation_error",
          },
          object: "error",
        };
      }
    }

    return null; // Request is valid
  }

  /**
   * Validates reasoning settings against model capabilities
   *
   * @param modelInfo - The model information
   * @param reasoning - The reasoning settings to validate
   * @param request - The original request for error context
   * @returns LLMFailureResponse if validation fails, null if valid
   */
  private validateReasoningSettings(
    modelInfo: ModelInfo,
    reasoning: LLMSettings['reasoning'],
    request: LLMChatRequest
  ): LLMFailureResponse | null {
    // If no reasoning settings provided, nothing to validate
    if (!reasoning) {
      return null;
    }

    // If model doesn't support reasoning
    if (!modelInfo.reasoning?.supported) {
      // Check if user is trying to enable reasoning
      const tryingToEnableReasoning = 
        reasoning.enabled === true ||
        reasoning.effort !== undefined ||
        (reasoning.maxTokens !== undefined && reasoning.maxTokens > 0);
      
      if (tryingToEnableReasoning) {
        return {
          provider: request.providerId!,
          model: request.modelId!,
          error: {
            message: `Model ${request.modelId} does not support reasoning/thinking`,
            type: 'validation_error',
            code: 'reasoning_not_supported'
          },
          object: 'error'
        };
      }
      // Otherwise, user is explicitly disabling reasoning - this is fine
      // The reasoning settings will be stripped later
    }

    return null;
  }

  /**
   * Merges request settings with model-specific and global defaults
   *
   * @param modelId - The model ID to get defaults for
   * @param providerId - The provider ID to get defaults for
   * @param requestSettings - Settings from the request
   * @returns Complete settings object with all required fields
   */
  private mergeSettingsForModel(
    modelId: string,
    providerId: ApiProviderId,
    requestSettings?: Partial<LLMSettings>
  ): Required<LLMSettings> {
    // Get model-specific defaults
    const modelDefaults = getDefaultSettingsForModel(modelId, providerId);

    // Merge with user-provided settings (user settings take precedence)
    const mergedSettings: Required<LLMSettings> = {
      temperature: requestSettings?.temperature ?? modelDefaults.temperature,
      maxTokens: requestSettings?.maxTokens ?? modelDefaults.maxTokens,
      topP: requestSettings?.topP ?? modelDefaults.topP,
      stopSequences:
        requestSettings?.stopSequences ?? modelDefaults.stopSequences,
      frequencyPenalty:
        requestSettings?.frequencyPenalty ?? modelDefaults.frequencyPenalty,
      presencePenalty:
        requestSettings?.presencePenalty ?? modelDefaults.presencePenalty,
      user: requestSettings?.user ?? modelDefaults.user,
      supportsSystemMessage:
        requestSettings?.supportsSystemMessage ??
        modelDefaults.supportsSystemMessage,
      geminiSafetySettings:
        requestSettings?.geminiSafetySettings ??
        modelDefaults.geminiSafetySettings,
      reasoning: {
        ...modelDefaults.reasoning,
        ...requestSettings?.reasoning,
      },
    };

    // Log the final settings for debugging
    console.log(`Merged settings for ${providerId}/${modelId}:`, {
      temperature: mergedSettings.temperature,
      maxTokens: mergedSettings.maxTokens,
      topP: mergedSettings.topP,
      hasStopSequences: mergedSettings.stopSequences.length > 0,
      frequencyPenalty: mergedSettings.frequencyPenalty,
      presencePenalty: mergedSettings.presencePenalty,
      hasUser: !!mergedSettings.user,
      geminiSafetySettingsCount: mergedSettings.geminiSafetySettings.length,
      reasoning: mergedSettings.reasoning,
    });

    return mergedSettings;
  }

  /**
   * Gets the appropriate client adapter for a provider
   *
   * @param providerId - The provider ID
   * @returns The client adapter to use
   */
  private getClientAdapter(providerId: ApiProviderId): ILLMClientAdapter {
    // Check for registered real adapters first
    const registeredAdapter = this.clientAdapters.get(providerId);
    if (registeredAdapter) {
      console.log(`Using registered adapter for provider: ${providerId}`);
      return registeredAdapter;
    }

    // Fall back to mock adapter for unsupported providers
    console.log(`No real adapter found for ${providerId}, using mock adapter`);
    return this.mockClientAdapter;
  }

  /**
   * Registers a client adapter for a specific provider
   *
   * @param providerId - The provider ID
   * @param adapter - The client adapter implementation
   */
  registerClientAdapter(
    providerId: ApiProviderId,
    adapter: ILLMClientAdapter
  ): void {
    this.clientAdapters.set(providerId, adapter);
    console.log(`Registered client adapter for provider: ${providerId}`);
  }

  /**
   * Gets information about registered adapters
   *
   * @returns Map of provider IDs to adapter info
   */
  getRegisteredAdapters(): Map<ApiProviderId, any> {
    const adapterInfo = new Map();

    for (const [providerId, adapter] of this.clientAdapters.entries()) {
      adapterInfo.set(providerId, {
        providerId,
        hasAdapter: true,
        adapterInfo: adapter.getAdapterInfo?.() || { name: "Unknown Adapter" },
      });
    }

    return adapterInfo;
  }

  /**
   * Gets a summary of available providers and their adapter status
   *
   * @returns Summary of provider availability
   */
  getProviderSummary(): {
    totalProviders: number;
    providersWithAdapters: number;
    availableProviders: string[];
    unavailableProviders: string[];
  } {
    const availableProviders: string[] = [];
    const unavailableProviders: string[] = [];

    for (const provider of SUPPORTED_PROVIDERS) {
      if (this.clientAdapters.has(provider.id)) {
        availableProviders.push(provider.id);
      } else {
        unavailableProviders.push(provider.id);
      }
    }

    return {
      totalProviders: SUPPORTED_PROVIDERS.length,
      providersWithAdapters: availableProviders.length,
      availableProviders,
      unavailableProviders,
    };
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
   * Resolves model information from either a preset ID or provider/model IDs
   * 
   * @private
   * @param options Options containing either presetId or providerId/modelId
   * @returns Resolved model info and settings or error response
   */
  private resolveModelInfo(options: {
    presetId?: string;
    providerId?: string;
    modelId?: string;
    settings?: LLMSettings;
  }): {
    providerId?: string;
    modelId?: string;
    modelInfo?: ModelInfo;
    settings?: LLMSettings;
    error?: LLMFailureResponse;
  } {
    // If presetId is provided, use it
    if (options.presetId) {
      const preset = this.presets.find(p => p.id === options.presetId);
      if (!preset) {
        return {
          error: {
            provider: 'unknown',
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
            provider: preset.providerId,
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
          provider: options.providerId || 'unknown',
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
          provider: options.providerId,
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

    const modelInfo = getModelById(options.modelId, options.providerId);
    if (!modelInfo) {
      return {
        error: {
          provider: options.providerId,
          model: options.modelId,
          error: {
            message: `Unsupported model: ${options.modelId} for provider: ${options.providerId}`,
            code: 'UNSUPPORTED_MODEL',
            type: 'validation_error',
          },
          object: 'error',
        }
      };
    }

    return {
      providerId: options.providerId,
      modelId: options.modelId,
      modelInfo,
      settings: options.settings
    };
  }

  /**
   * Prepares messages with model context for template rendering
   * 
   * This method resolves model information from either a preset or direct provider/model IDs,
   * then renders a template with model context variables injected, or returns pre-built messages
   * with the model context separately.
   * 
   * @param options Options for preparing messages
   * @returns Promise resolving to prepared messages and model context
   * 
   * @example
   * ```typescript
   * const { messages } = await llm.prepareMessage({
   *   template: 'Help me {{ thinking_enabled ? "think through" : "solve" }} this: {{ problem }}',
   *   variables: { problem: 'complex algorithm' },
   *   presetId: 'anthropic-claude-3-7-sonnet-20250219-thinking'
   * });
   * ```
   */
  async prepareMessage(options: PrepareMessageOptions): Promise<PrepareMessageResult | LLMFailureResponse> {
    console.log('LLMService.prepareMessage called');

    // Validate input
    if (!options.template && !options.messages) {
      return {
        provider: 'unknown',
        model: 'unknown',
        error: {
          message: 'Either template or messages must be provided',
          code: 'INVALID_INPUT',
          type: 'validation_error',
        },
        object: 'error',
      };
    }

    // Resolve model information
    const resolved = this.resolveModelInfo(options);
    if (resolved.error) {
      return resolved.error;
    }

    const { providerId, modelId, modelInfo, settings } = resolved;

    // Merge settings with model defaults
    const mergedSettings = this.mergeSettingsForModel(
      modelId!,
      providerId!,
      settings
    );

    // Create model context
    const modelContext: ModelContext = {
      thinking_enabled: !!(modelInfo!.reasoning?.supported && 
                          (mergedSettings.reasoning?.enabled === true ||
                           (modelInfo!.reasoning?.enabledByDefault && mergedSettings.reasoning?.enabled !== false))),
      thinking_available: !!modelInfo!.reasoning?.supported,
      model_id: modelId!,
      provider_id: providerId!,
      reasoning_effort: mergedSettings.reasoning?.effort,
      reasoning_max_tokens: mergedSettings.reasoning?.maxTokens,
    };

    // Prepare messages
    let messages: LLMMessage[];
    
    if (options.template) {
      // Render template with variables and model context
      const allVariables = {
        ...options.variables,
        ...modelContext, // Inject model context at root level
      };

      try {
        const content = renderTemplate(options.template, allVariables);
        messages = [{ role: 'user', content }];
      } catch (error) {
        return {
          provider: providerId!,
          model: modelId!,
          error: {
            message: `Template rendering failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
            code: 'TEMPLATE_ERROR',
            type: 'validation_error',
          },
          object: 'error',
        };
      }
    } else {
      // Use pre-built messages
      messages = options.messages!;
    }

    return {
      messages,
      modelContext,
    };
  }
}
