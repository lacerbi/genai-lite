// AI Summary: Anthropic client adapter for making real API calls to Anthropic's messages endpoint.
// Handles Claude-specific request formatting, response parsing, and error mapping to standardized format.

import Anthropic from "@anthropic-ai/sdk";
import type { LLMResponse, LLMFailureResponse, LLMMessage } from "../types";
import type {
  ILLMClientAdapter,
  InternalLLMChatRequest,
  AdapterErrorCode,
  AdapterRequestOptions,
  AdapterLLMStreamEvent,
  AdapterPreparationContext,
  AdapterPreparationResult,
  AdapterPreparedRequest,
} from "./types";
import { ADAPTER_ERROR_CODES } from "./types";
import { getCommonMappedErrorDetails } from "../../shared/adapters/errorUtils";
import { applyStrictSchemaConstraints } from "../../shared/adapters/schemaUtils";
import {
  mergeUsageRecords,
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
  toPreparedRequestValue,
} from "./preparedAdapterUtils";

interface AnthropicPreparedRequest {
  anthropic: Anthropic;
  messageParams: Anthropic.Messages.MessageCreateParams;
  requestTransportOptions: Record<string, any>;
  useStructuredOutput: boolean;
  messages: Anthropic.Messages.MessageParam[];
}

interface AnthropicMessagePayload {
  messageParams: Anthropic.Messages.MessageCreateParams;
  useStructuredOutput: boolean;
  messages: Anthropic.Messages.MessageParam[];
}

interface AnthropicPreparedProviderRequest {
  request: InternalLLMChatRequest;
  messageParams: Anthropic.Messages.MessageCreateParams;
  useStructuredOutput: boolean;
}

const ANTHROPIC_ADAPTER_REVISION = "anthropic-adapter-v1";
const ANTHROPIC_REQUEST_SHAPE_REVISION = "anthropic-messages-v1";

interface AnthropicStreamAccumulator {
  id: string;
  model: string;
  created: number;
  content: string;
  reasoning: string;
  stopReason: string | null;
  usage?: any;
  rawParts: Array<{
    type: string;
    text?: string;
    value?: import("../types").PreparedRequestValue;
    reasoning?: boolean;
  }>;
}

/**
 * Client adapter for Anthropic API integration
 *
 * This adapter:
 * - Formats requests according to Anthropic's messages API requirements
 * - Handles Claude-specific system message positioning and formatting
 * - Maps Anthropic responses to standardized LLMResponse format
 * - Converts Anthropic errors to standardized LLMFailureResponse format
 * - Manages Claude-specific settings and constraints
 */
export class AnthropicClientAdapter implements ILLMClientAdapter {
  private baseURL?: string;
  private logger: Logger;

  /**
   * Creates a new Anthropic client adapter
   *
   * @param config Optional configuration for the adapter
   * @param config.baseURL Custom base URL for Anthropic-compatible APIs
   * @param config.logger Custom logger instance
   */
  constructor(config?: { baseURL?: string; logger?: Logger }) {
    this.baseURL = config?.baseURL;
    this.logger = config?.logger ?? createDefaultLogger();
  }

  async prepareRequest(
    request: InternalLLMChatRequest,
    context: AdapterPreparationContext
  ): Promise<AdapterPreparationResult> {
    try {
      request = applyPromptStructuredOutput(request);
      const payload = this.prepareMessageParams(request);
      const providerRequest =
        freezeProviderRequest<AnthropicPreparedProviderRequest>({
          request,
          messageParams: payload.messageParams,
          useStructuredOutput: payload.useStructuredOutput,
        });
      return {
        prepared: {
          mode: context.mode,
          providerRequest,
          requestView: createPreparedRequestView({
            operation: "anthropic.messages",
            mode: context.mode,
            payload: payload.messageParams as unknown as Record<
              string,
              unknown
            >,
            structuredOutput: request.settings.structuredOutput,
            reasoningField: "thinking",
          }),
          promptAccounting: { status: "unavailable" },
          outputTokenLimit: context.outputTokenLimit,
          bindings: {
            adapterRevision: ANTHROPIC_ADAPTER_REVISION,
            requestShapeRevision: ANTHROPIC_REQUEST_SHAPE_REVISION,
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
      prepared.providerRequest as AnthropicPreparedProviderRequest;
    const request = providerRequest.request;
    try {
      const anthropic = this.createClient(apiKey);
      const messageParams = structuredClone(
        providerRequest.messageParams
      ) as Anthropic.Messages.MessageCreateParamsNonStreaming;
      const requestTransportOptions = this.createTransportOptions(options);
      const completion =
        Object.keys(requestTransportOptions).length > 0
          ? await anthropic.messages.create(
              messageParams,
              requestTransportOptions
            )
          : await anthropic.messages.create(messageParams);
      return this.createSuccessResponse(completion, request);
    } catch (error) {
      this.logger.error("Anthropic prepared API error:", error);
      return this.createErrorResponse(error, request);
    }
  }

  async *streamPrepared(
    prepared: AdapterPreparedRequest,
    apiKey: string,
    options?: AdapterRequestOptions
  ): AsyncIterable<AdapterLLMStreamEvent> {
    const providerRequest =
      prepared.providerRequest as AnthropicPreparedProviderRequest;
    yield* this.streamMessages(
      providerRequest.request,
      structuredClone(providerRequest.messageParams),
      providerRequest.useStructuredOutput,
      apiKey,
      options
    );
  }

  /**
   * Sends a chat message to Anthropic's API
   *
   * @param request - The internal LLM request with applied settings
   * @param apiKey - The decrypted Anthropic API key
   * @returns Promise resolving to success or failure response
   */
  async sendMessage(
    request: InternalLLMChatRequest,
    apiKey: string,
    options?: AdapterRequestOptions
  ): Promise<LLMResponse | LLMFailureResponse> {
    request = applyPromptStructuredOutput(request);
    try {
      const {
        anthropic,
        messageParams,
        requestTransportOptions,
        useStructuredOutput,
        messages,
      } = this.prepareMessageRequest(request, apiKey, options);

      this.logger.info(`Making Anthropic API call for model: ${request.modelId}`);
      this.logger.debug(`Anthropic API parameters:`, {
        model: messageParams.model,
        temperature: messageParams.temperature,
        max_tokens: messageParams.max_tokens,
        top_p: messageParams.top_p,
        hasSystem: !!messageParams.system,
        messageCount: messages.length,
        hasStopSequences: !!messageParams.stop_sequences,
        useStructuredOutput,
      });

      // Structured and unstructured requests take the same endpoint - structured
      // output is GA, so there is no beta header or beta endpoint involved.
      const completion =
        Object.keys(requestTransportOptions).length > 0
          ? await anthropic.messages.create(messageParams, requestTransportOptions)
          : await anthropic.messages.create(messageParams);

      this.logger.info(
        `Anthropic API call successful, response ID: ${(completion as any).id}`
      );

      // Convert to standardized response format. `create` is typed against the
      // streaming/non-streaming param union; we never set `stream`, so this is
      // always a Message.
      return this.createSuccessResponse(completion as any, request);
    } catch (error) {
      this.logger.error("Anthropic API error:", error);
      return this.createErrorResponse(error, request);
    }
  }

  async *streamMessage(
    request: InternalLLMChatRequest,
    apiKey: string,
    options?: AdapterRequestOptions
  ): AsyncIterable<AdapterLLMStreamEvent> {
    request = applyPromptStructuredOutput(request);
    const payload = this.prepareMessageParams(request);
    yield* this.streamMessages(
      request,
      payload.messageParams,
      payload.useStructuredOutput,
      apiKey,
      options
    );
  }

  private async *streamMessages(
    request: InternalLLMChatRequest,
    messageParams: Anthropic.Messages.MessageCreateParams,
    useStructuredOutput: boolean,
    apiKey: string,
    options?: AdapterRequestOptions
  ): AsyncIterable<AdapterLLMStreamEvent> {
    const accumulator: AnthropicStreamAccumulator = {
      id: "",
      model: request.modelId,
      created: Math.floor(Date.now() / 1000),
      content: "",
      reasoning: "",
      stopReason: null,
      rawParts: [],
    };
    let sawEvent = false;
    let started = false;

    try {
      const anthropic = this.createClient(apiKey);
      const requestTransportOptions = this.createTransportOptions(options);

      this.logger.info(`Making Anthropic streaming API call for model: ${request.modelId}`, {
        useStructuredOutput,
      });
      // No beta header for structured output - output_config.format is GA.
      const stream =
        Object.keys(requestTransportOptions).length > 0
          ? anthropic.messages.stream(messageParams as any, requestTransportOptions as any)
          : anthropic.messages.stream(messageParams as any);

      for await (const event of stream as AsyncIterable<Anthropic.Messages.MessageStreamEvent>) {
        sawEvent = true;

        if (event.type === "message_start") {
          accumulator.id = event.message.id || accumulator.id;
          accumulator.model = event.message.model || accumulator.model;
          accumulator.stopReason = event.message.stop_reason ?? accumulator.stopReason;
          accumulator.usage = this.mergeAnthropicUsage(accumulator.usage, event.message.usage);

          if (event.message.stop_reason != null) {
            yield {
              type: "adapter_evidence",
              observedEvidence: {
                choice: {
                  index: 0,
                  finishReason: this.mapAnthropicStopReason(
                    event.message.stop_reason
                  ),
                  termination: normalizeTermination(
                    event.message.stop_reason,
                    event.message.stop_reason === "max_tokens"
                      ? "output"
                      : undefined
                  ),
                },
              },
            };
          }

          let usageEvent: AdapterLLMStreamEvent | undefined;
          if (event.message.usage) {
            const normalized = this.normalizeAnthropicUsage(
              accumulator.usage
            );
            if (normalized.usage) {
              yield {
                type: "adapter_evidence",
                observedEvidence: {
                  usage: normalized.usage,
                  usageEvidence: normalized.usageEvidence,
                },
              };
              usageEvent = {
                type: "usage",
                usage: normalized.usage,
                observedEvidence: {
                  usageEvidence: normalized.usageEvidence,
                },
              };
            }
          }

          if (!started) {
            started = true;
            yield {
              type: "start",
              provider: request.providerId,
              model: accumulator.model,
              id: accumulator.id,
              created: accumulator.created,
            };
          }

          if (usageEvent) {
            yield usageEvent;
          }
          continue;
        }

        const publicEvents: AdapterLLMStreamEvent[] = [];

        if (event.type === "content_block_start") {
          const block = event.content_block as any;
          const rawValue = toPreparedRequestValue(block);
          const rawPart = {
            type: `content_block_start:${String(block?.type ?? "unknown")}`,
            ...(typeof block?.text === "string" && { text: block.text }),
            ...(typeof block?.thinking === "string" && {
              text: block.thinking,
              reasoning: true,
            }),
            ...(rawValue !== undefined && {
              value: {
                blockIndex: event.index,
                block: rawValue,
              },
            }),
          };
          accumulator.rawParts.push(rawPart);
          yield {
            type: "adapter_evidence",
            observedEvidence: {
              choice: {
                index: 0,
                ...(block?.type === "text" &&
                  typeof block.text === "string" && {
                    rawContentDelta: block.text,
                  }),
                rawContentParts: [rawPart],
              },
            },
          };
          if (block?.type === "text" && typeof block.text === "string" && block.text.length > 0) {
            accumulator.content += block.text;
            publicEvents.push({
              type: "content_delta",
              delta: block.text,
              index: 0,
            });
          } else if (
            block?.type === "thinking" &&
            typeof block.thinking === "string" &&
            block.thinking.length > 0
          ) {
            accumulator.reasoning += block.thinking;
            if (request.settings.reasoning?.exclude !== true) {
              publicEvents.push({
                type: "reasoning_delta",
                delta: block.thinking,
                index: 0,
              });
            }
          }
        } else if (event.type === "content_block_delta") {
          const delta = event.delta as any;
          const rawValue = toPreparedRequestValue(delta);
          const rawPart = {
            type: String(delta?.type ?? "unknown"),
            ...(typeof delta?.text === "string" && { text: delta.text }),
            ...(typeof delta?.thinking === "string" && {
              text: delta.thinking,
              reasoning: true,
            }),
            ...(rawValue !== undefined && {
              value: {
                blockIndex: event.index,
                delta: rawValue,
              },
            }),
          };
          accumulator.rawParts.push(rawPart);
          yield {
            type: "adapter_evidence",
            observedEvidence: {
              choice: {
                index: 0,
                ...(delta?.type === "text_delta" &&
                  typeof delta.text === "string" && {
                    rawContentDelta: delta.text,
                  }),
                rawContentParts: [rawPart],
              },
            },
          };
          if (delta?.type === "text_delta" && typeof delta.text === "string" && delta.text.length > 0) {
            accumulator.content += delta.text;
            publicEvents.push({
              type: "content_delta",
              delta: delta.text,
              index: 0,
            });
          } else if (
            delta?.type === "thinking_delta" &&
            typeof delta.thinking === "string" &&
            delta.thinking.length > 0
          ) {
            accumulator.reasoning += delta.thinking;
            if (request.settings.reasoning?.exclude !== true) {
              publicEvents.push({
                type: "reasoning_delta",
                delta: delta.thinking,
                index: 0,
              });
            }
          }
        } else if (event.type === "message_delta") {
          accumulator.stopReason = event.delta.stop_reason ?? accumulator.stopReason;
          if (event.delta.stop_reason != null) {
            yield {
              type: "adapter_evidence",
              observedEvidence: {
                choice: {
                  index: 0,
                  finishReason: this.mapAnthropicStopReason(
                    event.delta.stop_reason
                  ),
                  termination: normalizeTermination(
                    event.delta.stop_reason,
                    event.delta.stop_reason === "max_tokens"
                      ? "output"
                      : undefined
                  ),
                },
              },
            };
          }
          accumulator.usage = this.mergeAnthropicUsage(accumulator.usage, event.usage);
          if (event.usage) {
            const normalized = this.normalizeAnthropicUsage(
              accumulator.usage
            );
            if (normalized.usage) {
              yield {
                type: "adapter_evidence",
                observedEvidence: {
                  usage: normalized.usage,
                  usageEvidence: normalized.usageEvidence,
                },
              };
              publicEvents.push({
                type: "usage",
                usage: normalized.usage,
                observedEvidence: {
                  usageEvidence: normalized.usageEvidence,
                },
              });
            }
          }
        }

        if (!started) {
          started = true;
          yield {
            type: "start",
            provider: request.providerId,
            model: accumulator.model,
            id: accumulator.id,
            created: accumulator.created,
          };
        }
        for (const publicEvent of publicEvents) {
          yield publicEvent;
        }
      }

      const response = this.createSuccessResponse(
        this.createSyntheticMessage(request, accumulator),
        request
      );
      response.choices[0].rawContentParts = accumulator.rawParts;
      yield { type: "complete", response };
    } catch (error) {
      this.logger.error("Anthropic streaming API error:", error);
      const errorResponse = this.createErrorResponse(error, request);

      if (sawEvent || accumulator.content.length > 0 || accumulator.reasoning.length > 0) {
        const partial = this.createSuccessResponse(
          this.createSyntheticMessage(request, accumulator),
          request
        );
        partial.choices[0].rawContentParts = accumulator.rawParts;
        errorResponse.partialResponse = {
          id: partial.id,
          provider: partial.provider,
          model: partial.model,
          created: partial.created,
          choices: partial.choices,
          usage: partial.usage,
          usageEvidence: partial.usageEvidence,
        };
      }

      yield { type: "error", error: errorResponse };
    }
  }

  /**
   * Validates Anthropic API key format
   *
   * @param apiKey - The API key to validate
   * @returns True if the key format appears valid
   */
  validateApiKey(apiKey: string): boolean {
    // Anthropic API keys typically start with 'sk-ant-' and are longer
    return apiKey.startsWith("sk-ant-") && apiKey.length >= 30;
  }

  /**
   * Gets adapter information
   */
  getAdapterInfo() {
    return {
      providerId: "anthropic" as const,
      name: "Anthropic Client Adapter",
      version: "1.0.0",
    };
  }

  private prepareMessageRequest(
    request: InternalLLMChatRequest,
    apiKey: string,
    options?: AdapterRequestOptions
  ): AnthropicPreparedRequest {
    const payload = this.prepareMessageParams(request);
    return {
      anthropic: this.createClient(apiKey),
      requestTransportOptions: this.createTransportOptions(options),
      ...payload,
    };
  }

  private createClient(apiKey: string): Anthropic {
    return new Anthropic({
      apiKey,
      ...(this.baseURL && { baseURL: this.baseURL }),
      maxRetries: 0,
    });
  }

  private createTransportOptions(
    options?: AdapterRequestOptions
  ): Record<string, unknown> {
    return {
      ...(options?.signal && { signal: options.signal }),
      ...(options?.timeoutMs !== undefined && { timeout: options.timeoutMs }),
    };
  }

  private prepareMessageParams(
    request: InternalLLMChatRequest
  ): AnthropicMessagePayload {
    const hasTemperature = request.settings.temperature !== undefined;
    const hasTopP = request.settings.topP !== undefined;
    if (hasTemperature && hasTopP) {
      throw new Error(
        "Invalid Anthropic settings: temperature and topP cannot both be specified"
      );
    }

    // Check if generally available structured output is requested.
    const useStructuredOutput = !!(
      request.settings.structuredOutput?.schema &&
      request.settings.structuredOutput.enabled !== false &&
      request.settings.structuredOutput.delivery !== "prompt"
    );

    // Format messages for Anthropic API (Claude has specific requirements)
    const { messages, systemMessage } = this.formatMessagesForAnthropic(request);

    // Prepare API call parameters
    const messageParams: Anthropic.Messages.MessageCreateParams = {
      model: request.modelId,
      messages: messages,
      max_tokens: request.settings.maxTokens,
      ...(hasTemperature && { temperature: request.settings.temperature }),
      ...(hasTopP && { top_p: request.settings.topP }),
      ...(request.settings.topK !== undefined && {
        top_k: request.settings.topK,
      }),
      ...(systemMessage && { system: systemMessage }),
      ...(request.settings.stopSequences.length > 0 && {
        stop_sequences: request.settings.stopSequences,
      }),
    };

    // Handle structured output configuration for Anthropic.
    // Structured outputs are generally available: the stable request field is
    // output_config.format, with no beta header. The format object carries only
    // `type` and `schema` - the generic StructuredOutputSettings `name` and
    // `strict` fields exist for other providers and are not serialized here.
    if (useStructuredOutput) {
      const so = request.settings.structuredOutput!;
      // Anthropic requires additionalProperties: false on all object schemas
      const processedSchema: Record<string, unknown> =
        so.strict !== false
          ? applyStrictSchemaConstraints({ ...so.schema })
          : { ...so.schema };
      messageParams.output_config = {
        format: {
          type: "json_schema",
          schema: processedSchema,
        },
      };
    }

    // Handle reasoning/thinking configuration for Claude models
    if (request.settings.reasoning && !request.settings.reasoning.exclude) {
      const reasoning = request.settings.reasoning;
      let budgetTokens: number | undefined;

      // Convert reasoning settings to Anthropic's thinking format
      if (reasoning.maxTokens !== undefined) {
        budgetTokens = Math.max(reasoning.maxTokens, 1024); // Minimum 1024
      } else if (reasoning.effort) {
        // Convert effort levels to token budgets
        // Max budget for Anthropic is 32000
        const maxBudget = 32000;

        switch (reasoning.effort) {
          case 'high':
            budgetTokens = Math.floor(maxBudget * 0.8);
            break;
          case 'medium':
            budgetTokens = Math.floor(maxBudget * 0.5);
            break;
          case 'low':
            budgetTokens = Math.floor(maxBudget * 0.2);
            break;
        }
      } else if (reasoning.enabled !== false) {
        // Use default budget
        budgetTokens = 10000;
      }

      if (budgetTokens !== undefined) {
        // Add thinking configuration to the request
        (messageParams as any).thinking = {
          type: "enabled",
          budget_tokens: Math.min(budgetTokens, 32000), // Cap at max
        };
      }
    }

    return {
      messageParams,
      useStructuredOutput,
      messages,
    };
  }

  private normalizeAnthropicUsage(usage: any) {
    return normalizeUsage(usage, {
      prompt: ["input_tokens"],
      completion: ["output_tokens"],
      total: [],
    });
  }

  private mapAnthropicUsage(usage: any) {
    return this.normalizeAnthropicUsage(usage).usage ?? {};
  }

  private mergeAnthropicUsage(
    current: any | undefined,
    next: any | undefined
  ): any | undefined {
    if (!next) {
      return current;
    }

    return mergeUsageRecords(current, next);
  }

  private createSyntheticMessage(
    request: InternalLLMChatRequest,
    accumulator: AnthropicStreamAccumulator
  ): Anthropic.Messages.Message {
    const content: any[] = [];
    if (accumulator.reasoning) {
      content.push({
        type: "thinking",
        thinking: accumulator.reasoning,
        signature: "",
      });
    }
    content.push({
      type: "text",
      text: accumulator.content,
    });

    return {
      id: accumulator.id || `anthropic-stream-${Date.now()}`,
      type: "message",
      role: "assistant",
      model: accumulator.model || request.modelId,
      content,
      stop_reason: accumulator.stopReason as any,
      stop_sequence: null,
      usage: accumulator.usage,
    } as any;
  }

  /**
   * Formats messages for Anthropic API with proper system message handling
   *
   * @param request - The internal LLM request
   * @returns Formatted messages and system message for Anthropic
   */
  private formatMessagesForAnthropic(request: InternalLLMChatRequest): {
    messages: Anthropic.Messages.MessageParam[];
    systemMessage?: string;
  } {
    const messages: Anthropic.Messages.MessageParam[] = [];
    const inlineSystemMessages: string[] = [];

    // Check if model supports system messages
    const supportsSystem = request.settings.supportsSystemMessage !== false;

    // Process conversation messages
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

    let systemMessage: string | undefined;

    if (combinedSystemContent) {
      if (useNativeSystemMessage) {
        // Model supports system messages - use Anthropic's system parameter
        systemMessage = combinedSystemContent;
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
        // Don't set systemMessage - it stays undefined
      }
    }

    // Anthropic requires messages to start with 'user' role
    // If the first message is not from user, we need to handle this
    if (messages.length > 0 && messages[0].role !== "user") {
      this.logger.warn(
        "Anthropic API requires first message to be from user. Adjusting message order."
      );
      // Find the first user message and move it to the front, or create a default one
      const firstUserIndex = messages.findIndex((msg) => msg.role === "user");
      if (firstUserIndex > 0) {
        const firstUserMessage = messages.splice(firstUserIndex, 1)[0];
        messages.unshift(firstUserMessage);
      } else if (firstUserIndex === -1) {
        // No user message found, create a default one
        messages.unshift({
          role: "user",
          content: "Please respond based on the previous context.",
        });
      }
    }

    // Ensure alternating user/assistant pattern (Anthropic requirement)
    const cleanedMessages = this.ensureAlternatingRoles(messages);

    return {
      messages: cleanedMessages,
      systemMessage,
    };
  }

  /**
   * Ensures messages alternate between user and assistant roles as required by Anthropic
   *
   * @param messages - Original messages array
   * @returns Cleaned messages with proper alternating pattern
   */
  private ensureAlternatingRoles(
    messages: Anthropic.Messages.MessageParam[]
  ): Anthropic.Messages.MessageParam[] {
    if (messages.length === 0) return messages;

    const cleanedMessages: Anthropic.Messages.MessageParam[] = [];
    let expectedRole: "user" | "assistant" = "user";

    for (const message of messages) {
      if (message.role === expectedRole) {
        cleanedMessages.push(message);
        expectedRole = expectedRole === "user" ? "assistant" : "user";
      } else if (message.role === "user" || message.role === "assistant") {
        // If roles don't alternate properly, we might need to combine messages
        // or insert a placeholder. For now, we'll skip non-alternating messages
        // and log a warning.
        this.logger.warn(
          `Skipping message with unexpected role: expected ${expectedRole}, got ${message.role}`
        );
      }
    }

    return cleanedMessages;
  }

  /**
   * Creates a standardized success response from Anthropic's response
   *
   * @param completion - Raw Anthropic completion response
   * @param request - Original request for context
   * @returns Standardized LLM response
   */
  private createSuccessResponse(
    completion: Anthropic.Messages.Message,
    request: InternalLLMChatRequest
  ): LLMResponse {
    // Anthropic returns content as an array of content blocks. Thinking-capable
    // models may place a thinking block before the text block.
    const textBlocks = completion.content.filter((block: any) => block.type === "text");
    const textContent = textBlocks.map((block: any) => block.text || "").join("");

    if (textBlocks.length === 0) {
      throw new Error("Invalid completion structure from Anthropic API");
    }

    // Extract reasoning from thinking content blocks. This is the only place
    // Anthropic exposes it: `Message` has no `thinking_content` or
    // `reasoning_details` field (the latter is an OpenRouter concept, handled in
    // OpenRouterClientAdapter), so branches reading those could never fire.
    const thinkingContent = completion.content
      .filter((block: any) => block.type === "thinking" && typeof block.thinking === "string")
      .map((block: any) => block.thinking)
      .join("");
    const reasoning: string | undefined = thinkingContent || undefined;

    // Map Anthropic's stop reason to our standard format
    const finishReason = this.mapAnthropicStopReason(completion.stop_reason);

    const choice: any = {
      message: {
        role: "assistant",
        content: textContent,
      },
      rawContent: textContent,
      rawContentParts: completion.content.map((block: any) => ({
        type: String(block.type ?? "unknown"),
        ...(typeof block.text === "string" && { text: block.text }),
        ...(typeof block.thinking === "string" && {
          text: block.thinking,
          reasoning: true,
        }),
        ...(toPreparedRequestValue(block) !== undefined && {
          value: toPreparedRequestValue(block),
        }),
      })),
      finish_reason: finishReason,
      termination: normalizeTermination(
        completion.stop_reason,
        completion.stop_reason === "max_tokens" ? "output" : undefined
      ),
      index: 0,
    };

    // Include reasoning if available and not excluded
    if (reasoning && request.settings.reasoning && !request.settings.reasoning.exclude) {
      choice.reasoning = reasoning;
    }

    const normalizedUsage = normalizeUsage(
      completion.usage as unknown as Record<string, unknown> | undefined,
      {
        prompt: ["input_tokens"],
        completion: ["output_tokens"],
        total: [],
      }
    );

    return {
      id: completion.id,
      provider: request.providerId,
      model: completion.model || request.modelId,
      created: Math.floor(Date.now() / 1000), // Anthropic doesn't provide created timestamp
      choices: [choice],
      ...normalizedUsage,
      object: "chat.completion",
    };
  }

  /**
   * Maps Anthropic stop reasons to standardized format
   *
   * @param anthropicReason - The stop reason from Anthropic
   * @returns Standardized finish reason
   */
  private mapAnthropicStopReason(
    anthropicReason: string | null
  ): string | null {
    if (!anthropicReason) return null;

    // Anthropic's StopReason union is exactly:
    //   end_turn | max_tokens | stop_sequence | tool_use | pause_turn | refusal
    // Note there is no `content_filter` - that is OpenAI's vocabulary. A model
    // that declines on policy grounds reports `refusal`, which we normalize to
    // `content_filter` so callers can detect a blocked completion with the same
    // check they already use for OpenAI and Gemini.
    const reasonMap: Record<string, string> = {
      end_turn: "stop",
      max_tokens: "length",
      stop_sequence: "stop",
      tool_use: "tool_calls",
      refusal: "content_filter",
      // Anthropic-specific: a long-running turn was paused and the caller is
      // expected to continue it. No equivalent in the normalized vocabulary, so
      // it maps to "other" deliberately rather than by falling through.
      pause_turn: "other",
    };

    return reasonMap[anthropicReason] || "other";
  }

  /**
   * Creates a standardized error response from Anthropic errors
   *
   * @param error - The error from Anthropic API
   * @param request - Original request for context
   * @returns Standardized LLM failure response
   */
  private createErrorResponse(
    error: any,
    request: InternalLLMChatRequest
  ): LLMFailureResponse {
    // Use shared error mapping utility for common error patterns
    const initialProviderMessage =
      error instanceof Anthropic.APIError ? error.message : undefined;
    let { errorCode, errorMessage, errorType, status, retryAfterMs } =
      getCommonMappedErrorDetails(error, initialProviderMessage);

    // Apply Anthropic-specific refinements for 400 errors based on message content
    if (error instanceof Anthropic.APIError && status === 400) {
      if (
        error.message.toLowerCase().includes("context length") ||
        error.message.toLowerCase().includes("too long")
      ) {
        errorCode = ADAPTER_ERROR_CODES.CONTEXT_LENGTH_EXCEEDED;
      } else if (
        error.message.toLowerCase().includes("content policy") ||
        error.message.toLowerCase().includes("safety")
      ) {
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
