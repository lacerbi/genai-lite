// AI Summary: Anthropic client adapter for making real API calls to Anthropic's messages endpoint.
// Handles Claude-specific request formatting, response parsing, and error mapping to standardized format.

import Anthropic from "@anthropic-ai/sdk";
import type { LLMResponse, LLMFailureResponse, LLMMessage, LLMStreamEvent } from "../types";
import type {
  ILLMClientAdapter,
  InternalLLMChatRequest,
  AdapterErrorCode,
  AdapterRequestOptions,
} from "./types";
import { ADAPTER_ERROR_CODES } from "./types";
import { getCommonMappedErrorDetails } from "../../shared/adapters/errorUtils";
import {
  collectSystemContent,
  prependSystemToFirstUserMessage,
} from "../../shared/adapters/systemMessageUtils";
import type { Logger } from "../../logging/types";
import { createDefaultLogger } from "../../logging/defaultLogger";

interface AnthropicPreparedRequest {
  anthropic: Anthropic;
  messageParams: Anthropic.Messages.MessageCreateParams;
  requestTransportOptions: Record<string, any>;
  useStructuredOutput: boolean;
  messages: Anthropic.Messages.MessageParam[];
}

interface AnthropicStreamAccumulator {
  id: string;
  model: string;
  created: number;
  content: string;
  reasoning: string;
  stopReason: string | null;
  usage?: any;
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

      // Make the API call - use beta endpoint for structured output
      let completion;
      if (useStructuredOutput) {
        // For structured output, we need to use the beta messages endpoint with proper headers
        completion = await anthropic.messages.create(messageParams, {
          headers: {
            'anthropic-beta': 'structured-outputs-2025-11-13',
          },
          ...requestTransportOptions,
        } as any);
      } else {
        completion =
          Object.keys(requestTransportOptions).length > 0
            ? await anthropic.messages.create(messageParams, requestTransportOptions)
            : await anthropic.messages.create(messageParams);
      }

      this.logger.info(
        `Anthropic API call successful, response ID: ${(completion as any).id}`
      );

      // Convert to standardized response format
      // Cast to any to handle beta response type differences
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
  ): AsyncIterable<LLMStreamEvent> {
    const accumulator: AnthropicStreamAccumulator = {
      id: "",
      model: request.modelId,
      created: Math.floor(Date.now() / 1000),
      content: "",
      reasoning: "",
      stopReason: null,
    };
    let sawEvent = false;
    let started = false;

    try {
      const {
        anthropic,
        messageParams,
        requestTransportOptions,
        useStructuredOutput,
      } = this.prepareMessageRequest(request, apiKey, options);

      this.logger.info(`Making Anthropic streaming API call for model: ${request.modelId}`);
      const streamOptions = useStructuredOutput
        ? {
            headers: {
              "anthropic-beta": "structured-outputs-2025-11-13",
            },
            ...requestTransportOptions,
          }
        : requestTransportOptions;
      const stream =
        Object.keys(streamOptions).length > 0
          ? anthropic.messages.stream(messageParams as any, streamOptions as any)
          : anthropic.messages.stream(messageParams as any);

      for await (const event of stream as AsyncIterable<Anthropic.Messages.MessageStreamEvent>) {
        sawEvent = true;

        if (event.type === "message_start") {
          accumulator.id = event.message.id || accumulator.id;
          accumulator.model = event.message.model || accumulator.model;
          accumulator.stopReason = event.message.stop_reason ?? accumulator.stopReason;
          accumulator.usage = this.mergeAnthropicUsage(accumulator.usage, event.message.usage);

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

          if (event.message.usage) {
            yield {
              type: "usage",
              usage: this.mapAnthropicUsage(accumulator.usage),
            };
          }
          continue;
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

        if (event.type === "content_block_start") {
          const block = event.content_block as any;
          if (block?.type === "text" && typeof block.text === "string" && block.text.length > 0) {
            accumulator.content += block.text;
            yield { type: "content_delta", delta: block.text, index: event.index };
          } else if (
            block?.type === "thinking" &&
            typeof block.thinking === "string" &&
            block.thinking.length > 0
          ) {
            accumulator.reasoning += block.thinking;
            if (request.settings.reasoning?.exclude !== true) {
              yield { type: "reasoning_delta", delta: block.thinking, index: event.index };
            }
          }
        } else if (event.type === "content_block_delta") {
          const delta = event.delta as any;
          if (delta?.type === "text_delta" && typeof delta.text === "string" && delta.text.length > 0) {
            accumulator.content += delta.text;
            yield { type: "content_delta", delta: delta.text, index: event.index };
          } else if (
            delta?.type === "thinking_delta" &&
            typeof delta.thinking === "string" &&
            delta.thinking.length > 0
          ) {
            accumulator.reasoning += delta.thinking;
            if (request.settings.reasoning?.exclude !== true) {
              yield { type: "reasoning_delta", delta: delta.thinking, index: event.index };
            }
          }
        } else if (event.type === "message_delta") {
          accumulator.stopReason = event.delta.stop_reason ?? accumulator.stopReason;
          accumulator.usage = this.mergeAnthropicUsage(accumulator.usage, event.usage);
          if (event.usage) {
            yield {
              type: "usage",
              usage: this.mapAnthropicUsage(accumulator.usage),
            };
          }
        }
      }

      const response = this.createSuccessResponse(
        this.createSyntheticMessage(request, accumulator),
        request
      );
      yield { type: "complete", response };
    } catch (error) {
      this.logger.error("Anthropic streaming API error:", error);
      const errorResponse = this.createErrorResponse(error, request);

      if (sawEvent || accumulator.content.length > 0 || accumulator.reasoning.length > 0) {
        const partial = this.createSuccessResponse(
          this.createSyntheticMessage(request, accumulator),
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
    // Check if structured output is requested - need beta API
    const useStructuredOutput = !!(
      request.settings.structuredOutput?.schema &&
      request.settings.structuredOutput.enabled !== false
    );

    // Initialize Anthropic client
    const anthropic = new Anthropic({
      apiKey,
      ...(this.baseURL && { baseURL: this.baseURL }),
      maxRetries: 0, // retries are owned by the unified LLMService retry layer
    });

    // Per-request transport options (abort signal, timeout)
    const requestTransportOptions = {
      ...(options?.signal && { signal: options.signal }),
      ...(options?.timeoutMs !== undefined && { timeout: options.timeoutMs }),
    };

    // Format messages for Anthropic API (Claude has specific requirements)
    const { messages, systemMessage } = this.formatMessagesForAnthropic(request);

    // Prepare API call parameters
    const messageParams: Anthropic.Messages.MessageCreateParams = {
      model: request.modelId,
      messages: messages,
      max_tokens: request.settings.maxTokens,
      temperature: request.settings.temperature,
      top_p: request.settings.topP,
      ...(request.settings.topK !== undefined && {
        top_k: request.settings.topK,
      }),
      ...(systemMessage && { system: systemMessage }),
      ...(request.settings.stopSequences.length > 0 && {
        stop_sequences: request.settings.stopSequences,
      }),
    };

    // Handle structured output configuration for Anthropic
    // Note: Structured output requires the beta API endpoint
    if (useStructuredOutput) {
      const so = request.settings.structuredOutput!;
      // Anthropic requires additionalProperties: false on all object schemas
      const processedSchema = so.strict !== false
        ? this.addAdditionalPropertiesFalse(so.schema)
        : so.schema;
      // Anthropic's format: output_format.schema is the schema directly
      (messageParams as any).output_format = {
        type: 'json_schema',
        name: so.name,
        schema: processedSchema,
        strict: so.strict !== false,
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
      anthropic,
      messageParams,
      requestTransportOptions,
      useStructuredOutput,
      messages,
    };
  }

  private mapAnthropicUsage(usage: any) {
    const promptTokens = usage.input_tokens ?? 0;
    const completionTokens = usage.output_tokens ?? 0;
    return {
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: promptTokens + completionTokens,
    };
  }

  private mergeAnthropicUsage(
    current: any | undefined,
    next: any | undefined
  ): any | undefined {
    if (!next) {
      return current;
    }

    return {
      ...(current || {}),
      ...next,
      input_tokens: next.input_tokens ?? current?.input_tokens ?? 0,
      output_tokens: next.output_tokens ?? current?.output_tokens ?? 0,
    };
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
   * Recursively adds additionalProperties: false to all object schemas
   * Required by Anthropic's strict mode for structured outputs
   *
   * @param schema - The JSON schema to process
   * @returns A new schema with additionalProperties: false on all objects
   */
  private addAdditionalPropertiesFalse(schema: any): any {
    if (!schema || typeof schema !== 'object') {
      return schema;
    }

    const processed: any = { ...schema };

    // If this is an object type, add additionalProperties: false
    if (processed.type === 'object') {
      processed.additionalProperties = false;

      // Process nested properties
      if (processed.properties) {
        processed.properties = {};
        for (const [key, value] of Object.entries(schema.properties)) {
          processed.properties[key] = this.addAdditionalPropertiesFalse(value);
        }
      }
    }

    // Process array items
    if (processed.items) {
      processed.items = this.addAdditionalPropertiesFalse(schema.items);
    }

    return processed;
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

    // Extract thinking/reasoning content if available
    let reasoning: string | undefined;
    let reasoning_details: any | undefined;
    
    // Check for thinking content in the response
    if ((completion as any).thinking_content) {
      reasoning = (completion as any).thinking_content;
    }

    const thinkingContent = completion.content
      .filter((block: any) => block.type === "thinking" && typeof block.thinking === "string")
      .map((block: any) => block.thinking)
      .join("");
    if (!reasoning && thinkingContent) {
      reasoning = thinkingContent;
    }
    
    // Check for reasoning details that need to be preserved
    if ((completion as any).reasoning_details) {
      reasoning_details = (completion as any).reasoning_details;
    }

    // Map Anthropic's stop reason to our standard format
    const finishReason = this.mapAnthropicStopReason(completion.stop_reason);

    const choice: any = {
      message: {
        role: "assistant",
        content: textContent,
      },
      finish_reason: finishReason,
      index: 0,
    };

    // Include reasoning if available and not excluded
    if (reasoning && request.settings.reasoning && !request.settings.reasoning.exclude) {
      choice.reasoning = reasoning;
    }
    
    // Always include reasoning_details if present (for tool use continuation)
    if (reasoning_details) {
      choice.reasoning_details = reasoning_details;
    }

    return {
      id: completion.id,
      provider: request.providerId,
      model: completion.model || request.modelId,
      created: Math.floor(Date.now() / 1000), // Anthropic doesn't provide created timestamp
      choices: [choice],
      usage: completion.usage
        ? {
            prompt_tokens: completion.usage.input_tokens,
            completion_tokens: completion.usage.output_tokens,
            total_tokens:
              completion.usage.input_tokens + completion.usage.output_tokens,
          }
        : undefined,
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

    const reasonMap: Record<string, string> = {
      end_turn: "stop",
      max_tokens: "length",
      stop_sequence: "stop",
      content_filter: "content_filter",
      tool_use: "tool_calls",
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
