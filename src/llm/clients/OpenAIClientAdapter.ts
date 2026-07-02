// AI Summary: OpenAI client adapter for making real API calls to OpenAI's chat completions endpoint.
// Handles request formatting, response parsing, and error mapping to standardized format.

import OpenAI from "openai";
import type { LLMResponse, LLMFailureResponse } from "../types";
import type {
  ILLMClientAdapter,
  InternalLLMChatRequest,
  AdapterErrorCode,
} from "./types";
import { ADAPTER_ERROR_CODES } from "./types";
import { getCommonMappedErrorDetails } from "../../shared/adapters/errorUtils";
import { mapOpenAIChatLogprobs } from "../../shared/adapters/logprobsUtils";
import {
  collectSystemContent,
  prependSystemToFirstUserMessage,
} from "../../shared/adapters/systemMessageUtils";
import type { Logger } from "../../logging/types";
import { createDefaultLogger } from "../../logging/defaultLogger";

/**
 * Client adapter for OpenAI API integration
 *
 * This adapter:
 * - Formats requests according to OpenAI's chat completions API
 * - Handles OpenAI-specific authentication and headers
 * - Maps OpenAI responses to standardized LLMResponse format
 * - Converts OpenAI errors to standardized LLMFailureResponse format
 */
export class OpenAIClientAdapter implements ILLMClientAdapter {
  private baseURL?: string;
  private logger: Logger;

  /**
   * Creates a new OpenAI client adapter
   *
   * @param config Optional configuration for the adapter
   * @param config.baseURL Custom base URL for OpenAI-compatible APIs
   * @param config.logger Custom logger instance
   */
  constructor(config?: { baseURL?: string; logger?: Logger }) {
    this.baseURL = config?.baseURL;
    this.logger = config?.logger ?? createDefaultLogger();
  }

  /**
   * Sends a chat message to OpenAI's API
   *
   * @param request - The internal LLM request with applied settings
   * @param apiKey - The decrypted OpenAI API key
   * @returns Promise resolving to success or failure response
   */
  async sendMessage(
    request: InternalLLMChatRequest,
    apiKey: string
  ): Promise<LLMResponse | LLMFailureResponse> {
    try {
      // Initialize OpenAI client
      const openai = new OpenAI({
        apiKey,
        ...(this.baseURL && { baseURL: this.baseURL }),
      });

      // Format messages for OpenAI API
      const messages = this.formatMessages(request);

      // Prepare API call parameters
      const completionParams: OpenAI.Chat.Completions.ChatCompletionCreateParams =
        {
          model: request.modelId,
          messages: messages,
          temperature: request.settings.temperature,
          max_completion_tokens: request.settings.maxTokens,
          top_p: request.settings.topP,
          ...(request.settings.stopSequences.length > 0 && {
            stop: request.settings.stopSequences,
          }),
          ...(request.settings.frequencyPenalty !== 0 && {
            frequency_penalty: request.settings.frequencyPenalty,
          }),
          ...(request.settings.presencePenalty !== 0 && {
            presence_penalty: request.settings.presencePenalty,
          }),
          ...(request.settings.seed !== undefined && {
            seed: request.settings.seed,
          }),
          ...(request.settings.logprobs === true && {
            logprobs: true,
            ...(request.settings.topLogprobs !== undefined && {
              top_logprobs: request.settings.topLogprobs,
            }),
          }),
          ...(request.settings.user && {
            user: request.settings.user,
          }),
        };

      // Handle reasoning configuration for OpenAI models (o-series)
      if (request.settings.reasoning && !request.settings.reasoning.exclude) {
        const reasoning = request.settings.reasoning;

        // OpenAI uses reasoning_effort for o-series models
        if (reasoning.effort) {
          (completionParams as any).reasoning_effort = reasoning.effort;
        } else if (reasoning.enabled !== false) {
          // Default to medium effort if reasoning is enabled
          (completionParams as any).reasoning_effort = 'medium';
        }
      }

      // Handle structured output configuration
      if (request.settings.structuredOutput?.schema && request.settings.structuredOutput.enabled !== false) {
        const so = request.settings.structuredOutput;
        // OpenAI strict mode requires additionalProperties: false on all object schemas
        const processedSchema = so.strict !== false
          ? this.addAdditionalPropertiesFalse(so.schema)
          : so.schema;
        completionParams.response_format = {
          type: 'json_schema',
          json_schema: {
            name: so.name,
            strict: so.strict !== false, // default true
            schema: processedSchema as any,
          }
        } as any;
      }

      this.logger.debug(`OpenAI API parameters:`, {
        model: completionParams.model,
        temperature: completionParams.temperature,
        max_completion_tokens: completionParams.max_completion_tokens,
        top_p: completionParams.top_p,
        hasStop: !!completionParams.stop,
        frequency_penalty: completionParams.frequency_penalty,
        presence_penalty: completionParams.presence_penalty,
        hasUser: !!completionParams.user,
      });

      this.logger.info(`Making OpenAI API call for model: ${request.modelId}`);

      // Make the API call
      const completion = await openai.chat.completions.create(completionParams);

      // Type guard to ensure we have a non-streaming response
      if ('id' in completion && 'choices' in completion) {
        this.logger.info(`OpenAI API call successful, response ID: ${completion.id}`);
        // Convert to standardized response format
        return this.createSuccessResponse(completion as OpenAI.Chat.Completions.ChatCompletion, request);
      } else {
        throw new Error('Unexpected streaming response from OpenAI API');
      }
    } catch (error) {
      this.logger.error("OpenAI API error:", error);
      return this.createErrorResponse(error, request);
    }
  }

  /**
   * Validates OpenAI API key format
   *
   * @param apiKey - The API key to validate
   * @returns True if the key format appears valid
   */
  validateApiKey(apiKey: string): boolean {
    // OpenAI API keys typically start with 'sk-' and are at least 20 characters
    return apiKey.startsWith("sk-") && apiKey.length >= 20;
  }

  /**
   * Gets adapter information
   */
  getAdapterInfo() {
    return {
      providerId: "openai" as const,
      name: "OpenAI Client Adapter",
      version: "1.0.0",
    };
  }

  /**
   * Recursively adds additionalProperties: false to all object schemas
   * Required by OpenAI's strict mode for structured outputs
   *
   * @param schema - The JSON schema to process
   * @returns A new schema with additionalProperties: false on all objects
   */
  private addAdditionalPropertiesFalse(schema: any): any {
    if (!schema || typeof schema !== 'object') {
      return schema;
    }

    const processed: any = { ...schema };

    // If this is an object type, add additionalProperties: false and ensure required includes all properties
    if (processed.type === 'object') {
      processed.additionalProperties = false;

      // Process nested properties
      if (processed.properties) {
        const propertyKeys = Object.keys(schema.properties);
        processed.properties = {};
        for (const [key, value] of Object.entries(schema.properties)) {
          processed.properties[key] = this.addAdditionalPropertiesFalse(value);
        }
        // OpenAI strict mode requires 'required' to include ALL properties
        processed.required = propertyKeys;
      }
    }

    // Process array items
    if (processed.items) {
      processed.items = this.addAdditionalPropertiesFalse(schema.items);
    }

    return processed;
  }

  /**
   * Formats messages for OpenAI API
   *
   * @param request - The internal LLM request
   * @returns Formatted messages array for OpenAI
   */
  private formatMessages(
    request: InternalLLMChatRequest
  ): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];
    const inlineSystemMessages: string[] = [];

    // Check if model supports system messages
    const supportsSystem = request.settings.supportsSystemMessage !== false;

    // Add conversation messages (collecting system messages separately)
    for (const message of request.messages) {
      if (message.role === "system") {
        // Collect inline system messages
        inlineSystemMessages.push(message.content);
      } else if (message.role === "user") {
        messages.push({
          role: "user",
          content: message.content,
        });
      } else if (message.role === "assistant") {
        messages.push({
          role: "assistant",
          content: message.content,
        });
      }
    }

    // Use shared utility to collect and combine system content
    const { combinedSystemContent, useNativeSystemMessage } = collectSystemContent(
      request.systemMessage,
      inlineSystemMessages,
      supportsSystem
    );

    if (combinedSystemContent) {
      if (useNativeSystemMessage) {
        // Model supports system messages - add as system role at the start
        messages.unshift({
          role: "system",
          content: combinedSystemContent,
        });
      } else {
        // Model doesn't support system messages - prepend to first user message
        const simpleMessages = messages.map((m) => ({
          role: m.role,
          content: m.content as string,
        }));
        const modifiedIndex = prependSystemToFirstUserMessage(
          simpleMessages,
          combinedSystemContent,
          request.settings.systemMessageFallback
        );
        if (modifiedIndex !== -1) {
          messages[modifiedIndex].content = simpleMessages[modifiedIndex].content;
          this.logger.debug(
            `Model ${request.modelId} doesn't support system messages - prepended to first user message`
          );
        }
      }
    }

    return messages;
  }

  /**
   * Creates a standardized success response from OpenAI's response
   *
   * @param completion - Raw OpenAI completion response
   * @param request - Original request for context
   * @returns Standardized LLM response
   */
  private createSuccessResponse(
    completion: OpenAI.Chat.Completions.ChatCompletion,
    request: InternalLLMChatRequest
  ): LLMResponse {
    const choice = completion.choices[0];

    if (!choice || !choice.message) {
      throw new Error("Invalid completion structure from OpenAI API");
    }

    const responseChoice: any = {
      message: {
        role: choice.message.role as "assistant",
        content: choice.message.content || "",
      },
      finish_reason: choice.finish_reason,
      index: choice.index,
    };

    // Check for reasoning content if OpenAI starts returning it
    // (Currently o-series models don't return reasoning tokens)
    if ((choice as any).reasoning && request.settings.reasoning && !request.settings.reasoning.exclude) {
      responseChoice.reasoning = (choice as any).reasoning;
    }

    // Per-token log probabilities (when requested via settings.logprobs)
    const logprobs = mapOpenAIChatLogprobs((choice as any).logprobs);
    if (logprobs) {
      responseChoice.logprobs = logprobs;
    }

    return {
      id: completion.id,
      provider: request.providerId,
      model: completion.model || request.modelId,
      created: completion.created,
      choices: [responseChoice],
      usage: completion.usage
        ? {
            prompt_tokens: completion.usage.prompt_tokens,
            completion_tokens: completion.usage.completion_tokens,
            total_tokens: completion.usage.total_tokens,
          }
        : undefined,
      object: "chat.completion",
    };
  }

  /**
   * Creates a standardized error response from OpenAI errors
   *
   * @param error - The error from OpenAI API
   * @param request - Original request for context
   * @returns Standardized LLM failure response
   */
  private createErrorResponse(
    error: any,
    request: InternalLLMChatRequest
  ): LLMFailureResponse {
    // Use shared error mapping utility for common error patterns
    const initialProviderMessage =
      error instanceof OpenAI.APIError ? error.message : undefined;
    let { errorCode, errorMessage, errorType, status } =
      getCommonMappedErrorDetails(error, initialProviderMessage);

    // Apply OpenAI-specific refinements for 400 errors based on message content
    if (error instanceof OpenAI.APIError && status === 400) {
      if (error.message.toLowerCase().includes("context length")) {
        errorCode = ADAPTER_ERROR_CODES.CONTEXT_LENGTH_EXCEEDED;
      } else if (error.message.toLowerCase().includes("content policy")) {
        errorCode = ADAPTER_ERROR_CODES.CONTENT_FILTER;
        errorType = "content_filter_error";
      }
      // For other 400 errors, use the default mapping from the utility (PROVIDER_ERROR)
    }

    return {
      provider: request.providerId,
      model: request.modelId,
      error: {
        message: errorMessage,
        code: errorCode,
        type: errorType,
        ...(status && { status }),
        providerError: error,
      },
      object: "error",
    };
  }
}
