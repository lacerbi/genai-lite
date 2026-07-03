# TypeScript Reference

Complete type definitions and interfaces for genai-lite.

## Contents

- [Overview](#overview)
- [Import Patterns](#import-patterns)
- [Core Types](#core-types)
- [LLM Types](#llm-types)
- [Image Types](#image-types)
- [llama.cpp Types](#llamacpp-types)
- [Utility Types](#utility-types)
- [Logging Types](#logging-types)

## Overview

genai-lite is written in TypeScript and provides comprehensive type definitions for all APIs, ensuring type safety and IDE IntelliSense support with discriminated unions for response types.

## Import Patterns

### Services and Functions

```typescript
// Services
import { LLMService, ImageService } from 'genai-lite';

// API key providers
import { fromEnvironment } from 'genai-lite';

// Utilities
import {
  renderTemplate,
  countTokens,
  getSmartPreview,
  parseRoleTags,
  parseStructuredContent,
  extractRandomVariables,
  extractInitialTaggedContent,
  extractMarkerDelimitedContent
} from 'genai-lite/prompting';

// llama.cpp
import { LlamaCppClientAdapter, LlamaCppServerClient } from 'genai-lite';
```

### Types

```typescript
// Core types
import type {
  ApiKeyProvider,
  PresetMode,
  Logger,
  LogLevel,
  LoggingConfig
} from 'genai-lite';

// Logging utilities
import {
  createDefaultLogger,
  silentLogger,
  DEFAULT_LOG_LEVEL
} from 'genai-lite';

// LLM types
import type {
  LLMChatRequest,
  LLMChatRequestWithPreset,
  LLMResponse,
  LLMFailureResponse,
  LLMError,
  LLMSettings,
  LlamaCppSettings,
  LLMReasoningSettings,
  LLMThinkingTagFallbackSettings,
  TokenLogprob,
  LocalReasoningMetadata,
  StructuredOutputSettings,
  StructuredOutputSchema,
  StructuredOutputSchemaProperty,
  ModelStructuredOutputCapabilities,
  ModelPreset,
  LLMServiceOptions,
  SendMessageOptions,
  ModelContext,
  CreateMessagesResult,
  TemplateMetadata
} from 'genai-lite';

// Retry utilities (runtime + types)
import { withRetry, DEFAULT_RETRY_POLICY } from 'genai-lite';
import type { RetryPolicy, RetryVerdict, WithRetryOptions } from 'genai-lite';

// Image types
import type {
  ImageGenerationRequest,
  ImageGenerationRequestWithPreset,
  ImageGenerationResponse,
  ImageFailureResponse,
  ImageGenerationSettings,
  DiffusionSettings,
  OpenAISpecificSettings,
  ImagePreset,
  ImageProviderInfo,
  ImageModelInfo,
  GeneratedImage,
  ImageProgressCallback
} from 'genai-lite';

// llama.cpp types
import type {
  LlamaCppClientConfig,
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
  GgufModelPattern
} from 'genai-lite';
```

## Core Types

### ApiKeyProvider

```typescript
type ApiKeyProvider = (providerId: string) => Promise<string | null>;
```

### PresetMode

```typescript
type PresetMode = 'extend' | 'replace';
```

## LLM Types

### Request Types

```typescript
interface LLMChatRequest {
  providerId: string;
  modelId: string;
  messages: LLMMessage[];
  settings?: Partial<LLMSettings>;
}

interface LLMChatRequestWithPreset {
  presetId: string;
  messages: LLMMessage[];
  settings?: Partial<LLMSettings>;
}

interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}
```

### Response Types

```typescript
interface LLMResponse {
  object: 'chat.completion';
  id: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: LLMMessage;
    reasoning?: string;
    reasoning_details?: any;    // Provider-specific reasoning details (e.g. OpenRouter)
    logprobs?: TokenLogprob[];  // Per-token log probs (when settings.logprobs requested)
    parsedContent?: unknown;    // Auto-parsed JSON from structured output
    parseError?: string;        // Error message if JSON parsing failed
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

// Per-token log probability entry (OpenAI-compatible shape; also from llama.cpp)
interface TokenLogprob {
  token: string;
  logprob: number;
  topLogprobs?: Array<{ token: string; logprob: number }>;
}

interface LLMError {
  message: string;
  code?: string | number;
  type?: string;
  param?: string;
  status?: number;         // HTTP status from the provider, when available
  retryAfterMs?: number;   // Provider-suggested wait (from a Retry-After header)
  providerError?: any;
}

interface LLMFailureResponse {
  object: 'error';
  error: LLMError;  // type includes: 'authentication_error' | 'rate_limit_error' |
                    // 'validation_error' | 'network_error' | 'server_error' |
                    // 'timeout_error' (REQUEST_TIMEOUT) | 'abort_error' (REQUEST_ABORTED)
  provider: string;
  model?: string;
  partialResponse?: Omit<LLMResponse, 'object'>;
}

type LLMServiceResponse = LLMResponse | LLMFailureResponse;
```

### Settings Types

```typescript
interface LLMSettings {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  stopSequences?: string[];
  frequencyPenalty?: number;
  presencePenalty?: number;
  topK?: number;           // Integer ≥ 0; 0 disables. Anthropic/Gemini/llama.cpp/OpenRouter
  minP?: number;           // 0.0-1.0; 0 disables. llama.cpp/OpenRouter
  repeatPenalty?: number;  // > 0; 1.0 = disabled. llama.cpp/OpenRouter
  seed?: number;           // Integer; llama.cpp treats -1 as random
  logprobs?: boolean;      // Per-token log probs. llama.cpp/OpenAI/OpenRouter
  topLogprobs?: number;    // 0-20; requires logprobs: true
  user?: string;
  supportsSystemMessage?: boolean;
  reasoning?: LLMReasoningSettings;
  thinkingTagFallback?: LLMThinkingTagFallbackSettings;
  structuredOutput?: StructuredOutputSettings;
  llamacpp?: LlamaCppSettings;  // llama.cpp-only; ignored by other adapters
}

interface LLMReasoningSettings {
  enabled?: boolean;
  effort?: 'low' | 'medium' | 'high';
  maxTokens?: number;
  exclude?: boolean;
}

// llama.cpp-only request settings (settings.llamacpp)
interface LlamaCppSettings {
  grammar?: string;  // Raw GBNF grammar; mutually exclusive with structuredOutput
  chatTemplateKwargs?: Record<string, string | number | boolean>;
                     // Raw chat-template kwargs (requires --jinja); merged over
                     // library-derived kwargs such as the reasoning toggle
}

// Local-model reasoning metadata carried on ModelInfo.localReasoning
interface LocalReasoningMetadata {
  toggleKwarg?: string;          // Chat-template kwarg toggling thinking (e.g. "enable_thinking")
  nothinkPrefix?: string;        // Exact prefix stripped from content when thinking is off
  markers?: [string, string];    // Open/close pair for marker-based reasoning extraction
}

interface LLMThinkingTagFallbackSettings {
  enabled?: boolean;
  tagName?: string;
  enforce?: boolean;
}

interface StructuredOutputSettings {
  name: string;                      // Required: Schema name for provider APIs
  schema: StructuredOutputSchema;    // Required: JSON Schema definition
  enabled?: boolean;                 // Optional: Enable/disable (default: true)
  strict?: boolean;                  // Optional: Strict mode (default: true)
  autoParse?: boolean;               // Optional: Auto-parse JSON (default: true)
}

interface StructuredOutputSchema {
  type: 'object' | 'array' | 'string' | 'number' | 'boolean';
  properties?: Record<string, StructuredOutputSchemaProperty>;
  required?: string[];
  items?: StructuredOutputSchemaProperty;
  additionalProperties?: boolean;
  description?: string;
}

interface StructuredOutputSchemaProperty {
  type: 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object' | 'null';
  description?: string;
  enum?: (string | number | boolean)[];
  properties?: Record<string, StructuredOutputSchemaProperty>;
  required?: string[];
  items?: StructuredOutputSchemaProperty;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
}

interface ModelStructuredOutputCapabilities {
  supported: boolean;
  strictMode?: boolean;
  notes?: string;
}
```

### Preset Type

```typescript
interface ModelPreset {
  id: string;
  displayName: string;
  description?: string;
  providerId: string;
  modelId: string;
  settings?: Partial<LLMSettings>;
}
```

### Template Types

```typescript
interface ModelContext {
  native_reasoning_active: boolean;
  native_reasoning_capable: boolean;
  requires_tags_for_thinking: boolean;
  model_id: string;
  provider_id: string;
  reasoning_effort?: 'low' | 'medium' | 'high';
  reasoning_max_tokens?: number;
}

interface CreateMessagesResult {
  messages: LLMMessage[];
  modelContext: ModelContext | null;
  settings: Partial<LLMSettings>;
}

interface TemplateMetadata {
  settings?: Partial<LLMSettings>;
}
```

### Service and Retry Types

```typescript
interface LLMServiceOptions {
  presets?: ModelPreset[];
  presetMode?: PresetMode;        // 'extend' (default) | 'replace'
  logLevel?: LogLevel;
  logger?: Logger;
  timeoutMs?: number;             // Default per-request timeout (overridable per call)
  retry?: Partial<RetryPolicy> & {
    retryOnTimeout?: boolean;     // Whether REQUEST_TIMEOUT is retryable (default true)
  };
}

// Second argument to LLMService.sendMessage(request, options)
interface SendMessageOptions {
  signal?: AbortSignal;   // Client-side cancel (provider may still process/bill)
  timeoutMs?: number;     // Overrides the service-level timeoutMs
  maxRetries?: number;    // Overrides the service-level retry.maxRetries
}

interface RetryPolicy {
  maxRetries: number;      // Retries after the initial attempt (default 2)
  initialDelayMs: number;  // Base delay before the first retry (default 500)
  maxDelayMs: number;      // Upper bound for any single delay (default 10000)
  backoffFactor: number;   // Exponential growth factor per attempt (default 2)
}

// Verdict returned by a withRetry shouldRetry callback
interface RetryVerdict {
  retry: boolean;
  retryAfterMs?: number;
}

// DEFAULT_RETRY_POLICY: RetryPolicy = { maxRetries: 2, initialDelayMs: 500, maxDelayMs: 10000, backoffFactor: 2 }
```

## Image Types

### Request Types

```typescript
interface ImageGenerationRequest {
  providerId: string;
  modelId: string;
  prompt: string;
  count?: number;
  settings?: ImageGenerationSettings;
}

interface ImageGenerationRequestWithPreset {
  presetId: string;
  prompt: string;
  count?: number;
  settings?: ImageGenerationSettings;
}

// Second argument to ImageService.generateImage(request, options)
interface GenerateImageOptions {
  signal?: AbortSignal;   // Client-side cancel; genai-electron also gets a
                          // best-effort server-side DELETE cancellation
}
```

### Response Types

```typescript
interface ImageGenerationResponse {
  object: 'image.result';
  created: number;
  data: GeneratedImage[];
}

interface GeneratedImage {
  data: Buffer;
  seed?: number;
  revisedPrompt?: string;
}

interface ImageFailureResponse {
  object: 'error';
  providerId: string;
  modelId?: string;
  error: {
    message: string;
    code?: string | number; // e.g. REQUEST_ABORTED, REQUEST_TIMEOUT, RATE_LIMIT_EXCEEDED,
                            // NETWORK_ERROR, PROVIDER_ERROR
    type?: string;          // e.g. 'abort_error', 'timeout_error', 'rate_limit_error',
                            // 'connection_error', 'server_error', 'authentication_error',
                            // 'validation_error'
    status?: number;        // HTTP status reported by the provider, when available
    param?: string;
    providerError?: any;    // Original provider error (for debugging)
  };
}

type ImageServiceResponse = ImageGenerationResponse | ImageFailureResponse;
```

### Settings Types

```typescript
interface ImageGenerationSettings {
  width?: number;
  height?: number;
  quality?: 'auto' | 'high' | 'medium' | 'low' | 'hd' | 'standard';
  style?: 'vivid' | 'natural';
  openai?: OpenAISpecificSettings;
  diffusion?: DiffusionSettings;
}

interface OpenAISpecificSettings {
  outputFormat?: 'png' | 'jpeg' | 'webp';
  background?: 'auto' | 'transparent' | 'white' | 'black';
  moderation?: 'auto' | 'high' | 'low';
  compression?: number;
}

interface DiffusionSettings {
  negativePrompt?: string;
  steps?: number;
  cfgScale?: number;
  sampler?: 'euler_a' | 'euler' | 'heun' | 'dpm2' |
            'dpm++2s_a' | 'dpm++2m' | 'dpm++2mv2' | 'lcm';
  seed?: number;
  onProgress?: ImageProgressCallback;
}

type ImageProgressCallback = (progress: {
  stage: 'loading' | 'diffusion' | 'decoding';
  currentStep?: number;
  totalSteps?: number;
  percentage?: number;
}) => void;
```

### Preset Type

```typescript
interface ImagePreset {
  id: string;
  displayName: string;
  description?: string;
  providerId: string;
  modelId: string;
  settings?: ImageGenerationSettings;
}
```

## llama.cpp Types

### Client Configuration

```typescript
interface LlamaCppClientConfig {
  baseURL?: string;      // default: http://127.0.0.1:8080
  checkHealth?: boolean;
  logger?: Logger;
}
```

Request timeouts are configured at the service level (`LLMServiceOptions.timeoutMs`) or per call (`SendMessageOptions.timeoutMs`), not on the adapter.

### Server Response Types

```typescript
interface LlamaCppHealthResponse {
  status: 'ok' | 'loading' | 'error';
  error?: string;
}

interface LlamaCppTokenizeResponse {
  tokens: number[];
}

interface LlamaCppDetokenizeResponse {
  content: string;
}

interface LlamaCppEmbeddingResponse {
  embedding: number[];
}

interface LlamaCppInfillResponse {
  content: string;
  stop: boolean;
  tokens_predicted: number;
  tokens_evaluated: number;
}

interface LlamaCppPropsResponse {
  total_slots: number;
  default_generation_settings: Record<string, any>;
}

interface LlamaCppSlot {
  id: number;
  state: 0 | 1;
}

interface LlamaCppSlotsResponse {
  slots: LlamaCppSlot[];
}

interface LlamaCppModel {
  model: string;
}

interface LlamaCppModelsResponse {
  data: LlamaCppModel[];
}
```

### Capability Detection Types

```typescript
interface GgufModelPattern {
  pattern: string;                 // Case-insensitive substring matched against the GGUF filename
  name: string;                    // Human-readable model name
  description?: string;
  capabilities: Partial<ModelInfo>; // Detected capabilities (reasoning, contextWindow,
                                    // maxTokens, defaultSettings, localReasoning, ...)
}

const KNOWN_GGUF_MODELS: GgufModelPattern[];

// Returns the matched pattern's capabilities (first match wins), or null if unrecognized
function detectGgufCapabilities(ggufFilename: string): Partial<ModelInfo> | null;

// Builds a ModelInfo for an unknown/detected model, merging optional detected capabilities
function createFallbackModelInfo(
  modelId: string,
  providerId: string,
  capabilities?: Partial<ModelInfo>
): ModelInfo;
```

## Utility Types

```typescript
function renderTemplate(
  template: string,
  variables: Record<string, any>
): string;

function countTokens(
  text: string,
  model?: string
): number;

function getSmartPreview(
  text: string,
  options: { minLines: number; maxLines: number }
): string;

function parseRoleTags(content: string): LLMMessage[];

function parseStructuredContent(
  content: string,
  tagNames: string[]
): Record<string, string>;

function extractRandomVariables(
  template: string,
  options?: { maxPerTag?: number }
): Record<string, string>;

function parseTemplateWithMetadata(
  template: string
): { metadata: TemplateMetadata; content: string };
```

## Logging Types

### Logger

Interface for custom logger injection. Compatible with pino, winston, bunyan, and console.

```typescript
interface Logger {
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}
```

### LogLevel

```typescript
type LogLevel = 'silent' | 'error' | 'warn' | 'info' | 'debug';
```

### LoggingConfig

```typescript
interface LoggingConfig {
  /** Log level threshold - messages below this level are suppressed */
  level: LogLevel;
  /** Custom logger implementation (optional) */
  logger?: Logger;
}
```

### Logging Utilities

```typescript
/**
 * Creates a console-based logger with level filtering
 * @param level - Minimum log level (defaults to env var or 'warn')
 */
function createDefaultLogger(level?: LogLevel): Logger;

/** Default log level from GENAI_LITE_LOG_LEVEL env var or 'warn' */
const DEFAULT_LOG_LEVEL: LogLevel;

/** Logger that discards all output - useful for testing */
const silentLogger: Logger;
```

See [Logging](logging.md) for usage examples and custom logger integration.
