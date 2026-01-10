// --- Core Types ---
export type { ApiKeyProvider, PresetMode } from "./types";

// --- LLM Service ---
export { LLMService } from "./llm/LLMService";
export type { LLMServiceOptions, CreateMessagesResult } from "./llm/LLMService";

// --- Model Presets ---
export type { ModelPreset } from "./types/presets";

// Export all core request/response/config types from the LLM module
export * from "./llm/types";

// Export all client adapter types
export * from "./llm/clients/types";

// --- API Key Providers ---
export { fromEnvironment } from "./providers/fromEnvironment";

// --- llama.cpp Integration ---
export { LlamaCppClientAdapter } from "./llm/clients/LlamaCppClientAdapter";
export { LlamaCppServerClient } from "./llm/clients/LlamaCppServerClient";
export type {
  LlamaCppClientConfig,
} from "./llm/clients/LlamaCppClientAdapter";
export type {
  LlamaCppHealthResponse,
  LlamaCppTokenizeResponse,
  LlamaCppDetokenizeResponse,
  LlamaCppEmbeddingResponse,
  LlamaCppInfillResponse,
  LlamaCppPropsResponse,
  LlamaCppMetricsResponse,
  LlamaCppSlot,
  LlamaCppSlotsResponse,
  LlamaCppModel,
  LlamaCppModelsResponse,
} from "./llm/clients/LlamaCppServerClient";

// --- OpenRouter Integration ---
export { OpenRouterClientAdapter } from "./llm/clients/OpenRouterClientAdapter";
export type { OpenRouterClientConfig } from "./llm/clients/OpenRouterClientAdapter";

// --- Mistral Integration ---
export { MistralClientAdapter } from "./llm/clients/MistralClientAdapter";
export type { MistralClientConfig } from "./llm/clients/MistralClientAdapter";

// --- Image Generation ---
// Export Image Service
export { ImageService } from "./image/ImageService";

// Export all image types
export type {
  ImageProviderId,
  ImageMimeType,
  ImageResponseFormat,
  ImageQuality,
  ImageStyle,
  DiffusionSampler,
  ImageProgressStage,
  ImageProgressCallback,
  DiffusionSettings,
  OpenAISpecificSettings,
  ImageGenerationSettings,
  ResolvedImageGenerationSettings,
  ImageUsage,
  GeneratedImage,
  ImageGenerationRequestBase,
  ImageGenerationRequest,
  ImageGenerationRequestWithPreset,
  ImageGenerationResponse,
  ImageFailureResponse,
  ImageProviderCapabilities,
  ImageModelInfo,
  ImageProviderInfo,
  ImagePreset,
  ImageProviderAdapterConfig,
  ImageProviderAdapter,
  ImageServiceOptions,
  CreatePromptResult,
} from "./types/image";

// --- Utilities ---
export { renderTemplate } from "./prompting/template";
export { countTokens, getSmartPreview, extractRandomVariables } from "./prompting/content";
export { parseStructuredContent, parseRoleTags, extractInitialTaggedContent, parseTemplateWithMetadata } from "./prompting/parser";
export type { TemplateMetadata } from "./prompting/parser";
export { createFallbackModelInfo, detectGgufCapabilities, KNOWN_GGUF_MODELS } from "./llm/config";
export type { GgufModelPattern } from "./llm/config";

// --- Logging ---
export type { Logger, LogLevel, LoggingConfig } from "./logging/types";
export { createDefaultLogger, DEFAULT_LOG_LEVEL, silentLogger } from "./logging/defaultLogger";