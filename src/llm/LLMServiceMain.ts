// AI Summary: Main process service for LLM operations, integrating with ApiKeyServiceMain for secure key access.
// Orchestrates LLM requests through provider-specific client adapters with proper error handling.

import type { ApiKeyServiceMain } from "genai-key-storage-lite";
import type {
  LLMChatRequest,
  LLMResponse,
  LLMFailureResponse,
  ProviderInfo,
  ModelInfo,
  ApiProviderId,
  LLMSettings,
} from "../types";
import type {
  ILLMClientAdapter,
  InternalLLMChatRequest,
} from "./clients/types";
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

/**
 * Main process service for LLM operations
 *
 * This service:
 * - Manages LLM provider client adapters
 * - Integrates with ApiKeyServiceMain for secure API key access
 * - Validates requests and applies default settings
 * - Routes requests to appropriate provider adapters
 * - Handles errors and provides standardized responses
 */
export class LLMServiceMain {
  private apiKeyService: ApiKeyServiceMain;
  private clientAdapters: Map<ApiProviderId, ILLMClientAdapter>;
  private mockClientAdapter: MockClientAdapter;

  constructor(apiKeyService: ApiKeyServiceMain) {
    this.apiKeyService = apiKeyService;
    this.clientAdapters = new Map();
    this.mockClientAdapter = new MockClientAdapter();

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
            `LLMServiceMain: Failed to instantiate adapter for provider '${provider.id}'. This provider will use the mock adapter. Error:`,
            error
          );
        }
      } else {
        console.warn(
          `LLMServiceMain: No adapter constructor found for supported provider '${provider.id}'. This provider will use the mock adapter as a fallback.`
        );
      }
    }

    if (registeredCount > 0) {
      console.log(
        `LLMServiceMain: Initialized with ${registeredCount} dynamically registered adapter(s) for: ${successfullyRegisteredProviders.join(
          ", "
        )}.`
      );
    } else {
      console.log(
        `LLMServiceMain: No real adapters were dynamically registered. All providers will use the mock adapter.`
      );
    }
  }

  /**
   * Gets list of supported LLM providers
   *
   * @returns Promise resolving to array of provider information
   */
  async getProviders(): Promise<ProviderInfo[]> {
    console.log("LLMServiceMain.getProviders called");
    return [...SUPPORTED_PROVIDERS]; // Return a copy to prevent external modification
  }

  /**
   * Gets list of supported models for a specific provider
   *
   * @param providerId - The provider ID to get models for
   * @returns Promise resolving to array of model information
   */
  async getModels(providerId: ApiProviderId): Promise<ModelInfo[]> {
    console.log(`LLMServiceMain.getModels called for provider: ${providerId}`);

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
    request: LLMChatRequest
  ): Promise<LLMResponse | LLMFailureResponse> {
    console.log(
      `LLMServiceMain.sendMessage called for provider: ${request.providerId}, model: ${request.modelId}`
    );

    try {
      // Validate provider
      if (!isProviderSupported(request.providerId)) {
        console.warn(
          `Unsupported provider in sendMessage: ${request.providerId}`
        );
        return {
          provider: request.providerId,
          model: request.modelId,
          error: {
            message: `Unsupported provider: ${
              request.providerId
            }. Supported providers: ${SUPPORTED_PROVIDERS.map((p) => p.id).join(
              ", "
            )}`,
            code: "UNSUPPORTED_PROVIDER",
            type: "validation_error",
          },
          object: "error",
        };
      }

      // Validate model
      if (!isModelSupported(request.modelId, request.providerId)) {
        const availableModels = getModelsByProvider(request.providerId).map(
          (m) => m.id
        );
        console.warn(
          `Unsupported model ${request.modelId} for provider ${
            request.providerId
          }. Available: ${availableModels.join(", ")}`
        );
        return {
          provider: request.providerId,
          model: request.modelId,
          error: {
            message: `Unsupported model: ${request.modelId} for provider: ${
              request.providerId
            }. Available models: ${availableModels.join(", ")}`,
            code: "UNSUPPORTED_MODEL",
            type: "validation_error",
          },
          object: "error",
        };
      }

      // Get model info for additional validation or settings
      const modelInfo = getModelById(request.modelId, request.providerId);
      if (!modelInfo) {
        // This shouldn't happen if validation above passed, but defensive programming
        console.error(
          `Model info not found for validated model: ${request.modelId}`
        );
        return {
          provider: request.providerId,
          model: request.modelId,
          error: {
            message: `Internal error: Model configuration not found for ${request.modelId}`,
            code: "MODEL_CONFIG_ERROR",
            type: "internal_error",
          },
          object: "error",
        };
      }

      // Validate basic request structure
      const structureValidationResult = this.validateRequestStructure(request);
      if (structureValidationResult) {
        return structureValidationResult;
      }

      // Validate settings if provided
      if (request.settings) {
        const settingsValidationErrors = validateLLMSettings(request.settings);
        if (settingsValidationErrors.length > 0) {
          return {
            provider: request.providerId,
            model: request.modelId,
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
        request.modelId,
        request.providerId,
        request.settings
      );

      // Filter out unsupported parameters based on model and provider configuration
      let filteredSettings = { ...finalSettings }; // Create a mutable copy

      // Get provider info for parameter filtering (modelInfo is already available from earlier validation)
      const providerInfo = getProviderById(request.providerId);

      const paramsToExclude = new Set<keyof LLMSettings>();

      // Add provider-level exclusions
      if (providerInfo?.unsupportedParameters) {
        providerInfo.unsupportedParameters.forEach((param) =>
          paramsToExclude.add(param)
        );
      }
      // Add model-level exclusions (these will be added to any provider-level ones)
      if (modelInfo?.unsupportedParameters) {
        modelInfo.unsupportedParameters.forEach((param) =>
          paramsToExclude.add(param)
        );
      }

      if (paramsToExclude.size > 0) {
        console.log(
          `LLMServiceMain: Potential parameters to exclude for provider '${request.providerId}', model '${request.modelId}':`,
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
            `LLMServiceMain: Removing excluded parameter '${String(
              param
            )}' for provider '${request.providerId}', model '${
              request.modelId
            }'. Value was:`,
            filteredSettings[param]
          );
          delete (filteredSettings as Partial<LLMSettings>)[param]; // Cast to allow deletion
        } else {
          // This case should ideally not happen if finalSettings truly is Required<LLMSettings>
          // and mergeSettingsForModel ensures all keys are present (even if undefined).
          console.log(
            `LLMServiceMain: Parameter '${String(
              param
            )}' marked for exclusion was not found in settings for provider '${
              request.providerId
            }', model '${request.modelId}'.`
          );
        }
      });

      const internalRequest: InternalLLMChatRequest = {
        ...request,
        settings: filteredSettings,
      };

      console.log(
        `Processing LLM request with (potentially filtered) settings:`,
        {
          provider: request.providerId,
          model: request.modelId,
          settings: filteredSettings,
          messageCount: request.messages.length,
        }
      );

      console.log(
        `Processing LLM request: ${request.messages.length} messages, model: ${request.modelId}`
      );

      // Get client adapter - use mock for now, real adapters will be added later
      const clientAdapter = this.getClientAdapter(request.providerId);

      // Use ApiKeyServiceMain to securely access the API key and make the request
      try {
        // First, try to get the key from secure storage.
        console.log(
          `Attempting to use key from secure storage for ${request.providerId}...`
        );
        const result = await this.apiKeyService.withDecryptedKey(
          request.providerId,
          (apiKey: string) => {
            console.log(
              `Making LLM request with ${clientAdapter.constructor.name} for provider: ${request.providerId}`
            );
            return clientAdapter.sendMessage(internalRequest, apiKey);
          }
        );

        console.log(
          `LLM request completed successfully for model: ${request.modelId}`
        );
        return result;
      } catch (storageError) {
        console.warn(
          `Secure storage failed for ${request.providerId}: ${
            storageError instanceof Error
              ? storageError.message
              : String(storageError)
          }. Attempting ENV fallback.`
        );

        // If secure storage fails, try the environment variable.
        const envVarName = `ATHANOR_${request.providerId.toUpperCase()}_API_KEY`;
        const apiKeyFromEnv = process.env[envVarName];

        if (apiKeyFromEnv) {
          console.log(
            `Found key for ${request.providerId} in environment variable.`
          );
          // The sendMessage call to the adapter can also throw, which will be caught by the outer catch block.
          return await clientAdapter.sendMessage(
            internalRequest,
            apiKeyFromEnv
          );
        }

        // If we are here, both methods failed. Re-throw the original error to be handled by the outer catch.
        console.error(
          `API key for ${request.providerId} not found in secure storage or environment variables.`
        );
        throw storageError;
      }
    } catch (error) {
      console.error("Error in LLMServiceMain.sendMessage:", error);

      return {
        provider: request.providerId,
        model: request.modelId,
        error: {
          message:
            error instanceof Error
              ? `API key error for ${request.providerId}: ${
                  error.message
                }. Check secure storage or the ATHANOR_${request.providerId.toUpperCase()}_API_KEY environment variable.`
              : "Unknown error occurred during API key retrieval or message sending.",
          code: "API_KEY_ERROR",
          type: "authentication_error",
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
    request: LLMChatRequest
  ): LLMFailureResponse | null {
    // Basic request structure validation
    if (
      !request.messages ||
      !Array.isArray(request.messages) ||
      request.messages.length === 0
    ) {
      return {
        provider: request.providerId,
        model: request.modelId,
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
          provider: request.providerId,
          model: request.modelId,
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
          provider: request.providerId,
          model: request.modelId,
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
   * Checks if an API key is available from any source (secure storage or ENV).
   * @param providerId The provider ID to check for
   * @returns Promise resolving to true if a key is available, false otherwise.
   */
  async isKeyAvailable(providerId: ApiProviderId): Promise<boolean> {
    if (!providerId) {
      return false;
    }

    // First, check if the key is in the secure OS storage.
    const isStored = await this.apiKeyService.isKeyStored(providerId);
    if (isStored) {
      return true; // Found it in secure storage
    }

    // If not found, check for an environment variable as a fallback.
    const envVarName = `ATHANOR_${providerId.toUpperCase()}_API_KEY`;
    const apiKeyFromEnv = process.env[envVarName];

    // Return true only if the environment variable is set to a non-empty string.
    return !!apiKeyFromEnv;
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
}
