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