# Recent Updates

This document describes recent significant updates to genai-lite. 

## Summary

1. **[Automatic Thinking Extraction](#automatic-thinking-extraction-feature)** - Automatically extracts and standardizes reasoning/thinking from all models
2. **[Unified Prompt Creation API](#unified-prompt-creation-api)** - New `createMessages()` method simplifies creating model-aware, multi-turn prompts

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
// response.choices[0].reasoning = "<!-- Extracted by genai-lite from <thinking> tag -->\n15% = 0.15, so 0.15 × 240 = 36"
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