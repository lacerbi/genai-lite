// AI Summary: Core type definitions for the LLM interaction module.
// Defines request/response structures, settings, provider/model info, and error handling types.

/**
 * API provider ID type - represents a unique identifier for an AI provider
 */
export type ApiProviderId = string;

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
}

/**
 * IPC channel names for LLM operations
 */
export const LLM_IPC_CHANNELS = {
  GET_PROVIDERS: 'llm:get-providers',
  GET_MODELS: 'llm:get-models',
  SEND_MESSAGE: 'llm:send-message',
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
