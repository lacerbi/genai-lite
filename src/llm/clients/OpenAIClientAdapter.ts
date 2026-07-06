// AI Summary: OpenAI client adapter for making real API calls to OpenAI's chat completions endpoint.
// Handles request formatting, response parsing, and error mapping to standardized format.

import OpenAI from "openai";
import type { LLMResponse, LLMFailureResponse, LLMStreamEvent } from "../types";
import type {
  ILLMClientAdapter,
  InternalLLMChatRequest,
  AdapterRequestOptions,
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

interface OpenAICompletionRequest {
  openai: OpenAI;
  completionParams: OpenAI.Chat.Completions.ChatCompletionCreateParams;
}

interface OpenAIStreamChoiceState {
  content: string;
  reasoning: string;
  finishReason: string | null;
  logprobs: any[];
}

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
    apiKey: string,
    options?: AdapterRequestOptions
  ): Promise<LLMResponse | LLMFailureResponse> {
    try {
      const { openai, completionParams } = this.prepareCompletionRequest(request, apiKey);

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

      const transportOptions = this.createTransportOptions(options);
      const completion =
        Object.keys(transportOptions).length > 0
          ? await openai.chat.completions.create(completionParams, transportOptions)
          : await openai.chat.completions.create(completionParams);

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

  async *streamMessage(
    request: InternalLLMChatRequest,
    apiKey: string,
    options?: AdapterRequestOptions
  ): AsyncIterable<LLMStreamEvent> {
    const choiceStates = new Map<number, OpenAIStreamChoiceState>();
    let responseId = "";
    let responseModel = request.modelId;
    let created = Math.floor(Date.now() / 1000);
    let usage: OpenAI.Completions.CompletionUsage | undefined;

    try {
      const { openai, completionParams } = this.prepareCompletionRequest(request, apiKey);
      const streamParams = {
        ...completionParams,
        stream: true,
        stream_options: { include_usage: true },
      } as OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming;
      const transportOptions = this.createTransportOptions(options);
      const stream =
        Object.keys(transportOptions).length > 0
          ? await openai.chat.completions.create(streamParams, transportOptions)
          : await openai.chat.completions.create(streamParams);

      let started = false;
      for await (const chunk of stream) {
        responseId = chunk.id || responseId;
        responseModel = chunk.model || responseModel;
        created = chunk.created || created;

        if (!started) {
          started = true;
          yield {
            type: "start",
            provider: request.providerId,
            model: responseModel,
            id: responseId,
            created,
          };
        }

        if (chunk.usage) {
          usage = chunk.usage;
          yield {
            type: "usage",
            usage: {
              prompt_tokens: chunk.usage.prompt_tokens,
              completion_tokens: chunk.usage.completion_tokens,
              total_tokens: chunk.usage.total_tokens,
            },
          };
        }

        for (const choice of chunk.choices || []) {
          const state = this.getStreamChoiceState(choiceStates, choice.index);
          state.finishReason = choice.finish_reason ?? state.finishReason;
          const delta = choice.delta as any;

          const reasoningDelta = delta?.reasoning ?? delta?.reasoning_content;
          if (typeof reasoningDelta === "string" && reasoningDelta.length > 0) {
            state.reasoning += reasoningDelta;
            if (request.settings.reasoning?.exclude !== true) {
              yield {
                type: "reasoning_delta",
                delta: reasoningDelta,
                index: choice.index,
              };
            }
          }

          if (typeof delta?.content === "string" && delta.content.length > 0) {
            state.content += delta.content;
            yield {
              type: "content_delta",
              delta: delta.content,
              index: choice.index,
            };
          }

          const mappedLogprobs = mapOpenAIChatLogprobs(choice.logprobs);
          if (mappedLogprobs) {
            state.logprobs.push(...((choice.logprobs as any)?.content || []));
          }
        }
      }

      const response = this.createSuccessResponse(
        this.createSyntheticCompletion(
          request,
          responseId,
          responseModel,
          created,
          choiceStates,
          usage
        ),
        request
      );

      yield { type: "complete", response };
    } catch (error) {
      this.logger.error("OpenAI streaming API error:", error);
      const errorResponse = this.createErrorResponse(error, request);
      if (choiceStates.size > 0) {
        const partial = this.createSuccessResponse(
          this.createSyntheticCompletion(
            request,
            responseId,
            responseModel,
            created,
            choiceStates,
            usage
          ),
          request
        );
        errorResponse.partialResponse = {
          id: partial.id,
          provider: partial.provider,
          model: partial.model,
          created: partial.created,
          choices: partial.choices,
          usage: partial.usage,
        };
      }
      yield { type: "error", error: errorResponse };
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

  private prepareCompletionRequest(
    request: InternalLLMChatRequest,
    apiKey: string
  ): OpenAICompletionRequest {
    const openai = new OpenAI({
      apiKey,
      ...(this.baseURL && { baseURL: this.baseURL }),
      maxRetries: 0, // retries are owned by the unified LLMService retry layer
    });

    const messages = this.formatMessages(request);
    const completionParams: OpenAI.Chat.Completions.ChatCompletionCreateParams =
      {
        model: request.modelId,
        messages,
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

    if (request.settings.reasoning && !request.settings.reasoning.exclude) {
      const reasoning = request.settings.reasoning;
      if (reasoning.effort) {
        (completionParams as any).reasoning_effort = reasoning.effort;
      } else if (reasoning.enabled !== false) {
        (completionParams as any).reasoning_effort = 'medium';
      }
    }

    if (request.settings.structuredOutput?.schema && request.settings.structuredOutput.enabled !== false) {
      const so = request.settings.structuredOutput;
      const processedSchema = so.strict !== false
        ? this.addAdditionalPropertiesFalse(so.schema)
        : so.schema;
      completionParams.response_format = {
        type: 'json_schema',
        json_schema: {
          name: so.name,
          strict: so.strict !== false,
          schema: processedSchema as any,
        }
      } as any;
    }

    return { openai, completionParams };
  }

  private createTransportOptions(options?: AdapterRequestOptions) {
    return {
      ...(options?.signal && { signal: options.signal }),
      ...(options?.timeoutMs !== undefined && { timeout: options.timeoutMs }),
    };
  }

  private getStreamChoiceState(
    states: Map<number, OpenAIStreamChoiceState>,
    index: number
  ): OpenAIStreamChoiceState {
    let state = states.get(index);
    if (!state) {
      state = {
        content: "",
        reasoning: "",
        finishReason: null,
        logprobs: [],
      };
      states.set(index, state);
    }
    return state;
  }

  private createSyntheticCompletion(
    request: InternalLLMChatRequest,
    id: string,
    model: string,
    created: number,
    choiceStates: Map<number, OpenAIStreamChoiceState>,
    usage?: OpenAI.Completions.CompletionUsage
  ): OpenAI.Chat.Completions.ChatCompletion {
    const choices = Array.from(choiceStates.entries())
      .sort(([a], [b]) => a - b)
      .map(([index, state]) => ({
        index,
        message: {
          role: "assistant" as const,
          content: state.content,
          ...(state.reasoning && { reasoning: state.reasoning }),
        },
        finish_reason: state.finishReason,
        ...(state.logprobs.length > 0 && {
          logprobs: { content: state.logprobs },
        }),
      }));

    return {
      id: id || `openai-stream-${Date.now()}`,
      object: "chat.completion",
      created,
      model: model || request.modelId,
      choices: choices as any,
      ...(usage && { usage }),
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
    const reasoning = (choice as any).reasoning ?? (choice.message as any).reasoning;
    if (reasoning && request.settings.reasoning && !request.settings.reasoning.exclude) {
      responseChoice.reasoning = reasoning;
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
    let { errorCode, errorMessage, errorType, status, retryAfterMs } =
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
        ...(retryAfterMs !== undefined && { retryAfterMs }),
        providerError: error,
      },
      object: "error",
    };
  }
}
