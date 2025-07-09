import type { 
  LLMChatRequest, 
  LLMChatRequestWithPreset,
  LLMFailureResponse,
  LLMSettings,
  ModelInfo
} from "../types";
import { validateLLMSettings } from "../config";

/**
 * Validates LLM requests including structure, messages, and settings
 */
export class RequestValidator {
  /**
   * Validates basic LLM request structure
   *
   * @param request - The request to validate
   * @returns LLMFailureResponse if validation fails, null if valid
   */
  validateRequestStructure(
    request: LLMChatRequest | LLMChatRequestWithPreset
  ): LLMFailureResponse | null {
    // Basic request structure validation
    if (
      !request.messages ||
      !Array.isArray(request.messages) ||
      request.messages.length === 0
    ) {
      return {
        provider: request.providerId || (request as LLMChatRequestWithPreset).presetId || 'unknown',
        model: request.modelId || (request as LLMChatRequestWithPreset).presetId || 'unknown',
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
          provider: request.providerId || ('presetId' in request ? request.presetId : undefined) || 'unknown',
          model: request.modelId || ('presetId' in request ? request.presetId : undefined) || 'unknown',
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
          provider: request.providerId || ('presetId' in request ? request.presetId : undefined) || 'unknown',
          model: request.modelId || ('presetId' in request ? request.presetId : undefined) || 'unknown',
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
   * Validates LLM settings
   *
   * @param settings - The settings to validate
   * @param providerId - The provider ID for error context
   * @param modelId - The model ID for error context
   * @returns LLMFailureResponse if validation fails, null if valid
   */
  validateSettings(
    settings: Partial<LLMSettings>,
    providerId: string,
    modelId: string
  ): LLMFailureResponse | null {
    const settingsValidationErrors = validateLLMSettings(settings);
    if (settingsValidationErrors.length > 0) {
      return {
        provider: providerId as any,
        model: modelId,
        error: {
          message: `Invalid settings: ${settingsValidationErrors.join(", ")}`,
          code: "INVALID_SETTINGS",
          type: "validation_error",
        },
        object: "error",
      };
    }
    return null;
  }

  /**
   * Validates reasoning settings against model capabilities
   *
   * @param modelInfo - The model information
   * @param reasoning - The reasoning settings to validate
   * @param request - The original request for error context
   * @returns LLMFailureResponse if validation fails, null if valid
   */
  validateReasoningSettings(
    modelInfo: ModelInfo,
    reasoning: LLMSettings['reasoning'],
    request: LLMChatRequest
  ): LLMFailureResponse | null {
    // If no reasoning settings provided, nothing to validate
    if (!reasoning) {
      return null;
    }

    // If model doesn't support reasoning
    if (!modelInfo.reasoning?.supported) {
      // Check if user is trying to enable reasoning
      const tryingToEnableReasoning = 
        reasoning.enabled === true ||
        reasoning.effort !== undefined ||
        (reasoning.maxTokens !== undefined && reasoning.maxTokens > 0);
      
      if (tryingToEnableReasoning) {
        return {
          provider: request.providerId!,
          model: request.modelId!,
          error: {
            message: `Model ${request.modelId} does not support reasoning/thinking`,
            type: 'validation_error',
            code: 'reasoning_not_supported'
          },
          object: 'error'
        };
      }
      // Otherwise, user is explicitly disabling reasoning - this is fine
      // The reasoning settings will be stripped later
    }

    return null;
  }
}