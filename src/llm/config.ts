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
  StructuredOutputSettings,
  StructuredOutputSchema,
  LocalReasoningMetadata,
} from "./types";
import type { ILLMClientAdapter } from "./clients/types";
import { OpenAIClientAdapter } from "./clients/OpenAIClientAdapter";
import { AnthropicClientAdapter } from "./clients/AnthropicClientAdapter";
import { GeminiClientAdapter } from "./clients/GeminiClientAdapter";
import { LlamaCppClientAdapter } from "./clients/LlamaCppClientAdapter";
import { OpenRouterClientAdapter } from "./clients/OpenRouterClientAdapter";
import { MistralClientAdapter } from "./clients/MistralClientAdapter";
import { createDefaultLogger } from "../logging/defaultLogger";

const logger = createDefaultLogger();

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
  openrouter: OpenRouterClientAdapter,
  mistral: MistralClientAdapter,
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
    // 127.0.0.1 (not localhost) avoids a ~2s/request IPv6-fallback stall on Windows
    baseURL: process.env.LLAMACPP_API_BASE_URL || 'http://127.0.0.1:8080',
  },
  openrouter: {
    baseURL: process.env.OPENROUTER_API_BASE_URL || 'https://openrouter.ai/api/v1',
  },
  mistral: {
    baseURL: process.env.MISTRAL_API_BASE_URL || undefined,
  },
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
  topK: undefined as any, // No universal default; provider support varies, filtered when undefined
  minP: undefined as any, // No universal default; explicit per-model defaults for detected GGUF models
  repeatPenalty: undefined as any, // No universal default; explicit per-model defaults for detected GGUF models
  seed: undefined as any, // No universal default; deterministic sampling is opt-in
  supportsSystemMessage: true,
  systemMessageFallback: {
    format: 'xml',
    tagName: 'system',
    separator: '\n\n---\n\n',
  },
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
  openRouterProvider: undefined as any, // Optional, only used with OpenRouter provider
  structuredOutput: undefined as any, // Optional, enables JSON schema-constrained output
  logprobs: undefined as any, // Optional, per-token log probabilities (llama.cpp/OpenAI/OpenRouter)
  topLogprobs: undefined as any, // Optional, number of alternatives per token
  llamacpp: undefined as any, // Optional, llama.cpp-specific settings (grammar, chatTemplateKwargs)
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
    unsupportedParameters: ["frequencyPenalty", "topK", "minP", "repeatPenalty"],
  },
  {
    id: "anthropic",
    name: "Anthropic",
    unsupportedParameters: ["seed", "minP", "repeatPenalty", "logprobs", "topLogprobs"],
  },
  {
    id: "gemini",
    name: "Google Gemini",
    // Gemini has its own logprobs mechanism with a different shape; not mapped yet
    unsupportedParameters: ["minP", "repeatPenalty", "logprobs", "topLogprobs"],
  },
  {
    id: "mistral",
    name: "Mistral AI",
    unsupportedParameters: ["topK", "minP", "repeatPenalty", "logprobs", "topLogprobs"],
  },
  {
    id: "llamacpp",
    name: "llama.cpp",
    allowUnknownModels: true,  // Users load arbitrary GGUF models with custom names
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    allowUnknownModels: true,  // OpenRouter provides 100+ models dynamically
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

// ---------------------------------------------------------------------------
// Shared vendor sampling profiles and reasoning-toggle metadata for GGUF models.
// Sampling values follow vendor model cards; llama.cpp's own server defaults
// (temperature 0.8, top_k 40, min_p 0.05) match no vendor's recommendation, so
// detected models set them explicitly. See docs/dev/adding-models-and-providers.md.
// ---------------------------------------------------------------------------

const HYBRID_REASONING = {
  supported: true,
  enabledByDefault: false,
  canDisable: true,
} as const;

const ALWAYS_ON_REASONING = {
  supported: true,
  enabledByDefault: true,
  canDisable: false,
} as const;

const THINK_MARKERS: [string, string] = ["<think>", "</think>"];

/** Qwen chat templates: enable_thinking flag; template injects an empty think block when disabled */
const QWEN_LOCAL_REASONING: LocalReasoningMetadata = {
  toggleKwarg: "enable_thinking",
  nothinkPrefix: "<think>\n\n</think>\n\n",
  markers: THINK_MARKERS,
};

/** Gemma 4 chat template: enable_thinking flag; harmony-style thought-channel markers */
const GEMMA4_LOCAL_REASONING: LocalReasoningMetadata = {
  toggleKwarg: "enable_thinking",
  nothinkPrefix: "<|channel>thought\n<channel|>",
  markers: ["<|channel>thought", "<channel|>"],
};

// Vendor sampling profiles (temperature / topP / topK / minP / repeatPenalty)
const QWEN_NONTHINKING_SAMPLING: Partial<LLMSettings> = {
  temperature: 0.7, topP: 0.8, topK: 20, minP: 0, repeatPenalty: 1.0,
};
const QWEN3_THINKING_SAMPLING: Partial<LLMSettings> = {
  temperature: 0.6, topP: 0.95, topK: 20, minP: 0, repeatPenalty: 1.0,
};
const QWEN35_THINKING_SAMPLING: Partial<LLMSettings> = {
  temperature: 1.0, topP: 0.95, topK: 20, minP: 0, repeatPenalty: 1.0,
};
const GEMMA_SAMPLING: Partial<LLMSettings> = {
  temperature: 1.0, topP: 0.95, topK: 64, minP: 0, repeatPenalty: 1.0,
};
const GPT_OSS_SAMPLING: Partial<LLMSettings> = {
  temperature: 1.0, topP: 1.0, topK: 0, minP: 0, repeatPenalty: 1.0,
};
const MINISTRAL_INSTRUCT_SAMPLING: Partial<LLMSettings> = {
  temperature: 0.15, minP: 0, repeatPenalty: 1.0,
};
const MINISTRAL_REASONING_SAMPLING: Partial<LLMSettings> = {
  temperature: 0.7, topP: 0.95, minP: 0, repeatPenalty: 1.0,
};
const GRANITE_SAMPLING: Partial<LLMSettings> = {
  temperature: 0.7, topP: 0.95, topK: 0, minP: 0, repeatPenalty: 1.0,
};
const LLAMA32_SAMPLING: Partial<LLMSettings> = {
  temperature: 0.6, topP: 0.9, topK: 0, minP: 0, repeatPenalty: 1.0,
};

/**
 * Known GGUF model patterns for capability detection
 *
 * Order matters: more specific patterns should come before generic ones.
 * First matching pattern wins.
 *
 * Ordering rules (see docs/dev/adding-models-and-providers.md):
 * - Specific before generic: "qwen3-4b-instruct-2507" before "qwen3-4b"
 * - Newer family names before older substrings they contain: "qwen3.5" contains no
 *   "qwen3-" (the dot breaks the match) but is listed first anyway for clarity
 * - Quantization agnostic: never embed Q4_K_M/Q8_0 in patterns
 */
export const KNOWN_GGUF_MODELS: GgufModelPattern[] = [
  // --- Qwen 3.5 (hybrid thinking; enable_thinking toggle) ---
  {
    pattern: "qwen3.5-2b",
    name: "Qwen 3.5 2B",
    description: "Qwen 3.5 2B hybrid-thinking model",
    capabilities: {
      maxTokens: 8192,
      contextWindow: 131072,
      supportsImages: false,
      supportsPromptCache: false,
      reasoning: { ...HYBRID_REASONING },
      localReasoning: QWEN_LOCAL_REASONING,
      defaultSettings: QWEN_NONTHINKING_SAMPLING,
      reasoningDefaultSettings: QWEN35_THINKING_SAMPLING,
    },
  },
  {
    pattern: "qwen3.5-4b",
    name: "Qwen 3.5 4B",
    description: "Qwen 3.5 4B hybrid-thinking model",
    capabilities: {
      maxTokens: 8192,
      contextWindow: 131072,
      supportsImages: false,
      supportsPromptCache: false,
      reasoning: { ...HYBRID_REASONING },
      localReasoning: QWEN_LOCAL_REASONING,
      defaultSettings: QWEN_NONTHINKING_SAMPLING,
      reasoningDefaultSettings: QWEN35_THINKING_SAMPLING,
    },
  },
  {
    pattern: "qwen3.5-9b",
    name: "Qwen 3.5 9B",
    description: "Qwen 3.5 9B hybrid-thinking model",
    capabilities: {
      maxTokens: 16384,
      contextWindow: 131072,
      supportsImages: false,
      supportsPromptCache: false,
      reasoning: { ...HYBRID_REASONING },
      localReasoning: QWEN_LOCAL_REASONING,
      defaultSettings: QWEN_NONTHINKING_SAMPLING,
      reasoningDefaultSettings: QWEN35_THINKING_SAMPLING,
    },
  },
  {
    pattern: "qwen3.5",
    name: "Qwen 3.5",
    description: "Qwen 3.5 hybrid-thinking model (size not recognized)",
    capabilities: {
      maxTokens: 8192,
      contextWindow: 131072,
      supportsImages: false,
      supportsPromptCache: false,
      reasoning: { ...HYBRID_REASONING },
      localReasoning: QWEN_LOCAL_REASONING,
      defaultSettings: QWEN_NONTHINKING_SAMPLING,
      reasoningDefaultSettings: QWEN35_THINKING_SAMPLING,
    },
  },
  // --- Qwen 3.6 (hybrid thinking; same profiles as 3.5 per family reuse) ---
  {
    pattern: "qwen3.6-27b",
    name: "Qwen 3.6 27B",
    description: "Qwen 3.6 27B hybrid-thinking model",
    capabilities: {
      maxTokens: 16384,
      contextWindow: 131072,
      supportsImages: false,
      supportsPromptCache: false,
      reasoning: { ...HYBRID_REASONING },
      localReasoning: QWEN_LOCAL_REASONING,
      defaultSettings: QWEN_NONTHINKING_SAMPLING,
      reasoningDefaultSettings: QWEN35_THINKING_SAMPLING,
    },
  },
  {
    pattern: "qwen3.6-35b",
    name: "Qwen 3.6 35B-A3B",
    description: "Qwen 3.6 35B MoE (3B active) hybrid-thinking model",
    capabilities: {
      maxTokens: 16384,
      contextWindow: 131072,
      supportsImages: false,
      supportsPromptCache: false,
      reasoning: { ...HYBRID_REASONING },
      localReasoning: QWEN_LOCAL_REASONING,
      defaultSettings: QWEN_NONTHINKING_SAMPLING,
      reasoningDefaultSettings: QWEN35_THINKING_SAMPLING,
    },
  },
  {
    pattern: "qwen3.6",
    name: "Qwen 3.6",
    description: "Qwen 3.6 hybrid-thinking model (size not recognized)",
    capabilities: {
      maxTokens: 8192,
      contextWindow: 131072,
      supportsImages: false,
      supportsPromptCache: false,
      reasoning: { ...HYBRID_REASONING },
      localReasoning: QWEN_LOCAL_REASONING,
      defaultSettings: QWEN_NONTHINKING_SAMPLING,
      reasoningDefaultSettings: QWEN35_THINKING_SAMPLING,
    },
  },
  // --- Qwen 3 2507 refreshes (must precede the base qwen3-* size patterns) ---
  // Instruct-2507 checkpoints are non-thinking; the enable_thinking:false kwarg and
  // nothink stripping are safe no-ops there (template has no think injection).
  {
    pattern: "qwen3-4b-instruct-2507",
    name: "Qwen 3 4B Instruct 2507",
    description: "Qwen 3 4B Instruct-2507 (non-thinking checkpoint)",
    capabilities: {
      maxTokens: 8192,
      contextWindow: 131072,
      supportsImages: false,
      supportsPromptCache: false,
      localReasoning: QWEN_LOCAL_REASONING,
      defaultSettings: QWEN_NONTHINKING_SAMPLING,
    },
  },
  {
    pattern: "qwen3-4b-thinking-2507",
    name: "Qwen 3 4B Thinking 2507",
    description: "Qwen 3 4B Thinking-2507 (thinking-only checkpoint)",
    capabilities: {
      maxTokens: 16384,
      contextWindow: 131072,
      supportsImages: false,
      supportsPromptCache: false,
      reasoning: { ...ALWAYS_ON_REASONING },
      localReasoning: { markers: THINK_MARKERS },
      defaultSettings: QWEN3_THINKING_SAMPLING,
    },
  },
  {
    pattern: "qwen3-30b-a3b-instruct-2507",
    name: "Qwen 3 30B-A3B Instruct 2507",
    description: "Qwen 3 30B-A3B Instruct-2507 (non-thinking checkpoint)",
    capabilities: {
      maxTokens: 16384,
      contextWindow: 131072,
      supportsImages: false,
      supportsPromptCache: false,
      localReasoning: QWEN_LOCAL_REASONING,
      defaultSettings: QWEN_NONTHINKING_SAMPLING,
    },
  },
  {
    pattern: "qwen3-30b-a3b-thinking-2507",
    name: "Qwen 3 30B-A3B Thinking 2507",
    description: "Qwen 3 30B-A3B Thinking-2507 (thinking-only checkpoint)",
    capabilities: {
      maxTokens: 16384,
      contextWindow: 131072,
      supportsImages: false,
      supportsPromptCache: false,
      reasoning: { ...ALWAYS_ON_REASONING },
      localReasoning: { markers: THINK_MARKERS },
      defaultSettings: QWEN3_THINKING_SAMPLING,
    },
  },
  // --- Qwen 3 Series (original hybrid checkpoints; enable_thinking toggle) ---
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
        ...HYBRID_REASONING,
        maxBudget: 38912,
      },
      localReasoning: QWEN_LOCAL_REASONING,
      defaultSettings: QWEN_NONTHINKING_SAMPLING,
      reasoningDefaultSettings: QWEN3_THINKING_SAMPLING,
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
        ...HYBRID_REASONING,
        maxBudget: 38912,
      },
      localReasoning: QWEN_LOCAL_REASONING,
      defaultSettings: QWEN_NONTHINKING_SAMPLING,
      reasoningDefaultSettings: QWEN3_THINKING_SAMPLING,
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
        ...HYBRID_REASONING,
        maxBudget: 38912,
      },
      localReasoning: QWEN_LOCAL_REASONING,
      defaultSettings: QWEN_NONTHINKING_SAMPLING,
      reasoningDefaultSettings: QWEN3_THINKING_SAMPLING,
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
        ...HYBRID_REASONING,
        maxBudget: 38912,
      },
      localReasoning: QWEN_LOCAL_REASONING,
      defaultSettings: QWEN_NONTHINKING_SAMPLING,
      reasoningDefaultSettings: QWEN3_THINKING_SAMPLING,
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
        ...HYBRID_REASONING,
        maxBudget: 30720,
      },
      localReasoning: QWEN_LOCAL_REASONING,
      defaultSettings: QWEN_NONTHINKING_SAMPLING,
      reasoningDefaultSettings: QWEN3_THINKING_SAMPLING,
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
        ...HYBRID_REASONING,
        maxBudget: 30720,
      },
      localReasoning: QWEN_LOCAL_REASONING,
      defaultSettings: QWEN_NONTHINKING_SAMPLING,
      reasoningDefaultSettings: QWEN3_THINKING_SAMPLING,
    },
  },
  // --- Gemma 4 (hybrid thinking, supports system messages) ---
  // Note: enable_thinking:true is best-effort on Gemma 4 — the chat-template flag
  // activates the thought channel unreliably. enable_thinking:false works reliably.
  {
    pattern: "gemma-4-e2b",
    name: "Gemma 4 E2B",
    description: "Gemma 4 E2B (2.3B effective) hybrid-thinking model",
    capabilities: {
      maxTokens: 8192,
      contextWindow: 131072,
      supportsImages: false,
      supportsPromptCache: false,
      supportsSystemMessage: true,
      reasoning: { ...HYBRID_REASONING },
      localReasoning: GEMMA4_LOCAL_REASONING,
      defaultSettings: GEMMA_SAMPLING,
    },
  },
  {
    pattern: "gemma-4-e4b",
    name: "Gemma 4 E4B",
    description: "Gemma 4 E4B (4.5B effective) hybrid-thinking model",
    capabilities: {
      maxTokens: 8192,
      contextWindow: 131072,
      supportsImages: false,
      supportsPromptCache: false,
      supportsSystemMessage: true,
      reasoning: { ...HYBRID_REASONING },
      localReasoning: GEMMA4_LOCAL_REASONING,
      defaultSettings: GEMMA_SAMPLING,
    },
  },
  {
    pattern: "gemma-4-12b",
    name: "Gemma 4 12B",
    description: "Gemma 4 12B dense hybrid-thinking model (256K context)",
    capabilities: {
      maxTokens: 16384,
      contextWindow: 262144,
      supportsImages: false,
      supportsPromptCache: false,
      supportsSystemMessage: true,
      reasoning: { ...HYBRID_REASONING },
      localReasoning: GEMMA4_LOCAL_REASONING,
      defaultSettings: GEMMA_SAMPLING,
    },
  },
  {
    pattern: "gemma-4-26b-a4b",
    name: "Gemma 4 26B-A4B",
    description: "Gemma 4 26B MoE (~4B active) hybrid-thinking model (256K context)",
    capabilities: {
      maxTokens: 16384,
      contextWindow: 262144,
      supportsImages: false,
      supportsPromptCache: false,
      supportsSystemMessage: true,
      reasoning: { ...HYBRID_REASONING },
      localReasoning: GEMMA4_LOCAL_REASONING,
      defaultSettings: GEMMA_SAMPLING,
    },
  },
  {
    pattern: "gemma-4-31b",
    name: "Gemma 4 31B",
    description: "Gemma 4 31B dense hybrid-thinking model (256K context)",
    capabilities: {
      maxTokens: 16384,
      contextWindow: 262144,
      supportsImages: false,
      supportsPromptCache: false,
      supportsSystemMessage: true,
      reasoning: { ...HYBRID_REASONING },
      localReasoning: GEMMA4_LOCAL_REASONING,
      defaultSettings: GEMMA_SAMPLING,
    },
  },
  {
    pattern: "gemma-4",
    name: "Gemma 4",
    description: "Gemma 4 hybrid-thinking model (size not recognized)",
    capabilities: {
      maxTokens: 8192,
      contextWindow: 131072,
      supportsImages: false,
      supportsPromptCache: false,
      supportsSystemMessage: true,
      reasoning: { ...HYBRID_REASONING },
      localReasoning: GEMMA4_LOCAL_REASONING,
      defaultSettings: GEMMA_SAMPLING,
    },
  },
  // --- Gemma 3 (no thinking, no system-message role) ---
  {
    pattern: "gemma-3-1b",
    name: "Gemma 3 1B",
    description: "Gemma 3 1B instruction-tuned model",
    capabilities: {
      maxTokens: 8192,
      contextWindow: 32768,
      supportsImages: false,
      supportsPromptCache: false,
      supportsSystemMessage: false,
      defaultSettings: GEMMA_SAMPLING,
    },
  },
  {
    pattern: "gemma-3-4b",
    name: "Gemma 3 4B",
    description: "Gemma 3 4B instruction-tuned model",
    capabilities: {
      maxTokens: 8192,
      contextWindow: 131072,
      supportsImages: false,
      supportsPromptCache: false,
      supportsSystemMessage: false,
      defaultSettings: GEMMA_SAMPLING,
    },
  },
  {
    pattern: "gemma-3-12b",
    name: "Gemma 3 12B",
    description: "Gemma 3 12B instruction-tuned model",
    capabilities: {
      maxTokens: 8192,
      contextWindow: 131072,
      supportsImages: false,
      supportsPromptCache: false,
      supportsSystemMessage: false,
      defaultSettings: GEMMA_SAMPLING,
    },
  },
  {
    pattern: "gemma-3-27b",
    name: "Gemma 3 27B",
    description: "Gemma 3 27B instruction-tuned model",
    capabilities: {
      maxTokens: 8192,
      contextWindow: 131072,
      supportsImages: false,
      supportsPromptCache: false,
      supportsSystemMessage: false,
      defaultSettings: GEMMA_SAMPLING,
    },
  },
  {
    pattern: "gemma-3",
    name: "Gemma 3",
    description: "Gemma 3 instruction-tuned model (size not recognized)",
    capabilities: {
      maxTokens: 8192,
      contextWindow: 32768,
      supportsImages: false,
      supportsPromptCache: false,
      supportsSystemMessage: false,
      defaultSettings: GEMMA_SAMPLING,
    },
  },
  // --- GPT-OSS (harmony format; reasoning always on, cannot be disabled) ---
  {
    pattern: "gpt-oss-120b",
    name: "GPT-OSS 120B",
    description: "OpenAI GPT-OSS 120B reasoning-native model (harmony format)",
    capabilities: {
      maxTokens: 16384,
      contextWindow: 131072,
      supportsImages: false,
      supportsPromptCache: false,
      reasoning: { ...ALWAYS_ON_REASONING },
      defaultSettings: GPT_OSS_SAMPLING,
    },
  },
  {
    pattern: "gpt-oss-20b",
    name: "GPT-OSS 20B",
    description: "OpenAI GPT-OSS 20B reasoning-native model (harmony format)",
    capabilities: {
      maxTokens: 16384,
      contextWindow: 131072,
      supportsImages: false,
      supportsPromptCache: false,
      reasoning: { ...ALWAYS_ON_REASONING },
      defaultSettings: GPT_OSS_SAMPLING,
    },
  },
  {
    pattern: "gpt-oss",
    name: "GPT-OSS",
    description: "OpenAI GPT-OSS reasoning-native model (size not recognized)",
    capabilities: {
      maxTokens: 16384,
      contextWindow: 131072,
      supportsImages: false,
      supportsPromptCache: false,
      reasoning: { ...ALWAYS_ON_REASONING },
      defaultSettings: GPT_OSS_SAMPLING,
    },
  },
  // --- Ministral 3 (Reasoning variants before Instruct; Reasoning is a separate
  //     checkpoint, not a toggle) ---
  {
    pattern: "ministral-3-3b-reasoning",
    name: "Ministral 3 3B Reasoning",
    description: "Ministral 3 3B Reasoning variant (always-on thinking)",
    capabilities: {
      maxTokens: 16384,
      contextWindow: 131072,
      supportsImages: false,
      supportsPromptCache: false,
      reasoning: { ...ALWAYS_ON_REASONING },
      localReasoning: { markers: THINK_MARKERS },
      defaultSettings: MINISTRAL_REASONING_SAMPLING,
    },
  },
  {
    pattern: "ministral-3-8b-reasoning",
    name: "Ministral 3 8B Reasoning",
    description: "Ministral 3 8B Reasoning variant (always-on thinking)",
    capabilities: {
      maxTokens: 16384,
      contextWindow: 131072,
      supportsImages: false,
      supportsPromptCache: false,
      reasoning: { ...ALWAYS_ON_REASONING },
      localReasoning: { markers: THINK_MARKERS },
      defaultSettings: MINISTRAL_REASONING_SAMPLING,
    },
  },
  {
    pattern: "ministral-3-14b-reasoning",
    name: "Ministral 3 14B Reasoning",
    description: "Ministral 3 14B Reasoning variant (always-on thinking)",
    capabilities: {
      maxTokens: 16384,
      contextWindow: 131072,
      supportsImages: false,
      supportsPromptCache: false,
      reasoning: { ...ALWAYS_ON_REASONING },
      localReasoning: { markers: THINK_MARKERS },
      defaultSettings: MINISTRAL_REASONING_SAMPLING,
    },
  },
  {
    pattern: "ministral-3",
    name: "Ministral 3",
    description: "Ministral 3 Instruct model (thinking disabled via template flag)",
    capabilities: {
      maxTokens: 8192,
      contextWindow: 131072,
      supportsImages: false,
      supportsPromptCache: false,
      // Template supports a thinking flag but the Instruct variant is not a
      // reasoning model; the adapter keeps enable_thinking:false.
      localReasoning: {
        toggleKwarg: "enable_thinking",
        markers: THINK_MARKERS,
      },
      defaultSettings: MINISTRAL_INSTRUCT_SAMPLING,
    },
  },
  // --- Granite 4.1 (no thinking) ---
  {
    pattern: "granite-4.1",
    name: "Granite 4.1",
    description: "IBM Granite 4.1 instruction-tuned model",
    capabilities: {
      maxTokens: 8192,
      contextWindow: 131072,
      supportsImages: false,
      supportsPromptCache: false,
      defaultSettings: GRANITE_SAMPLING,
    },
  },
  // --- DeepSeek R1 (reasoning always on) ---
  {
    pattern: "deepseek-r1",
    name: "DeepSeek R1",
    description: "DeepSeek R1 reasoning model (always-on thinking)",
    capabilities: {
      maxTokens: 16384,
      contextWindow: 131072,
      supportsImages: false,
      supportsPromptCache: false,
      reasoning: { ...ALWAYS_ON_REASONING },
      localReasoning: { markers: THINK_MARKERS },
      defaultSettings: {
        temperature: 0.6, topP: 0.95, minP: 0, repeatPenalty: 1.0,
      },
    },
  },
  // --- Llama 3.2 (no thinking) ---
  {
    pattern: "llama-3.2",
    name: "Llama 3.2",
    description: "Meta Llama 3.2 instruction-tuned model",
    capabilities: {
      maxTokens: 8192,
      contextWindow: 131072,
      supportsImages: false,
      supportsPromptCache: false,
      defaultSettings: LLAMA32_SAMPLING,
    },
  },
  // Add more model patterns here as needed
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
      logger.debug(`Detected GGUF model: ${model.name} (pattern: ${model.pattern})`);
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
    structuredOutput: {
      supported: true,
      strictMode: true,
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
    structuredOutput: {
      supported: true,
      strictMode: true,
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
    structuredOutput: {
      supported: true,
      strictMode: true,
    },
  },
  // Anthropic Models - Claude 4 Series
  // Note: Anthropic's structured outputs are generally available for Claude 4.5
  // and later models only, so the entries below declare it unsupported.
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
    structuredOutput: {
      supported: false,
      notes: "Anthropic structured outputs require Claude 4.5 or later",
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
    structuredOutput: {
      supported: false,
      notes: "Anthropic structured outputs require Claude 4.5 or later",
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
    structuredOutput: {
      supported: false,
      notes: "Anthropic structured outputs require Claude 4.5 or later",
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
    structuredOutput: {
      supported: false,
      notes: "Anthropic structured outputs require Claude 4.5 or later",
    },
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
    structuredOutput: {
      supported: false,
      notes: "Anthropic structured outputs require Claude 4.5 or later",
    },
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
    structuredOutput: {
      supported: true,
      strictMode: true,
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
    structuredOutput: {
      supported: true,
      strictMode: true,
    },
  },
  {
    id: "gemini-2.5-flash-lite",
    name: "Gemini 2.5 Flash-Lite",
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
  // Google Gemma 3 Models (Open weights, free via Gemini API)
  // Note: Gemma models don't support system instructions - system content is prepended to user message
  // Note: Gemma models don't support JSON mode/structured output via Google's API
  {
    id: "gemma-3-27b-it",
    name: "Gemma 3 27B",
    providerId: "gemini",
    contextWindow: 131072,
    inputPrice: 0.0,
    outputPrice: 0.0,
    description:
      "Google's largest open model with multimodal capabilities and 128K context (free via Gemini API)",
    maxTokens: 8192,
    supportsImages: true,
    supportsPromptCache: false,
    supportsSystemMessage: false,
    structuredOutput: {
      supported: false,
      notes: "Gemma models do not support JSON mode via Google's API",
    },
  },
  // Google Gemma 4 Models (Open weights, free via Gemini API)
  // Note: Unlike Gemma 3, Gemma 4 supports a native system role
  // Note: Reasoning left unsupported on the cloud entries — the Gemini API exposes
  // no thinking toggle for Gemma (the <|think|> system-token mechanism is not modeled)
  {
    id: "gemma-4-26b-a4b-it",
    name: "Gemma 4 26B-A4B",
    providerId: "gemini",
    contextWindow: 262144,
    inputPrice: 0.0,
    outputPrice: 0.0,
    description:
      "Google's Gemma 4 26B MoE (~4B active) open model with 256K context (free via Gemini API)",
    maxTokens: 8192,
    supportsImages: false,
    supportsPromptCache: false,
    supportsSystemMessage: true,
    structuredOutput: {
      supported: false,
      notes: "Gemma models do not support JSON mode via Google's API",
    },
  },
  {
    id: "gemma-4-31b-it",
    name: "Gemma 4 31B",
    providerId: "gemini",
    contextWindow: 262144,
    inputPrice: 0.0,
    outputPrice: 0.0,
    description:
      "Google's Gemma 4 31B dense open model with 256K context (free via Gemini API)",
    maxTokens: 8192,
    supportsImages: false,
    supportsPromptCache: false,
    supportsSystemMessage: true,
    structuredOutput: {
      supported: false,
      notes: "Gemma models do not support JSON mode via Google's API",
    },
  },

  // OpenAI Models - GPT-5 Series
  // Note: GPT-5 models do not support temperature or topP parameters
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
    unsupportedParameters: ["temperature", "topP", "seed"],
    reasoning: {
      supported: true,
      enabledByDefault: false,
      canDisable: true,
      outputType: 'none',
    },
    structuredOutput: {
      supported: true,
      strictMode: true,
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
    unsupportedParameters: ["temperature", "topP", "seed"],
    reasoning: {
      supported: true,
      enabledByDefault: false,
      canDisable: true,
      outputType: 'none',
    },
    structuredOutput: {
      supported: true,
      strictMode: true,
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
    unsupportedParameters: ["temperature", "topP", "seed"],
    reasoning: {
      supported: true,
      enabledByDefault: false,
      canDisable: true,
      outputType: 'none',
    },
    structuredOutput: {
      supported: true,
      strictMode: true,
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
    unsupportedParameters: ["temperature", "topP", "seed"],
    reasoning: {
      supported: true,
      enabledByDefault: false,
      canDisable: true,
      outputType: 'none',
    },
    structuredOutput: {
      supported: true,
      strictMode: true,
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
    unsupportedParameters: ["topP", "seed"],
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
    structuredOutput: {
      supported: true,
      strictMode: true,
    },
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
    structuredOutput: {
      supported: true,
      strictMode: true,
    },
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
    structuredOutput: {
      supported: true,
      strictMode: true,
    },
  },

  // Mistral AI Models
  {
    id: "mistral-small-latest",
    name: "Mistral Small",
    providerId: "mistral",
    contextWindow: 128000,
    inputPrice: 0.1,
    outputPrice: 0.3,
    description: "Cost-effective model for general tasks",
    maxTokens: 128000,
    supportsImages: false,
    supportsPromptCache: false,
    structuredOutput: {
      supported: true,
      strictMode: false,
      notes: "JSON mode only - schema validation is client-side",
    },
  },
  {
    id: "mistral-large-2512",
    name: "Mistral Large 3",
    providerId: "mistral",
    contextWindow: 256000,
    inputPrice: 0.5,
    outputPrice: 1.5,
    description: "Mistral's frontier model with 256K context",
    maxTokens: 256000,
    supportsImages: false,
    supportsPromptCache: false,
    structuredOutput: {
      supported: true,
      strictMode: false,
      notes: "JSON mode only - schema validation is client-side",
    },
  },
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
    structuredOutput: {
      supported: true,
      strictMode: false,
      notes: "JSON mode only - schema validation is client-side",
    },
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
    // Optimistic: the server decides which model is loaded, so reasoning requests on
    // the generic id are not rejected. When the loaded GGUF is recognized, detection
    // overlays the real capabilities; otherwise extraction degrades gracefully.
    reasoning: {
      supported: true,
      enabledByDefault: false,
      canDisable: true,
    },
    structuredOutput: {
      supported: true,
      strictMode: true,
      notes: "Requires llama.cpp server with grammar support enabled",
    },
  },

  // OpenRouter Models (Free Tier)
  {
    id: "google/gemma-3-27b-it:free",
    name: "Gemma 3 27B (Free)",
    providerId: "openrouter",
    contextWindow: 96000,
    inputPrice: 0.0,
    outputPrice: 0.0,
    description: "Google's Gemma 3 27B instruction-tuned model via OpenRouter (free tier)",
    maxTokens: 8192,
    supportsImages: true,
    supportsPromptCache: false,
    structuredOutput: {
      supported: true,
      strictMode: true,
      notes: "Structured output supported via OpenRouter",
    },
  },
  {
    id: "mistralai/mistral-small-3.1-24b-instruct:free",
    name: "Mistral Small 3.1 24B (Free)",
    providerId: "openrouter",
    contextWindow: 96000,
    inputPrice: 0.0,
    outputPrice: 0.0,
    description: "Mistral Small 3.1 24B instruction model via OpenRouter (free tier)",
    maxTokens: 8192,
    supportsImages: false,
    supportsPromptCache: false,
    structuredOutput: {
      supported: true,
      strictMode: true,
      notes: "Structured output supported via OpenRouter",
    },
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
 * @param resolvedModelInfo - Optional already-resolved ModelInfo (e.g. a detected GGUF
 *   model's fallback info). When provided it is used instead of a registry lookup, so
 *   capabilities and defaultSettings of dynamically-detected models flow into settings.
 * @returns Merged default settings with model-specific overrides applied
 */
export function getDefaultSettingsForModel(
  modelId: string,
  providerId: ApiProviderId,
  resolvedModelInfo?: ModelInfo
): Required<LLMSettings> {
  // Base settings: global defaults, then provider-specific, then model-specific overrides
  const baseDefaults = { ...DEFAULT_LLM_SETTINGS };
  const providerDefaults = PROVIDER_DEFAULT_SETTINGS[providerId] || {};
  const modelDefaults = MODEL_DEFAULT_SETTINGS[modelId] || {};

  // Prefer the caller's resolved ModelInfo (covers detected GGUF/unknown models);
  // fall back to the static registry.
  const modelInfo = resolvedModelInfo ?? getModelById(modelId, providerId);

  // Merge settings in order of precedence (model-declared defaults sit above the
  // static per-model-ID table, below request settings)
  const mergedSettings = {
    ...baseDefaults,
    ...providerDefaults,
    ...modelDefaults,
    ...(modelInfo?.defaultSettings || {}),
  };

  // Override maxTokens from ModelInfo if available (unless the model's own
  // defaultSettings already chose one)
  if (
    modelInfo &&
    modelInfo.maxTokens !== undefined &&
    modelInfo.defaultSettings?.maxTokens === undefined
  ) {
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

  // Override supportsSystemMessage from ModelInfo if explicitly set
  if (modelInfo && modelInfo.supportsSystemMessage !== undefined) {
    mergedSettings.supportsSystemMessage = modelInfo.supportsSystemMessage;
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

  if (settings.topK !== undefined) {
    if (!Number.isInteger(settings.topK) || settings.topK < 0) {
      errors.push("topK must be a non-negative integer");
    }
  }

  if (settings.minP !== undefined) {
    if (
      typeof settings.minP !== "number" ||
      settings.minP < 0 ||
      settings.minP > 1
    ) {
      errors.push("minP must be a number between 0 and 1");
    }
  }

  if (settings.repeatPenalty !== undefined) {
    if (
      typeof settings.repeatPenalty !== "number" ||
      settings.repeatPenalty <= 0
    ) {
      errors.push("repeatPenalty must be a positive number");
    }
  }

  if (settings.seed !== undefined) {
    if (!Number.isInteger(settings.seed)) {
      errors.push("seed must be an integer");
    }
  }

  if (settings.logprobs !== undefined && typeof settings.logprobs !== "boolean") {
    errors.push("logprobs must be a boolean");
  }

  if (settings.topLogprobs !== undefined) {
    if (
      !Number.isInteger(settings.topLogprobs) ||
      settings.topLogprobs < 0 ||
      settings.topLogprobs > 20
    ) {
      errors.push("topLogprobs must be an integer between 0 and 20");
    }
  }

  if (settings.llamacpp !== undefined) {
    if (typeof settings.llamacpp !== "object" || settings.llamacpp === null) {
      errors.push("llamacpp must be an object");
    } else {
      if (
        settings.llamacpp.grammar !== undefined &&
        typeof settings.llamacpp.grammar !== "string"
      ) {
        errors.push("llamacpp.grammar must be a string (GBNF grammar)");
      }
      if (settings.llamacpp.chatTemplateKwargs !== undefined) {
        const kwargs = settings.llamacpp.chatTemplateKwargs;
        if (typeof kwargs !== "object" || kwargs === null || Array.isArray(kwargs)) {
          errors.push("llamacpp.chatTemplateKwargs must be an object");
        } else if (
          Object.values(kwargs).some(
            (v) => !["string", "number", "boolean"].includes(typeof v)
          )
        ) {
          errors.push(
            "llamacpp.chatTemplateKwargs values must be strings, numbers, or booleans"
          );
        }
      }
      // llama-server rejects requests carrying both a raw grammar and a JSON schema:
      // "Either 'json_schema' or 'grammar' can be specified, but not both"
      if (
        settings.llamacpp.grammar &&
        settings.structuredOutput?.schema &&
        settings.structuredOutput.enabled !== false &&
        settings.structuredOutput.delivery !== "prompt"
      ) {
        errors.push(
          "llamacpp.grammar and structuredOutput are mutually exclusive (llama-server rejects both together)"
        );
      }
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

  if (settings.structuredOutput !== undefined) {
    if (typeof settings.structuredOutput !== "object" || settings.structuredOutput === null) {
      errors.push("structuredOutput must be an object");
    } else {
      const so = settings.structuredOutput;

      // name is required
      if (!so.name || typeof so.name !== "string" || so.name.trim().length === 0) {
        errors.push("structuredOutput.name is required and must be a non-empty string");
      }

      // schema is required
      if (!so.schema || typeof so.schema !== "object") {
        errors.push("structuredOutput.schema is required and must be an object");
      } else {
        // Validate schema has a valid type
        const validTypes = ["object", "array", "string", "number", "boolean"];
        if (!so.schema.type || !validTypes.includes(so.schema.type)) {
          errors.push(`structuredOutput.schema.type must be one of: ${validTypes.join(", ")}`);
        }
      }

      // enabled must be boolean if present
      if (so.enabled !== undefined && typeof so.enabled !== "boolean") {
        errors.push("structuredOutput.enabled must be a boolean");
      }

      if (
        so.delivery !== undefined &&
        so.delivery !== "native" &&
        so.delivery !== "prompt"
      ) {
        errors.push("structuredOutput.delivery must be 'native' or 'prompt'");
      }

      // strict must be boolean if present
      if (so.strict !== undefined && typeof so.strict !== "boolean") {
        errors.push("structuredOutput.strict must be a boolean");
      }

      // autoParse must be boolean if present
      if (so.autoParse !== undefined && typeof so.autoParse !== "boolean") {
        errors.push("structuredOutput.autoParse must be a boolean");
      }
    }
  }

  return errors;
}
