# Adding Models and Providers

Guide for adding new models and providers to genai-lite.

## Quick Reference

| Task | File | Section |
|------|------|---------|
| Add cloud LLM model | `src/llm/config.ts` → `SUPPORTED_MODELS` | [Adding Cloud LLM Models](#pipeline-for-adding-cloud-llm-models) |
| Add GGUF pattern (llama.cpp) | `src/llm/config.ts` → `KNOWN_GGUF_MODELS` | [Adding GGUF Models](#pipeline-for-adding-gguf-models-llamacpp) |
| Add image model | `src/image/config.ts` | [Adding Image Models](#adding-image-models) |
| Add new LLM provider | `src/llm/clients/` + `src/llm/config.ts` | [Adding LLM Providers](#adding-new-llm-providers) |
| Add new image provider | `src/adapters/image/` + `src/image/config.ts` | [Adding Image Providers](#adding-new-image-providers) |
| Model info reference | [Cline api.ts](https://github.com/cline/cline/blob/main/src/shared/api.ts) | [Cline Reference](#cline-reference-format) |
| Field reference | `src/llm/types.ts` | [Complete Field Reference](#complete-field-reference) |
| Reasoning templates | Per-provider configs | [Reasoning Configuration](#translating-reasoning-configuration) |
| Validation commands | - | [Validation and Testing](#validation-and-testing) |

## Pipeline for Adding Cloud LLM Models

### 1. Research the Model

Get model specifications from:
- **Cline's api.ts**: https://github.com/cline/cline/blob/main/src/shared/api.ts - Often has up-to-date model definitions in a similar format
- **Provider documentation**: Official API docs for pricing, limits, capabilities
- **Developer input**: The dev may tell you what model to add

Key specs to gather:
- Model ID (exact API identifier)
- Context window size
- Max output tokens
- Input/output pricing (per million tokens)
- Image support
- Prompt caching support/pricing
- Reasoning/thinking support

### 2. Add to SUPPORTED_MODELS

Edit `src/llm/config.ts` and add an entry to the `SUPPORTED_MODELS` array:

```typescript
{
  id: "model-id-from-api",        // Exact API model identifier
  name: "Human Readable Name",
  providerId: "anthropic",         // Must match a SUPPORTED_PROVIDERS id
  contextWindow: 200000,
  maxTokens: 8192,
  inputPrice: 3.0,                 // $ per million input tokens
  outputPrice: 15.0,               // $ per million output tokens
  description: "Brief description of the model",
  supportsImages: true,
  supportsPromptCache: true,
  cacheWritesPrice: 3.75,          // Optional: $ per million cached tokens written
  cacheReadsPrice: 0.3,            // Optional: $ per million cached tokens read

  // Optional: Only if model has native reasoning support
  reasoning: {
    supported: true,
    enabledByDefault: false,       // true if reasoning is always on (e.g., o4-mini)
    canDisable: true,              // false if reasoning can't be turned off
    minBudget: 1024,               // Optional: min reasoning tokens
    maxBudget: 32000,              // Optional: max reasoning tokens
    defaultBudget: 10000,          // Optional: default if not specified
    outputType: 'summary',         // 'full' | 'summary' | 'none'
  },
}
```

### 3. Add Model-Specific Settings (Optional)

If the model needs non-standard defaults, add to `MODEL_DEFAULT_SETTINGS`:

```typescript
export const MODEL_DEFAULT_SETTINGS: Record<string, Partial<LLMSettings>> = {
  // Example: o4-mini requires temperature=1.0
  "o4-mini": { temperature: 1.0 },
  // Add your model here if needed
};
```

### 4. Test the Model

```bash
# Build the library
npm run build

# Quick test with chat-demo
cd examples/chat-demo && npm run dev

# Or run unit tests
npm test
```

## Pipeline for Adding GGUF Models (llama.cpp)

For local models via llama.cpp, add pattern detection to auto-configure capabilities.

### 1. Add Pattern to KNOWN_GGUF_MODELS

Edit `src/llm/config.ts`:

```typescript
export const KNOWN_GGUF_MODELS: GgufModelPattern[] = [
  // Add your pattern - order matters! More specific patterns first.
  {
    pattern: "deepseek-r1-14b",    // Case-insensitive substring match
    name: "DeepSeek R1 14B",
    description: "Reasoning-focused model",
    capabilities: {
      maxTokens: 8192,
      contextWindow: 65536,
      supportsImages: false,
      supportsPromptCache: false,
      reasoning: {
        supported: true,
        enabledByDefault: true,
        canDisable: false,
        maxBudget: 32768,
      },
    },
  },
  // Existing patterns...
];
```

### 2. Pattern Ordering Rules

- **Specific before generic**: `"qwen3-8b-instruct"` before `"qwen3-8b"`
- **Larger before smaller**: `"qwen3-30b"` before `"qwen3-14b"` (prevents false matches)
- **Quantization agnostic**: Don't include `Q4_K_M`, `Q8_0` etc. in patterns

### 3. Test Detection

```bash
npm run build
node -e "const { detectGgufCapabilities } = require('./dist'); \
  console.log(detectGgufCapabilities('DeepSeek-R1-14B-Q4_K_M.gguf'));"
```

## Cline Reference Format

Cline's `api.ts` is a large file with up-to-date model definitions. To fetch it:

1. Use the **raw GitHub URL** (the regular GitHub page is too large to process):
   ```
   https://raw.githubusercontent.com/cline/cline/main/src/shared/api.ts
   ```

2. Fetch with a **targeted prompt** to extract just the model info you need:
   ```
   WebFetch URL: https://raw.githubusercontent.com/cline/cline/main/src/shared/api.ts
   Prompt: "Extract the model definitions for [provider/model name] - show the structure with properties like context window, pricing, maxTokens, capabilities"
   ```

3. The response will contain the relevant model specs in a format similar to genai-lite.

### Translating Cline format to genai-lite

**Cline format:**
```typescript
"claude-sonnet-4-5-20250929": {
  maxTokens: 8192,
  contextWindow: 200_000,
  supportsImages: true,
  supportsPromptCache: true,
  supportsReasoning: true,
  inputPrice: 3.0,
  outputPrice: 15.0,
  cacheWritesPrice: 3.75,
  cacheReadsPrice: 0.3,
}
```

**genai-lite format:**
```typescript
{
  id: "claude-sonnet-4-5-20250929",  // Add: id field
  name: "Claude Sonnet 4.5",          // Add: human-readable name
  providerId: "anthropic",            // Add: provider reference
  contextWindow: 200000,              // Same (remove underscores)
  maxTokens: 8192,                    // Same
  supportsImages: true,               // Same
  supportsPromptCache: true,          // Same
  inputPrice: 3.0,                    // Same
  outputPrice: 15.0,                  // Same
  cacheWritesPrice: 3.75,             // Same
  cacheReadsPrice: 0.3,               // Same
  description: "...",                 // Add: description
  reasoning: {                        // Convert: supportsReasoning → reasoning object
    supported: true,
    enabledByDefault: false,
    canDisable: true,
  },
}
```

### Translating Reasoning Configuration

Cline only provides `supportsReasoning: boolean`. For the full reasoning config, use these **provider-specific templates**:

**Anthropic (Claude 4+):**
```typescript
reasoning: {
  supported: true,
  enabledByDefault: false,
  canDisable: true,
  minBudget: 1024,
  maxBudget: 32000,
  defaultBudget: 10000,
  outputType: 'summary',
  requiresStreamingAbove: 21333,
}
```

**Anthropic (Claude 3.7):**
```typescript
reasoning: {
  supported: true,
  enabledByDefault: false,
  canDisable: true,
  minBudget: 1024,
  maxBudget: 32000,
  defaultBudget: 10000,
  outputType: 'full',  // Claude 3.7 returns full thinking trace
  requiresStreamingAbove: 21333,
}
```

**Google Gemini (Pro - always on):**
```typescript
reasoning: {
  supported: true,
  enabledByDefault: true,
  canDisable: false,  // Cannot disable on Pro
  minBudget: 1024,
  maxBudget: 65536,
  defaultBudget: -1,
  dynamicBudget: {
    value: -1,
    description: "Let model decide based on query complexity",
  },
  outputType: 'summary',
}
```

**Google Gemini (Flash - optional):**
```typescript
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
}
```

**OpenAI o-series (always on, no output):**
```typescript
reasoning: {
  supported: true,
  enabledByDefault: true,
  canDisable: false,
  outputType: 'none',  // Reasoning not exposed in response
}
```

## Complete Field Reference

### ModelInfo Fields

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `id` | **Yes** | string | Exact API model identifier (e.g., `"claude-sonnet-4-20250514"`) |
| `name` | **Yes** | string | Human-readable name (e.g., `"Claude Sonnet 4"`) |
| `providerId` | **Yes** | string | Must match a `SUPPORTED_PROVIDERS` id |
| `supportsPromptCache` | **Yes** | boolean | Whether prompt caching is supported |
| `contextWindow` | No | number | Context window size in tokens |
| `maxTokens` | No | number | Maximum output tokens |
| `inputPrice` | No | number | $ per million input tokens |
| `outputPrice` | No | number | $ per million output tokens |
| `description` | No | string | Brief model description |
| `supportsImages` | No | boolean | Vision/image input support |
| `supportsSystemMessage` | No | boolean | System message support (rare, most support it) |
| `cacheWritesPrice` | No | number | $ per million cached write tokens |
| `cacheReadsPrice` | No | number | $ per million cached read tokens |
| `unsupportedParameters` | No | string[] | LLMSettings keys this model ignores (e.g., `["topP"]`) |
| `reasoning` | No | object | Reasoning capabilities (see below) |

### ModelReasoningCapabilities Fields

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `supported` | **Yes** | boolean | Does model support reasoning? |
| `enabledByDefault` | No | boolean | Is reasoning on by default? |
| `canDisable` | No | boolean | Can reasoning be turned off? |
| `minBudget` | No | number | Minimum reasoning token budget |
| `maxBudget` | No | number | Maximum reasoning token budget |
| `defaultBudget` | No | number | Default budget if not specified (-1 for dynamic) |
| `dynamicBudget` | No | object | For models with dynamic budgets (Gemini) |
| `dynamicBudget.value` | - | number | Budget value (-1 = dynamic) |
| `dynamicBudget.description` | - | string | Description of dynamic behavior |
| `outputType` | No | `'full'` \| `'summary'` \| `'none'` | What reasoning output is returned |
| `outputPrice` | No | number | $ per 1M reasoning tokens (if different from outputPrice) |
| `requiresStreamingAbove` | No | number | Token count above which streaming is required |

## Validation and Testing

### Validate Configuration

After adding a model, verify it was added correctly:

```bash
npm run build

# Check model exists and has valid config
node -e "
const { getModelById, isModelSupported } = require('./dist/llm/config');
const modelId = 'your-new-model-id';
const providerId = 'anthropic';

const model = getModelById(modelId, providerId);
console.log('Model found:', !!model);
console.log('Valid for provider:', isModelSupported(modelId, providerId));
if (model) {
  console.log('Config:', JSON.stringify(model, null, 2));
}
"
```

### List All Current Models

```bash
node -e "
const { SUPPORTED_MODELS } = require('./dist/llm/config');
console.log('Current models:');
SUPPORTED_MODELS.forEach(m => console.log(\`  \${m.providerId}: \${m.id}\`));
"
```

### Compare with Cline (identify gaps)

```bash
# Download Cline's api.ts
curl -s https://raw.githubusercontent.com/cline/cline/main/src/shared/api.ts > /tmp/cline-api.ts

# Extract Anthropic model IDs from Cline (example)
grep -oP '"claude-[^"]+":' /tmp/cline-api.ts | tr -d '":' | sort -u

# Compare against genai-lite
node -e "
const { SUPPORTED_MODELS } = require('./dist/llm/config');
const anthropicModels = SUPPORTED_MODELS
  .filter(m => m.providerId === 'anthropic')
  .map(m => m.id);
console.log('genai-lite Anthropic models:', anthropicModels);
"
```

## Adding Image Models

For image models on existing providers:

1. Update model list in `src/image/config.ts` under the provider's configuration
2. Add model-specific defaults (dimensions, quality settings, etc.)
3. Add presets to `src/config/image-presets.json` if desired
4. Test with the new model ID

## Adding New LLM Providers

For entirely new LLM providers (not just models):

1. Create adapter in `src/llm/clients/[Provider]ClientAdapter.ts`
2. Implement `ILLMClientAdapter` interface
3. Register in `src/llm/config.ts`:
   - Add to `ADAPTER_CONSTRUCTORS` map
   - Define models in `defaultProviderConfigs`
   - Add to `SUPPORTED_PROVIDERS`
4. Add provider-specific dependencies to `package.json`
5. Export any new types from `src/index.ts` if needed

## Adding New Image Providers

For entirely new image generation providers:

1. Create adapter in `src/adapters/image/[Provider]ImageAdapter.ts`
2. Implement `ImageProviderAdapter` interface:
   ```typescript
   interface ImageProviderAdapter {
     readonly id: ImageProviderId;
     readonly supports: ImageProviderCapabilities;
     generate(config: {
       request: ImageGenerationRequest;
       resolvedPrompt: string;
       settings: ResolvedImageGenerationSettings;
       apiKey: string | null;
     }): Promise<ImageGenerationResponse>;
     getModels?(): Promise<ImageModelInfo[]>;
   }
   ```
3. Register in `src/image/config.ts`:
   - Add to `SUPPORTED_IMAGE_PROVIDERS`
   - Define models in provider configuration
   - Add to `IMAGE_ADAPTER_CONFIGS` with constructor
4. Register in `ImageService` constructor:
   - Import adapter class
   - Instantiate with configuration (baseURL, timeout, etc.)
   - Call `adapterRegistry.registerAdapter(providerId, adapter)`
5. Add presets to `src/config/image-presets.json` (optional but recommended)
6. Export any new types from `src/index.ts` if needed
7. Write comprehensive tests:
   - Test adapter implementation with mocked HTTP clients
   - Test error handling for all error types
   - Test settings mapping and validation
   - Test response processing (Buffer conversion, metadata extraction)
   - Aim for 85%+ coverage

### Reference Implementations

**OpenAI Images Adapter:**
- See `src/adapters/image/OpenAIImageAdapter.ts`
- 29 tests, 95.41% coverage
- Handles multiple models (gpt-image-1, dall-e-3, dall-e-2) with different APIs
- Uses shared `errorUtils` for consistent error handling

**genai-electron Diffusion Adapter:**
- See `src/adapters/image/GenaiElectronImageAdapter.ts`
- 29 tests, 87.96% coverage
- Implements progress callbacks via polling
- Coordinates with genai-electron's async API (see `docs/devlog/2025-10-22-genai-electron-changes.md`)

## Updating Documentation

After adding models, update:
1. `genai-lite-docs/providers-and-models.md` - User-facing model list
2. Run tests to ensure nothing broke: `npm test`

## Related Documentation

- [GGUF Model Detection](../devlog/2025-10-17_gguf-model-detection.md) - How auto-detection works
- [Understanding Thinking](../devlog/2025-10-14_understanding-thinking.md) - Reasoning mode details
