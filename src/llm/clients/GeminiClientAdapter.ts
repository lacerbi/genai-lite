// AI Summary: Gemini client adapter for making real API calls to Google's Gemini LLM APIs.
// Handles Gemini-specific request formatting, safety settings, response parsing, and error mapping.

import { GoogleGenAI } from "@google/genai";
import type {
  LLMResponse,
  LLMFailureResponse,
  GeminiSafetySetting,
} from "../types";
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
 * Client adapter for Google Gemini API integration
 *
 * This adapter:
 * - Formats requests according to Gemini's generative AI API requirements
 * - Handles Gemini-specific safety settings and system instructions
 * - Maps Gemini responses to standardized LLMResponse format
 * - Converts Gemini errors to standardized LLMFailureResponse format
 * - Manages Gemini-specific settings and constraints
 */
export class GeminiClientAdapter implements ILLMClientAdapter {
  private baseURL?: string;

  /**
   * Creates a new Gemini client adapter
   *
   * @param config Optional configuration for the adapter
   * @param config.baseURL Custom base URL (unused for Gemini but kept for consistency)
   */
  constructor(config?: { baseURL?: string }) {
    this.baseURL = config?.baseURL;
  }

  /**
   * Sends a chat message to Gemini's API
   *
   * @param request - The internal LLM request with applied settings
   * @param apiKey - The decrypted Gemini API key
   * @returns Promise resolving to success or failure response
   */
  async sendMessage(
    request: InternalLLMChatRequest,
    apiKey: string
  ): Promise<LLMResponse | LLMFailureResponse> {
    try {
      // Initialize Gemini client
      const genAI = new GoogleGenAI({ apiKey });

      // Format the request for Gemini API
      const { contents, generationConfig, safetySettings, systemInstruction } =
        this.formatInternalRequestToGemini(request);

      logger.info(`Making Gemini API call for model: ${request.modelId}`);
      logger.debug(`Gemini API parameters:`, {
        model: request.modelId,
        temperature: generationConfig.temperature,
        maxOutputTokens: generationConfig.maxOutputTokens,
        hasSystemInstruction: !!systemInstruction,
        contentsLength: contents.length,
        safetySettingsCount: safetySettings?.length || 0,
      });

      // Generate content using the modern API
      const result = await genAI.models.generateContent({
        model: request.modelId,
        contents: contents,
        config: {
          ...generationConfig,
          safetySettings: safetySettings,
          ...(systemInstruction && { systemInstruction: systemInstruction }),
        },
      });

      logger.info(`Gemini API call successful, processing response`);

      // Convert to standardized response format
      return this.createSuccessResponse(result, request);
    } catch (error) {
      logger.error("Gemini API error:", error);
      return this.createErrorResponse(error, request);
    }
  }

  /**
   * Validates Gemini API key format
   *
   * @param apiKey - The API key to validate
   * @returns True if the key format appears valid
   */
  validateApiKey(apiKey: string): boolean {
    // Gemini API keys typically start with 'AIza' and are around 39 characters long
    return (
      typeof apiKey === "string" &&
      apiKey.startsWith("AIza") &&
      apiKey.length >= 35
    );
  }

  /**
   * Gets adapter information
   */
  getAdapterInfo() {
    return {
      providerId: "gemini" as const,
      name: "Gemini Client Adapter",
      version: "1.0.0",
    };
  }

  /**
   * Formats the internal LLM request for Gemini API
   *
   * @param request - The internal LLM request
   * @returns Formatted request components for Gemini
   */
  private formatInternalRequestToGemini(request: InternalLLMChatRequest): {
    contents: any[];
    generationConfig: any;
    safetySettings?: any[];
    systemInstruction?: string;
  } {
    const contents: any[] = [];
    let systemInstruction = request.systemMessage;

    // Check if model supports system instructions (e.g., Gemma models don't)
    const supportsSystem = request.settings.supportsSystemMessage !== false;

    // Process messages - separate system messages and build conversation contents
    for (const message of request.messages) {
      if (message.role === "system") {
        // Collect system content (will be used as systemInstruction or prepended to user message)
        if (systemInstruction) {
          systemInstruction += "\n\n" + message.content;
        } else {
          systemInstruction = message.content;
        }
      } else if (message.role === "user") {
        contents.push({
          role: "user",
          parts: [{ text: message.content }],
        });
      } else if (message.role === "assistant") {
        // Map assistant to model for Gemini
        contents.push({
          role: "model",
          parts: [{ text: message.content }],
        });
      }
    }

    // If model doesn't support system instructions but we have system content,
    // prepend it to the first user message instead
    if (!supportsSystem && systemInstruction && contents.length > 0) {
      const firstUserIndex = contents.findIndex(c => c.role === "user");
      if (firstUserIndex !== -1) {
        const originalText = contents[firstUserIndex].parts[0].text;
        contents[firstUserIndex].parts[0].text = systemInstruction + "\n\n" + originalText;
        logger.debug(`Model ${request.modelId} doesn't support system instructions - prepended to first user message`);
      }
      // Clear systemInstruction so it's not sent to the API
      systemInstruction = undefined;
    }

    // Build generation config
    const generationConfig: any = {
      maxOutputTokens: request.settings.maxTokens,
      temperature: request.settings.temperature,
      ...(request.settings.topP && { topP: request.settings.topP }),
      ...(request.settings.stopSequences &&
        request.settings.stopSequences.length > 0 && {
          stopSequences: request.settings.stopSequences,
        }),
    };

    // Handle reasoning/thinking configuration
    if (request.settings.reasoning && !request.settings.reasoning.exclude) {
      const reasoning = request.settings.reasoning;
      let thinkingBudget: number | undefined;

      // Convert reasoning settings to Gemini's thinkingConfig
      if (reasoning.maxTokens !== undefined) {
        thinkingBudget = reasoning.maxTokens;
      } else if (reasoning.effort) {
        // Convert effort levels to token budgets
        // Get model info to determine max budget
        const modelId = request.modelId;
        const maxBudget = modelId.includes('flash') ? 24576 : 65536; // Default max budgets
        
        switch (reasoning.effort) {
          case 'high':
            thinkingBudget = Math.floor(maxBudget * 0.8);
            break;
          case 'medium':
            thinkingBudget = Math.floor(maxBudget * 0.5);
            break;
          case 'low':
            thinkingBudget = Math.floor(maxBudget * 0.2);
            break;
        }
      } else if (reasoning.enabled !== false) {
        // Use model default or dynamic budget (-1)
        thinkingBudget = -1; // Let model decide
      }

      if (thinkingBudget !== undefined) {
        generationConfig.thinkingConfig = {
          thinkingBudget: thinkingBudget,
          includeThoughts: true  // Request thought summaries in response
        };
      }
    }

    // Map safety settings from Athanor format to Gemini SDK format
    const safetySettings = request.settings.geminiSafetySettings?.map(
      (setting: GeminiSafetySetting) => ({
        category: setting.category,
        threshold: setting.threshold,
      })
    );

    return {
      contents,
      generationConfig,
      safetySettings,
      systemInstruction,
    };
  }

  /**
   * Creates a standardized success response from Gemini's response
   *
   * @param response - Raw Gemini response
   * @param request - Original request for context
   * @returns Standardized LLM response
   */
  private createSuccessResponse(
    response: any,
    request: InternalLLMChatRequest
  ): LLMResponse {
    // Extract content from the response object
    const candidate = response.candidates?.[0];
    let content = "";
    let reasoning: string | undefined;
    
    // Process all parts to extract content and thought summaries
    if (candidate?.content?.parts) {
      const thoughtParts: string[] = [];
      const contentParts: string[] = [];
      
      for (const part of candidate.content.parts) {
        if (part.thought) {
          // This is a thought summary
          thoughtParts.push(part.text || "");
        } else if (part.text) {
          // Regular content
          contentParts.push(part.text);
        }
      }
      
      content = contentParts.join("");
      if (thoughtParts.length > 0) {
        reasoning = thoughtParts.join("\n\n");
      }
    }

    // Extract usage data if available
    const usageMetadata = response.usageMetadata || {};

    const finishReason = this.mapGeminiFinishReason(
      candidate?.finishReason || null
    );

    const choice: any = {
      message: {
        role: "assistant",
        content: content,
      },
      finish_reason: finishReason,
      index: 0,
    };

    // Include reasoning if available and not excluded
    if (reasoning && request.settings.reasoning && !request.settings.reasoning.exclude) {
      choice.reasoning = reasoning;
    }

    return {
      id: this.generateResponseId(),
      provider: request.providerId,
      model: response.modelUsed || request.modelId,
      created: Math.floor(Date.now() / 1000),
      choices: [choice],
      usage: usageMetadata
        ? {
            prompt_tokens: usageMetadata.promptTokenCount || 0,
            completion_tokens: usageMetadata.candidatesTokenCount || 0,
            total_tokens: usageMetadata.totalTokenCount || 0,
          }
        : undefined,
      object: "chat.completion",
    };
  }

  /**
   * Maps Gemini finish reasons to standardized format
   *
   * @param geminiReason - The finish reason from Gemini
   * @returns Standardized finish reason
   */
  private mapGeminiFinishReason(geminiReason: string | null): string | null {
    if (!geminiReason) return null;

    const reasonMap: Record<string, string> = {
      STOP: "stop",
      MAX_TOKENS: "length",
      SAFETY: "content_filter",
      RECITATION: "content_filter",
      PROHIBITED_CONTENT: "content_filter",
      SPII: "content_filter",
      BLOCKLIST: "content_filter",
      LANGUAGE: "other",
      OTHER: "other",
      MALFORMED_FUNCTION_CALL: "function_call_error",
    };

    return reasonMap[geminiReason] || "other";
  }

  /**
   * Creates a standardized error response from Gemini errors
   *
   * @param error - The error from Gemini API
   * @param request - Original request for context
   * @returns Standardized LLM failure response
   */
  private createErrorResponse(
    error: any,
    request: InternalLLMChatRequest
  ): LLMFailureResponse {
    // Use shared error mapping utility for common error patterns
    const initialProviderMessage = error?.message;
    let { errorCode, errorMessage, errorType, status } =
      getCommonMappedErrorDetails(error, initialProviderMessage);

    // Apply Gemini-specific refinements for certain error types
    if (error && error.message) {
      const message = error.message.toLowerCase();

      if (message.includes("context length") || message.includes("too long")) {
        errorCode = ADAPTER_ERROR_CODES.CONTEXT_LENGTH_EXCEEDED;
        errorType = "invalid_request_error";
      } else if (message.includes("safety") || message.includes("blocked")) {
        errorCode = ADAPTER_ERROR_CODES.CONTENT_FILTER;
        errorType = "content_filter_error";
      } else if (
        message.includes("api key") ||
        message.includes("authentication")
      ) {
        errorCode = ADAPTER_ERROR_CODES.INVALID_API_KEY;
        errorType = "authentication_error";
      } else if (message.includes("quota") || message.includes("limit")) {
        errorCode = ADAPTER_ERROR_CODES.RATE_LIMIT_EXCEEDED;
        errorType = "rate_limit_error";
      }
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

  /**
   * Generates a unique response ID
   *
   * @returns A unique response ID string
   */
  private generateResponseId(): string {
    return `gemini-${Date.now()}-${Math.random()
      .toString(36)
      .substring(2, 15)}`;
  }
}
