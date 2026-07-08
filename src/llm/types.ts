// AI Summary: Core type definitions for the LLM interaction module.
// Defines request/response structures, settings, provider/model info, and error handling types.

/**
 * API provider ID type - represents a unique identifier for an AI provider
 */
export type ApiProviderId = string;

// ============================================================================
// Structured Output Types
// ============================================================================

/**
 * JSON Schema property definition for structured output
 *
 * Defines the shape and constraints for individual properties within a schema.
 * Supports nested objects, arrays, and primitive types with validation constraints.
 */
export interface StructuredOutputSchemaProperty {
  /** The JSON type of this property */
  type: "string" | "number" | "integer" | "boolean" | "array" | "object" | "null";
  /** Human-readable description of this property */
  description?: string;
  /** Allowed values for enum types */
  enum?: (string | number | boolean)[];
  /** Nested properties for object types */
  properties?: Record<string, StructuredOutputSchemaProperty>;
  /** Required property names for object types */
  required?: string[];
  /** Schema for array items */
  items?: StructuredOutputSchemaProperty;
  /** Minimum value for number/integer types */
  minimum?: number;
  /** Maximum value for number/integer types */
  maximum?: number;
  /** Minimum length for string types */
  minLength?: number;
  /** Maximum length for string types */
  maxLength?: number;
  /** Regex pattern for string validation */
  pattern?: string;
}

/**
 * Root JSON Schema definition for structured output
 *
 * Defines the top-level schema that the LLM response must conform to.
 * The schema is sent to the provider to constrain the output format.
 */
export interface StructuredOutputSchema {
  /** The JSON type of the root element */
  type: "object" | "array" | "string" | "number" | "boolean";
  /** Properties for object types */
  properties?: Record<string, StructuredOutputSchemaProperty>;
  /** Required property names for object types */
  required?: string[];
  /** Schema for array items */
  items?: StructuredOutputSchemaProperty;
  /** Whether additional properties are allowed (default: false for strict mode) */
  additionalProperties?: boolean;
  /** Human-readable description of the schema */
  description?: string;
}

/**
 * Settings for structured output generation
 *
 * When provided, instructs the LLM to return JSON conforming to the specified schema.
 * The response will be automatically parsed and available in `choice.parsedContent`.
 *
 * @example
 * ```typescript
 * const response = await llm.sendMessage({
 *   providerId: 'openai',
 *   modelId: 'gpt-4.1',
 *   messages: [{ role: 'user', content: 'Extract: "John is 30 years old"' }],
 *   settings: {
 *     structuredOutput: {
 *       name: 'person_extraction',
 *       schema: {
 *         type: 'object',
 *         properties: {
 *           name: { type: 'string' },
 *           age: { type: 'integer' }
 *         },
 *         required: ['name', 'age']
 *       }
 *     }
 *   }
 * });
 * // response.choices[0].parsedContent = { name: 'John', age: 30 }
 * ```
 */
export interface StructuredOutputSettings {
  /**
   * Whether structured output is enabled.
   * @default true (when structuredOutput object exists)
   */
  enabled?: boolean;

  /**
   * Name for the schema (required by most providers).
   * Should be a descriptive identifier like 'person_info' or 'weather_data'.
   */
  name: string;

  /** The JSON schema that the response must conform to */
  schema: StructuredOutputSchema;

  /**
   * Whether to use strict mode (provider enforces exact schema match).
   * @default true
   */
  strict?: boolean;

  /**
   * Whether to automatically parse the JSON response into `parsedContent`.
   * Set to false if you want to handle parsing yourself.
   * @default true
   */
  autoParse?: boolean;
}

/**
 * Model capabilities for structured output
 *
 * Describes what structured output features a model supports.
 */
export interface ModelStructuredOutputCapabilities {
  /** Whether the model supports structured output at all */
  supported: boolean;
  /** Whether the model supports strict mode (exact schema enforcement) */
  strictMode?: boolean;
  /** Additional notes about the model's structured output support */
  notes?: string;
}

/**
 * Capability support status for provider/model features.
 *
 * `unknown` means genai-lite does not have explicit metadata for the feature.
 * Callers should decide whether to allow, reject, or fall back for unknown
 * capabilities.
 */
export type CapabilityStatus = "supported" | "unsupported" | "unknown";

/**
 * Source of a capability decision.
 */
export type CapabilitySource = "registry" | "detected" | "fallback";

/**
 * Structured-output support status for a provider/model pair.
 */
export interface StructuredOutputSupport {
  /** Whether structured output is known supported, known unsupported, or unknown */
  status: CapabilityStatus;
  /** Whether strict provider-side schema enforcement is supported, when known */
  strictMode?: boolean;
  /** Additional notes from model metadata */
  notes?: string;
  /** Where the capability decision came from */
  source: CapabilitySource;
}

/**
 * Capability summary for a provider/model pair.
 */
export interface ModelCapabilities {
  /** Structured-output support status */
  structuredOutput: StructuredOutputSupport;
}

/**
 * Message roles supported by LLM APIs
 */
export type LLMMessageRole = 'user' | 'assistant' | 'system';

/**
 * Individual message in a conversation
 */
export interface LLMMessage {
  role: LLMMessageRole;
  content: string;
}

/**
 * Gemini harm categories for safety settings
 * Only includes categories supported by the API for safety setting rules
 */
export type GeminiHarmCategory =
  | 'HARM_CATEGORY_UNSPECIFIED'
  | 'HARM_CATEGORY_HATE_SPEECH'
  | 'HARM_CATEGORY_SEXUALLY_EXPLICIT'
  | 'HARM_CATEGORY_DANGEROUS_CONTENT'
  | 'HARM_CATEGORY_HARASSMENT'
  | 'HARM_CATEGORY_CIVIC_INTEGRITY';

/**
 * Gemini harm block thresholds for safety settings
 */
export type GeminiHarmBlockThreshold =
  | 'HARM_BLOCK_THRESHOLD_UNSPECIFIED'
  | 'BLOCK_LOW_AND_ABOVE'
  | 'BLOCK_MEDIUM_AND_ABOVE'
  | 'BLOCK_ONLY_HIGH'
  | 'BLOCK_NONE';

/**
 * Individual Gemini safety setting
 */
export interface GeminiSafetySetting {
  category: GeminiHarmCategory;
  threshold: GeminiHarmBlockThreshold;
}

/**
 * Reasoning/thinking configuration for LLM requests
 */
export interface LLMReasoningSettings {
  /** Enable reasoning/thinking mode */
  enabled?: boolean;
  /** Effort-based control (OpenAI style) */
  effort?: 'high' | 'medium' | 'low';
  /** Token-based control (Anthropic/Gemini style) */
  maxTokens?: number;
  /** Exclude reasoning from response (keep internal only) */
  exclude?: boolean;
}

/**
 * Settings for extracting reasoning from XML tags when native reasoning is not active.
 *
 * This is a fallback mechanism for getting reasoning from:
 * 1. Models without native reasoning support (e.g., GPT-4, Claude 3.5)
 * 2. Models with native reasoning disabled (to see the full reasoning trace)
 *
 * **Key use case:** Disable native reasoning on capable models to avoid obfuscation
 * by providers, then prompt the model to use <thinking> tags for full visibility.
 *
 * **Important:** You must explicitly prompt the model to use thinking tags in your prompt.
 * The library only extracts them - it doesn't generate them automatically.
 */
export interface LLMThinkingTagFallbackSettings {
  /**
   * Enable tag extraction fallback.
   * When this object exists, extraction is enabled by default (enabled: true).
   * Set to false to explicitly disable (useful for overriding inherited settings).
   * @default true (when thinkingTagFallback object exists)
   */
  enabled?: boolean;

  /**
   * Name of the XML tag to extract.
   * @default 'thinking'
   * @example tagName: 'scratchpad' will extract <scratchpad>...</scratchpad>
   */
  tagName?: string;

  /**
   * Enforce that thinking tags are present when native reasoning is not active.
   *
   * When true:
   * - If native reasoning is active: No enforcement (model using native)
   * - If native reasoning is NOT active: Error if tags missing (fallback required)
   *
   * This is always "smart" - it automatically detects whether native reasoning
   * is active and only enforces when the model needs to use tags as a fallback.
   *
   * @default false
   */
  enforce?: boolean;
}

/**
 * Format options for prepending system content when model doesn't support system messages.
 * - 'xml': Wrap in XML tags (default) - `<system>content</system>\n\n{user message}`
 * - 'separator': Use a simple separator - `{content}\n\n---\n\n{user message}`
 * - 'plain': Just prepend with double newline - `{content}\n\n{user message}`
 */
export type SystemMessageFallbackFormat = 'xml' | 'separator' | 'plain';

/**
 * Settings for handling system messages when the model doesn't support them natively.
 * When a model has `supportsSystemMessage: false`, these settings control how
 * system content is formatted when prepended to the first user message.
 */
export interface SystemMessageFallbackSettings {
  /**
   * Format to use when prepending system content to user message.
   * @default 'xml'
   */
  format?: SystemMessageFallbackFormat;

  /**
   * Tag name to use when format is 'xml'.
   * @default 'system'
   * @example tagName: 'instructions' produces `<instructions>content</instructions>`
   */
  tagName?: string;

  /**
   * Separator string to use when format is 'separator'.
   * @default '---'
   */
  separator?: string;
}

/**
 * OpenRouter-specific provider routing settings
 *
 * These settings allow controlling which underlying providers serve requests
 * when using OpenRouter. All fields are optional - by default, OpenRouter
 * automatically selects the best provider based on price, latency, and availability.
 *
 * @see https://openrouter.ai/docs/provider-routing
 */
export interface OpenRouterProviderSettings {
  /**
   * Provider priority order. OpenRouter will try providers in this order.
   * @example order: ["Together", "Fireworks", "Lepton"]
   */
  order?: string[];

  /**
   * Providers to exclude from serving this request.
   * @example ignore: ["Azure", "OpenAI"]
   */
  ignore?: string[];

  /**
   * Providers to allow exclusively. If set, only these providers can serve the request.
   * @example allow: ["Together", "Fireworks"]
   */
  allow?: string[];

  /**
   * Control whether providers can use your prompts for training.
   * Set to 'deny' to opt out of data collection by providers.
   * @default undefined (provider's default behavior)
   */
  dataCollection?: 'deny' | 'allow';

  /**
   * If true, only route to providers that support all parameters in your request.
   * Useful when using provider-specific features.
   * @default false
   */
  requireParameters?: boolean;
}

/**
 * Configurable settings for LLM requests
 */
export interface LLMSettings {
  /** Controls randomness in the response (0.0 to 2.0, typically 0.0 to 1.0) */
  temperature?: number;
  /** Maximum number of tokens to generate in the response */
  maxTokens?: number;
  /** Controls diversity via nucleus sampling (0.0 to 1.0) */
  topP?: number;
  /** Sequences where the API will stop generating further tokens */
  stopSequences?: string[];
  /** Number between -2.0 and 2.0. Positive values penalize new tokens based on their existing frequency */
  frequencyPenalty?: number;
  /** Number between -2.0 and 2.0. Positive values penalize new tokens based on whether they appear in the text so far */
  presencePenalty?: number;
  /**
   * Limits sampling to the K most likely tokens (integer >= 0; 0 disables top-k filtering).
   * Supported by: Anthropic (top_k), Gemini (topK), llama.cpp (top_k), OpenRouter (top_k).
   * Not supported by OpenAI or Mistral (stripped automatically).
   */
  topK?: number;
  /**
   * Minimum probability threshold relative to the most likely token (0.0 to 1.0; 0 disables).
   * Note: llama.cpp's server default is 0.05, which matches no vendor recommendation —
   * detected GGUF models get an explicit 0 by default.
   * Supported by: llama.cpp (min_p), OpenRouter (min_p). Stripped for other providers.
   */
  minP?: number;
  /**
   * Multiplicative repetition penalty over prompt + output tokens (1.0 = disabled).
   * Distinct from presencePenalty (additive, output-only). For Qwen models prefer
   * presencePenalty and keep repeatPenalty at 1.0 (vendor guidance).
   * Supported by: llama.cpp (repeat_penalty), OpenRouter (repetition_penalty). Stripped elsewhere.
   */
  repeatPenalty?: number;
  /**
   * Seed for (best-effort) deterministic sampling. Integer; llama.cpp treats -1 as random.
   * Supported by: OpenAI (beta; ignored by reasoning models), Gemini, Mistral (randomSeed),
   * llama.cpp, OpenRouter. Not supported by Anthropic (stripped automatically).
   */
  seed?: number;
  /** A unique identifier representing your end-user, which can help monitor and detect abuse */
  user?: string;
  /** Whether the LLM supports system message (almost all LLMs do nowadays) */
  supportsSystemMessage?: boolean;
  /**
   * Settings for handling system messages when the model doesn't support them.
   * Controls how system content is formatted when prepended to user messages.
   */
  systemMessageFallback?: SystemMessageFallbackSettings;
  /** Gemini-specific safety settings for content filtering */
  geminiSafetySettings?: GeminiSafetySetting[];
  /** Universal reasoning/thinking configuration */
  reasoning?: LLMReasoningSettings;
  /**
   * Extract reasoning from XML tags when native reasoning is not active.
   *
   * This is a fallback mechanism for getting reasoning from:
   * 1. Models without native reasoning support (e.g., GPT-4, Claude 3.5)
   * 2. Models with native reasoning disabled (to see the full reasoning trace)
   *
   * Key use case: Disable native reasoning on capable models to avoid obfuscation
   * by providers, then prompt the model to use <thinking> tags for full visibility.
   *
   * Note: You must explicitly prompt the model to use thinking tags in your prompt.
   * The library only extracts them - it doesn't generate them automatically.
   */
  thinkingTagFallback?: LLMThinkingTagFallbackSettings;
  /**
   * OpenRouter-specific provider routing settings.
   * Only used when providerId is 'openrouter'.
   * @see OpenRouterProviderSettings
   */
  openRouterProvider?: OpenRouterProviderSettings;

  /**
   * Structured output settings for JSON schema-constrained responses.
   *
   * When provided, instructs the LLM to return JSON conforming to the specified schema.
   * The response will be automatically parsed and available in `choice.parsedContent`.
   *
   * This is optional - if not provided, the LLM returns normal text responses.
   *
   * @see StructuredOutputSettings
   */
  structuredOutput?: StructuredOutputSettings;

  /**
   * Request per-token log probabilities on the response.
   * Supported by: llama.cpp, OpenAI, OpenRouter (pass-through; model-dependent).
   * Stripped for Anthropic/Gemini/Mistral. Results land on `choice.logprobs`.
   */
  logprobs?: boolean;
  /**
   * Number of most-likely alternatives to return per token (0-20).
   * Requires `logprobs: true`.
   */
  topLogprobs?: number;
  /**
   * llama.cpp-specific settings.
   * Only used when providerId is 'llamacpp'; ignored by other adapters.
   * @see LlamaCppSettings
   */
  llamacpp?: LlamaCppSettings;
}

/**
 * llama.cpp-specific request settings
 */
export interface LlamaCppSettings {
  /**
   * Raw GBNF grammar string for constrained decoding.
   * Mutually exclusive with `structuredOutput` (llama-server rejects both:
   * "Either 'json_schema' or 'grammar' can be specified, but not both").
   * Caveat: current llama.cpp builds may not apply the grammar while thinking
   * is active — prefer grammar with reasoning disabled.
   */
  grammar?: string;
  /**
   * Extra chat-template kwargs forwarded verbatim to llama-server (requires --jinja).
   * Merged over any library-derived kwargs (e.g. the reasoning toggle's
   * enable_thinking), so explicit values here always win.
   */
  chatTemplateKwargs?: Record<string, string | number | boolean>;
}

/**
 * Per-token log probability entry (OpenAI-compatible shape, also produced by
 * llama.cpp's chat completions endpoint).
 */
export interface TokenLogprob {
  /** The generated token text */
  token: string;
  /** Log probability of the token */
  logprob: number;
  /** Most-likely alternative tokens at this position (when topLogprobs requested) */
  topLogprobs?: Array<{ token: string; logprob: number }>;
}

/**
 * Request structure for chat completion
 */
export interface LLMChatRequest {
  providerId: ApiProviderId;
  modelId: string;
  messages: LLMMessage[];
  systemMessage?: string;
  settings?: LLMSettings;
}

/**
 * Extended request structure that supports preset IDs
 */
export interface LLMChatRequestWithPreset extends Omit<LLMChatRequest, 'providerId' | 'modelId'> {
  /** Provider ID (required if not using presetId) */
  providerId?: ApiProviderId;
  /** Model ID (required if not using presetId) */
  modelId?: string;
  /** Preset ID (alternative to providerId/modelId) */
  presetId?: string;
}

/**
 * Request used by LLMService.validateRequestCapabilities().
 *
 * This intentionally does not require messages: callers often need to validate
 * provider/model/settings compatibility during configuration, before the final
 * prompt messages exist.
 */
export interface LLMRequestCapabilityPreflight {
  /** Provider ID (required if not using presetId) */
  providerId?: ApiProviderId;
  /** Model ID (required if not using presetId) */
  modelId?: string;
  /** Preset ID (alternative to providerId/modelId) */
  presetId?: string;
  /** Settings whose provider/model capability requirements should be checked */
  settings?: LLMSettings;
}

/**
 * Result of LLMService.getModelCapabilities().
 */
export interface ModelCapabilitiesResult {
  object: "model.capabilities";
  provider: ApiProviderId;
  model: string;
  /** Resolved model metadata used to derive the capability summary */
  modelInfo: ModelInfo;
  /** Structured-output support status for this provider/model pair */
  structuredOutput: StructuredOutputSupport;
}

/**
 * Individual choice in an LLM response
 */
export interface LLMChoice {
  message: LLMMessage;
  finish_reason: string | null;
  index?: number;
  /** Reasoning/thinking content (if available and not excluded) */
  reasoning?: string;
  /** Provider-specific reasoning details that need to be preserved */
  reasoning_details?: any;
  /** Per-token log probabilities (when settings.logprobs was requested and supported) */
  logprobs?: TokenLogprob[];
  /**
   * Parsed JSON content when structuredOutput is enabled and autoParse is true.
   * Contains the parsed object/array from the JSON response.
   */
  parsedContent?: unknown;
  /**
   * Error message if JSON parsing failed when structuredOutput was enabled.
   * Only present when autoParse is true and parsing failed.
   */
  parseError?: string;
}

/**
 * Token usage information from LLM APIs
 */
export interface LLMUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}

/**
 * Successful response from LLM API
 */
export interface LLMResponse {
  id: string;
  provider: ApiProviderId;
  model: string;
  created: number;
  choices: LLMChoice[];
  usage?: LLMUsage;
  object: 'chat.completion';
}

/**
 * Error information from LLM APIs
 */
export interface LLMError {
  message: string;
  code?: string | number;
  type?: string;
  param?: string;
  /** HTTP status code from the provider, when available */
  status?: number;
  /** Provider-suggested wait before retrying in ms (from a Retry-After header) */
  retryAfterMs?: number;
  providerError?: any;
}

/**
 * Error response from LLM operations
 */
export interface LLMFailureResponse {
  provider: ApiProviderId;
  model?: string;
  error: LLMError;
  object: 'error';
  /** The partial response that was generated before the error occurred (if available) */
  partialResponse?: Omit<LLMResponse, 'object'>;
}

/**
 * Successful result of LLMService.validateRequestCapabilities().
 */
export interface LLMRequestCapabilityValidationSuccess {
  object: "capability.validation";
  valid: true;
  provider: ApiProviderId;
  model: string;
  capabilities: ModelCapabilities;
}

/**
 * Failure result of LLMService.validateRequestCapabilities().
 *
 * The base error envelope intentionally matches LLMFailureResponse so callers
 * can use the same diagnostic handling as sendMessage().
 */
export type LLMRequestCapabilityValidationFailure = LLMFailureResponse & {
  valid: false;
  capabilities?: ModelCapabilities;
};

/**
 * Result of LLMService.validateRequestCapabilities().
 */
export type LLMRequestCapabilityValidationResult =
  | LLMRequestCapabilityValidationSuccess
  | LLMRequestCapabilityValidationFailure;

/**
 * Streaming event emitted by LLMService.streamMessage().
 */
export type LLMStreamEvent =
  | {
      type: "start";
      provider: ApiProviderId;
      model: string;
      id?: string;
      created?: number;
    }
  | {
      type: "content_delta";
      delta: string;
      index: number;
    }
  | {
      type: "reasoning_delta";
      delta: string;
      index: number;
    }
  | {
      type: "usage";
      usage: LLMUsage;
    }
  | {
      type: "complete";
      response: LLMResponse;
    }
  | {
      type: "error";
      error: LLMFailureResponse;
    };

/**
 * Information about a supported LLM provider
 */
export interface ProviderInfo {
  id: ApiProviderId;
  name: string;
  unsupportedParameters?: (keyof LLMSettings)[];
  /**
   * If true, allows using unknown/unregistered model IDs with this provider.
   * Useful for providers like llamacpp where users load arbitrary models.
   * Default: false (strict validation)
   */
  allowUnknownModels?: boolean;
}

/**
 * Reasoning/thinking capabilities for a model
 */
export interface ModelReasoningCapabilities {
  /** Does this model support reasoning/thinking? */
  supported: boolean;
  /** Is reasoning enabled by default? */
  enabledByDefault?: boolean;
  /** Can reasoning be disabled? (e.g., Gemini Pro can't) */
  canDisable?: boolean;
  /** Minimum token budget for reasoning */
  minBudget?: number;
  /** Maximum token budget for reasoning */
  maxBudget?: number;
  /** Default token budget if not specified */
  defaultBudget?: number;
  /** Special budget values (e.g., -1 for Gemini's dynamic) */
  dynamicBudget?: {
    value: number;
    description: string;
  };
  /** Price per 1M reasoning tokens (optional - if not set, uses regular outputPrice) */
  outputPrice?: number;
  /** What type of reasoning output is returned */
  outputType?: 'full' | 'summary' | 'none';
  /** Token count above which streaming is required */
  requiresStreamingAbove?: number;
}

/**
 * Information about a supported LLM model
 */
export interface ModelInfo {
  id: string;
  name: string;
  providerId: ApiProviderId;
  contextWindow?: number;
  inputPrice?: number;
  outputPrice?: number;
  supportsSystemMessage?: boolean;
  description?: string;
  maxTokens?: number;
  supportsImages?: boolean;
  supportsPromptCache: boolean;
  /** @deprecated Use reasoning instead */
  thinkingConfig?: {
    maxBudget?: number;
    outputPrice?: number;
  };
  /** Reasoning/thinking capabilities */
  reasoning?: ModelReasoningCapabilities;
  cacheWritesPrice?: number;
  cacheReadsPrice?: number;
  unsupportedParameters?: (keyof LLMSettings)[];
  /** Structured output capabilities */
  structuredOutput?: ModelStructuredOutputCapabilities;
  /**
   * Model-specific default settings (e.g. vendor-recommended sampling parameters).
   * Merged below request settings: DEFAULT < provider < MODEL_DEFAULT_SETTINGS <
   * defaultSettings < request. Used heavily by detected GGUF models, whose vendors
   * publish sampling profiles that differ from llama.cpp's server defaults.
   */
  defaultSettings?: Partial<LLMSettings>;
  /**
   * Additional default-settings overlay applied only when reasoning/thinking is
   * active for the request (e.g. Qwen recommends a different sampling profile in
   * thinking mode). Per-key precedence: request > reasoningDefaultSettings > defaultSettings.
   */
  reasoningDefaultSettings?: Partial<LLMSettings>;
  /**
   * Local-model (llama.cpp) reasoning-toggle and output-cleanup metadata.
   * Battle-tested constants sourced from real chat-template behavior.
   */
  localReasoning?: LocalReasoningMetadata;
}

/**
 * Metadata describing how a local (GGUF/llama.cpp) model's chat template handles
 * thinking mode, and how to clean its output.
 */
export interface LocalReasoningMetadata {
  /**
   * Name of the chat-template kwarg that toggles thinking (e.g. "enable_thinking").
   * When set, the llama.cpp adapter sends `chat_template_kwargs: { [toggleKwarg]: <bool> }`
   * derived from `settings.reasoning.enabled` (explicitly false when reasoning is not
   * requested). Requires the server to run with `--jinja`. Omit for models whose
   * thinking cannot be toggled (always-on reasoning models).
   */
  toggleKwarg?: string;
  /**
   * Exact prefix some chat templates inject into response content when thinking is
   * disabled (e.g. Qwen's "<think>\n\n</think>\n\n"). Stripped verbatim (exact
   * startsWith match) from message content before the response is returned.
   */
  nothinkPrefix?: string;
  /**
   * Open/close marker pair used to extract a reasoning trace from message content
   * when the server does not populate `reasoning_content` (model/template dependent).
   * Only fully-closed pairs are extracted.
   */
  markers?: [string, string];
}

/**
 * IPC channel names for LLM operations
 */
export const LLM_IPC_CHANNELS = {
  GET_PROVIDERS: 'llm:get-providers',
  GET_MODELS: 'llm:get-models',
  SEND_MESSAGE: 'llm:send-message',
  STREAM_MESSAGE: 'llm:stream-message',
  IS_KEY_AVAILABLE: 'llm:is-key-available',
} as const;

/**
 * Type for LLM IPC channel names
 */
export type LLMIPCChannelName =
  (typeof LLM_IPC_CHANNELS)[keyof typeof LLM_IPC_CHANNELS];

/**
 * Model context variables injected into templates during createMessages()
 *
 * These variables enable templates to adapt based on the model's reasoning capabilities.
 *
 * **Key Usage Pattern:**
 * When adding thinking tag instructions, use requires_tags_for_thinking:
 * ```
 * {{ requires_tags_for_thinking ? 'Write your reasoning in <thinking> tags first.' : '' }}
 * ```
 *
 * This ensures:
 * - Models with active native reasoning get clean prompts
 * - Models without native reasoning get explicit tag instructions
 */
export interface ModelContext {
  /**
   * Whether native reasoning is CURRENTLY ACTIVE for this request.
   * - true: Model is using built-in reasoning (Claude 4, o4-mini, Gemini with reasoning enabled)
   * - false: No native reasoning is active (model doesn't support it OR it's been disabled)
   *
   * Use in templates when adapting behavior based on whether native reasoning is happening.
   */
  native_reasoning_active: boolean;

  /**
   * Whether the model HAS THE CAPABILITY to use native reasoning.
   * - true: Model supports native reasoning (may or may not be enabled)
   * - false: Model does not support native reasoning
   *
   * Use in templates to check if native reasoning is possible (not necessarily active).
   */
  native_reasoning_capable: boolean;

  /**
   * Whether this model/request requires thinking tags to produce reasoning.
   * - true: Native reasoning is not active, model needs prompting to use <thinking> tags
   * - false: Native reasoning is active, no need for thinking tags
   *
   * Use in templates for conditional thinking tag instructions:
   * {{ requires_tags_for_thinking ? 'Write your reasoning in <thinking> tags first.' : '' }}
   */
  requires_tags_for_thinking: boolean;

  /** The resolved model ID */
  model_id: string;
  /** The resolved provider ID */
  provider_id: string;
  /** Reasoning effort level if specified ('low', 'medium', or 'high') */
  reasoning_effort?: string;
  /** Reasoning max tokens if specified */
  reasoning_max_tokens?: number;
}
