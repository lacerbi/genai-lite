// AI Summary: Anthropic client adapter for making real API calls to Anthropic's messages endpoint.
// Handles Claude-specific request formatting, response parsing, and error mapping to standardized format.

import Anthropic from "@anthropic-ai/sdk";
import type { LLMResponse, LLMFailureResponse, LLMMessage } from "../types";
import type {
  ILLMClientAdapter,
  InternalLLMChatRequest,
  AdapterErrorCode,
} from "./types";
import { ADAPTER_ERROR_CODES } from "./types";
import { getCommonMappedErrorDetails } from "../../shared/adapters/errorUtils";
import { createDefaultLogger } from "../../logging/defaultLogger";

const logger = createDefaultLogger();

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

  /**
   * Creates a new Anthropic client adapter
   *
   * @param config Optional configuration for the adapter
   * @param config.baseURL Custom base URL for Anthropic-compatible APIs
   */
  constructor(config?: { baseURL?: string }) {
    this.baseURL = config?.baseURL;
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
    apiKey: string
  ): Promise<LLMResponse | LLMFailureResponse> {
    try {
      // Initialize Anthropic client
      const anthropic = new Anthropic({
        apiKey,
        ...(this.baseURL && { baseURL: this.baseURL }),
      });

      // Format messages for Anthropic API (Claude has specific requirements)
      const { messages, systemMessage } =
        this.formatMessagesForAnthropic(request);

      // Prepare API call parameters
      const messageParams: Anthropic.Messages.MessageCreateParams = {
        model: request.modelId,
        messages: messages,
        max_tokens: request.settings.maxTokens,
        temperature: request.settings.temperature,
        top_p: request.settings.topP,
        ...(systemMessage && { system: systemMessage }),
        ...(request.settings.stopSequences.length > 0 && {
          stop_sequences: request.settings.stopSequences,
        }),
      };

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
            budget_tokens: Math.min(budgetTokens, 32000) // Cap at max
          };
        }
      }

      logger.info(`Making Anthropic API call for model: ${request.modelId}`);
      logger.debug(`Anthropic API parameters:`, {
        model: messageParams.model,
        temperature: messageParams.temperature,
        max_tokens: messageParams.max_tokens,
        top_p: messageParams.top_p,
        hasSystem: !!messageParams.system,
        messageCount: messages.length,
        hasStopSequences: !!messageParams.stop_sequences,
      });

      // Make the API call
      const completion = await anthropic.messages.create(messageParams);

      logger.info(
        `Anthropic API call successful, response ID: ${completion.id}`
      );

      // Convert to standardized response format
      return this.createSuccessResponse(completion, request);
    } catch (error) {
      logger.error("Anthropic API error:", error);
      return this.createErrorResponse(error, request);
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
    let systemMessage = request.systemMessage;

    // Process conversation messages
    for (const message of request.messages) {
      if (message.role === "system") {
        // Anthropic handles system messages separately
        // If we already have a system message, append to it
        if (systemMessage) {
          systemMessage += "\n\n" + message.content;
        } else {
          systemMessage = message.content;
        }
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

    // Anthropic requires messages to start with 'user' role
    // If the first message is not from user, we need to handle this
    if (messages.length > 0 && messages[0].role !== "user") {
      logger.warn(
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
        logger.warn(
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
    // Anthropic returns content as an array of content blocks
    const contentBlock = completion.content[0];

    if (!contentBlock || contentBlock.type !== "text") {
      throw new Error("Invalid completion structure from Anthropic API");
    }

    // Extract thinking/reasoning content if available
    let reasoning: string | undefined;
    let reasoning_details: any | undefined;
    
    // Check for thinking content in the response
    if ((completion as any).thinking_content) {
      reasoning = (completion as any).thinking_content;
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
        content: contentBlock.text,
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
    let { errorCode, errorMessage, errorType, status } =
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
        providerError: error,
      },
      object: "error",
    };
  }
}
