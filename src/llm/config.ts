// AI Summary: Configuration for LLM module including default settings, supported providers, and models.
// Defines operational parameters and available LLM options for the application.

import type {
  LLMSettings,
  ProviderInfo,
  ModelInfo,
  ApiProviderId,
  GeminiSafetySetting,
  GeminiHarmCategory,
  GeminiHarmBlockThreshold,
} from "./types";
import type { ILLMClientAdapter } from "./clients/types";
import { OpenAIClientAdapter } from "./clients/OpenAIClientAdapter";
import { AnthropicClientAdapter } from "./clients/AnthropicClientAdapter";
import { GeminiClientAdapter } from "./clients/GeminiClientAdapter";
import { LlamaCppClientAdapter } from "./clients/LlamaCppClientAdapter";
// Placeholder for future imports:
// import { MistralClientAdapter } from './clients/MistralClientAdapter';

/**
 * Mapping from provider IDs to their corresponding adapter constructor classes
 * This enables dynamic registration of client adapters in LLMServiceMain
 */
export const ADAPTER_CONSTRUCTORS: Partial<
  Record<
    ApiProviderId,
    new (config?: { baseURL?: string; checkHealth?: boolean }) => ILLMClientAdapter
  >
> = {
  openai: OpenAIClientAdapter,
  anthropic: AnthropicClientAdapter,
  gemini: GeminiClientAdapter,
  llamacpp: LlamaCppClientAdapter,
  // 'mistral': MistralClientAdapter, // Uncomment and add when Mistral adapter is ready
};

/**
 * Optional configuration objects for each adapter
 * Allows passing parameters like baseURL during instantiation
 */
export const ADAPTER_CONFIGS: Partial<
  Record<ApiProviderId, { baseURL?: string }>
> = {
  openai: {
    baseURL: process.env.OPENAI_API_BASE_URL || undefined,
  },
  anthropic: {
    baseURL: process.env.ANTHROPIC_API_BASE_URL || undefined,
  },
  llamacpp: {
    baseURL: process.env.LLAMACPP_API_BASE_URL || 'http://localhost:8080',
  },
  // 'gemini': { /* ... Gemini specific config ... */ },
  // 'mistral': { /* ... Mistral specific config ... */ },
};

/**
 * Default settings applied to all LLM requests unless overridden
 */
export const DEFAULT_LLM_SETTINGS: Required<LLMSettings> = {
  temperature: 0.5,
  maxTokens: 4096,
  topP: 0.95,
  stopSequences: [],
  frequencyPenalty: 0.0,
  presencePenalty: 0.0,
  supportsSystemMessage: true,
  user: undefined as any, // Will be filtered out when undefined
  geminiSafetySettings: [
    { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
    { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
    { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
    { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
  ],
  reasoning: {
    enabled: false,
    effort: undefined as any,
    maxTokens: undefined as any,
    exclude: false,
  },
  thinkingTagFallback: {
    enabled: false,
    tagName: 'thinking',
    enforce: false
  },
};

/**
 * Per-provider default setting overrides
 */
export const PROVIDER_DEFAULT_SETTINGS: Partial<
  Record<ApiProviderId, Partial<LLMSettings>>
> = {
  openai: {},
  anthropic: {},
  gemini: {
    geminiSafetySettings: [
      { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
    ],
  },
  mistral: {},
};

/**
 * Per-model default setting overrides (takes precedence over provider defaults)
 */
export const MODEL_DEFAULT_SETTINGS: Record<string, Partial<LLMSettings>> = {
  // OpenAI model-specific overrides
  "o4-mini": { temperature: 1.0 },
  // Anthropic model-specific overrides
  // Gemini model-specific overrides
  // Mistral model-specific overrides
};

/**
 * Supported LLM providers
 */
export const SUPPORTED_PROVIDERS: ProviderInfo[] = [
  {
    id: "openai",
    name: "OpenAI",
    unsupportedParameters: ["frequencyPenalty"],
  },
  {
    id: "anthropic",
    name: "Anthropic",
  },
  {
    id: "gemini",
    name: "Google Gemini",
  },
  {
    id: "mistral",
    name: "Mistral AI",
  },
  {
    id: "llamacpp",
    name: "llama.cpp",
    allowUnknownModels: true,  // Users load arbitrary GGUF models with custom names
  },
  {
    id: "mock",
    name: "Mock Provider",
    allowUnknownModels: true,  // Test provider accepts any model
  },
];

/**
 * Pattern definition for detecting GGUF model capabilities
 */
export interface GgufModelPattern {
  /** Pattern to match in the GGUF filename (case-insensitive substring match) */
  pattern: string;
  /** Human-readable name for the model */
  name: string;
  /** Optional description */
  description?: string;
  /** Model capabilities (reasoning config, context window, etc.) */
  capabilities: Partial<ModelInfo>;
}

/**
 * Known GGUF model patterns for capability detection
 *
 * Order matters: more specific patterns should come before generic ones.
 * First matching pattern wins.
 *
 * Example: "Qwen3-0.6B-0522" should be before "Qwen3-0.6B"
 */
export const KNOWN_GGUF_MODELS: GgufModelPattern[] = [
  // Qwen 3 Series - All support thinking/reasoning
  {
    pattern: "qwen3-30b",
    name: "Qwen 3 30B",
    description: "Qwen 3 30B model with thinking capabilities",
    capabilities: {
      maxTokens: 16384,
      contextWindow: 131072,
      supportsImages: false,
      supportsPromptCache: false,
      reasoning: {
        supported: true,
        enabledByDefault: false,
        canDisable: true,
        maxBudget: 38912,
      },
    },
  },
  {
    pattern: "qwen3-14b",
    name: "Qwen 3 14B",
    description: "Qwen 3 14B model with thinking capabilities",
    capabilities: {
      maxTokens: 8192,
      contextWindow: 131072,
      supportsImages: false,
      supportsPromptCache: false,
      reasoning: {
        supported: true,
        enabledByDefault: false,
        canDisable: true,
        maxBudget: 38912,
      },
    },
  },
  {
    pattern: "qwen3-8b",
    name: "Qwen 3 8B",
    description: "Qwen 3 8B model with thinking capabilities",
    capabilities: {
      maxTokens: 8192,
      contextWindow: 131072,
      supportsImages: false,
      supportsPromptCache: false,
      reasoning: {
        supported: true,
        enabledByDefault: false,
        canDisable: true,
        maxBudget: 38912,
      },
    },
  },
  {
    pattern: "qwen3-4b",
    name: "Qwen 3 4B",
    description: "Qwen 3 4B model with thinking capabilities",
    capabilities: {
      maxTokens: 8192,
      contextWindow: 131072,
      supportsImages: false,
      supportsPromptCache: false,
      reasoning: {
        supported: true,
        enabledByDefault: false,
        canDisable: true,
        maxBudget: 38912,
      },
    },
  },
  {
    pattern: "qwen3-1.7b",
    name: "Qwen 3 1.7B",
    description: "Qwen 3 1.7B model with thinking capabilities",
    capabilities: {
      maxTokens: 8192,
      contextWindow: 32768,
      supportsImages: false,
      supportsPromptCache: false,
      reasoning: {
        supported: true,
        enabledByDefault: false,
        canDisable: true,
        maxBudget: 30720,
      },
    },
  },
  {
    pattern: "qwen3-0.6b",
    name: "Qwen 3 0.6B",
    description: "Qwen 3 0.6B model with thinking capabilities",
    capabilities: {
      maxTokens: 8192,
      contextWindow: 32768,
      supportsImages: false,
      supportsPromptCache: false,
      reasoning: {
        supported: true,
        enabledByDefault: false,
        canDisable: true,
        maxBudget: 30720,
      },
    },
  },
  // Add more model patterns here as needed
  // DeepSeek, Llama, etc.
];

/**
 * Detects model capabilities from GGUF filename
 *
 * Performs case-insensitive substring matching against known model patterns.
 * Returns the first matching pattern's capabilities (array order determines priority).
 *
 * @param ggufFilename - The GGUF model filename (e.g., "Qwen3-8B-Instruct-Q4_K_M.gguf")
 * @returns Partial ModelInfo with detected capabilities, or null if no match
 *
 * @example
 * ```typescript
 * const caps = detectGgufCapabilities("Qwen3-8B-Instruct-Q4_K_M.gguf");
 * if (caps?.reasoning?.supported) {
 *   console.log("This model supports thinking!");
 * }
 * ```
 */
export function detectGgufCapabilities(
  ggufFilename: string
): Partial<ModelInfo> | null {
  const lowerFilename = ggufFilename.toLowerCase();

  // First match wins (array is pre-ordered from specific to generic)
  for (const model of KNOWN_GGUF_MODELS) {
    if (lowerFilename.includes(model.pattern.toLowerCase())) {
      console.log(`Detected GGUF model: ${model.name} (pattern: ${model.pattern})`);
      return model.capabilities;
    }
  }

  // No match found
  return null;
}

/**
 * Supported LLM models with their configurations
 * ModelInfo is similar to Cline model info
 * See: https://github.com/cline/cline/blob/main/src/shared/api.ts
 */
export const SUPPORTED_MODELS: ModelInfo[] = [
  // Anthropic Models - Claude 4.5 Series
  {
    id: "claude-opus-4-5-20251101",
    name: "Claude Opus 4.5",
    providerId: "anthropic",
    contextWindow: 200000,
    inputPrice: 5.0,
    outputPrice: 25.0,
    description: "Most powerful Claude model with enhanced reasoning and capabilities",
    maxTokens: 8192,
    supportsImages: true,
    supportsPromptCache: true,
    cacheWritesPrice: 6.25,
    cacheReadsPrice: 0.5,
    reasoning: {
      supported: true,
      enabledByDefault: false,
      canDisable: true,
      minBudget: 1024,
      maxBudget: 32000,
      defaultBudget: 10000,
      outputType: 'summary',
      requiresStreamingAbove: 21333,
    },
  },
  {
    id: "claude-sonnet-4-5-20250929",
    name: "Claude Sonnet 4.5",
    providerId: "anthropic",
    contextWindow: 200000,
    inputPrice: 3.0,
    outputPrice: 15.0,
    description: "Advanced Claude model balancing intelligence, speed, and cost",
    maxTokens: 8192,
    supportsImages: true,
    supportsPromptCache: true,
    cacheWritesPrice: 3.75,
    cacheReadsPrice: 0.3,
    reasoning: {
      supported: true,
      enabledByDefault: false,
      canDisable: true,
      minBudget: 1024,
      maxBudget: 32000,
      defaultBudget: 10000,
      outputType: 'summary',
      requiresStreamingAbove: 21333,
    },
  },
  {
    id: "claude-haiku-4-5-20251001",
    name: "Claude Haiku 4.5",
    providerId: "anthropic",
    contextWindow: 200000,
    inputPrice: 1.0,
    outputPrice: 5.0,
    description: "Fast and cost-effective Claude model with reasoning capabilities",
    maxTokens: 8192,
    supportsImages: true,
    supportsPromptCache: true,
    cacheWritesPrice: 1.25,
    cacheReadsPrice: 0.1,
    reasoning: {
      supported: true,
      enabledByDefault: false,
      canDisable: true,
      minBudget: 1024,
      maxBudget: 32000,
      defaultBudget: 10000,
      outputType: 'summary',
      requiresStreamingAbove: 21333,
    },
  },
  // Anthropic Models - Claude 4 Series
  {
    id: "claude-sonnet-4-20250514",
    name: "Claude Sonnet 4",
    providerId: "anthropic",
    contextWindow: 200000,
    inputPrice: 3.0,
    outputPrice: 15.0,
    description: "Latest Claude Sonnet model with enhanced capabilities",
    maxTokens: 8192,
    supportsImages: true,
    supportsPromptCache: true,
    cacheWritesPrice: 3.75,
    cacheReadsPrice: 0.3,
    reasoning: {
      supported: true,
      enabledByDefault: false,
      canDisable: true,
      minBudget: 1024,
      maxBudget: 32000,
      defaultBudget: 10000,
      outputType: 'summary',
      requiresStreamingAbove: 21333,
    },
  },
  {
    id: "claude-opus-4-20250514",
    name: "Claude Opus 4",
    providerId: "anthropic",
    contextWindow: 200000,
    inputPrice: 15.0,
    outputPrice: 75.0,
    description: "Most powerful Claude model for highly complex tasks",
    maxTokens: 8192,
    supportsImages: true,
    supportsPromptCache: true,
    cacheWritesPrice: 18.75,
    cacheReadsPrice: 1.5,
    reasoning: {
      supported: true,
      enabledByDefault: false,
      canDisable: true,
      minBudget: 1024,
      maxBudget: 32000,
      defaultBudget: 10000,
      outputType: 'summary',
      requiresStreamingAbove: 21333,
    },
  },
  {
    id: "claude-3-7-sonnet-20250219",
    name: "Claude 3.7 Sonnet",
    providerId: "anthropic",
    contextWindow: 200000,
    inputPrice: 3.0,
    outputPrice: 15.0,
    description: "Advanced Claude model with improved reasoning",
    maxTokens: 8192,
    supportsImages: true,
    supportsPromptCache: true,
    cacheWritesPrice: 3.75,
    cacheReadsPrice: 0.3,
    reasoning: {
      supported: true,
      enabledByDefault: false,
      canDisable: true,
      minBudget: 1024,
      maxBudget: 32000,
      defaultBudget: 10000,
      outputType: 'full',
      requiresStreamingAbove: 21333,
    },
  },
  {
    id: "claude-3-5-sonnet-20241022",
    name: "Claude 3.5 Sonnet",
    providerId: "anthropic",
    contextWindow: 200000,
    inputPrice: 3.0,
    outputPrice: 15.0,
    description: "Best balance of intelligence, speed, and cost",
    maxTokens: 8192,
    supportsImages: true,
    supportsPromptCache: true,
    cacheWritesPrice: 3.75,
    cacheReadsPrice: 0.3,
  },
  {
    id: "claude-3-5-haiku-20241022",
    name: "Claude 3.5 Haiku",
    providerId: "anthropic",
    contextWindow: 200000,
    inputPrice: 0.8,
    outputPrice: 4.0,
    description: "Fastest and most cost-effective Claude model",
    maxTokens: 8192,
    supportsImages: false,
    supportsPromptCache: true,
    cacheWritesPrice: 1.0,
    cacheReadsPrice: 0.08,
  },

  // Google Gemini Models - Gemini 3 Series (Preview)
  {
    id: "gemini-3-pro-preview",
    name: "Gemini 3 Pro (Preview)",
    providerId: "gemini",
    contextWindow: 1048576,
    inputPrice: 2.0,
    outputPrice: 12.0,
    description:
      "Next-generation Gemini model with advanced reasoning and thinking capabilities",
    maxTokens: 8192,
    supportsImages: true,
    supportsPromptCache: true,
    cacheReadsPrice: 0.5,
    reasoning: {
      supported: true,
      enabledByDefault: true,
      canDisable: false,
      minBudget: 1024,
      maxBudget: 65536,
      defaultBudget: -1,
      dynamicBudget: {
        value: -1,
        description: "Let model decide based on query complexity",
      },
      outputType: 'summary',
    },
  },
  {
    id: "gemini-3-flash-preview",
    name: "Gemini 3 Flash (Preview)",
    providerId: "gemini",
    contextWindow: 1048576,
    inputPrice: 0.5,
    outputPrice: 3.0,
    description:
      "Fast Gemini 3 model with reasoning capabilities and large output support",
    maxTokens: 65536,
    supportsImages: true,
    supportsPromptCache: true,
    cacheReadsPrice: 0.125,
    reasoning: {
      supported: true,
      enabledByDefault: true,
      canDisable: true,
      minBudget: 1024,
      maxBudget: 24576,
      defaultBudget: -1,
      dynamicBudget: {
        value: -1,
        description: "Let model decide based on query complexity",
      },
      outputType: 'summary',
    },
  },
  // Google Gemini Models - Gemini 2.5 Series
  {
    id: "gemini-2.5-pro",
    name: "Gemini 2.5 Pro",
    providerId: "gemini",
    contextWindow: 1048576,
    inputPrice: 1.25,
    outputPrice: 10,
    description:
      "Most advanced Gemini model for complex reasoning and multimodal tasks",
    maxTokens: 65536,
    supportsImages: true,
    supportsPromptCache: true,
    cacheReadsPrice: 0.31,
    reasoning: {
      supported: true,
      enabledByDefault: true,
      canDisable: false,
      minBudget: 1024,
      maxBudget: 65536,
      defaultBudget: -1,
      dynamicBudget: {
        value: -1,
        description: "Let model decide based on query complexity",
      },
      outputType: 'summary',
    },
  },
  {
    id: "gemini-2.5-flash",
    name: "Gemini 2.5 Flash",
    providerId: "gemini",
    contextWindow: 1048576,
    inputPrice: 0.3,
    outputPrice: 2.5,
    description:
      "Fast, efficient model with large context and reasoning capabilities",
    maxTokens: 65536,
    supportsImages: true,
    supportsPromptCache: true,
    reasoning: {
      supported: true,
      enabledByDefault: true,
      canDisable: true,
      minBudget: 1024,
      maxBudget: 24576,
      defaultBudget: -1,
      dynamicBudget: {
        value: -1,
        description: "Let model decide based on query complexity",
      },
      outputType: 'summary',
    },
  },
  {
    id: "gemini-2.5-flash-lite-preview-06-17",
    name: "Gemini 2.5 Flash-Lite Preview",
    providerId: "gemini",
    contextWindow: 1000000,
    inputPrice: 0.1,
    outputPrice: 0.4,
    description:
      "Smallest and most cost effective model, built for at scale usage",
    maxTokens: 64000,
    supportsImages: true,
    supportsPromptCache: true,
    reasoning: {
      supported: true,
      enabledByDefault: false,
      canDisable: true,
      minBudget: 512,
      maxBudget: 24576,
      defaultBudget: -1,
      dynamicBudget: {
        value: -1,
        description: "Let model decide based on query complexity",
      },
      outputType: 'summary',
    },
  },
  {
    id: "gemini-2.0-flash",
    name: "Gemini 2.0 Flash",
    providerId: "gemini",
    contextWindow: 1048576,
    inputPrice: 0.1,
    outputPrice: 0.4,
    description: "High-performance model with multimodal capabilities",
    maxTokens: 8192,
    supportsImages: true,
    supportsPromptCache: true,
    cacheReadsPrice: 0.025,
    cacheWritesPrice: 1.0,
  },
  {
    id: "gemini-2.0-flash-lite",
    name: "Gemini 2.0 Flash Lite",
    providerId: "gemini",
    contextWindow: 1048576,
    inputPrice: 0.075,
    outputPrice: 0.3,
    description: "Lightweight version of Gemini 2.0 Flash",
    maxTokens: 8192,
    supportsImages: true,
    supportsPromptCache: false,
  },

  // OpenAI Models - GPT-5 Series
  {
    id: "gpt-5.2",
    name: "GPT-5.2",
    providerId: "openai",
    contextWindow: 272000,
    inputPrice: 1.75,
    outputPrice: 14.0,
    description: "Latest GPT-5 flagship model with advanced reasoning",
    maxTokens: 8192,
    supportsImages: true,
    supportsPromptCache: true,
    cacheReadsPrice: 0.4375,
    reasoning: {
      supported: true,
      enabledByDefault: false,
      canDisable: true,
      outputType: 'none',
    },
  },
  {
    id: "gpt-5.1",
    name: "GPT-5.1",
    providerId: "openai",
    contextWindow: 272000,
    inputPrice: 1.25,
    outputPrice: 10.0,
    description: "GPT-5 model with strong reasoning capabilities",
    maxTokens: 8192,
    supportsImages: true,
    supportsPromptCache: true,
    cacheReadsPrice: 0.3125,
    reasoning: {
      supported: true,
      enabledByDefault: false,
      canDisable: true,
      outputType: 'none',
    },
  },
  {
    id: "gpt-5-mini-2025-08-07",
    name: "GPT-5 Mini",
    providerId: "openai",
    contextWindow: 272000,
    inputPrice: 0.25,
    outputPrice: 2.0,
    description: "Compact GPT-5 model balancing cost and capability",
    maxTokens: 8192,
    supportsImages: true,
    supportsPromptCache: true,
    cacheReadsPrice: 0.0625,
    reasoning: {
      supported: true,
      enabledByDefault: false,
      canDisable: true,
      outputType: 'none',
    },
  },
  {
    id: "gpt-5-nano-2025-08-07",
    name: "GPT-5 Nano",
    providerId: "openai",
    contextWindow: 272000,
    inputPrice: 0.05,
    outputPrice: 0.4,
    description: "Ultra-efficient GPT-5 model for high-volume tasks",
    maxTokens: 8192,
    supportsImages: true,
    supportsPromptCache: true,
    cacheReadsPrice: 0.0125,
    reasoning: {
      supported: true,
      enabledByDefault: false,
      canDisable: true,
      outputType: 'none',
    },
  },
  // OpenAI Models - o-series
  {
    id: "o4-mini",
    name: "o4-mini",
    providerId: "openai",
    contextWindow: 200000,
    inputPrice: 1.1,
    outputPrice: 4.4,
    description: "Advanced reasoning model with high token capacity",
    maxTokens: 100000,
    supportsImages: true,
    supportsPromptCache: true,
    cacheReadsPrice: 0.275,
    unsupportedParameters: ["topP"],
    reasoning: {
      supported: true,
      enabledByDefault: true,
      canDisable: false,
      outputType: 'none',
    },
  },
  // OpenAI Models - GPT-4.1 Series
  {
    id: "gpt-4.1",
    name: "GPT-4.1",
    providerId: "openai",
    contextWindow: 1047576,
    inputPrice: 2,
    outputPrice: 8,
    description: "Latest GPT-4 model with enhanced capabilities",
    maxTokens: 32768,
    supportsImages: true,
    supportsPromptCache: true,
    cacheReadsPrice: 0.5,
  },
  {
    id: "gpt-4.1-mini",
    name: "GPT-4.1 Mini",
    providerId: "openai",
    contextWindow: 1047576,
    inputPrice: 0.4,
    outputPrice: 1.6,
    description: "Smaller version of GPT-4.1 for cost-effective tasks",
    maxTokens: 32768,
    supportsImages: true,
    supportsPromptCache: true,
    cacheReadsPrice: 0.1,
  },
  {
    id: "gpt-4.1-nano",
    name: "GPT-4.1 Nano",
    providerId: "openai",
    contextWindow: 1047576,
    inputPrice: 0.1,
    outputPrice: 0.4,
    description: "Ultra-efficient version of GPT-4.1",
    maxTokens: 32768,
    supportsImages: true,
    supportsPromptCache: true,
    cacheReadsPrice: 0.025,
  },

  // Mistral AI Models
  {
    id: "codestral-2501",
    name: "Codestral",
    providerId: "mistral",
    contextWindow: 256000,
    inputPrice: 0.3,
    outputPrice: 0.9,
    description: "Specialized model for code generation and programming tasks",
    maxTokens: 256000,
    supportsImages: false,
    supportsPromptCache: false,
  },
  {
    id: "devstral-small-2505",
    name: "Devstral Small",
    providerId: "mistral",
    contextWindow: 131072,
    inputPrice: 0.1,
    outputPrice: 0.3,
    description: "Compact development-focused model",
    maxTokens: 128000,
    supportsImages: false,
    supportsPromptCache: false,
  },

  // llama.cpp Model (generic - actual model determined by llama.cpp server)
  {
    id: "llamacpp",
    name: "llama.cpp Local Model",
    providerId: "llamacpp",
    contextWindow: 8192,
    inputPrice: 0.0,
    outputPrice: 0.0,
    description: "Local model running via llama.cpp server (model determined by server)",
    maxTokens: 4096,
    supportsImages: false,
    supportsPromptCache: false,
  },
];

/**
 * Gets provider information by ID
 *
 * @param providerId - The provider ID to look up
 * @returns The provider info or undefined if not found
 */
export function getProviderById(providerId: string): ProviderInfo | undefined {
  return SUPPORTED_PROVIDERS.find((provider) => provider.id === providerId);
}

/**
 * Gets model information by ID and provider
 *
 * @param modelId - The model ID to look up
 * @param providerId - The provider ID to filter by
 * @returns The model info or undefined if not found
 */
export function getModelById(
  modelId: string,
  providerId?: string
): ModelInfo | undefined {
  return SUPPORTED_MODELS.find(
    (model) =>
      model.id === modelId && (!providerId || model.providerId === providerId)
  );
}

/**
 * Gets all models for a specific provider
 *
 * @param providerId - The provider ID to filter by
 * @returns Array of model info for the provider
 */
export function getModelsByProvider(providerId: string): ModelInfo[] {
  return SUPPORTED_MODELS.filter((model) => model.providerId === providerId);
}

/**
 * Validates if a provider is supported
 *
 * @param providerId - The provider ID to validate
 * @returns True if the provider is supported
 */
export function isProviderSupported(providerId: string): boolean {
  return SUPPORTED_PROVIDERS.some((provider) => provider.id === providerId);
}

/**
 * Validates if a model is supported for a given provider
 *
 * @param modelId - The model ID to validate
 * @param providerId - The provider ID to validate against
 * @returns True if the model is supported for the provider
 */
export function isModelSupported(modelId: string, providerId: string): boolean {
  return SUPPORTED_MODELS.some(
    (model) => model.id === modelId && model.providerId === providerId
  );
}

/**
 * Creates a fallback ModelInfo for unknown/unregistered models
 *
 * Used when allowUnknownModels is enabled for a provider, or as a permissive
 * fallback when strict validation is disabled. Provides sensible defaults.
 *
 * @param modelId - The model ID to create info for
 * @param providerId - The provider ID
 * @param capabilities - Optional detected capabilities to merge (e.g., from GGUF detection)
 * @returns ModelInfo with default/placeholder values, enhanced with detected capabilities
 */
export function createFallbackModelInfo(
  modelId: string,
  providerId: string,
  capabilities?: Partial<ModelInfo>
): ModelInfo {
  const defaults: ModelInfo = {
    id: modelId,
    name: modelId,
    providerId: providerId as ApiProviderId,
    contextWindow: 4096,
    maxTokens: 2048,
    inputPrice: 0,
    outputPrice: 0,
    description: `Unknown model (using defaults)`,
    supportsImages: false,
    supportsPromptCache: false,
  };

  // Merge detected capabilities if provided
  if (capabilities) {
    return {
      ...defaults,
      ...capabilities,
      // Always preserve these from defaults/params
      id: modelId,
      name: capabilities.name || modelId,
      providerId: providerId as ApiProviderId,
      // For local models, pricing is always 0
      inputPrice: 0,
      outputPrice: 0,
      cacheWritesPrice: undefined,
      cacheReadsPrice: undefined,
    };
  }

  return defaults;
}

/**
 * Gets merged default settings for a specific model and provider
 *
 * @param modelId - The model ID
 * @param providerId - The provider ID
 * @returns Merged default settings with model-specific overrides applied
 */
export function getDefaultSettingsForModel(
  modelId: string,
  providerId: ApiProviderId
): Required<LLMSettings> {
  // Base settings: global defaults, then provider-specific, then model-specific overrides
  const baseDefaults = { ...DEFAULT_LLM_SETTINGS };
  const providerDefaults = PROVIDER_DEFAULT_SETTINGS[providerId] || {};
  const modelDefaults = MODEL_DEFAULT_SETTINGS[modelId] || {};

  // Merge settings in order of precedence
  const mergedSettings = {
    ...baseDefaults,
    ...providerDefaults,
    ...modelDefaults,
  };

  // Override maxTokens from ModelInfo if available
  const modelInfo = getModelById(modelId, providerId);
  if (modelInfo && modelInfo.maxTokens !== undefined) {
    mergedSettings.maxTokens = modelInfo.maxTokens;
  }

  // Handle reasoning settings based on model capabilities
  if (modelInfo?.reasoning?.supported) {
    // If the model has reasoning enabled by default, update the settings
    if (modelInfo.reasoning.enabledByDefault) {
      mergedSettings.reasoning = {
        ...mergedSettings.reasoning,
        enabled: true,
      };
    }
  }

  // Filter out undefined values and ensure required fields
  return Object.fromEntries(
    Object.entries(mergedSettings).filter(([_, value]) => value !== undefined)
  ) as Required<LLMSettings>;
}

/**
 * Valid Gemini harm categories for validation
 * Only includes categories supported by the API for safety setting rules
 */
const VALID_GEMINI_HARM_CATEGORIES: GeminiHarmCategory[] = [
  "HARM_CATEGORY_HATE_SPEECH",
  "HARM_CATEGORY_SEXUALLY_EXPLICIT",
  "HARM_CATEGORY_DANGEROUS_CONTENT",
  "HARM_CATEGORY_HARASSMENT",
  "HARM_CATEGORY_CIVIC_INTEGRITY",
];

/**
 * Valid Gemini harm block thresholds for validation
 */
const VALID_GEMINI_HARM_BLOCK_THRESHOLDS: GeminiHarmBlockThreshold[] = [
  "HARM_BLOCK_THRESHOLD_UNSPECIFIED",
  "BLOCK_LOW_AND_ABOVE",
  "BLOCK_MEDIUM_AND_ABOVE",
  "BLOCK_ONLY_HIGH",
  "BLOCK_NONE",
];

/**
 * Validates LLM settings values
 *
 * @param settings - The settings to validate
 * @returns Array of validation error messages, empty if valid
 */
export function validateLLMSettings(settings: Partial<LLMSettings>): string[] {
  const errors: string[] = [];

  if (settings.temperature !== undefined) {
    if (
      typeof settings.temperature !== "number" ||
      settings.temperature < 0 ||
      settings.temperature > 2
    ) {
      errors.push("temperature must be a number between 0 and 2");
    }
  }

  if (settings.maxTokens !== undefined) {
    if (
      !Number.isInteger(settings.maxTokens) ||
      settings.maxTokens < 1 ||
      settings.maxTokens > 100000
    ) {
      errors.push("maxTokens must be an integer between 1 and 100000");
    }
  }

  if (settings.topP !== undefined) {
    if (
      typeof settings.topP !== "number" ||
      settings.topP < 0 ||
      settings.topP > 1
    ) {
      errors.push("topP must be a number between 0 and 1");
    }
  }

  if (settings.frequencyPenalty !== undefined) {
    if (
      typeof settings.frequencyPenalty !== "number" ||
      settings.frequencyPenalty < -2 ||
      settings.frequencyPenalty > 2
    ) {
      errors.push("frequencyPenalty must be a number between -2 and 2");
    }
  }

  if (settings.presencePenalty !== undefined) {
    if (
      typeof settings.presencePenalty !== "number" ||
      settings.presencePenalty < -2 ||
      settings.presencePenalty > 2
    ) {
      errors.push("presencePenalty must be a number between -2 and 2");
    }
  }

  if (settings.stopSequences !== undefined) {
    if (!Array.isArray(settings.stopSequences)) {
      errors.push("stopSequences must be an array");
    } else if (settings.stopSequences.length > 4) {
      errors.push("stopSequences can contain at most 4 sequences");
    } else if (
      settings.stopSequences.some(
        (seq: any) => typeof seq !== "string" || seq.length === 0
      )
    ) {
      errors.push("stopSequences must contain only non-empty strings");
    }
  }

  if (settings.user !== undefined && typeof settings.user !== "string") {
    errors.push("user must be a string");
  }

  if (settings.geminiSafetySettings !== undefined) {
    if (!Array.isArray(settings.geminiSafetySettings)) {
      errors.push("geminiSafetySettings must be an array");
    } else {
      for (let i = 0; i < settings.geminiSafetySettings.length; i++) {
        const setting = settings.geminiSafetySettings[i];
        if (!setting || typeof setting !== "object") {
          errors.push(
            `geminiSafetySettings[${i}] must be an object with category and threshold`
          );
          continue;
        }

        if (
          !setting.category ||
          !VALID_GEMINI_HARM_CATEGORIES.includes(setting.category)
        ) {
          errors.push(
            `geminiSafetySettings[${i}].category must be a valid Gemini harm category`
          );
        }

        if (
          !setting.threshold ||
          !VALID_GEMINI_HARM_BLOCK_THRESHOLDS.includes(setting.threshold)
        ) {
          errors.push(
            `geminiSafetySettings[${i}].threshold must be a valid Gemini harm block threshold`
          );
        }
      }
    }
  }

  if (settings.reasoning !== undefined) {
    if (typeof settings.reasoning !== "object" || settings.reasoning === null) {
      errors.push("reasoning must be an object");
    } else {
      if (settings.reasoning.enabled !== undefined && typeof settings.reasoning.enabled !== "boolean") {
        errors.push("reasoning.enabled must be a boolean");
      }

      if (settings.reasoning.effort !== undefined) {
        if (!["high", "medium", "low"].includes(settings.reasoning.effort)) {
          errors.push("reasoning.effort must be 'high', 'medium', or 'low'");
        }
      }

      if (settings.reasoning.maxTokens !== undefined) {
        if (!Number.isInteger(settings.reasoning.maxTokens) || settings.reasoning.maxTokens < 0) {
          errors.push("reasoning.maxTokens must be a non-negative integer");
        }
      }

      if (settings.reasoning.exclude !== undefined && typeof settings.reasoning.exclude !== "boolean") {
        errors.push("reasoning.exclude must be a boolean");
      }
    }
  }

  return errors;
}
