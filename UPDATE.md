# Recent Updates

This document describes recent significant updates to genai-lite. 

## Summary

1. **[Automatic Thinking Extraction](#automatic-thinking-extraction-feature)** - Automatically extracts and standardizes reasoning/thinking from all models
2. **[Unified Prompt Creation API](#unified-prompt-creation-api)** - New `createMessages()` method simplifies creating model-aware, multi-turn prompts
3. **[Self-Contained Templates with Metadata](#self-contained-templates-with-metadata)** - Templates can now embed their own settings using `<META>` blocks
4. **[Intelligent Enforcement for Thinking Tag Extraction](#intelligent-enforcement-for-thinking-tag-extraction)** - New `onMissing` property with smart 'auto' mode ensures thinking tags are present when needed

---

# Automatic Thinking Extraction Feature

## Overview

Implemented automatic extraction of "thinking" or "reasoning" content from LLM responses, providing a unified way to capture model reasoning across all providers, even those without native reasoning support.

## Problem Solved

While some models (like Claude Sonnet 4, Gemini 2.5 Pro) have native reasoning capabilities that return thinking in a dedicated field, many models don't. Developers often prompt these models to "think step-by-step" using XML tags, but this mixes reasoning with the actual response, making it harder to process programmatically.

## Solution

The library now automatically detects and extracts content wrapped in XML tags (default: `<thinking>`) at the beginning of responses and moves it to the standardized `reasoning` field, creating consistency across all models.

## Implementation Details

### 1. Type System (`src/llm/types.ts`)
- Added `LLMThinkingExtractionSettings` interface with:
  - `enabled?: boolean` - Toggle extraction (default: true)
  - `tag?: string` - Custom tag name (default: 'thinking')
- Extended `LLMSettings` interface with `thinkingExtraction` property

### 2. Configuration (`src/llm/config.ts`)
- Added default settings: `{ enabled: true, tag: 'thinking' }`
- Automatically enabled for all providers and models

### 3. Parser Utility (`src/prompting/parser.ts`)
- Created `extractInitialTaggedContent` function
- Extracts content only from tags at the beginning of responses
- Handles whitespace and returns both extracted content and remaining text

### 4. Core Integration (`src/llm/LLMService.ts`)
- Added post-processing after adapter responses
- When extraction is enabled and tag is found:
  - Removes the tag and its content from the main response
  - Appends extracted content to the `reasoning` field
  - Preserves any existing reasoning (for models with native support)

### 5. Settings Management (`src/llm/services/SettingsManager.ts`)
- Updated to properly merge thinking extraction settings with defaults

## Usage Example

```typescript
// Prompt a model to think before answering
const response = await llmService.sendMessage({
  providerId: 'openai',
  modelId: 'gpt-4.1',
  messages: [{
    role: 'system',
    content: 'Always think through problems step-by-step in <thinking> tags before answering.'
  }, {
    role: 'user',
    content: 'What is 15% of 240?'
  }]
});

// Model response: "<thinking>15% = 0.15, so 0.15 × 240 = 36</thinking>The answer is 36."
// 
// Extracted result:
// response.choices[0].message.content = "The answer is 36."
// response.choices[0].reasoning = "15% = 0.15, so 0.15 × 240 = 36"
```

## Configuration Options

```typescript
// Disable extraction
settings: {
  thinkingExtraction: {
    enabled: false
  }
}

// Use custom tag
settings: {
  thinkingExtraction: {
    tag: 'scratchpad'
  }
}
```

## Testing

- Added comprehensive unit tests for `extractInitialTaggedContent` parser function
- Added integration tests in `LLMService.test.ts` covering:
  - Extraction when enabled/disabled
  - Custom tag names
  - Missing tags
  - Appending to existing reasoning
- Updated `MockClientAdapter` to support testing with `test_thinking:` pattern
- All tests passing with 100% coverage for new code

## Documentation Updates

1. **README.md**: Added "Automatic Thinking Extraction" section with examples
2. **Summary files**: Updated 6 files across src/llm/, src/llm/services/, and src/prompting/
3. **CLAUDE.md**: Added feature note and updated type definitions

## Benefits

1. **Consistency**: All models now have a standardized `reasoning` field
2. **Backward Compatible**: Enabled by default but doesn't break existing code
3. **Flexible**: Supports custom tag names for different use cases
4. **Clean Responses**: Separates reasoning from actual answers
5. **Model Agnostic**: Works with any model that can output XML tags

## Technical Notes

- Only extracts tags at the beginning of responses (not in the middle)
- Preserves existing reasoning for models with native support
- Minimal performance impact (simple string operations)
- No external dependencies required

---

# Unified Prompt Creation API

## Overview

Introduced a powerful new `LLMService.createMessages()` method that unifies template rendering, model context injection, and role tag parsing into a single, intuitive API. This replaces the confusing multi-step process previously required for creating model-aware, multi-turn prompts.

## Problem Solved

Previously, creating sophisticated prompts that were both model-aware AND multi-turn required an awkward, non-obvious process:

```typescript
// OLD WAY - Confusing and boilerplate-heavy
const prep = await llmService.prepareMessage({
  presetId: 'some-thinking-preset',
  messages: [] // Dummy input just to get model context
});
const allVariables = { ...myAppVariables, ...prep.modelContext };
const messages = buildMessagesFromTemplate(myTemplate, allVariables);
await llmService.sendMessage({ presetId, messages });
```

This workflow had several issues:
- Required understanding subtle differences between three functions
- Forced developers to chain functions in non-intuitive ways
- Model context extraction required dummy parameters
- Easy to forget steps or mix up the order

## Solution

The new `createMessages()` method provides a single, clean API that handles everything:

```typescript
// NEW WAY - Simple and intuitive
const { messages, modelContext } = await llmService.createMessages({
  template: myMultiTurnTemplate,
  variables: myAppVariables,
  presetId: 'some-thinking-preset'
});
await llmService.sendMessage({ presetId, messages });
```

## Migration Guide

### Basic Template Migration

**Before:**
```typescript
import { buildMessagesFromTemplate } from 'genai-lite/prompting';

const messages = buildMessagesFromTemplate(
  '<SYSTEM>You are helpful.</SYSTEM><USER>{{question}}</USER>',
  { question: 'How do I use TypeScript?' }
);
```

**After:**
```typescript
const { messages } = await llmService.createMessages({
  template: '<SYSTEM>You are helpful.</SYSTEM><USER>{{question}}</USER>',
  variables: { question: 'How do I use TypeScript?' }
});
```

### Model-Aware Template Migration

**Before:**
```typescript
// Step 1: Get model context
const prep = await llmService.prepareMessage({
  template: 'Think {{ thinking_enabled ? "carefully" : "quickly" }}',
  variables: { task: 'solve this' },
  presetId: 'claude-thinking'
});

// Step 2: Use the prepared messages
await llmService.sendMessage({
  presetId: 'claude-thinking',
  messages: prep.messages
});
```

**After:**
```typescript
const { messages } = await llmService.createMessages({
  template: 'Think {{ thinking_enabled ? "carefully" : "quickly" }}',
  variables: { task: 'solve this' },
  presetId: 'claude-thinking'
});

await llmService.sendMessage({ presetId: 'claude-thinking', messages });
```

### Multi-Turn + Model-Aware Migration (Most Complex Case)

**Before:**
```typescript
// Step 1: Extract model context with dummy call
const { modelContext } = await llmService.prepareMessage({
  presetId: 'gpt-4-thinking',
  messages: [] // Dummy parameter
});

// Step 2: Manually merge variables
const allVars = {
  ...myVariables,
  ...modelContext
};

// Step 3: Build messages
const messages = buildMessagesFromTemplate(myTemplate, allVars);

// Step 4: Send
await llmService.sendMessage({ presetId: 'gpt-4-thinking', messages });
```

**After:**
```typescript
// Everything in one clean step
const { messages } = await llmService.createMessages({
  template: myTemplate,
  variables: myVariables,
  presetId: 'gpt-4-thinking'
});

await llmService.sendMessage({ presetId: 'gpt-4-thinking', messages });
```

### Standalone Template Parsing (Without Model Context)

If you need to parse templates without model context:

**Before:**
```typescript
import { buildMessagesFromTemplate } from 'genai-lite/prompting';
const messages = buildMessagesFromTemplate(template, variables);
```

**After:**
```typescript
import { parseRoleTags, renderTemplate } from 'genai-lite/prompting';
const rendered = renderTemplate(template, variables);
const messages = parseRoleTags(rendered);
```

## API Reference

### createMessages(options)

Creates messages from a template with role tags and model-aware variable substitution.

**Parameters:**
- `template` (string, required): Template containing `{{variables}}` and `<ROLE>` tags
- `variables` (object, optional): Variables to inject into the template
- `presetId` (string, optional): Model preset ID for model context
- `providerId` (string, optional): Provider ID (use with modelId)
- `modelId` (string, optional): Model ID (use with providerId)

**Returns:**
```typescript
{
  messages: LLMMessage[];        // Parsed messages ready for sending
  modelContext: ModelContext | null;  // Model context (if preset/model specified)
}
```

**Model Context Variables Available in Templates:**
- `thinking_enabled`: Whether reasoning is enabled
- `thinking_available`: Whether model supports reasoning
- `model_id`: The resolved model ID
- `provider_id`: The resolved provider ID
- `reasoning_effort`: Reasoning effort level (if set)
- `reasoning_max_tokens`: Reasoning token budget (if set)

## Advanced Features

### Dynamic Role Injection

The new API enables powerful patterns where variables can inject entire role blocks:

```typescript
const { messages } = await llmService.createMessages({
  template: `
    {{ systemPrompt ? '<SYSTEM>{{systemPrompt}}</SYSTEM>' : '' }}
    {{ examples ? examples : '' }}
    <USER>{{query}}</USER>
  `,
  variables: {
    systemPrompt: needsSystem ? 'You are an expert.' : null,
    examples: hasExamples ? '<USER>Example Q</USER><ASSISTANT>Example A</ASSISTANT>' : '',
    query: 'Real question here'
  }
});
```

### Conditional Model-Aware Prompts

```typescript
const { messages } = await llmService.createMessages({
  template: `
    <SYSTEM>
      You are a {{ thinking_enabled ? "thoughtful" : "quick" }} assistant.
      {{ thinking_available && !thinking_enabled ? 
        "Note: Reasoning mode available with effort={{reasoning_effort || 'medium'}}" : "" }}
    </SYSTEM>
    <USER>{{question}}</USER>
  `,
  variables: { question: 'How does recursion work?' },
  presetId: 'claude-3-7-sonnet-thinking'
});
```

## Breaking Changes

The following functions and types have been **removed** in the latest version:

### Removed Functions:
- `LLMService.prepareMessage()` - Use `createMessages()` instead
- `buildMessagesFromTemplate()` - Use `createMessages()` or `parseRoleTags()`

### Removed Types:
- `PrepareMessageOptions` - No longer needed
- `PrepareMessageResult` - No longer needed

### Import Changes:
```typescript
// Old import (no longer works)
import { buildMessagesFromTemplate } from 'genai-lite/prompting';

// New imports for utilities
import { parseRoleTags, renderTemplate } from 'genai-lite/prompting';
```

## Implementation Details

### 1. New Parser Utility (`src/prompting/parser.ts`)
- Added `parseRoleTags()` function that extracts role tags without rendering
- Handles `<SYSTEM>`, `<USER>`, and `<ASSISTANT>` tags
- Returns array of `{ role, content }` objects
- Falls back to single user message if no tags found

### 2. Unified Method (`src/llm/LLMService.ts`)
- Implements the complete "render-then-parse" workflow:
  1. Resolves model context from preset/model IDs (if provided)
  2. Merges user variables with model context
  3. Renders the complete template with all variables
  4. Parses role tags from the rendered result
  5. Returns formatted messages and model context

### 3. Refactored Internals
- `buildMessagesFromTemplate` was refactored to use `parseRoleTags` internally
- Maintained separation between pure utilities and orchestration logic
- All existing tests updated and passing

## Benefits

1. **Simplified API**: One method instead of understanding and chaining three
2. **More Powerful**: Variables can dynamically inject role tags
3. **Better Developer Experience**: Intuitive, discoverable API
4. **Reduced Errors**: No more forgetting steps or wrong order
5. **Cleaner Codebase**: 685 lines of deprecated code removed
6. **Smaller Bundle**: Reduced package size

## Testing

- Added 16 comprehensive test cases for `createMessages()`
- Added 15 test cases for `parseRoleTags()` utility
- All existing tests updated and passing
- 100% coverage maintained for new functionality

## Technical Notes

- The "render-then-parse" approach enables dynamic role injection
- Model context resolution is skipped if no preset/model specified
- Backward compatible through clean deprecation path
- TypeScript types fully updated for better IntelliSense

---

# Self-Contained Templates with Metadata

## Overview

Templates can now embed their own LLM settings directly using a `<META>` block, making them self-contained units that carry their optimal configuration. This eliminates the need to remember and manually specify settings for each template.

## Problem Solved

Previously, developers had to remember to apply specific settings every time they used a template:

```typescript
// OLD WAY - Settings separate from template
const template = '<SYSTEM>You are a creative writer...</SYSTEM>';
const { messages } = await llmService.createMessages({ template });

// Had to remember these settings every time
await llmService.sendMessage({
  messages,
  settings: {
    temperature: 0.9,
    thinkingExtraction: { enabled: true, tag: "reasoning" }
  }
});
```

This was error-prone and made templates less portable.

## Solution

Templates can now include their settings directly:

```typescript
// NEW WAY - Self-contained template
const template = `
<META>
{
  "settings": {
    "temperature": 0.9,
    "thinkingExtraction": { "enabled": true, "tag": "reasoning" }
  }
}
</META>
<SYSTEM>You are a creative writer...</SYSTEM>
`;

const { messages, settings } = await llmService.createMessages({ template });
await llmService.sendMessage({ messages, settings });
```

## Implementation Details

### 1. Parser Enhancement (`src/prompting/parser.ts`)
- Added `parseTemplateWithMetadata()` function
- Extracts JSON from `<META>` blocks at template start
- Returns `{ metadata: TemplateMetadata, content: string }`
- Graceful error handling for invalid JSON

### 2. Type System
- Added `TemplateMetadata` interface with optional `settings` field
- Added `CreateMessagesResult` interface with new `settings` field
- Exported from main index for public API

### 3. Service Integration (`src/llm/LLMService.ts`)
- Updated `createMessages()` to parse metadata before rendering
- Returns extracted settings in addition to messages and modelContext
- Validates settings through `SettingsManager.validateTemplateSettings()`

### 4. Settings Validation (`src/llm/services/SettingsManager.ts`)
- Added `validateTemplateSettings()` method
- Type-checks all LLM settings fields
- Logs warnings for invalid values
- Returns only valid settings

## Settings Hierarchy

The complete settings precedence order (later overrides earlier):

1. **Model Defaults** - Base settings for each model
2. **Preset Settings** - From selected preset
3. **Template Settings** - From `<META>` block
4. **Runtime Settings** - From `sendMessage()` call

Example:
```typescript
// Model default: temperature = 0.7
// Preset: temperature = 0.8
// Template: temperature = 0.9
// Runtime: temperature = 1.0

// Final temperature used: 1.0 (runtime wins)
```

## Usage Examples

### Basic Usage
```typescript
const template = `
<META>
{
  "settings": {
    "temperature": 0.9,
    "maxTokens": 2000
  }
}
</META>
<USER>Write a poem</USER>
`;

const { messages, settings } = await llmService.createMessages({ template });
// settings = { temperature: 0.9, maxTokens: 2000 }
```

### With Model Context
```typescript
const template = `
<META>
{
  "settings": {
    "reasoning": { "enabled": true, "effort": "high" }
  }
}
</META>
<SYSTEM>You are a {{ thinking_enabled ? "thoughtful" : "quick" }} assistant.</SYSTEM>
<USER>Solve this problem...</USER>
`;

const { messages, settings, modelContext } = await llmService.createMessages({
  template,
  presetId: 'claude-thinking'
});
```

### Invalid Settings Handling
```typescript
const template = `
<META>
{
  "settings": {
    "temperature": 3.0,     // Invalid - logged and ignored
    "unknownField": true,   // Unknown - logged and ignored
    "maxTokens": 1000      // Valid - included
  }
}
</META>
`;
// Console warnings for invalid fields
// settings = { maxTokens: 1000 }
```

## Benefits

1. **Self-Contained**: Templates are complete units with their optimal settings
2. **Portable**: Easy to share templates with all necessary configuration
3. **Maintainable**: Settings live with the template they belong to
4. **Type-Safe**: Full TypeScript validation and IntelliSense
5. **Backward Compatible**: Templates without `<META>` work as before

## Testing

- Added 9 comprehensive tests for `parseTemplateWithMetadata()`
- Added 8 tests for `createMessages()` with metadata
- Tests cover validation, error handling, and backward compatibility
- 100% coverage maintained

## Technical Notes

- `<META>` must be at the beginning of the template
- Invalid JSON results in warning, not error
- Empty or missing settings default to `{}`
- All settings are validated before use
- Compatible with all existing features (model context, thinking extraction, etc.)

---

# Intelligent Enforcement for Thinking Tag Extraction

## Overview

Introduced intelligent enforcement for thinking tag extraction through a new `onMissing` property that automatically determines whether to be strict or lenient based on the model's native reasoning capabilities. This ensures reliable prompt-driven reasoning for non-native models while maintaining flexibility for models with native reasoning support.

## Problem Solved

When prompting models to "think in tags", developers need assurance that the model followed the instruction. However, the same prompt might be used with different models - some with native reasoning, others without. A simple "strict mode" would fail for native reasoning models that don't need tags. The challenge was providing a single setting that works intelligently across all model types.

## Solution

The new `onMissing` property in `LLMThinkingExtractionSettings` supports four modes:
- `'ignore'`: Silently continue if tag is missing
- `'warn'`: Log a warning but continue
- `'error'`: Return an error response
- `'auto'` (default): Intelligently decide based on native reasoning status

The `'auto'` mode logic:
> Be **strict** (error) unless the model has **native reasoning active**. If native reasoning is active, be **lenient** (ignore).

## Migration Guide

### Breaking Change: Default Settings Updated

**Before:**
```typescript
// Default settings
thinkingExtraction: {
  enabled: true,    // Was enabled by default
  tag: 'thinking'
}
```

**After:**
```typescript
// New default settings
thinkingExtraction: {
  enabled: false,   // Now requires explicit opt-in
  tag: 'thinking',
  onMissing: 'auto' // Smart enforcement
}
```

### Migration Examples

**1. If you were relying on default extraction being enabled:**
```typescript
// Before (extraction happened automatically)
const response = await llm.sendMessage({
  providerId: 'openai',
  modelId: 'gpt-4.1',
  messages: [{ role: 'user', content: 'Think step by step...' }]
});

// After (must explicitly enable)
const response = await llm.sendMessage({
  providerId: 'openai',
  modelId: 'gpt-4.1',
  messages: [{ role: 'user', content: 'Think step by step...' }],
  settings: {
    thinkingExtraction: { enabled: true }
  }
});
```

**2. For universal prompts that instruct thinking in tags:**
```typescript
// This now works intelligently across all models
const universalPrompt = `
<SYSTEM>Always think through problems step-by-step in <thinking> tags before answering.</SYSTEM>
<USER>{{ question }}</USER>
`;

// With non-native model: enforces tag presence
// With native reasoning model: allows missing tag
const response = await llm.sendMessage({
  presetId: modelPreset,
  messages,
  settings: {
    reasoning: { enabled: true },
    thinkingExtraction: { 
      enabled: true
      // onMissing: 'auto' is default
    }
  }
});
```

**3. If you need the old behavior (no enforcement):**
```typescript
settings: {
  thinkingExtraction: {
    enabled: true,
    onMissing: 'ignore' // Old behavior
  }
}
```

## Usage Examples

### Basic Usage with Auto Mode

```typescript
// For non-native models (e.g., GPT-4)
const response = await llm.sendMessage({
  providerId: 'openai',
  modelId: 'gpt-4.1',
  messages: [{
    role: 'system',
    content: 'Think in <thinking> tags before answering.'
  }, {
    role: 'user',
    content: 'What is 15% of 240?'
  }],
  settings: {
    thinkingExtraction: { enabled: true } // Uses auto mode
  }
});

// If model doesn't output <thinking> tag: ERROR
// "The model (gpt-4.1) response was expected to start with a <thinking> tag..."
```

### With Native Reasoning Models

```typescript
// For native reasoning models (e.g., Claude 3.7)
const response = await llm.sendMessage({
  providerId: 'anthropic',
  modelId: 'claude-3-7-sonnet-20250219',
  messages: [/* same prompt */],
  settings: {
    reasoning: { enabled: true },
    thinkingExtraction: { enabled: true }
  }
});

// If model doesn't output <thinking> tag: SUCCESS (ignored)
// Native reasoning is active, so tags are optional
```

### Explicit Control

```typescript
// Force strict checking even for native models
settings: {
  reasoning: { enabled: true },
  thinkingExtraction: {
    enabled: true,
    onMissing: 'error' // Override auto behavior
  }
}

// Just warn instead of error
settings: {
  thinkingExtraction: {
    enabled: true,
    onMissing: 'warn'
  }
}
```

### Custom Tag Names

```typescript
settings: {
  thinkingExtraction: {
    enabled: true,
    tag: 'reasoning', // Custom tag name
    onMissing: 'auto'
  }
}
// Error message will reference <reasoning> tag
```

## Implementation Details

### Type Changes

```typescript
export interface LLMThinkingExtractionSettings {
  enabled?: boolean;  // Now defaults to false
  tag?: string;       // Default: 'thinking'
  onMissing?: 'ignore' | 'warn' | 'error' | 'auto'; // NEW - Default: 'auto'
}
```

### Native Reasoning Detection

The system considers native reasoning "active" when:
1. Model supports reasoning (`reasoning.supported === true`)
2. AND one of:
   - Reasoning is explicitly enabled (`reasoning.enabled === true`)
   - Model has reasoning on by default (`reasoning.enabledByDefault === true`) AND not explicitly disabled (`reasoning.enabled !== false`)
   - Model cannot disable reasoning (`reasoning.canDisable === false`)

### Special Model Handling

- **Always-on models** (e.g., o4-mini): Always considered to have active reasoning
- **Default-enabled models** (e.g., Gemini 2.5 Pro): Considered active unless explicitly disabled
- **Regular models**: Only active when explicitly enabled

## Benefits

1. **Write Once, Run Anywhere**: Single prompt template works across all models
2. **Reliability**: Ensures non-native models follow thinking instructions
3. **Flexibility**: Doesn't break when using native reasoning models
4. **Developer Experience**: Smart defaults reduce configuration burden
5. **Gradual Migration**: Can override behavior when needed

## Technical Notes

- Only affects responses when `thinkingExtraction.enabled === true`
- The `'auto'` mode evaluation happens at runtime based on actual settings
- Error messages include model context to aid debugging
- Console warnings (when using 'warn' mode) include model ID
- Fully backward compatible with explicit mode settings

---

## Bug Fix: Native Reasoning Detection for Auto Mode (2025-07)

### Issue Fixed
Fixed the `isNativeReasoningActive` logic to properly handle models with `enabledByDefault: true` (like Gemini Flash 2.5). Previously, these models were always considered to have native reasoning active, even when the user explicitly disabled reasoning with `reasoning: { enabled: false }`.

### Impact
- Models with `enabledByDefault: true` now correctly enforce thinking tags when reasoning is explicitly disabled
- The `onMissing: 'auto'` mode now works as intended for all model configurations
- No breaking changes - only affects the strictness of thinking tag enforcement

### Technical Details
The logic now checks if reasoning is explicitly disabled before considering `enabledByDefault`:
```typescript
const isNativeReasoningActive = 
  modelInfo!.reasoning?.supported === true &&
  (internalRequest.settings.reasoning?.enabled === true ||
   (modelInfo!.reasoning?.enabledByDefault === true &&
    internalRequest.settings.reasoning?.enabled !== false) || // Only if not explicitly disabled
   modelInfo!.reasoning?.canDisable === false); // Always-on models
```