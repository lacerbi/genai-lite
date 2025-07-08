# Task: Add Support for Thinking/Reasoning Models

## Overview
Enhanced genai-lite to support thinking/reasoning models across multiple AI providers (OpenAI, Anthropic, Google Gemini) using a unified interface inspired by OpenRouter's approach.

## Implementation Details

### 1. Type System Updates

#### Added New Types (`src/llm/types.ts`)

**LLMReasoningSettings Interface**
```typescript
export interface LLMReasoningSettings {
  enabled?: boolean;                    // Enable reasoning mode
  effort?: 'high' | 'medium' | 'low';   // OpenAI-style effort levels
  maxTokens?: number;                   // Direct token budget control
  exclude?: boolean;                    // Exclude reasoning from response
}
```

**ModelReasoningCapabilities Interface**
```typescript
export interface ModelReasoningCapabilities {
  supported: boolean;                   // Does model support reasoning?
  enabledByDefault?: boolean;           // Is it on by default?
  canDisable?: boolean;                 // Can it be turned off?
  minBudget?: number;                   // Minimum token budget
  maxBudget?: number;                   // Maximum token budget
  defaultBudget?: number;               // Default if not specified
  dynamicBudget?: {                     // Special values (e.g., Gemini's -1)
    value: number;
    description: string;
  };
  outputPrice?: number;                 // Price per 1M reasoning tokens (optional)
  outputType?: 'full' | 'summary' | 'none';  // What gets returned
  requiresStreamingAbove?: number;      // Token count requiring streaming
}
```

**Updated Existing Types**
- Added `reasoning?: LLMReasoningSettings` to `LLMSettings`
- Added `reasoning?: ModelReasoningCapabilities` to `ModelInfo`
- Added `reasoning?: string` and `reasoning_details?: any` to `LLMChoice`
- Deprecated `thinkingConfig` in favor of `reasoning`

### 2. Model Configuration Updates (`src/llm/config.ts`)

#### Anthropic Models
- **Claude 3.7 Sonnet**: Full reasoning output, 1024-32000 token budget
- **Claude Sonnet 4**: Summary output only, same budget range
- **Claude Opus 4**: Summary output only, same budget range

#### Google Gemini Models
- **Gemini 2.5 Pro**: Cannot disable, supports dynamic budget (-1)
- **Gemini 2.5 Flash**: Can disable, max 24576 tokens
- **Gemini 2.5 Flash-Lite**: Lower default budget (512 min)

#### OpenAI Models
- **o4-mini**: Always enabled, cannot disable, no reasoning output

### 3. Service Layer Changes (`src/llm/LLMService.ts`)

**Added Reasoning Validation**
```typescript
private validateReasoningSettings(
  modelInfo: ModelInfo,
  reasoning: LLMSettings['reasoning'],
  request: LLMChatRequest
): LLMFailureResponse | null
```
- Validates reasoning settings against model capabilities
- Throws error if trying to enable reasoning on non-supporting models
- Allows explicit disabling (enabled: false) for any model
- Strips reasoning settings for non-supporting models after validation

**Key Validation Rules**
1. Models without reasoning support:
   - `reasoning: { enabled: true }` → Error
   - `reasoning: { effort: 'high' }` → Error
   - `reasoning: { maxTokens: 5000 }` → Error
   - `reasoning: { enabled: false }` → OK (stripped)
   - `reasoning: { exclude: true }` → OK (stripped)

2. Models with reasoning support:
   - All settings passed through to adapters
   - Validation of effort values and maxTokens ranges

### 4. Adapter Implementations

#### GeminiClientAdapter
Converts universal reasoning to Gemini's `thinkingConfig`:
```typescript
// Universal format
reasoning: { effort: 'high' }

// Converts to Gemini format
thinkingConfig: { thinkingBudget: 52428 }  // 80% of max
```

#### AnthropicClientAdapter
Converts to Claude's thinking format:
```typescript
// Universal format
reasoning: { maxTokens: 10000 }

// Converts to Anthropic format
thinking: { type: "enabled", budget_tokens: 10000 }
```

#### OpenAIClientAdapter
Converts to OpenAI's reasoning_effort:
```typescript
// Universal format
reasoning: { effort: 'medium' }

// Converts to OpenAI format
reasoning_effort: 'medium'
```

### 5. Validation Implementation (`src/llm/config.ts`)

Added comprehensive validation for reasoning settings:
```typescript
if (settings.reasoning !== undefined) {
  // Validate object type
  // Validate enabled is boolean
  // Validate effort is 'high', 'medium', or 'low'
  // Validate maxTokens is non-negative integer
  // Validate exclude is boolean
}
```

## Testing Strategy

### Test Coverage Added

1. **LLMService Tests** (`src/llm/LLMService.test.ts`)
   - Reasoning validation for non-supporting models
   - Effort/maxTokens rejection for non-supporting models
   - Allowing disabled reasoning universally
   - Settings validation for reasoning parameters

2. **Config Tests** (`src/llm/config.test.ts`)
   - Reasoning settings validation
   - Invalid parameter detection
   - Valid settings acceptance

3. **Adapter Tests** (all adapter test files)
   - Added reasoning field to all test requests
   - Gemini: Tests for thinking budget calculation
   - Anthropic: Tests for budget_tokens conversion
   - OpenAI: Tests for reasoning_effort mapping

### Writing Tests for Reasoning Features

When writing tests for reasoning features:

1. **Always include reasoning in test requests**:
   ```typescript
   settings: {
     // ... other settings ...
     reasoning: {
       enabled: false,
       effort: undefined as any,
       maxTokens: undefined as any,
       exclude: false
     }
   }
   ```

2. **Test model capability checks**:
   - Test that non-reasoning models reject reasoning requests
   - Test that reasoning models accept various configurations
   - Test edge cases like negative maxTokens

3. **Test adapter conversions**:
   - Mock the provider's API client
   - Verify correct parameter transformation
   - Check reasoning output extraction

4. **Test validation errors**:
   - Invalid effort values
   - Negative token budgets
   - Non-boolean enabled/exclude values

## Migration Notes

- The old `thinkingConfig` field is deprecated but still present for backward compatibility
- New implementations should use the `reasoning` field exclusively
- Reasoning settings are automatically stripped for non-supporting models after validation

## Future Considerations

1. **Streaming Support**: Some models require streaming above certain token counts
2. **Pricing**: Reasoning tokens may have different pricing (use `outputPrice` field)
3. **Provider Updates**: As providers add new reasoning models, update configurations accordingly
4. **Output Formats**: Different providers return reasoning in different formats (full, summary, none)