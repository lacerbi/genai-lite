import type {
  LLMChatRequest,
  LLMChatRequestWithPreset,
  LLMFailureResponse,
  LLMSettings,
  ModelInfo,
  StructuredOutputSettings
} from "../types";
import type { Logger } from "../../logging/types";
import { createDefaultLogger } from "../../logging/defaultLogger";
import { validateLLMSettings } from "../config";

/**
 * Validates LLM requests including structure, messages, and settings
 */
export class RequestValidator {
  private logger: Logger;

  /**
   * Creates a new RequestValidator
   *
   * @param logger Optional logger instance
   */
  constructor(logger?: Logger) {
    this.logger = logger ?? createDefaultLogger();
  }
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
    if (
      providerId === "anthropic" &&
      settings.temperature !== undefined &&
      settings.topP !== undefined
    ) {
      settingsValidationErrors.push(
        "Anthropic requests cannot specify both temperature and topP; choose one sampler"
      );
    }

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

  /**
   * Validates structured output settings against model capabilities
   *
   * @param modelInfo - The model information
   * @param structuredOutput - The structured output settings to validate
   * @param request - The original request for error context
   * @returns LLMFailureResponse if validation fails, null if valid
   */
  validateStructuredOutputSettings(
    modelInfo: ModelInfo,
    structuredOutput: StructuredOutputSettings | undefined,
    request: LLMChatRequest
  ): LLMFailureResponse | null {
    // If no structured output settings provided, nothing to validate
    if (!structuredOutput) {
      return null;
    }

    // Check if explicitly disabled
    if (structuredOutput.enabled === false) {
      return null;
    }

    if (
      structuredOutput.delivery !== undefined &&
      structuredOutput.delivery !== "native" &&
      structuredOutput.delivery !== "prompt"
    ) {
      return {
        provider: request.providerId!,
        model: request.modelId!,
        error: {
          message:
            "structuredOutput.delivery must be either 'native' or 'prompt'.",
          type: "validation_error",
          code: "structured_output_invalid_delivery",
          param: "settings.structuredOutput.delivery",
        },
        object: "error",
      };
    }

    // Explicit prompt delivery is instruction-only and does not require a
    // provider-native structured-output capability.
    if (structuredOutput.delivery === "prompt") {
      if (structuredOutput.strict !== false) {
        this.logger.warn(
          `Prompt-delivered structured output for ${request.modelId} is instruction-only; ` +
          `strict provider enforcement is not available.`
        );
      }
      return null;
    }

    // If model has explicit structuredOutput capabilities defined, check them
    if (modelInfo.structuredOutput !== undefined) {
      if (!modelInfo.structuredOutput.supported) {
        const notes = modelInfo.structuredOutput.notes;
        const baseMessage = `Structured output is not available for ${request.modelId} on ${request.providerId}`;
        const message = notes ? `${baseMessage}. ${notes}` : baseMessage;
        return {
          provider: request.providerId!,
          model: request.modelId!,
          error: {
            message,
            type: 'validation_error',
            code: 'structured_output_not_supported'
          },
          object: 'error'
        };
      }

      // Warn (but don't error) if strict mode requested but not supported
      if (structuredOutput.strict !== false && modelInfo.structuredOutput.strictMode === false) {
        this.logger.warn(
          `Model ${request.modelId} does not support strict mode for structured output. ` +
          `Schema validation will be client-side only.`
        );
      }
    }
    // If structuredOutput capabilities are not defined on the model,
    // allow the request to proceed (for unknown models on providers that allow them).
    // The provider will either support it or return an appropriate error.

    return null;
  }
}
