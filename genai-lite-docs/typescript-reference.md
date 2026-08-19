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

// Evidence-bearing token profiles and structural certificates
import {
  computeContentTokenizerSemanticRevision,
  countContentTextTokens,
  countTextTokens,
  estimateTextTokens,
  getContentTokenProfileById,
  getContentTokenProfileMappingRevision,
  registerContentTokenProfileConfiguration,
  resolveContentTokenProfile,
  resolveTokenProfile,
  getTokenProfileById,
  codePointBoundToTokenUpperBound,
  retokenizationUpperBound
} from 'genai-lite';

// Constrained answer labels, suffix-walk resolution, and OpenAI-shape normalization
import {
  extractSingleTokenLabelProbs,
  generateAnswerTokenGrammar,
  generateSuffixGrammar,
  mapOpenAIChatLogprobs,
  resolveLabelProbsWithSuffixWalk,
  resolveLabelProbsWithSuffixWalkAsync
} from 'genai-lite';

// Optional local tokenizer initialization (peer loaded only on function call)
import {
  ContentTokenizerLoaderError,
  loadContentTokenizerProfile
} from 'genai-lite/tokenizer-loader';
import {
  GEMMA_4_IT_CONTENT_TOKENIZER_RECIPE
} from 'genai-lite/tokenizer-recipes';

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
  LLMStreamEvent,
  LLMServiceStreamEvent,
  PreparedCall,
  PreparedCompleteCall,
  PreparedStreamCall,
  PreparedRequestInspection,
  PreparedRequestValue,
  PreparedStructuredOutputView,
  PreparedPromptAccounting,
  PreparedPromptTokenUpperBound,
  EffectiveOutputTokenLimit,
  LLMTermination,
  LLMRawContentPart,
  LLMRawAnswerAccounting,
  LLMUsageEvidence,
  TokenProfile,
  TokenProfileResolution,
  ContentTokenProfileIdentity,
  ContentTokenProfile,
  ContentTokenProfileResolution,
  ContentTokenProfileAlias,
  ContentTokenProfileConfiguration,
  ContentTokenizerSemanticArtifact,
  ContentTokenizerSemanticProvenance,
  ContentTokenizerRuntimeProvenance,
  ContentTokenizerBackendProvenance,
  RegisteredContentTokenizerBackend,
  TokenCountResult,
  TokenBoundResult,
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
  CapabilityStatus,
  CapabilitySource,
  CapabilityRegistryMetadata,
  CapabilitySupport,
  StructuredOutputSupport,
  LogprobsSupport,
  ModelCapabilities,
  ModelCapabilitiesResult,
  LLMRequestCapabilityPreflight,
  LLMRequestCapabilityValidationResult,
  ModelPreset,
  LLMServiceOptions,
  SendMessageOptions,
  StreamMessageOptions,
  ModelContext,
  CreateMessagesResult,
  TemplateMetadata,
  SingleTokenLabelProbStatus,
  SingleTokenLabelProbOptions,
  SingleTokenLabelProbExtraction,
  SuffixWalkFetchRequest,
  SuffixTokenLogprobFetcher,
  AsyncSuffixTokenLogprobFetcher,
  SuffixWalkLabelProbOptions,
  SuffixWalkLabelProbExtraction,
  LabelProbResolution,
  SuffixWalkTermination
} from 'genai-lite';

import type {
  ContentTokenizerLoaderKind,
  ContentTokenizerRecipe,
  ContentTokenizerRecipeArtifact,
  ContentTokenizerRecipeLoaderInput,
  ContentTokenizerRecipeSelfTest,
  ContentTokenizerRecipeSelfTestName,
  ContentTokenizerCoverageEvidence
} from 'genai-lite/tokenizer-recipes';

import type {
  ContentTokenizerLoaderErrorCode,
  ContentTokenizerPeer,
  ContentTokenizerRuntimeModule,
  LoadContentTokenizerProfileOptions
} from 'genai-lite/tokenizer-loader';

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
  LlamaCppChatInputTokensResponse,
  LlamaCppUtilityRequestOptions,
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
  provider: string;
  model: string;
  choices: Array<{
    index: number;
    message: LLMMessage;
    rawContent?: string;
    rawContentParts?: LLMRawContentPart[];
    answerAccounting?: LLMAnswerAccountingByScope;
    /** @deprecated Use answerAccounting.rawContent. */
    rawAnswerAccounting?: LLMRawAnswerAccounting;
    termination?: LLMTermination;
    reasoning?: string;
    reasoning_details?: any;    // Provider-specific reasoning details (e.g. OpenRouter)
    logprobs?: TokenLogprob[];  // Per-token log probs (when settings.logprobs requested)
    parsedContent?: unknown;    // Auto-parsed JSON from structured output
    parseError?: string;        // Error message if JSON parsing failed
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  usageEvidence?: LLMUsageEvidence;
}

interface LLMAnswerAccounting {
  tokens: number;
  method: 'exact' | 'model' | 'heuristic';
  source: 'provider' | 'library';
  tokenizerId?: string;
  tokenProfileRevision?: string;
  reasoning:
    | 'included_native'
    | 'included_extracted'
    | 'excluded'
    | 'unknown';
}

interface LLMAnswerAccountingByScope {
  rawContent?: LLMAnswerAccounting;
  providerOutput?: LLMAnswerAccounting;
}

// Per-token log probability entry (OpenAI-compatible shape; also from llama.cpp)
interface TokenLogprob {
  token: string;
  logprob: number;
  topLogprobs?: Array<{ token: string; logprob: number }>;
}

type SingleTokenLabelProbStatus =
  | 'ok'
  | 'ambiguous_prefix'
  | 'missing_alternatives'
  | 'no_matching_tokens'
  | 'invalid_evidence';

interface SingleTokenLabelProbOptions {
  ambiguityLogprobGap?: number;
}

interface SingleTokenLabelProbExtraction {
  status: SingleTokenLabelProbStatus;
  absoluteLabelProbs: Record<string, number>;
  conditionalLabelProbs: Record<string, number>;
  residualMass: number;
  ambiguousMass: number;
  rawTokenLogprob?: TokenLogprob;
}

function generateAnswerTokenGrammar(labels: readonly string[]): string;

function extractSingleTokenLabelProbs(
  labels: readonly string[],
  tokenLogprob: TokenLogprob | undefined,
  options?: SingleTokenLabelProbOptions
): SingleTokenLabelProbExtraction;

// Optional suffix-walk resolution of shared-prefix label mass (an approximation)

interface SuffixWalkFetchRequest {
  prefix: string;                    // exact decoded text to reissue as prefill
  suffixes: readonly string[];       // label fragments still reachable
  grammar: string;                   // GBNF accepting exactly one suffix
}

type SuffixTokenLogprobFetcher = (
  request: SuffixWalkFetchRequest
) => TokenLogprob | undefined;

type AsyncSuffixTokenLogprobFetcher = (
  request: SuffixWalkFetchRequest
) => Promise<TokenLogprob | undefined>;

interface SuffixWalkLabelProbOptions extends SingleTokenLabelProbOptions {
  maxFetches?: number;               // finite positive integer; defaults to 8
}

type LabelProbResolution = 'single_position' | 'suffix_walk';

type SuffixWalkTermination =
  | 'not_started'
  | 'complete'
  | 'budget_exhausted'
  | 'fetch_rejected';

interface SuffixWalkLabelProbExtraction extends SingleTokenLabelProbExtraction {
  resolution: LabelProbResolution;
  termination: SuffixWalkTermination;
  fetchCount: number;                // completed fetcher invocations
}

function generateSuffixGrammar(suffixes: readonly string[]): string;

function resolveLabelProbsWithSuffixWalk(
  labels: readonly string[],
  initial: SingleTokenLabelProbExtraction,
  fetcher: SuffixTokenLogprobFetcher,
  options?: SuffixWalkLabelProbOptions
): SuffixWalkLabelProbExtraction;

function resolveLabelProbsWithSuffixWalkAsync(
  labels: readonly string[],
  initial: SingleTokenLabelProbExtraction,
  fetcher: AsyncSuffixTokenLogprobFetcher,
  options?: SuffixWalkLabelProbOptions
): Promise<SuffixWalkLabelProbExtraction>;

function mapOpenAIChatLogprobs(
  logprobs: unknown
): TokenLogprob[] | undefined;

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

type LLMStreamEvent =
  | { type: 'start'; provider: string; model: string; id?: string; created?: number }
  | { type: 'content_delta'; delta: string; index: number }
  | { type: 'reasoning_delta'; delta: string; index: number }
  | {
      type: 'usage';
      usage: {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
      };
    }
  | { type: 'complete'; response: LLMResponse }
  | { type: 'error'; error: LLMFailureResponse };

type LLMServiceStreamEvent = LLMStreamEvent & { attemptId: string };
```

### Constrained Answer Label Types

`absoluteLabelProbs` and `residualMass` require provider evidence normalized over the complete
effective candidate distribution before top-N truncation. `conditionalLabelProbs` is separately
normalized over recognized labels. See [Constrained Answer Labels](constrained-answer-labels.md).

The suffix-walk resolvers are optional and only act on an `ambiguous_prefix` extraction, which must
carry `rawTokenLogprob` or they throw `TypeError`. Any other status is trusted typed pass-through:
copied defensively, never reconciled against `labels` or `options`, and never fetched. `labels` must
match the label set that produced the extraction; strict-prefix sets still throw.

The fetcher is caller-owned and the library never dispatches. Each `SuffixWalkFetchRequest` carries
the exact decoded `prefix` to reissue as assistant prefill, the still-reachable `suffixes`, and the
`grammar` generated from them. Returning `undefined` (or unusable evidence) ends the walk with
`termination: 'fetch_rejected'` while keeping already-resolved mass; a thrown error or rejected
promise propagates unchanged. `maxFetches` is a global budget across all branches, defaulting to 8,
and `fetchCount` reports the invocations actually spent.

Results are approximations: reissued decoded text may retokenize differently from the original
generated path, so `resolution: 'suffix_walk'` products carry no numerical error bound. `status`,
`resolution`, and `termination` are independent axes, and `resolution` records that fetching
occurred rather than that it succeeded.

`SuffixWalkLabelProbExtraction` extends `SingleTokenLabelProbExtraction`, so a walk result is itself
accepted as `initial`. Do not use that to resume an incomplete walk: no suffix transcript is
retained, so the walk would restart from the position-0 snapshot and drop what it had already
resolved. Raise `maxFetches` instead.

Custom adapters emit the legacy-compatible `LLMStreamEvent` shape without an
attempt ID. Every `LLMService` public stream event is an
`LLMServiceStreamEvent` and carries the same `attemptId`, including validation,
preparation, handle, and API-key failures.

### Prepared calls

```typescript
type PreparedCallMode = 'complete' | 'stream';
type PreparedCompleteCall = PreparedCall<'complete'>;
type PreparedStreamCall = PreparedCall<'stream'>;
type ProviderEndpointRevision = string | number;

interface PreparedRequestBindings {
  adapterRevision: string;
  requestShapeRevision: string;
  tokenProfileRevision?: string;
  providerEndpointRevision?: ProviderEndpointRevision;
  serverStateFingerprint?: string;
  chatTemplateFingerprint?: string;
}

interface PreparedStructuredOutputView {
  delivery: 'native' | 'prompt';
  enforcement: 'provider' | 'json_only' | 'instruction_only';
  name?: string;
  schema?: PreparedRequestValue;
  promptRevision?: string;
}

type PreparedPromptAccounting =
  | {
      status: 'available';
      count: {
        tokens: number;
        method: 'exact' | 'model' | 'heuristic';
        tokenizerId?: string;
        tokenProfileRevision?: string;
        uncertaintyTokens?: number;
      };
      upperBound?: PreparedPromptTokenUpperBound;
    }
  | {
      status: 'available';
      upperBound: PreparedPromptTokenUpperBound;
    }
  | { status: 'unavailable' };

interface EffectiveOutputTokenLimit {
  tokens: number;
  source:
    | 'request'
    | 'preset'
    | 'model_default'
    | 'library_default'
    | 'provider_default';
  requestedTokens?: number;
  clamp?: {
    tokens: number;
    source: 'model_hard_limit' | 'provider_hard_limit';
  };
  counts: 'visible_only' | 'visible_and_reasoning' | 'provider_defined' | 'unknown';
}

service.prepareMessage(request, { mode: 'complete' });
service.inspectPrepared(prepared);
service.sendPrepared(completePrepared, options);
service.streamPrepared(streamPrepared, options);
```

Prepared handles are nominal, service-owned, immutable, and nonserializable.
Inspection exposes `PreparedProviderRequestView`, `PreparedPromptAccounting`,
`EffectiveOutputTokenLimit`, and `PreparedRequestBindings`. See
[Prepared Calls and Token Accounting](prepared-calls-and-accounting.md) for the
full evidence contract.

### Capability Types

```typescript
type CapabilityStatus = 'supported' | 'unsupported' | 'unknown';
type CapabilitySource = 'registry' | 'detected' | 'fallback';

interface CapabilityRegistryMetadata {
  supported: boolean;
  notes?: string;
}

interface CapabilitySupport {
  status: CapabilityStatus;
  notes?: string;
  source: CapabilitySource;
}

interface StructuredOutputSupport extends CapabilitySupport {
  strictMode?: boolean;
}

interface LogprobsSupport extends CapabilitySupport {}

interface ModelCapabilities {
  structuredOutput: StructuredOutputSupport;
  logprobs?: LogprobsSupport;
  contentTokenCounting?:
    | 'exact'
    | 'model'
    | 'heuristic'
    | 'unavailable'
    | 'runtime';
  preparedMessageTokenCounting?:
    | 'exact'
    | 'model'
    | 'heuristic'
    | 'unavailable'
    | 'runtime';
  tokenProfileId?: string;
  tokenProfileMappingRevision?: string;
}

interface ModelCapabilitiesResult {
  object: 'model.capabilities';
  provider: string;
  model: string;
  modelInfo: ModelInfo;
  structuredOutput: StructuredOutputSupport;
  capabilities: ModelCapabilities;
}

interface LLMRequestCapabilityPreflight {
  providerId?: string;
  modelId?: string;
  presetId?: string;
  settings?: LLMSettings;
}

type LLMRequestCapabilityValidationResult =
  | {
      object: 'capability.validation';
      valid: true;
      provider: string;
      model: string;
      capabilities: ModelCapabilities;
    }
  | (LLMFailureResponse & {
      valid: false;
      capabilities?: ModelCapabilities;
    });
```

`unknown` means genai-lite has no explicit metadata for that capability. It is not automatically rejected by `validateRequestCapabilities()`; callers decide policy.

`ProviderInfo.logprobs?` and `ModelInfo.logprobs?` carry `CapabilityRegistryMetadata`.
Model metadata wins over provider metadata; absent metadata produces `unknown`. OpenAI and
OpenRouter intentionally remain unknown at provider level because support is model/route-dependent.

`tokenProfileMappingRevision` identifies the complete content-profile registry
snapshot used for that capability result. Capability results are point-in-time
values; query again after registering a backend or alias.

### Content-token profiles

```typescript
interface ContentTokenProfileIdentity {
  id: string;
  tokenizerId: string;
  revision: string;
}

interface ContentTokenProfile extends ContentTokenProfileIdentity {
  quality: 'exact' | 'model';
  origin: 'builtin' | 'registered';
}

interface ContentTokenizerSemanticArtifact {
  role: string;
  sha256: string;
}

interface ContentTokenizerSemanticProvenance {
  tokenizerImplementation: string;
  textPolicy: 'ordinary-text-no-specials-v1';
  artifacts: ContentTokenizerSemanticArtifact[];
}

interface ContentTokenizerRuntimeProvenance {
  packageName: string;
  packageVersion: string;
  loaderImplementationRevision: string;
}

interface ContentTokenizerBackendProvenance {
  semantic: ContentTokenizerSemanticProvenance;
  runtime?: ContentTokenizerRuntimeProvenance;
}

type ContentTokenProfileResolution =
  | {
      status: 'available';
      provider: string;
      model: string;
      mappingRevision: string;
      profile: ContentTokenProfile;
    }
  | {
      status: 'unavailable';
      provider: string;
      model: string;
      mappingRevision: string;
      reason: string;
    };

interface RegisteredContentTokenizerBackend {
  id: string;
  tokenizerId: string;
  revision: string;
  provenance: ContentTokenizerBackendProvenance;
  countTextTokens(text: string): number;
}

interface ContentTokenProfileAlias {
  providerId: string;
  modelId: string;
  profileId: string;
}

interface ContentTokenProfileConfiguration {
  backends: RegisteredContentTokenizerBackend[];
  aliases: ContentTokenProfileAlias[];
}
```

Core functions:

```typescript
computeContentTokenizerSemanticRevision(semanticProvenance): string;
registerContentTokenProfileConfiguration(configuration): void;
resolveContentTokenProfile(providerId, modelId): ContentTokenProfileResolution;
getContentTokenProfileById(profileId): ContentTokenProfile | undefined;
countContentTextTokens(text, profile): TokenCountResult;
getContentTokenProfileMappingRevision(): string;
```

The production registry is process-global, synchronous, transactional, and
append-only. Reads do not close registration. New backend IDs and unclaimed
exact aliases may be added later, but existing IDs and aliases cannot be
replaced or removed. Unavailable resolutions may become available when queried
again. Each result's `mappingRevision` identifies the complete registry
snapshot read and may change after successful additions. Registered backends
are always `model` quality. The legacy certified `TokenProfile` APIs remain
separate and accept only canonical built-in certificate profiles.

Optional loader types and values are exported from exact subpaths:

```typescript
type ContentTokenizerLoaderKind = 'huggingface-tokenizer-json-v1';

interface ContentTokenizerRecipe {
  id: string;
  tokenizerId: string;
  semanticRevision: string;
  loaderKind: ContentTokenizerLoaderKind;
  loaderInput: ContentTokenizerRecipeLoaderInput;
  textPolicy: 'ordinary-text-no-specials-v1';
  selfTest: ContentTokenizerRecipeSelfTest[];
  coverageRequiredRoles: string[];
  coverageEvidence: ContentTokenizerCoverageEvidence[];
}

interface ContentTokenizerRuntimeModule {
  readonly Tokenizer: unknown;
}

interface ContentTokenizerPeer {
  readonly module: ContentTokenizerRuntimeModule;
  readonly packageVersion: string;
}

interface LoadContentTokenizerProfileOptions {
  cacheDir: string;
  allowDownload: boolean;
  signal?: AbortSignal;
  tokenizersPeer?: ContentTokenizerPeer;
}

loadContentTokenizerProfile(
  recipe: ContentTokenizerRecipe,
  options: LoadContentTokenizerProfileOptions
): Promise<RegisteredContentTokenizerBackend>;
```

The loader and recipes subpaths both export all three loader-facing interfaces
above; the loader re-export keeps them discoverable beside the loading
function, while the recipes export preserves the existing options-type path.
Public declarations use only genai-lite-owned structural types, so installing
the optional peer is not required to typecheck ordinary consumers. A real
`import * as tokenizersModule from '@huggingface/tokenizers'` namespace is
directly assignable to `module`.

When `tokenizersPeer` is omitted, the loader discovers the installed peer and
proves its version from its package manifest. When supplied, discovery is
bypassed and `packageVersion` is a caller assertion validated against `^0.1.3`
and recorded in runtime provenance.

`ContentTokenizerRecipeArtifact`, `ContentTokenizerRecipeLoaderInput`,
`ContentTokenizerRecipeSelfTest`, and `ContentTokenizerCoverageEvidence`
describe the pinned loader manifest, required regression corpus, and claimed
immutable model coverage. `ContentTokenizerRecipeSelfTestName` is the union of
the six required test categories.

`ContentTokenizerLoaderError.code` has type
`ContentTokenizerLoaderErrorCode`, one of
`TOKENIZER_PEER_MISSING`, `TOKENIZER_PEER_VERSION_UNSUPPORTED`,
`TOKENIZER_RECIPE_INVALID`, `TOKENIZER_ARTIFACT_UNAVAILABLE`,
`TOKENIZER_ARTIFACT_INTEGRITY`, `TOKENIZER_LOAD_FAILED`,
`TOKENIZER_SELF_TEST_FAILED`, or `TOKENIZER_ABORTED`.

An unsupported or indeterminate asserted version produces
`TOKENIZER_PEER_VERSION_UNSUPPORTED`. A malformed injected module or tokenizer
constructor failure produces `TOKENIZER_LOAD_FAILED`; unknown option or peer
wrapper fields produce `TOKENIZER_RECIPE_INVALID`.

See [Prepared Calls and Token Accounting](prepared-calls-and-accounting.md#content-token-profiles)
for registration timing, exact aliases, cache guarantees, recipes, and
bundler configuration.

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
  providerEndpointRevisionProvider?: ProviderEndpointRevisionProvider;
  // Opt-in snapshot reuse; requires the revision provider and asserts that its
  // value changes for every model/build/template state change.
  cachePreparationStateByEndpointRevision?: boolean;
  retry?: Partial<RetryPolicy> & {
    retryOnTimeout?: boolean;     // Whether REQUEST_TIMEOUT is retryable (default true)
  };
}

type ProviderEndpointRevisionProvider = (
  context: Readonly<{
    providerId: ApiProviderId;
    modelId: string;
  }>
) =>
  | ProviderEndpointRevision
  | null
  | undefined
  | Promise<ProviderEndpointRevision | null | undefined>;

// Second argument to LLMService.sendMessage(request, options)
interface SendMessageOptions {
  signal?: AbortSignal;   // Client-side cancel (provider may still process/bill)
  timeoutMs?: number;     // Overrides the service-level timeoutMs
  maxRetries?: number;    // Overrides the service-level retry.maxRetries
}

// Second argument to LLMService.streamMessage(request, options)
interface StreamMessageOptions {
  signal?: AbortSignal;   // Client-side cancel (provider may still process/bill)
  timeoutMs?: number;     // Overrides the service-level timeoutMs
}

// Capability methods on LLMService
class LLMService {
  getModelCapabilities(
    providerId: string,
    modelId: string
  ): Promise<ModelCapabilitiesResult | LLMFailureResponse>;

  supportsStructuredOutput(
    providerId: string,
    modelId: string
  ): Promise<StructuredOutputSupport | LLMFailureResponse>;

  validateRequestCapabilities(
    request: LLMRequestCapabilityPreflight
  ): Promise<LLMRequestCapabilityValidationResult>;
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
  timeoutMs?: number;     // Per-request timeout override (default 60s OpenAI,
                          // 120s genai-electron)
  maxRetries?: number;    // Per-request retry cap; ignored for providers that
                          // are not retry-safe (e.g. genai-electron)
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
    retryAfterMs?: number;  // Provider-suggested wait (from a Retry-After header)
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
  tokens?: number[];
  stop?: boolean;
}

interface LlamaCppPropsResponse {
  assistant_name?: string;
  user_name?: string;
  default_generation_settings?: Record<string, unknown>;
  total_slots?: number;
  model_alias?: string;
  model_path?: string;
  chat_template?: string;
  chat_template_caps?: Record<string, unknown>;
  bos_token?: string;
  eos_token?: string;
  build_info?: Record<string, unknown> | string;
  [key: string]: unknown;
}

interface LlamaCppSlot {
  id: number;
  state: number;
  prompt?: string;
  [key: string]: any;
}

interface LlamaCppSlotsResponse {
  slots: LlamaCppSlot[];
}

interface LlamaCppModel {
  id: string;
  object?: string;
  created?: number;
  owned_by?: string;
  aliases?: string[];
  meta?: Record<string, unknown>;
}

interface LlamaCppModelsResponse {
  object: string;
  data: LlamaCppModel[];
}

interface LlamaCppChatInputTokensResponse {
  input_tokens: number;
  object?: string;
}

interface LlamaCppUtilityRequestOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  model?: string;
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
