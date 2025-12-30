# GGUF Model Detection System

**Date:** 2025-10-17
**Status:** Implemented
**Version:** 0.4.3 (pending)

## Overview

Implemented automatic detection of model capabilities for GGUF models loaded in llama.cpp server. The system identifies known open-weights models by matching their GGUF filenames against a pattern library and automatically configures reasoning support, context windows, and token limits.

## Problem Statement

Users loading GGUF models in llama.cpp faced several issues:

1. **No capability information**: llama.cpp accepts arbitrary model IDs, but genai-lite had no way to know if a model supports reasoning/thinking
2. **Manual configuration required**: Users had to manually specify model capabilities or use fallback defaults
3. **Qwen3 models**: User had Qwen3 model with conditional thinking support (via `/think` prompt) but library couldn't detect this

## Solution Architecture

### 3-Layer Approach

```
┌─────────────────────────────────────────────────────────────┐
│  1. GGUF Model Pattern Library (config.ts)                  │
│     - Known model patterns with capabilities                │
│     - Priority-ordered array (specific → generic)           │
│     - Case-insensitive substring matching                   │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  2. Adapter-Level Caching (LlamaCppClientAdapter)           │
│     - Queries /v1/models once on first request              │
│     - Detects & caches capabilities                         │
│     - Auto-invalidates on connection errors                 │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  3. Integration (ModelResolver)                              │
│     - Uses adapter's cached detection                       │
│     - Merges into fallback ModelInfo                        │
│     - Zero overhead after first request                     │
└─────────────────────────────────────────────────────────────┘
```

## Implementation Details

### 1. Pattern Library (`src/llm/config.ts`)

**New Interface:**
```typescript
interface GgufModelPattern {
  pattern: string;              // Case-insensitive substring match
  name: string;                 // Human-readable name
  description?: string;         // Optional description
  capabilities: Partial<ModelInfo>;  // Detected capabilities
}
```

**Pattern Array:**
- Order matters: more specific patterns before generic ones
- First match wins
- Currently includes 6 Qwen3 models (30B, 14B, 8B, 4B, 1.7B, 0.6B)

**Example:**
```typescript
{
  pattern: "qwen3-8b",
  name: "Qwen 3 8B",
  capabilities: {
    maxTokens: 8192,
    contextWindow: 131072,
    reasoning: {
      supported: true,
      enabledByDefault: false,
      canDisable: true,
      maxBudget: 38912,
    }
  }
}
```

**Detection Function:**
```typescript
function detectGgufCapabilities(ggufFilename: string): Partial<ModelInfo> | null
```
- Takes GGUF filename (e.g., "Qwen3-8B-Instruct-Q4_K_M.gguf")
- Returns matched capabilities or null
- Logs detected model for debugging

### 2. Adapter Caching (`src/llm/clients/LlamaCppClientAdapter.ts`)

**New Properties:**
```typescript
private cachedModelCapabilities: Partial<ModelInfo> | null = null;
private detectionAttempted: boolean = false;
```

**New Methods:**

**`getModelCapabilities()`:**
- Public async method
- Returns cached result if available
- Queries `/v1/models` endpoint once
- Calls `detectGgufCapabilities()` with filename
- Caches result (even if null)
- Logs all operations for debugging

**`clearModelCache()`:**
- Public method for manual cache clearing
- Resets both cached capabilities and detection flag
- Called automatically on connection errors

**Error Handling:**
- `sendMessage()` detects connection errors
- Clears cache on ECONNREFUSED, fetch failed, etc.
- Ensures re-detection when server comes back online

### 3. ModelResolver Integration (`src/llm/services/ModelResolver.ts`)

**Changes:**
- Added `AdapterRegistry` to constructor
- For llamacpp provider: calls `adapter.getModelCapabilities()`
- Passes detected capabilities to `createFallbackModelInfo()`
- Made `resolve()` async to support detection

**Flow:**
```typescript
if (options.providerId === 'llamacpp') {
  const adapter = this.adapterRegistry.getAdapter('llamacpp');
  if (adapter && typeof adapter.getModelCapabilities === 'function') {
    detectedCapabilities = await adapter.getModelCapabilities();
  }
}
modelInfo = createFallbackModelInfo(modelId, providerId, detectedCapabilities);
```

### 4. Enhanced Fallback (`src/llm/config.ts`)

**Updated Signature:**
```typescript
function createFallbackModelInfo(
  modelId: string,
  providerId: string,
  capabilities?: Partial<ModelInfo>  // NEW: Optional detected capabilities
): ModelInfo
```

**Behavior:**
- Merges capabilities with defaults
- Always sets pricing to 0 (local models)
- Preserves modelId and providerId
- Backward compatible (capabilities optional)

## Performance Characteristics

### First Request (Cold Start)
```
1 HTTP request to /v1/models
+ Pattern matching (O(n) where n = pattern count)
+ Cache write
≈ 10-50ms depending on network
```

### Subsequent Requests
```
Cache read only
≈ <1ms (in-memory lookup)
```

### Connection Error Recovery
```
Cache cleared automatically
Next request triggers re-detection
```

## Usage Examples

### Automatic Detection
```typescript
const service = new LLMService(fromEnvironment);

// User loads "Qwen3-8B-Instruct-Q4_K_M.gguf" in llama.cpp
const response = await service.sendMessage({
  providerId: 'llamacpp',
  modelId: 'my-model',  // Doesn't matter - detects from server
  messages: [{ role: 'user', content: 'Hello!' }]
});

// Reasoning support automatically detected and enabled!
```

### Manual Cache Control
```typescript
import { LlamaCppClientAdapter } from 'genai-lite';

const adapter = new LlamaCppClientAdapter({ baseURL: 'http://localhost:8080' });

// Get capabilities (cached after first call)
const caps = await adapter.getModelCapabilities();
console.log('Supports reasoning:', caps?.reasoning?.supported);

// Clear cache if server restarted with different model
adapter.clearModelCache();
```

### Direct Detection
```typescript
import { detectGgufCapabilities } from 'genai-lite';

const caps = detectGgufCapabilities('Qwen3-14B-Q4_K_M.gguf');
if (caps?.reasoning?.supported) {
  console.log('This model supports thinking!');
  console.log('Max reasoning budget:', caps.reasoning.maxBudget);
}
```

## Testing

### Unit Tests
- All 428 existing tests passing
- ModelResolver tests updated for async resolution
- Coverage: 88.61% overall, 91.66% config.ts

### Manual Testing
```bash
# Test detection
node -e "const { detectGgufCapabilities } = require('./dist'); \
  console.log(detectGgufCapabilities('Qwen3-8B-Instruct-Q4_K_M.gguf'));"

# Expected output:
# Detected GGUF model: Qwen 3 8B (pattern: qwen3-8b)
# { reasoning: { supported: true, ... }, contextWindow: 131072, ... }
```

## Extending the System

### Adding New Models

1. **Add pattern to KNOWN_GGUF_MODELS** (`src/llm/config.ts`):
```typescript
{
  pattern: "deepseek-r1",  // Case-insensitive substring
  name: "DeepSeek R1",
  description: "Reasoning-focused model",
  capabilities: {
    maxTokens: 8192,
    contextWindow: 32768,
    reasoning: {
      supported: true,
      enabledByDefault: true,  // Always thinking
      canDisable: false,       // Can't turn off
    }
  }
}
```

2. **Order matters**: Place more specific patterns before generic ones
3. **Test the pattern**: Use `detectGgufCapabilities()` to verify

### Model Variant Handling

**Specific before Generic:**
```typescript
// Correct order:
["Qwen3-0.6B-0522", "Qwen3-0.6B-instruct", "Qwen3-0.6B"]

// Why: "Qwen3-0.6B-0522-Q4_K_M.gguf" matches first pattern
//      "Qwen3-0.6B-instruct-Q8_0.gguf" matches second
//      "Qwen3-0.6B-Q5_K_M.gguf" matches third
```

### Quantization Agnostic

Patterns intentionally ignore quantization suffixes:
- `Q4_K_M`, `Q8_0`, `Q5_K_S` etc. are not part of patterns
- Same capabilities regardless of quantization level
- Focus on model family/size, not encoding method

## Known Limitations

1. **Pattern-based detection only**: No inspection of GGUF metadata
2. **Limited model library**: Currently only Qwen3 family
3. **No version tracking**: Can't distinguish model versions without filename hints
4. **Substring matching only**: No regex support (intentional simplicity)

## Future Enhancements

### Short Term
- [ ] Add more model families (DeepSeek-R1, Llama 3.3, etc.)
- [ ] Document pattern naming conventions
- [ ] Add detection statistics/telemetry

### Medium Term
- [ ] Inspect GGUF metadata if available
- [ ] Query model capabilities directly if server exposes them
- [ ] User-configurable pattern library

### Long Term
- [ ] Community-maintained pattern database
- [ ] Automatic pattern updates from registry
- [ ] Model capability negotiation protocol

## Breaking Changes

None. All changes are backward compatible:
- `createFallbackModelInfo()` capabilities parameter is optional
- Detection is automatic and transparent
- No API changes for end users

## Files Modified

### Core Implementation
- `src/llm/config.ts`: Pattern library, detection function, enhanced fallback
- `src/llm/clients/LlamaCppClientAdapter.ts`: Caching and getModelCapabilities()
- `src/llm/services/ModelResolver.ts`: Integration with adapter
- `src/llm/LLMService.ts`: Pass AdapterRegistry to ModelResolver

### Exports
- `src/index.ts`: Export detectGgufCapabilities, KNOWN_GGUF_MODELS, GgufModelPattern

### Tests
- `src/llm/services/ModelResolver.test.ts`: Updated for async + AdapterRegistry

### Documentation
- `docs/dev/2025-10-17_gguf-model-detection.md`: This file

## Related Issues/PRs

- Context: User requested Qwen3 reasoning support detection
- Motivation: Eliminate manual model configuration for common open models
- Impact: Better UX for llama.cpp users with zero-config capability detection

## Checklist

- [x] Pattern library implemented
- [x] Detection function tested
- [x] Adapter caching implemented
- [x] ModelResolver integration complete
- [x] LLMService wiring updated
- [x] Public API exports added
- [x] Tests passing (428/428)
- [x] Documentation written
- [ ] Changelog updated (pending)
- [ ] Version bump (pending)
- [ ] README examples updated (pending)
