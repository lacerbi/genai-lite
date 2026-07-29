// AI Summary: Client adapter for OpenRouter API gateway using OpenAI-compatible API.
// Provides unified access to 100+ LLM models from various providers through a single API.

import OpenAI from "openai";
import type { LLMResponse, LLMFailureResponse } from "../types";
import type {
  ILLMClientAdapter,
  InternalLLMChatRequest,
  AdapterRequestOptions,
  AdapterLLMStreamEvent,
  AdapterPreparationContext,
  AdapterPreparationResult,
  AdapterPreparedRequest,
} from "./types";
import { ADAPTER_ERROR_CODES } from "./types";
import { getCommonMappedErrorDetails } from "../../shared/adapters/errorUtils";
import { mapOpenAIChatLogprobs } from "../../shared/adapters/logprobsUtils";
import {
  normalizeTermination,
  normalizeUsage,
} from "../../shared/adapters/usageUtils";
import {
  collectSystemContent,
  prependSystemToFirstUserMessage,
} from "../../shared/adapters/systemMessageUtils";
import type { Logger } from "../../logging/types";
import { createDefaultLogger } from "../../logging/defaultLogger";
import {
  applyPromptStructuredOutput,
  createPreparedRequestView,
  freezeProviderRequest,
} from "./preparedAdapterUtils";

/**
 * Configuration options for OpenRouterClientAdapter
 */
export interface OpenRouterClientConfig {
  /** Base URL of the OpenRouter API (default: https://openrouter.ai/api/v1) */
  baseURL?: string;
  /** Your app's URL for rankings attribution (optional) */
  httpReferer?: string;
  /** Your app's display name for rankings (optional) */
  siteTitle?: string;
  /** Logger instance for adapter logging */
  logger?: Logger;
}

interface OpenRouterCompletionRequest {
  openai: OpenAI;
  completionParams: OpenAI.Chat.Completions.ChatCompletionCreateParams;
}

interface OpenRouterPreparedProviderRequest {
  request: InternalLLMChatRequest;
  completionParams: OpenAI.Chat.Completions.ChatCompletionCreateParams;
}

const OPENROUTER_ADAPTER_REVISION = "openrouter-adapter-v1";
const OPENROUTER_REQUEST_SHAPE_REVISION = "openrouter-chat-completions-v1";

interface OpenRouterStreamChoiceState {
  content: string;
  reasoning: string;
  reasoningDetails?: any;
  finishReason: string | null;
  logprobs: any[];
}

/**
 * Client adapter for OpenRouter API integration
 *
 * OpenRouter is an API gateway that provides unified access to 100+ LLM models
 * from various providers (OpenAI, Anthropic, Google, Meta, Mistral, etc.)
 * through an OpenAI-compatible API.
 *
 * Key features:
 * - Uses OpenAI-compatible API format
 * - Single API key for all models
 * - Model IDs use provider/model format (e.g., "openai/gpt-4", "anthropic/claude-3-opus")
 * - Optional provider routing for controlling which underlying providers serve requests
 * - App attribution via HTTP-Referer and X-Title headers
 *
 * @example
 * ```typescript
 * // Create adapter
 * const adapter = new OpenRouterClientAdapter({
 *   httpReferer: 'https://myapp.com',
 *   siteTitle: 'My App'
 * });
 *
 * // Use via LLMService
 * const response = await service.sendMessage({
 *   providerId: 'openrouter',
 *   modelId: 'google/gemma-3-27b-it:free',
 *   messages: [{ role: 'user', content: 'Hello!' }]
 * });
 * ```
 */
export class OpenRouterClientAdapter implements ILLMClientAdapter {
  private baseURL: string;
  private httpReferer?: string;
  private siteTitle?: string;
  private logger: Logger;

  /**
   * Creates a new OpenRouter client adapter
   *
   * @param config Optional configuration for the adapter
   */
  constructor(config?: OpenRouterClientConfig) {
    this.baseURL = config?.baseURL || 'https://openrouter.ai/api/v1';
    this.httpReferer = config?.httpReferer || process.env.OPENROUTER_HTTP_REFERER;
    this.siteTitle = config?.siteTitle || process.env.OPENROUTER_SITE_TITLE;
    this.logger = config?.logger ?? createDefaultLogger();
  }

  async prepareRequest(
    request: InternalLLMChatRequest,
    context: AdapterPreparationContext
  ): Promise<AdapterPreparationResult> {
    try {
      request = applyPromptStructuredOutput(request);
      const baseParams = this.prepareCompletionParams(request);
      const completionParams =
        context.mode === "stream"
          ? ({
              ...baseParams,
              stream: true,
              stream_options: { include_usage: true },
            } as OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming)
          : baseParams;
      const providerRequest =
        freezeProviderRequest<OpenRouterPreparedProviderRequest>({
          request,
          completionParams,
        });
      return {
        prepared: {
          mode: context.mode,
          providerRequest,
          requestView: createPreparedRequestView({
            operation: "openrouter.chat.completions",
            mode: context.mode,
            payload: completionParams as unknown as Record<string, unknown>,
            structuredOutput: request.settings.structuredOutput,
            reasoningField: "reasoning",
            extensionFields: ["provider"],
          }),
          promptAccounting: { status: "unavailable" },
          outputTokenLimit: context.outputTokenLimit,
          bindings: {
            adapterRevision: OPENROUTER_ADAPTER_REVISION,
            requestShapeRevision: OPENROUTER_REQUEST_SHAPE_REVISION,
          },
        },
      };
    } catch (error) {
      return { error: this.createErrorResponse(error, request) };
    }
  }

  async sendPrepared(
    prepared: AdapterPreparedRequest,
    apiKey: string,
    options?: AdapterRequestOptions
  ): Promise<LLMResponse | LLMFailureResponse> {
    const providerRequest =
      prepared.providerRequest as OpenRouterPreparedProviderRequest;
    const request = providerRequest.request;
    try {
      const openai = this.createClient(apiKey);
      const completionParams = structuredClone(
        providerRequest.completionParams
      ) as OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming;
      const transportOptions = this.createTransportOptions(options);
      const completion =
        Object.keys(transportOptions).length > 0
          ? await openai.chat.completions.create(
              completionParams,
              transportOptions
            )
          : await openai.chat.completions.create(completionParams);
      return this.createSuccessResponse(completion, request);
    } catch (error) {
      this.logger.error("OpenRouter prepared API error:", error);
      return this.createErrorResponse(error, request);
    }
  }

  async *streamPrepared(
    prepared: AdapterPreparedRequest,
    apiKey: string,
    options?: AdapterRequestOptions
  ): AsyncIterable<AdapterLLMStreamEvent> {
    const providerRequest =
      prepared.providerRequest as OpenRouterPreparedProviderRequest;
    yield* this.streamCompletion(
      providerRequest.request,
      structuredClone(
        providerRequest.completionParams
      ) as OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming,
      apiKey,
      options
    );
  }

  /**
   * Sends a chat message to OpenRouter API
   *
   * @param request - The internal LLM request with applied settings
   * @param apiKey - The OpenRouter API key
   * @returns Promise resolving to success or failure response
   */
  async sendMessage(
    request: InternalLLMChatRequest,
    apiKey: string,
    options?: AdapterRequestOptions
  ): Promise<LLMResponse | LLMFailureResponse> {
    request = applyPromptStructuredOutput(request);
    try {
      const { openai, completionParams } = this.prepareCompletionRequest(request, apiKey);

      this.logger.debug(`OpenRouter API parameters:`, {
        baseURL: this.baseURL,
        model: completionParams.model,
        temperature: completionParams.temperature,
        max_tokens: completionParams.max_tokens,
        top_p: completionParams.top_p,
        hasProviderRouting: !!(completionParams as any).provider,
      });

      this.logger.info(`Making OpenRouter API call for model: ${request.modelId}`);

      // Make the API call
      const transportOptions = {
        ...(options?.signal && { signal: options.signal }),
        ...(options?.timeoutMs !== undefined && { timeout: options.timeoutMs }),
      };
      const completion =
        Object.keys(transportOptions).length > 0
          ? await openai.chat.completions.create(completionParams, transportOptions)
          : await openai.chat.completions.create(completionParams);

      // Type guard to ensure we have a non-streaming response
      if ('id' in completion && 'choices' in completion) {
        this.logger.info(`OpenRouter API call successful, response ID: ${completion.id}`);
        return this.createSuccessResponse(completion as OpenAI.Chat.Completions.ChatCompletion, request);
      } else {
        throw new Error('Unexpected streaming response from OpenRouter');
      }
    } catch (error) {
      this.logger.error("OpenRouter API error:", error);
      return this.createErrorResponse(error, request);
    }
  }

  async *streamMessage(
    request: InternalLLMChatRequest,
    apiKey: string,
    options?: AdapterRequestOptions
  ): AsyncIterable<AdapterLLMStreamEvent> {
    request = applyPromptStructuredOutput(request);
    const streamParams = {
      ...this.prepareCompletionParams(request),
      stream: true,
      stream_options: { include_usage: true },
    } as OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming;
    yield* this.streamCompletion(request, streamParams, apiKey, options);
  }

  private async *streamCompletion(
    request: InternalLLMChatRequest,
    streamParams: OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming,
    apiKey: string,
    options?: AdapterRequestOptions
  ): AsyncIterable<AdapterLLMStreamEvent> {
    const choiceStates = new Map<number, OpenRouterStreamChoiceState>();
    let responseId = "";
    let responseModel = request.modelId;
    let created = Math.floor(Date.now() / 1000);
    let usage: OpenAI.Completions.CompletionUsage | undefined;

    try {
      const openai = this.createClient(apiKey);
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
        const evidenceEvents: AdapterLLMStreamEvent[] = [];
        const publicEvents: AdapterLLMStreamEvent[] = [];

        if (chunk.usage) {
          usage = chunk.usage;
          const normalized = normalizeUsage(
            chunk.usage as unknown as Record<string, unknown>,
            {
              prompt: ["prompt_tokens"],
              completion: ["completion_tokens"],
              total: ["total_tokens"],
            }
          );
          if (normalized.usage) {
            evidenceEvents.push({
              type: "adapter_evidence",
              observedEvidence: {
                usage: normalized.usage,
                usageEvidence: normalized.usageEvidence,
              },
            });
            publicEvents.push({
              type: "usage",
              usage: normalized.usage,
              observedEvidence: {
                usageEvidence: normalized.usageEvidence,
              },
            });
          }
        }

        for (const choice of chunk.choices || []) {
          const state = this.getStreamChoiceState(choiceStates, choice.index);
          state.finishReason = choice.finish_reason ?? state.finishReason;
          if (choice.finish_reason != null) {
            evidenceEvents.push({
              type: "adapter_evidence",
              observedEvidence: {
                choice: {
                  index: choice.index,
                  finishReason: choice.finish_reason,
                  termination: normalizeTermination(choice.finish_reason),
                },
              },
            });
          }
          const delta = choice.delta as any;

          const reasoningDelta = delta?.reasoning ?? delta?.reasoning_content;
          if (typeof reasoningDelta === "string" && reasoningDelta.length > 0) {
            state.reasoning += reasoningDelta;
            evidenceEvents.push({
              type: "adapter_evidence",
              observedEvidence: {
                choice: {
                  index: choice.index,
                  rawContentParts: [{
                    type: "reasoning",
                    text: reasoningDelta,
                    reasoning: true,
                  }],
                },
              },
            });
            if (request.settings.reasoning?.exclude !== true) {
              publicEvents.push({
                type: "reasoning_delta",
                delta: reasoningDelta,
                index: choice.index,
              });
            }
          }

          if (delta?.reasoning_details) {
            state.reasoningDetails = delta.reasoning_details;
          }

          if (typeof delta?.content === "string" && delta.content.length > 0) {
            state.content += delta.content;
            evidenceEvents.push({
              type: "adapter_evidence",
              observedEvidence: {
                choice: {
                  index: choice.index,
                  rawContentDelta: delta.content,
                },
              },
            });
            publicEvents.push({
              type: "content_delta",
              delta: delta.content,
              index: choice.index,
            });
          }

          const mappedLogprobs = mapOpenAIChatLogprobs(choice.logprobs);
          if (mappedLogprobs) {
            state.logprobs.push(...((choice.logprobs as any)?.content || []));
          }
        }

        for (const event of evidenceEvents) {
          yield event;
        }
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
        for (const event of publicEvents) {
          yield event;
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
      this.logger.error("OpenRouter streaming API error:", error);
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
          usageEvidence: partial.usageEvidence,
        };
      } else if (usage) {
        const normalizedUsage = normalizeUsage(
          usage as unknown as Record<string, unknown>,
          {
            prompt: ["prompt_tokens"],
            completion: ["completion_tokens"],
            total: ["total_tokens"],
          }
        );
        errorResponse.partialResponse = {
          id: responseId,
          provider: request.providerId,
          model: responseModel,
          created,
          choices: [],
          ...normalizedUsage,
        };
      }
      yield { type: "error", error: errorResponse };
    }
  }

  private prepareCompletionRequest(
    request: InternalLLMChatRequest,
    apiKey: string
  ): OpenRouterCompletionRequest {
    return {
      openai: this.createClient(apiKey),
      completionParams: this.prepareCompletionParams(request),
    };
  }

  private createClient(apiKey: string): OpenAI {
    return new OpenAI({
      apiKey,
      maxRetries: 0, // retries are owned by the unified LLMService retry layer
      baseURL: this.baseURL,
      defaultHeaders: {
        ...(this.httpReferer && { 'HTTP-Referer': this.httpReferer }),
        ...(this.siteTitle && { 'X-Title': this.siteTitle }),
      },
    });
  }

  private prepareCompletionParams(
    request: InternalLLMChatRequest
  ): OpenAI.Chat.Completions.ChatCompletionCreateParams {
    const messages = this.formatMessages(request);
    const completionParams: OpenAI.Chat.Completions.ChatCompletionCreateParams = {
      model: request.modelId,
      messages,
      temperature: request.settings.temperature,
      max_tokens: request.settings.maxTokens,
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
      ...(request.settings.topK !== undefined && {
        top_k: request.settings.topK,
      }),
      ...(request.settings.minP !== undefined && {
        min_p: request.settings.minP,
      }),
      ...(request.settings.repeatPenalty !== undefined && {
        repetition_penalty: request.settings.repeatPenalty,
      }),
      ...(request.settings.logprobs === true && {
        logprobs: true,
        ...(request.settings.topLogprobs !== undefined && {
          top_logprobs: request.settings.topLogprobs,
        }),
      }),
    } as OpenAI.Chat.Completions.ChatCompletionCreateParams;

    const providerSettings = request.settings.openRouterProvider;
    if (providerSettings) {
      const provider: Record<string, any> = {};
      if (providerSettings.order) {
        provider.order = providerSettings.order;
      }
      if (providerSettings.ignore) {
        provider.ignore = providerSettings.ignore;
      }
      if (providerSettings.allow) {
        provider.allow = providerSettings.allow;
      }
      if (providerSettings.dataCollection) {
        provider.data_collection = providerSettings.dataCollection;
      }
      if (providerSettings.requireParameters !== undefined) {
        provider.require_parameters = providerSettings.requireParameters;
      }
      if (Object.keys(provider).length > 0) {
        (completionParams as any).provider = provider;
      }
    }

    if (
      request.settings.structuredOutput?.schema &&
      request.settings.structuredOutput.enabled !== false &&
      request.settings.structuredOutput.delivery !== "prompt"
    ) {
      const so = request.settings.structuredOutput;
      (completionParams as any).response_format = {
        type: 'json_schema',
        json_schema: {
          name: so.name,
          strict: so.strict !== false,
          schema: so.schema,
        }
      };
    }

    const reasoningSettings = request.settings.reasoning;
    if (
      reasoningSettings &&
      (reasoningSettings.enabled === true ||
        reasoningSettings.effort !== undefined ||
        reasoningSettings.maxTokens !== undefined)
    ) {
      const reasoning: Record<string, any> = {};
      if (reasoningSettings.maxTokens !== undefined) {
        reasoning.max_tokens = reasoningSettings.maxTokens;
      } else if (reasoningSettings.effort) {
        reasoning.effort = reasoningSettings.effort;
      } else {
        reasoning.enabled = true;
      }
      if (reasoningSettings.exclude === true) {
        reasoning.exclude = true;
      }
      (completionParams as any).reasoning = reasoning;
    }

    return completionParams;
  }

  private createTransportOptions(options?: AdapterRequestOptions) {
    return {
      ...(options?.signal && { signal: options.signal }),
      ...(options?.timeoutMs !== undefined && { timeout: options.timeoutMs }),
    };
  }

  private getStreamChoiceState(
    states: Map<number, OpenRouterStreamChoiceState>,
    index: number
  ): OpenRouterStreamChoiceState {
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
    choiceStates: Map<number, OpenRouterStreamChoiceState>,
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
          ...(state.reasoningDetails && {
            reasoning_details: state.reasoningDetails,
          }),
        },
        finish_reason: state.finishReason,
        ...(state.logprobs.length > 0 && {
          logprobs: { content: state.logprobs },
        }),
      }));

    return {
      id: id || `openrouter-stream-${Date.now()}`,
      object: "chat.completion",
      created,
      model: model || request.modelId,
      choices: choices as any,
      ...(usage && { usage }),
    };
  }

  /**
   * Validates OpenRouter API key format
   *
   * OpenRouter API keys typically start with 'sk-or-' and have significant length.
   *
   * @param apiKey - The API key to validate
   * @returns True if the key format appears valid
   */
  validateApiKey(apiKey: string): boolean {
    // OpenRouter keys start with 'sk-or-' (may include version like 'sk-or-v1-')
    return apiKey.startsWith('sk-or-') && apiKey.length >= 40;
  }

  /**
   * Gets adapter information
   */
  getAdapterInfo() {
    return {
      providerId: "openrouter" as const,
      name: "OpenRouter Client Adapter",
      version: "1.0.0",
      baseURL: this.baseURL,
    };
  }

  /**
   * Formats messages for OpenAI-compatible API
   *
   * @param request - The internal LLM request
   * @returns Formatted messages array
   */
  private formatMessages(
    request: InternalLLMChatRequest
  ): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];
    const inlineSystemMessages: string[] = [];

    // Check if model supports system messages (default true for most OpenRouter models)
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
   * Creates a standardized success response from OpenRouter's response
   *
   * @param completion - Raw OpenAI-compatible completion response
   * @param request - Original request for context
   * @returns Standardized LLM response
   */
  private createSuccessResponse(
    completion: OpenAI.Chat.Completions.ChatCompletion,
    request: InternalLLMChatRequest
  ): LLMResponse {
    const choice = completion.choices[0];

    if (!choice || !choice.message) {
      throw new Error("No valid choices in OpenRouter completion response");
    }

    const normalizedUsage = normalizeUsage(
      completion.usage as unknown as Record<string, unknown> | undefined,
      {
        prompt: ["prompt_tokens"],
        completion: ["completion_tokens"],
        total: ["total_tokens"],
      }
    );

    return {
      id: completion.id,
      provider: request.providerId,
      model: completion.model || request.modelId,
      created: completion.created,
      choices: completion.choices.map((c) => {
        const mappedChoice: any = {
          message: {
            role: "assistant",
            content: c.message.content || "",
          },
          rawContent: c.message.content || "",
          finish_reason: c.finish_reason,
          termination: normalizeTermination(c.finish_reason),
          index: c.index,
        };

        // OpenRouter returns the reasoning trace on message.reasoning (plus
        // structured reasoning_details) for models that expose it
        const messageReasoning = (c.message as any).reasoning;
        if (messageReasoning && request.settings.reasoning?.exclude !== true) {
          mappedChoice.reasoning = messageReasoning;
        }
        const reasoningDetails = (c.message as any).reasoning_details;
        if (reasoningDetails && request.settings.reasoning?.exclude !== true) {
          mappedChoice.reasoning_details = reasoningDetails;
        }

        // Per-token log probabilities (OpenAI-compatible shape)
        const logprobs = mapOpenAIChatLogprobs((c as any).logprobs);
        if (logprobs) {
          mappedChoice.logprobs = logprobs;
        }

        return mappedChoice;
      }),
      ...normalizedUsage,
      object: "chat.completion",
    };
  }

  /**
   * Creates a standardized error response from an error
   *
   * @param error - The error that occurred
   * @param request - Original request for context
   * @returns Standardized LLM failure response
   */
  private createErrorResponse(
    error: any,
    request: InternalLLMChatRequest
  ): LLMFailureResponse {
    // Use common error mapping
    const mappedError = getCommonMappedErrorDetails(error);

    // OpenRouter-specific error refinements
    if (mappedError.status === 400) {
      const errorMessage = (error?.message || '').toLowerCase();
      if (errorMessage.includes('model') && (errorMessage.includes('not available') || errorMessage.includes('not found'))) {
        mappedError.errorCode = ADAPTER_ERROR_CODES.MODEL_NOT_FOUND;
      }
    }

    return {
      provider: request.providerId,
      model: request.modelId,
      error: {
        message: mappedError.errorMessage,
        code: mappedError.errorCode,
        type: mappedError.errorType,
        ...(mappedError.status && { status: mappedError.status }),
        ...(mappedError.retryAfterMs !== undefined && { retryAfterMs: mappedError.retryAfterMs }),
        providerError: error,
      },
      object: "error",
    };
  }
}
