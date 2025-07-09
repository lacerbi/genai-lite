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
import { SUPPORTED_PROVIDERS, getProviderById, getModelsByProvider } from "./config";
import { renderTemplate } from "../prompting/template";

// Import the extracted services
import { PresetManager, type PresetMode } from "./services/PresetManager";
import { AdapterRegistry } from "./services/AdapterRegistry";
import { RequestValidator } from "./services/RequestValidator";
import { SettingsManager } from "./services/SettingsManager";
import { ModelResolver } from "./services/ModelResolver";

// Re-export PresetMode
export type { PresetMode };

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
  private presetManager: PresetManager;
  private adapterRegistry: AdapterRegistry;
  private requestValidator: RequestValidator;
  private settingsManager: SettingsManager;
  private modelResolver: ModelResolver;

  constructor(getApiKey: ApiKeyProvider, options: LLMServiceOptions = {}) {
    this.getApiKey = getApiKey;
    
    // Initialize services
    this.presetManager = new PresetManager(options.presets, options.presetMode);
    this.adapterRegistry = new AdapterRegistry();
    this.requestValidator = new RequestValidator();
    this.settingsManager = new SettingsManager();
    this.modelResolver = new ModelResolver(this.presetManager);
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
    const models = getModelsByProvider(providerId);
    if (models.length === 0) {
      console.warn(`Requested models for unsupported provider: ${providerId}`);
      return [];
    }

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
      const resolved = this.modelResolver.resolve(request);
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

      // Validate basic request structure
      const structureValidationResult = this.requestValidator.validateRequestStructure(resolvedRequest);
      if (structureValidationResult) {
        return structureValidationResult;
      }

      // Validate settings if provided  
      const combinedSettings = { ...resolvedSettings, ...request.settings };
      if (combinedSettings) {
        const settingsValidation = this.requestValidator.validateSettings(
          combinedSettings,
          providerId!,
          modelId!
        );
        if (settingsValidation) {
          return settingsValidation;
        }
      }

      // Apply model-specific defaults and merge with user settings
      const finalSettings = this.settingsManager.mergeSettingsForModel(
        modelId!,
        providerId!,
        combinedSettings
      );

      // Validate reasoning settings for model capabilities
      const reasoningValidation = this.requestValidator.validateReasoningSettings(
        modelInfo!,
        finalSettings.reasoning,
        resolvedRequest
      );
      if (reasoningValidation) {
        return reasoningValidation;
      }

      // Get provider info for parameter filtering
      const providerInfo = getProviderById(providerId!);
      if (!providerInfo) {
        return {
          provider: providerId!,
          model: modelId!,
          error: {
            message: `Provider information not found: ${providerId}`,
            code: "PROVIDER_ERROR",
            type: "server_error",
          },
          object: "error",
        };
      }

      // Filter out unsupported parameters
      const filteredSettings = this.settingsManager.filterUnsupportedParameters(
        finalSettings,
        modelInfo!,
        providerInfo
      );

      const internalRequest: InternalLLMChatRequest = {
        ...resolvedRequest,
        settings: filteredSettings as Required<LLMSettings>,
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

      // Get client adapter
      const clientAdapter = this.adapterRegistry.getAdapter(providerId!);

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
   * Gets all configured model presets
   * 
   * @returns Array of model presets
   */
  getPresets(): ModelPreset[] {
    return this.presetManager.getPresets();
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
    const resolved = this.modelResolver.resolve(options);
    if (resolved.error) {
      return resolved.error;
    }

    const { providerId, modelId, modelInfo, settings } = resolved;

    // Merge settings with model defaults
    const mergedSettings = this.settingsManager.mergeSettingsForModel(
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

  /**
   * Gets information about registered adapters
   *
   * @returns Map of provider IDs to adapter info
   */
  getRegisteredAdapters() {
    return this.adapterRegistry.getRegisteredAdapters();
  }

  /**
   * Gets a summary of available providers and their adapter status
   *
   * @returns Summary of provider availability
   */
  getProviderSummary() {
    return this.adapterRegistry.getProviderSummary();
  }
}