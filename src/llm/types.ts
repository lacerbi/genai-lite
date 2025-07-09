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
 * Settings for extracting 'thinking' content from the start of a response
 */
export interface LLMThinkingExtractionSettings {
  /**
   * If true, enables the automatic extraction of content from a specified XML tag.
   * @default true
   */
  enabled?: boolean;

  /**
   * The XML tag name to look for (e.g., 'thinking', 'reasoning', 'scratchpad').
   * @default 'thinking'
   */
  tag?: string;
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
  /** Gemini-specific safety settings for content filtering */
  geminiSafetySettings?: GeminiSafetySetting[];
  /** Universal reasoning/thinking configuration */
  reasoning?: LLMReasoningSettings;
  /**
   * Configuration for automatically extracting 'thinking' blocks from responses.
   * Enabled by default.
   */
  thinkingExtraction?: LLMThinkingExtractionSettings;
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
}

/**
 * Information about a supported LLM provider
 */
export interface ProviderInfo {
  id: ApiProviderId;
  name: string;
  unsupportedParameters?: (keyof LLMSettings)[];
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
 * Model context variables injected into templates
 */
export interface ModelContext {
  /** Whether reasoning/thinking is enabled for this request */
  thinking_enabled: boolean;
  /** Whether the model supports reasoning/thinking */
  thinking_available: boolean;
  /** The resolved model ID */
  model_id: string;
  /** The resolved provider ID */
  provider_id: string;
  /** Reasoning effort level if specified */
  reasoning_effort?: string;
  /** Reasoning max tokens if specified */
  reasoning_max_tokens?: number;
}
