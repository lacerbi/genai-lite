// --- Core Types ---
export type { ApiKeyProvider } from "./types";

// --- LLM Service ---
export { LLMService } from "./llm/LLMService";
export type { LLMServiceOptions, PresetMode, CreateMessagesResult } from "./llm/LLMService";

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
} from "./llm/clients/LlamaCppServerClient";

// --- Utilities ---
export { renderTemplate } from "./prompting/template";
export { countTokens, getSmartPreview, extractRandomVariables } from "./prompting/content";
export { parseStructuredContent, parseRoleTags, extractInitialTaggedContent, parseTemplateWithMetadata } from "./prompting/parser";
export type { TemplateMetadata } from "./prompting/parser";
export { createFallbackModelInfo } from "./llm/config";