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
import { extractInitialTaggedContent, parseRoleTags, parseTemplateWithMetadata } from "../prompting/parser";

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
 * Result from createMessages method
 */
export interface CreateMessagesResult {
  /** The parsed messages with role assignments */
  messages: LLMMessage[];
  /** Model context variables that were injected during template rendering */
  modelContext: ModelContext | null;
  /** Settings extracted from the template's <META> block */
  settings: Partial<LLMSettings>;
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

        // Post-process for thinking extraction
        // This feature extracts content from XML tags (e.g., <thinking>) and moves it to the reasoning field.
        // It also enforces that reasoning happens either via native reasoning OR via explicit thinking tags.
        if (result.object === 'chat.completion' && internalRequest.settings.thinkingExtraction?.enabled) {
          const settings = internalRequest.settings.thinkingExtraction;
          const tagName = settings.tag || 'thinking';

          // Step 1: Resolve the effective onMissing strategy
          // The 'auto' mode intelligently decides whether to be strict or lenient based on model capabilities
          let effectiveOnMissing = settings.onMissing || 'auto';
          if (effectiveOnMissing === 'auto') {
            // Check if native reasoning is active for this request
            // If yes, we're lenient (ignore missing tags) since the model is already thinking natively
            // If no, we're strict (error on missing tags) since we explicitly asked for thinking tags
            const isNativeReasoningActive =
              modelInfo!.reasoning?.supported === true &&
              (internalRequest.settings.reasoning?.enabled === true ||
               (modelInfo!.reasoning?.enabledByDefault === true &&
                internalRequest.settings.reasoning?.enabled !== false) || // Only if not explicitly disabled
               modelInfo!.reasoning?.canDisable === false); // Always-on models

            // Auto mode: strict for non-reasoning models, lenient for reasoning models
            effectiveOnMissing = isNativeReasoningActive ? 'ignore' : 'error';
          }

          // Step 2: Process the response
          // Extract thinking tags from the response and move to the reasoning field
          const choice = result.choices[0];
          if (choice?.message?.content) {
            const { extracted, remaining } = extractInitialTaggedContent(choice.message.content, tagName);

            if (extracted !== null) {
              // Success: thinking tag found
              console.log(`Extracted <${tagName}> block from response.`);

              // Handle the edge case: append to existing reasoning if present (e.g., native reasoning + thinking tags)
              const existingReasoning = choice.reasoning || '';

              // Only add a separator when appending to existing reasoning
              if (existingReasoning) {
                // Use a neutral markdown header that works for any consumer (human or AI)
                choice.reasoning = `${existingReasoning}\n\n#### Additional Reasoning\n\n${extracted}`;
              } else {
                // No existing reasoning, just use the extracted content directly
                choice.reasoning = extracted;
              }
              choice.message.content = remaining;
            } else {
              // Tag was not found - enforce the effective strategy
              // This is where we catch models that didn't follow the thinking tag instructions
              if (effectiveOnMissing === 'error') {
                return {
                  provider: providerId!,
                  model: modelId!,
                  error: {
                    message: `The model (${modelId}) response was expected to start with a <${tagName}> tag but it was not found. ` +
                             `This is enforced because the model does not have native reasoning active. ` +
                             `Either ensure your prompt instructs the model to use <${tagName}> tags, or enable native reasoning if supported.`,
                    code: "MISSING_EXPECTED_TAG",
                    type: "validation_error",
                  },
                  object: "error",
                  partialResponse: {
                    id: result.id,
                    provider: result.provider,
                    model: result.model,
                    created: result.created,
                    choices: result.choices,
                    usage: result.usage
                  }
                };
              } else if (effectiveOnMissing === 'warn') {
                console.warn(`Expected <${tagName}> tag was not found in the response from model ${modelId}.`);
              }
              // If 'ignore', do nothing
            }
          }
        }

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
   * Creates messages from a template with role tags and model-aware variable substitution
   *
   * This unified method combines the functionality of template rendering, model context
   * injection, and role tag parsing into a single, intuitive API. It replaces the need
   * to chain prepareMessage and buildMessagesFromTemplate for model-aware multi-turn prompts.
   *
   * **Model Context Injection:**
   * When a presetId or providerId/modelId is provided, this method automatically injects
   * model context variables into your templates:
   * - `thinking_enabled`: Whether native reasoning is currently active
   * - `thinking_available`: Whether the model supports native reasoning
   * - `model_id`, `provider_id`, `reasoning_effort`, `reasoning_max_tokens`
   *
   * **Best Practice for Thinking Tags:**
   * When adding thinking tag instructions, always use !thinking_enabled (NOT operator):
   * `{{ !thinking_enabled ? ' Write your reasoning in <thinking> tags first.' : '' }}`
   *
   * @param options Options for creating messages
   * @returns Promise resolving to parsed messages, model context, and template settings
   *
   * @example
   * ```typescript
   * // Basic usage
   * const { messages } = await llm.createMessages({
   *   template: `
   *     <SYSTEM>You are a helpful assistant.</SYSTEM>
   *     <USER>Help me with {{ task }}</USER>
   *   `,
   *   variables: { task: 'understanding async/await' },
   *   presetId: 'openai-gpt-4.1-default'
   * });
   *
   * // Model-aware template with thinking tags
   * const { messages, modelContext } = await llm.createMessages({
   *   template: `
   *     <SYSTEM>
   *       You are a problem-solving assistant.
   *       {{ !thinking_enabled ? ' For complex problems, write your reasoning in <thinking> tags first.' : '' }}
   *     </SYSTEM>
   *     <USER>{{ question }}</USER>
   *   `,
   *   variables: { question: 'Explain recursion' },
   *   presetId: 'anthropic-claude-3-7-sonnet-20250219-thinking'
   * });
   * ```
   */
  async createMessages(options: {
    template: string;
    variables?: Record<string, any>;
    presetId?: string;
    providerId?: string;
    modelId?: string;
  }): Promise<CreateMessagesResult> {
    console.log('LLMService.createMessages called');

    // NEW: Step 1 - Parse the template for metadata and content
    const { metadata, content: templateContent } = parseTemplateWithMetadata(options.template);
    // Validate the settings from the template
    const templateSettings = this.settingsManager.validateTemplateSettings(metadata.settings || {});

    // Step 2: Get model context if model information is provided
    let modelContext: ModelContext | null = null;
    
    if (options.presetId || (options.providerId && options.modelId)) {
      // Resolve model information
      const resolved = this.modelResolver.resolve({
        presetId: options.presetId,
        providerId: options.providerId as ApiProviderId,
        modelId: options.modelId
      });
      
      if (resolved.error) {
        // If resolution fails, proceed without model context
        console.warn('Model resolution failed, proceeding without model context:', resolved.error);
      } else {
        const { providerId, modelId, modelInfo, settings } = resolved;
        
        // Merge settings with model defaults
        const mergedSettings = this.settingsManager.mergeSettingsForModel(
          modelId!,
          providerId!,
          settings || {}
        );
        
        // Create model context
        modelContext = {
          thinking_enabled: !!(modelInfo!.reasoning?.supported && 
                              (mergedSettings.reasoning?.enabled === true ||
                               (modelInfo!.reasoning?.enabledByDefault && mergedSettings.reasoning?.enabled !== false))),
          thinking_available: !!modelInfo!.reasoning?.supported,
          model_id: modelId!,
          provider_id: providerId!,
          reasoning_effort: mergedSettings.reasoning?.effort,
          reasoning_max_tokens: mergedSettings.reasoning?.maxTokens,
        };
      }
    }

    // Step 2: Combine variables with model context
    // Model context comes first so user variables can override
    const allVariables = {
      ...(modelContext || {}),
      ...options.variables
    };

    // Step 3: Render the template with all variables
    let renderedTemplate: string;
    try {
      // Use templateContent which is the template without the <META> block
      renderedTemplate = renderTemplate(templateContent, allVariables);
    } catch (error) {
      throw new Error(`Template rendering failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // Step 4: Parse role tags from the rendered template
    const parsedMessages = parseRoleTags(renderedTemplate);

    // Step 5: Convert to LLMMessage format
    const messages: LLMMessage[] = parsedMessages.map(({ role, content }) => ({
      role: role as 'system' | 'user' | 'assistant',
      content
    }));

    return {
      messages,
      modelContext,
      settings: templateSettings // NEW: Add the extracted settings
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