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
  extractRandomVariables
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
  LLMSettings,
  LLMReasoningSettings,
  LLMThinkingTagFallbackSettings,
  ModelPreset,
  LLMServiceOptions,
  ModelContext,
  CreateMessagesResult,
  TemplateMetadata
} from 'genai-lite';

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
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

interface LLMFailureResponse {
  object: 'error';
  error: {
    type: 'authentication_error' | 'rate_limit_error' | 'validation_error' |
          'network_error' | 'provider_error';
    message: string;
    code?: string;
    provider?: string;
  };
  partialResponse?: LLMResponse;
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
  reasoning?: LLMReasoningSettings;
  thinkingTagFallback?: LLMThinkingTagFallbackSettings;
}

interface LLMReasoningSettings {
  enabled: boolean;
  effort?: 'low' | 'medium' | 'high';
  maxTokens?: number;
  exclude?: boolean;
}

interface LLMThinkingTagFallbackSettings {
  enabled: boolean;
  tagName?: string;
  enforce?: boolean;
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
  modelContext: ModelContext;
  settings?: Partial<LLMSettings>;
}

interface TemplateMetadata {
  settings?: Partial<LLMSettings>;
}
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
  error: {
    type: 'authentication_error' | 'rate_limit_error' | 'validation_error' |
          'network_error' | 'provider_error';
    message: string;
    code?: string;
    provider?: string;
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
  baseURL?: string;
  timeout?: number;
  checkHealth?: boolean;
}
```

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
  pattern: RegExp;
  modelId: string;
  displayName: string;
  supportsReasoning?: boolean;
  contextWindow?: number;
  maxTokens?: number;
}

const KNOWN_GGUF_MODELS: GgufModelPattern[];

function detectGgufCapabilities(filename: string): ModelInfo | null;
function createFallbackModelInfo(): ModelInfo;
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
): { template: string; metadata: TemplateMetadata };
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
