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
  AdapterRequestOptions,
  AdapterLLMStreamEvent,
  AdapterPreparationContext,
  AdapterPreparationResult,
  AdapterPreparedRequest,
} from "./types";
import { ADAPTER_ERROR_CODES } from "./types";
import { getCommonMappedErrorDetails } from "../../shared/adapters/errorUtils";
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

interface GeminiTransportState {
  abortSignal?: AbortSignal;
  timedOut: boolean;
  cleanup: () => void;
}

interface GeminiPreparedRequest {
  genAI: GoogleGenAI;
  params: any;
  transportState: GeminiTransportState;
  generationConfig: any;
  safetySettings?: any[];
  systemInstruction?: string;
  contents: any[];
}

interface GeminiSemanticRequest {
  params: any;
  generationConfig: any;
  safetySettings?: any[];
  systemInstruction?: string;
  contents: any[];
}

interface GeminiPreparedProviderRequest {
  request: InternalLLMChatRequest;
  params: any;
}

const GEMINI_ADAPTER_REVISION = "gemini-adapter-v1";
const GEMINI_REQUEST_SHAPE_REVISION = "gemini-generate-content-v1";

interface GeminiStreamAccumulator {
  responseId: string;
  created: number;
  model: string;
  contentParts: string[];
  thoughtParts: string[];
  rawParts: Record<string, unknown>[];
  finishReason: string | null;
  usageMetadata?: any;
}

function getGeminiRawPartType(part: Record<string, unknown>): string {
  if (part.thought === true) {
    return "thought";
  }
  if (typeof part.text === "string") {
    return "text";
  }
  const typedKeys = [
    "functionCall",
    "functionResponse",
    "executableCode",
    "codeExecutionResult",
    "inlineData",
    "fileData",
    "videoMetadata",
  ];
  return typedKeys.find((key) => part[key] !== undefined) ?? "unknown";
}

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
  private logger: Logger;

  /**
   * Creates a new Gemini client adapter
   *
   * @param config Optional configuration for the adapter
   * @param config.baseURL Custom base URL (unused for Gemini but kept for consistency)
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
      const semantic = this.prepareGenerateContentParams(request);
      const providerRequest =
        freezeProviderRequest<GeminiPreparedProviderRequest>({
          request,
          params: semantic.params,
        });
      return {
        prepared: {
          mode: context.mode,
          providerRequest,
          requestView: createPreparedRequestView({
            operation:
              context.mode === "stream"
                ? "gemini.generateContentStream"
                : "gemini.generateContent",
            mode: context.mode,
            payload: {
              ...semantic.params,
              systemInstruction: semantic.systemInstruction,
              thinkingConfig: semantic.generationConfig.thinkingConfig,
            },
            messageField: "contents",
            systemField: "systemInstruction",
            reasoningField: "thinkingConfig",
            structuredOutput: request.settings.structuredOutput,
          }),
          promptAccounting: { status: "unavailable" },
          outputTokenLimit: context.outputTokenLimit,
          bindings: {
            adapterRevision: GEMINI_ADAPTER_REVISION,
            requestShapeRevision: GEMINI_REQUEST_SHAPE_REVISION,
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
      prepared.providerRequest as GeminiPreparedProviderRequest;
    const request = providerRequest.request;
    let transportState: GeminiTransportState | undefined;
    try {
      transportState = this.createTransportState(options);
      const params = this.addTransportToParams(
        structuredClone(providerRequest.params),
        options,
        transportState
      );
      const genAI = new GoogleGenAI({ apiKey });
      const result = await genAI.models.generateContent(params);
      return this.createSuccessResponse(result, request);
    } catch (error) {
      this.logger.error("Gemini prepared API error:", error);
      return this.createErrorResponse(
        error,
        request,
        this.getTransportErrorContext(options, transportState)
      );
    } finally {
      transportState?.cleanup();
    }
  }

  async *streamPrepared(
    prepared: AdapterPreparedRequest,
    apiKey: string,
    options?: AdapterRequestOptions
  ): AsyncIterable<AdapterLLMStreamEvent> {
    const providerRequest =
      prepared.providerRequest as GeminiPreparedProviderRequest;
    yield* this.streamContent(
      providerRequest.request,
      structuredClone(providerRequest.params),
      apiKey,
      options
    );
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
    apiKey: string,
    options?: AdapterRequestOptions
  ): Promise<LLMResponse | LLMFailureResponse> {
    request = applyPromptStructuredOutput(request);
    // The SDK enforces httpOptions.timeout by aborting the same internal controller
    // the caller's abortSignal funnels into, so timeout and caller abort surface as
    // identical AbortErrors and cannot be distinguished from the error object. The
    // adapter owns the timeout instead and classifies from its own state in the
    // catch block.
    let transportState: GeminiTransportState | undefined;
    try {
      // Initialize Gemini client. The SDK's internal retry layer is opt-in via
      // httpOptions.retryOptions — it must stay unset here because LLMService's
      // withRetry owns retrying (SDK retries would multiply attempts).
      const prepared = this.prepareGenerateContentRequest(request, apiKey, options);
      transportState = prepared.transportState;

      this.logger.info(`Making Gemini API call for model: ${request.modelId}`);
      this.logger.debug(`Gemini API parameters:`, {
        model: request.modelId,
        temperature: prepared.generationConfig.temperature,
        maxOutputTokens: prepared.generationConfig.maxOutputTokens,
        hasSystemInstruction: !!prepared.systemInstruction,
        contentsLength: prepared.contents.length,
        safetySettingsCount: prepared.safetySettings?.length || 0,
      });

      const result = await prepared.genAI.models.generateContent(prepared.params);

      this.logger.info(`Gemini API call successful, processing response`);

      // Convert to standardized response format
      return this.createSuccessResponse(result, request);
    } catch (error) {
      this.logger.error("Gemini API error:", error);
      return this.createErrorResponse(
        error,
        request,
        this.getTransportErrorContext(options, transportState)
      );
    } finally {
      transportState?.cleanup();
    }
  }

  async *streamMessage(
    request: InternalLLMChatRequest,
    apiKey: string,
    options?: AdapterRequestOptions
  ): AsyncIterable<AdapterLLMStreamEvent> {
    request = applyPromptStructuredOutput(request);
    const semantic = this.prepareGenerateContentParams(request);
    yield* this.streamContent(request, semantic.params, apiKey, options);
  }

  private async *streamContent(
    request: InternalLLMChatRequest,
    semanticParams: any,
    apiKey: string,
    options?: AdapterRequestOptions
  ): AsyncIterable<AdapterLLMStreamEvent> {
    const accumulator: GeminiStreamAccumulator = {
      responseId: this.generateResponseId(),
      created: Math.floor(Date.now() / 1000),
      model: request.modelId,
      contentParts: [],
      thoughtParts: [],
      rawParts: [],
      finishReason: null,
    };
    let transportState: GeminiTransportState | undefined;
    let sawChunk = false;
    let started = false;

    try {
      transportState = this.createTransportState(options);
      const params = this.addTransportToParams(
        semanticParams,
        options,
        transportState
      );
      const genAI = new GoogleGenAI({ apiKey });

      this.logger.info(`Making Gemini streaming API call for model: ${request.modelId}`);
      const stream = await genAI.models.generateContentStream(params);

      for await (const chunk of stream) {
        sawChunk = true;
        this.updateGeminiAccumulatorMetadata(accumulator, chunk);
        const chunkEvents = this.processGeminiStreamChunk(
          accumulator,
          chunk,
          request
        );

        for (const event of chunkEvents) {
          if (event.type === "adapter_evidence") {
            yield event;
          }
        }

        if (!started) {
          started = true;
          yield {
            type: "start",
            provider: request.providerId,
            model: accumulator.model,
            id: accumulator.responseId,
            created: accumulator.created,
          };
        }

        for (const event of chunkEvents) {
          if (event.type !== "adapter_evidence") {
            yield event;
          }
        }
      }

      const response = this.createSuccessResponse(
        this.createSyntheticGeminiResponse(accumulator),
        request
      );
      yield { type: "complete", response };
    } catch (error) {
      this.logger.error("Gemini streaming API error:", error);
      const errorResponse = this.createErrorResponse(
        error,
        request,
        this.getTransportErrorContext(options, transportState)
      );

      if (sawChunk || accumulator.contentParts.length > 0 || accumulator.thoughtParts.length > 0) {
        const partial = this.createSuccessResponse(
          this.createSyntheticGeminiResponse(accumulator),
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
      }

      yield { type: "error", error: errorResponse };
    } finally {
      transportState?.cleanup();
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

  private prepareGenerateContentRequest(
    request: InternalLLMChatRequest,
    apiKey: string,
    options?: AdapterRequestOptions
  ): GeminiPreparedRequest {
    // The SDK's internal retry layer is opt-in via httpOptions.retryOptions and
    // must stay unset because LLMService's withRetry owns retrying.
    const semantic = this.prepareGenerateContentParams(request);
    const transportState = this.createTransportState(options);

    return {
      ...semantic,
      genAI: new GoogleGenAI({ apiKey }),
      params: this.addTransportToParams(
        semantic.params,
        options,
        transportState
      ),
      transportState,
    };
  }

  private prepareGenerateContentParams(
    request: InternalLLMChatRequest
  ): GeminiSemanticRequest {
    const { contents, generationConfig, safetySettings, systemInstruction } =
      this.formatInternalRequestToGemini(request);
    return {
      params: {
        model: request.modelId,
        contents,
        config: {
          ...generationConfig,
          safetySettings,
          ...(systemInstruction && { systemInstruction }),
        },
      },
      generationConfig,
      safetySettings,
      systemInstruction,
      contents,
    };
  }

  private addTransportToParams(
    semanticParams: any,
    options: AdapterRequestOptions | undefined,
    transportState: GeminiTransportState
  ): any {
    return {
      ...semanticParams,
      config: {
        ...semanticParams.config,
        ...(transportState.abortSignal && {
          abortSignal: transportState.abortSignal,
        }),
        ...(options?.timeoutMs !== undefined && {
          httpOptions: { timeout: options.timeoutMs + 1000 },
        }),
      },
    };
  }

  private createTransportState(options?: AdapterRequestOptions): GeminiTransportState {
    // The SDK enforces httpOptions.timeout by aborting the same internal controller
    // the caller's abortSignal funnels into, so timeout and caller abort surface as
    // identical AbortErrors. The adapter owns the timeout and classifies from this
    // state in the catch block.
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    const state: GeminiTransportState = {
      abortSignal: options?.signal,
      timedOut: false,
      cleanup: () => {
        if (timeoutHandle !== undefined) {
          clearTimeout(timeoutHandle);
        }
      },
    };

    if (options?.timeoutMs !== undefined) {
      const controller = new AbortController();
      if (options.signal) {
        if (options.signal.aborted) {
          controller.abort();
        } else {
          options.signal.addEventListener("abort", () => controller.abort(), {
            once: true,
          });
        }
      }
      timeoutHandle = setTimeout(() => {
        state.timedOut = true;
        controller.abort();
      }, options.timeoutMs);
      timeoutHandle.unref?.();
      state.abortSignal = controller.signal;
    }

    return state;
  }

  private getTransportErrorContext(
    options?: AdapterRequestOptions,
    transportState?: GeminiTransportState
  ): { timedOut?: boolean; aborted?: boolean } {
    return {
      timedOut: transportState?.timedOut,
      aborted: options?.signal?.aborted === true,
    };
  }

  private updateGeminiAccumulatorMetadata(
    accumulator: GeminiStreamAccumulator,
    chunk: any
  ): void {
    accumulator.model = chunk.modelUsed || accumulator.model;
    const candidate = chunk.candidates?.[0];
    accumulator.finishReason = candidate?.finishReason ?? accumulator.finishReason;
    if (chunk.usageMetadata) {
      accumulator.usageMetadata = mergeUsageRecords(
        accumulator.usageMetadata,
        chunk.usageMetadata
      );
    }
  }

  private processGeminiStreamChunk(
    accumulator: GeminiStreamAccumulator,
    chunk: any,
    request: InternalLLMChatRequest
  ): AdapterLLMStreamEvent[] {
    const events: AdapterLLMStreamEvent[] = [];
    const candidate = chunk.candidates?.[0];
    const parts = candidate?.content?.parts || [];
    const rawFinishReason = candidate?.finishReason;
    if (rawFinishReason != null) {
      events.push({
        type: "adapter_evidence",
        observedEvidence: {
          choice: {
            index: 0,
            finishReason: this.mapGeminiFinishReason(rawFinishReason),
            termination: normalizeTermination(
              rawFinishReason,
              rawFinishReason === "MAX_TOKENS" ? "output" : undefined
            ),
          },
        },
      });
    }

    for (const part of parts) {
      const rawPart = toPreparedRequestValue(part);
      if (
        rawPart &&
        typeof rawPart === "object" &&
        !Array.isArray(rawPart)
      ) {
        accumulator.rawParts.push(rawPart);
      }
      events.push({
        type: "adapter_evidence",
        observedEvidence: {
          choice: {
            index: 0,
            ...(!part?.thought &&
              typeof part?.text === "string" && {
                rawContentDelta: part.text,
              }),
            rawContentParts: [{
              type: getGeminiRawPartType(part),
              ...(typeof part?.text === "string" && {
                text: part.text,
              }),
              ...(rawPart !== undefined && { value: rawPart }),
              ...(part?.thought && { reasoning: true }),
            }],
          },
        },
      });
      if (typeof part?.text !== "string" || part.text.length === 0) {
        continue;
      }

      if (part.thought) {
        accumulator.thoughtParts.push(part.text);
        if (request.settings.reasoning?.exclude !== true) {
          events.push({
            type: "reasoning_delta",
            delta: part.text,
            index: 0,
          });
        }
      } else {
        accumulator.contentParts.push(part.text);
        events.push({
          type: "content_delta",
          delta: part.text,
          index: 0,
        });
      }
    }

    if (chunk.usageMetadata) {
      const normalized = normalizeUsage(chunk.usageMetadata, {
        prompt: ["promptTokenCount"],
        completion: ["candidatesTokenCount"],
        total: ["totalTokenCount"],
      });
      if (normalized.usage) {
        events.push({
          type: "adapter_evidence",
          observedEvidence: {
            usage: normalized.usage,
            usageEvidence: normalized.usageEvidence,
          },
        });
        events.push({
          type: "usage",
          usage: normalized.usage,
          observedEvidence: {
            usageEvidence: normalized.usageEvidence,
          },
        });
      }
    }

    return events;
  }

  private createSyntheticGeminiResponse(
    accumulator: GeminiStreamAccumulator
  ): any {
    const parts = accumulator.rawParts;

    return {
      responseId: accumulator.responseId,
      created: accumulator.created,
      modelUsed: accumulator.model,
      candidates: [{
        finishReason: accumulator.finishReason,
        content: {
          role: "model",
          parts,
        },
      }],
      usageMetadata: accumulator.usageMetadata,
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
    const inlineSystemMessages: string[] = [];

    // Check if model supports system instructions (e.g., Gemma models don't)
    const supportsSystem = request.settings.supportsSystemMessage !== false;

    // Process messages - separate system messages and build conversation contents
    for (const message of request.messages) {
      if (message.role === "system") {
        // Collect inline system messages
        inlineSystemMessages.push(message.content);
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

    // Use shared utility to collect and combine system content
    const { combinedSystemContent, useNativeSystemMessage } = collectSystemContent(
      request.systemMessage,
      inlineSystemMessages,
      supportsSystem
    );

    let systemInstruction: string | undefined;

    if (combinedSystemContent) {
      if (useNativeSystemMessage) {
        // Model supports system instructions - use native API
        systemInstruction = combinedSystemContent;
      } else {
        // Model doesn't support system instructions - prepend to first user message
        // Create a simple array with role/content for the utility
        const simpleContents = contents.map((c) => ({
          role: c.role,
          content: c.parts[0].text,
        }));
        const modifiedIndex = prependSystemToFirstUserMessage(
          simpleContents,
          combinedSystemContent,
          request.settings.systemMessageFallback
        );
        if (modifiedIndex !== -1) {
          // Update the actual contents array
          contents[modifiedIndex].parts[0].text = simpleContents[modifiedIndex].content;
          this.logger.debug(
            `Model ${request.modelId} doesn't support system instructions - prepended to first user message`
          );
        }
        // Don't set systemInstruction - it stays undefined
      }
    }

    // Build generation config
    const generationConfig: any = {
      maxOutputTokens: request.settings.maxTokens,
      temperature: request.settings.temperature,
      ...(request.settings.topP && { topP: request.settings.topP }),
      ...(request.settings.topK !== undefined && {
        topK: request.settings.topK,
      }),
      ...(request.settings.seed !== undefined && {
        seed: request.settings.seed,
      }),
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

    // Handle structured output configuration for Gemini
    if (
      request.settings.structuredOutput?.schema &&
      request.settings.structuredOutput.enabled !== false &&
      request.settings.structuredOutput.delivery !== "prompt"
    ) {
      const so = request.settings.structuredOutput;
      generationConfig.responseMimeType = 'application/json';
      generationConfig.responseSchema = this.convertToGeminiSchema(so.schema);
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

    const rawFinishReason = candidate?.finishReason ?? null;

    const finishReason = this.mapGeminiFinishReason(
      rawFinishReason
    );

    const choice: any = {
      message: {
        role: "assistant",
        content: content,
      },
      rawContent: content,
      rawContentParts: (candidate?.content?.parts ?? []).map((part: any) => ({
        type: getGeminiRawPartType(part),
        ...(typeof part.text === "string" && { text: part.text }),
        ...(part.thought && { reasoning: true }),
        ...(toPreparedRequestValue(part) !== undefined && {
          value: toPreparedRequestValue(part),
        }),
      })),
      finish_reason: finishReason,
      termination: normalizeTermination(
        rawFinishReason,
        rawFinishReason === "MAX_TOKENS" ? "output" : undefined
      ),
      index: 0,
    };

    // Include reasoning if available and not excluded
    if (reasoning && request.settings.reasoning && !request.settings.reasoning.exclude) {
      choice.reasoning = reasoning;
    }

    const normalizedUsage = normalizeUsage(response.usageMetadata, {
      prompt: ["promptTokenCount"],
      completion: ["candidatesTokenCount"],
      total: ["totalTokenCount"],
    });

    return {
      id: (response as any).responseId || this.generateResponseId(),
      provider: request.providerId,
      model: response.modelUsed || request.modelId,
      created: (response as any).created || Math.floor(Date.now() / 1000),
      choices: [choice],
      ...normalizedUsage,
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
   * @param context - Adapter-side transport state captured at catch time
   * @returns Standardized LLM failure response
   */
  private createErrorResponse(
    error: any,
    request: InternalLLMChatRequest,
    context?: { timedOut?: boolean; aborted?: boolean }
  ): LLMFailureResponse {
    // Classify adapter-owned aborts/timeouts first — the SDK surfaces both as
    // plain Errors the common mapping cannot recognize (see sendMessage)
    if (context?.aborted) {
      return {
        provider: request.providerId,
        model: request.modelId,
        error: {
          message: "Request was aborted",
          code: ADAPTER_ERROR_CODES.REQUEST_ABORTED,
          type: "abort_error",
          providerError: error,
        },
        object: "error",
      };
    }
    if (context?.timedOut) {
      return {
        provider: request.providerId,
        model: request.modelId,
        error: {
          message: "Request timed out",
          code: ADAPTER_ERROR_CODES.REQUEST_TIMEOUT,
          type: "timeout_error",
          providerError: error,
        },
        object: "error",
      };
    }

    // Use shared error mapping utility for common error patterns
    const initialProviderMessage = error?.message;
    let { errorCode, errorMessage, errorType, status, retryAfterMs } =
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
        ...(retryAfterMs !== undefined && { retryAfterMs }),
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

  /**
   * Converts our schema format to Gemini's schema format
   *
   * Gemini now supports standard JSON Schema format as of November 2025.
   * This method ensures the schema is properly formatted.
   *
   * @param schema - The structured output schema
   * @returns Gemini-compatible schema object
   */
  private convertToGeminiSchema(schema: any): any {
    // Gemini now supports standard JSON Schema format
    // Just pass through with minimal transformation
    const convertProperty = (prop: any): any => {
      if (!prop || typeof prop !== 'object') {
        return prop;
      }

      const result: any = { ...prop };

      // Ensure type is lowercase (JSON Schema standard)
      if (result.type && typeof result.type === 'string') {
        result.type = result.type.toLowerCase();
      }

      // Process nested properties
      if (result.properties) {
        result.properties = {};
        for (const [key, value] of Object.entries(prop.properties)) {
          result.properties[key] = convertProperty(value);
        }
      }

      // Process array items
      if (result.items) {
        result.items = convertProperty(prop.items);
      }

      return result;
    };

    return convertProperty(schema);
  }
}
