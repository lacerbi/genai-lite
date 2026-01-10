# LLM Service

Complete guide to text generation and chat completions using genai-lite's LLMService.

## Contents

- [Overview](#overview) - When to use LLMService
- [Basic Usage](#basic-usage) - Simple message sending
- [Reasoning Mode](#reasoning-mode) - Advanced problem-solving with native reasoning
- [Thinking Tag Fallback](#thinking-tag-fallback) - Structured reasoning for non-reasoning models
- [Creating Messages from Templates](#creating-messages-from-templates) - Model-aware prompt building
- [Self-Contained Templates](#self-contained-templates-with-metadata) - Templates with embedded settings
- [Model Presets](#model-presets) - Pre-configured model settings
- [Advanced Settings](#advanced-settings) - Fine-tuning model behavior
  - [System Message Fallback](#system-message-fallback) - Handling models without system message support
- [Error Handling](#error-handling) - Handling failures
- [Related Documentation](#related-documentation) - Provider info, utilities

## Overview

The `LLMService` class provides a unified interface for text generation across multiple AI providers:

- **Cloud Providers**: OpenAI (GPT-4.1, o4), Anthropic (Claude), Google (Gemini), Mistral
- **Local Providers**: llama.cpp (run any GGUF model locally)

**Key Features**:
- Unified API across all providers
- Native reasoning support for advanced models
- Thinking tag extraction for non-reasoning models
- Template engine with model context awareness
- Preset management for common configurations
- Consistent error handling

## Basic Usage

### Initialization

```typescript
import { LLMService, fromEnvironment } from 'genai-lite';

// Create service with environment variable API key provider
const llmService = new LLMService(fromEnvironment);

// With debug logging
const llmServiceDebug = new LLMService(fromEnvironment, {
  logLevel: 'debug'
});

// With custom logger (pino, winston, etc.)
import pino from 'pino';
const llmServicePino = new LLMService(fromEnvironment, {
  logger: pino({ level: 'info' })
});
```

See [Logging](logging.md) for complete logging configuration.

### Sending Messages

```typescript
const response = await llmService.sendMessage({
  providerId: 'openai',
  modelId: 'gpt-4.1-mini',
  messages: [
    { role: 'system', content: 'You are a helpful assistant.' },
    { role: 'user', content: 'What is TypeScript?' }
  ]
});

if (response.object === 'chat.completion') {
  console.log(response.choices[0].message.content);
} else {
  console.error('Error:', response.error.message);
}
```

### Provider and Model Discovery

```typescript
// Get list of supported providers
const providers = await llmService.getProviders();

// Get models for a specific provider
const models = await llmService.getModels('anthropic');

// Get configured presets
const presets = llmService.getPresets();
```

See [Providers & Models](providers-and-models.md) for all supported providers and models.

---

## Reasoning Mode

Some models include advanced reasoning capabilities that enhance problem-solving. These models can show their step-by-step thinking process.

### Models with Native Reasoning

- **Anthropic**: Claude 4 (Sonnet, Opus), Claude 3.7 Sonnet
- **Google Gemini**: Gemini 2.5 Pro (always on), Gemini 2.5 Flash, Gemini 2.5 Flash-Lite
- **OpenAI**: o4-mini (always on)
- **llama.cpp**: Qwen3, DeepSeek-R1, GPT-OSS (requires `--reasoning-format deepseek` server flag)

See [Providers & Models - Reasoning Support](providers-and-models.md#models-with-reasoning-support) for the complete list.

### Enabling Reasoning

#### Automatic Token Budget

Let the model decide how much thinking to do:

```typescript
const response = await llmService.sendMessage({
  providerId: 'gemini',
  modelId: 'gemini-2.5-flash',
  messages: [{
    role: 'user',
    content: 'Solve this step by step: If a train travels 120km in 2 hours, what is its speed in m/s?'
  }],
  settings: {
    reasoning: {
      enabled: true  // Let model decide reasoning budget
    }
  }
});
```

#### Effort Levels (Quick Control)

Use preset effort levels:

```typescript
const response = await llmService.sendMessage({
  providerId: 'anthropic',
  modelId: 'claude-3-7-sonnet-20250219',
  messages: [{
    role: 'user',
    content: 'Analyze this complex problem...'
  }],
  settings: {
    reasoning: {
      enabled: true,
      effort: 'high'  // 'low' (20% budget), 'medium' (50%), 'high' (80%)
    }
  }
});
```

#### Specific Token Budget

Set an exact reasoning token limit:

```typescript
const response = await llmService.sendMessage({
  providerId: 'gemini',
  modelId: 'gemini-2.5-flash-lite-preview-06-17',
  messages: [{
    role: 'user',
    content: 'What is the square root of 144?'
  }],
  settings: {
    reasoning: {
      enabled: true,
      maxTokens: 5000  // Specific token budget for reasoning
    }
  }
});
```

### Accessing Reasoning Output

```typescript
const response = await llmService.sendMessage({
  providerId: 'anthropic',
  modelId: 'claude-sonnet-4-20250514',
  messages: [{ role: 'user', content: 'Explain how Bitcoin works' }],
  settings: {
    reasoning: { enabled: true, effort: 'medium' }
  }
});

if (response.object === 'chat.completion' && response.choices[0].reasoning) {
  console.log('Model reasoning:', response.choices[0].reasoning);
  console.log('Final answer:', response.choices[0].message.content);
}
```

**Important**: Reasoning tokens are billed separately. Some models (o4-mini, Gemini 2.5 Pro) cannot disable reasoning. Set `exclude: true` to enable reasoning but not return it.

---

## Thinking Tag Fallback

For models **without native reasoning**, you can prompt them to output reasoning in XML tags. The library extracts these tags and moves the content to the standardized `reasoning` field. **You must explicitly prompt the model to use thinking tags**—the library only extracts them, it doesn't generate them automatically.

### Basic Example

```typescript
const response = await llmService.sendMessage({
  providerId: 'openai',
  modelId: 'gpt-4.1',
  messages: [{
    role: 'system',
    content: 'When solving problems, write your reasoning inside <thinking> tags, then provide the answer.'
  }, {
    role: 'user',
    content: 'What is 15% of 240?'
  }],
  settings: {
    thinkingTagFallback: { enabled: true }
  }
});

// Model outputs: "<thinking>15% = 0.15, so 0.15 × 240 = 36</thinking>The answer is 36."
// Result: reasoning = "15% = 0.15, so 0.15 × 240 = 36", content = "The answer is 36."
```

### Configuration Options

```typescript
settings: {
  thinkingTagFallback: {
    enabled: true,         // Must explicitly enable (default: false)
    tagName: 'scratchpad', // Custom tag name (default: 'thinking')
    enforce: true          // Smart enforcement (see below)
  }
}
```

### The `enforce` Property

- **`enforce: true`** - Error if tags missing AND native reasoning not active
- **`enforce: false`** (default) - Extract tags if present, never error

Enforcement is **smart**—it only enforces when native reasoning is not active. Models with active native reasoning won't error even if tags are missing.

```typescript
// Non-reasoning model: enforce: true requires tags
const response = await llmService.sendMessage({
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
    thinkingTagFallback: { enabled: true, enforce: true }
  }
});
// Result: ERROR if <thinking> tags missing (response in errorResponse.partialResponse)

// Reasoning model: enforce: true allows native reasoning instead of tags
const response2 = await llmService.sendMessage({
  providerId: 'anthropic',
  modelId: 'claude-3-7-sonnet-20250219',
  messages: [/* same */],
  settings: {
    reasoning: { enabled: true },
    thinkingTagFallback: { enabled: true, enforce: true }
  }
});
// Result: SUCCESS even without <thinking> tags (native reasoning active)
```

### Custom Tag Names

```typescript
settings: {
  thinkingTagFallback: {
    enabled: true,
    tagName: 'scratchpad'  // Use <scratchpad> instead of <thinking>
  }
}
```

---

## Creating Messages from Templates

The `createMessages()` method combines template rendering, model context injection, and role tag parsing into a single, intuitive API.

### Basic Example

```typescript
const { messages, modelContext } = await llmService.createMessages({
  template: `
    <SYSTEM>You are a helpful assistant.</SYSTEM>
    <USER>{{ question }}</USER>
  `,
  variables: {
    question: 'What is the optimal algorithm for finding the shortest path in a weighted graph?'
  },
  presetId: 'anthropic-claude-3-7-sonnet-20250219-thinking'
});

// The messages are ready to send
const response = await llmService.sendMessage({
  presetId: 'anthropic-claude-3-7-sonnet-20250219-thinking',
  messages: messages
});
```

### Model Context Variables

When using `createMessages()`, these variables are automatically injected:

- **`native_reasoning_active`**: Whether native reasoning is currently active (`true`/`false`)
- **`native_reasoning_capable`**: Whether the model supports native reasoning (`true`/`false`)
- **`requires_tags_for_thinking`**: Whether model needs thinking tags (inverse of `native_reasoning_active`)
- **`model_id`**, **`provider_id`**: Resolved IDs
- **`reasoning_effort`**, **`reasoning_max_tokens`**: Reasoning settings if specified

### Adaptive Prompts Based on Model Capabilities

**Best Practice**: Use `requires_tags_for_thinking` (the NOT operator) to add thinking tag instructions only for models that need them:

```typescript
const { messages, modelContext } = await llmService.createMessages({
  template: `
    <SYSTEM>
      You are a problem-solving assistant.
      {{ requires_tags_for_thinking ? ' For complex problems, write your reasoning in <thinking> tags before answering.' : '' }}
    </SYSTEM>
    <USER>{{ question }}</USER>
  `,
  variables: { question: 'What causes the seasons on Earth?' },
  presetId: 'anthropic-claude-3-7-sonnet-20250219-thinking'
});

// With a reasoning model: System prompt is clean (no thinking tag instruction)
// With a non-reasoning model: System prompt includes thinking tag instruction
```

### Multi-Turn Conversations

```typescript
const { messages } = await llmService.createMessages({
  template: `
    <SYSTEM>You are an expert code reviewer.</SYSTEM>
    {{ hasContext ? '<USER>Context: {{context}}</USER>' : '' }}
    <USER>Review this code:
\`\`\`{{language}}
{{code}}
\`\`\`</USER>
    {{ hasExamples ? examples : '' }}
    <USER>Focus on {{ focusAreas.join(', ') }}.</USER>
  `,
  variables: {
    hasContext: true,
    context: 'This is part of a high-performance web server',
    language: 'typescript',
    code: 'async function handleRequest(req: Request) { ... }',
    hasExamples: true,
    examples: '<ASSISTANT>I\'ll review your code focusing on the areas you mentioned.</ASSISTANT>',
    focusAreas: ['error handling', 'performance', 'type safety']
  },
  providerId: 'openai',
  modelId: 'gpt-4.1'
});
```

---

## Self-Contained Templates with Metadata

Templates can include their own settings using a `<META>` block for portability and consistency.

### Basic Example

```typescript
const creativeWritingTemplate = `
<META>
{
  "settings": {
    "temperature": 0.9,
    "maxTokens": 3000,
    "thinkingTagFallback": { "enabled": true, "tagName": "reasoning" }
  }
}
</META>
<SYSTEM>
You are a creative writer. Use <reasoning> tags to outline your story structure
before writing the actual story.
</SYSTEM>
<USER>Write a short story about {{ topic }}</USER>
`;

// Use the template - settings are automatically extracted
const { messages, settings } = await llmService.createMessages({
  template: creativeWritingTemplate,
  variables: { topic: 'a robot discovering music' },
  providerId: 'openai',
  modelId: 'gpt-4.1'
});

// Send the message with the template's settings
const response = await llmService.sendMessage({
  providerId: 'openai',
  modelId: 'gpt-4.1',
  messages,
  settings  // Uses temperature: 0.9, maxTokens: 3000, etc.
});
```

### Settings Hierarchy

When multiple settings sources exist, they are merged in this order (later overrides earlier):

```
Model Defaults < Preset Settings < Template <META> Settings < Runtime Settings
(lowest priority)                                            (highest priority)
```

```typescript
// Example of settings hierarchy
const { messages, settings: templateSettings } = await llmService.createMessages({
  template: `<META>{"settings": {"temperature": 0.8}}</META><USER>Hello</USER>`,
  presetId: 'some-preset'  // Preset might have temperature: 0.7
});

// Final temperature will be 0.9 (runtime overrides all)
const response = await llmService.sendMessage({
  presetId: 'some-preset',
  messages,
  settings: {
    ...templateSettings,
    temperature: 0.9  // Runtime override (highest priority)
  }
});
```

See [Core Concepts - Settings Hierarchy](core-concepts.md#settings-hierarchy) for details.

### Validation

Invalid settings in `<META>` blocks are logged as warnings and ignored.

---

## Model Presets

Presets are pre-configured combinations of provider, model, and settings. genai-lite includes 20+ built-in LLM presets, including specialized "thinking" presets for reasoning-capable models.

### Using Presets

```typescript
const presets = llmService.getPresets();

const response = await llmService.sendMessage({
  presetId: 'anthropic-claude-sonnet-4-20250514-default',
  messages: [{ role: 'user', content: 'Hello!' }]
});
```

### Overriding Preset Settings

```typescript
const response = await llmService.sendMessage({
  presetId: 'openai-gpt-4.1-default',
  messages: [{ role: 'user', content: 'Write a story' }],
  settings: {
    temperature: 0.9,  // Override preset's temperature
    maxTokens: 3000    // Override preset's maxTokens
  }
});
```

For custom presets, see [Core Concepts - Preset System](core-concepts.md#preset-system).

---

## Advanced Settings

Fine-tune model behavior with these settings:

```typescript
const response = await llmService.sendMessage({
  providerId: 'anthropic',
  modelId: 'claude-3-5-haiku-20241022',
  messages: [{ role: 'user', content: 'Write a haiku' }],
  settings: {
    temperature: 0.7,           // Randomness (0.0-2.0, typically 0.0-1.0)
    maxTokens: 100,             // Maximum output tokens
    topP: 0.9,                  // Nucleus sampling (0.0-1.0)
    stopSequences: ['\n\n'],    // Stop generation at these strings
    // Provider-specific settings also available
  }
});
```

### Common Settings

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `temperature` | number | 0.7 | Controls randomness (0=deterministic, 2=very random) |
| `maxTokens` | number | Model default | Maximum tokens to generate |
| `topP` | number | 1.0 | Nucleus sampling threshold |
| `stopSequences` | string[] | `[]` | Stop generation at these sequences |
| `reasoning` | object | - | Reasoning configuration (see [Reasoning Mode](#reasoning-mode)) |
| `thinkingTagFallback` | object | - | Thinking tag configuration (see [Thinking Tag Fallback](#thinking-tag-fallback)) |
| `systemMessageFallback` | object | - | System message format when model lacks native support (see below) |

### System Message Fallback

Some models (e.g., Gemma) don't support native system instructions. When `supportsSystemMessage: false` is set for a model, genai-lite automatically prepends system content to the first user message.

You can configure how this prepending is formatted:

```typescript
const response = await llmService.sendMessage({
  providerId: 'gemini',
  modelId: 'gemma-3-27b-it',
  systemMessage: 'You are a helpful assistant.',
  messages: [{ role: 'user', content: 'Hello' }],
  settings: {
    systemMessageFallback: {
      format: 'xml',           // 'xml' (default), 'separator', or 'plain'
      tagName: 'system',       // Tag name for xml format (default: 'system')
      separator: '\n\n---\n\n' // Separator for separator format
    }
  }
});
```

**Format options:**

| Format | Result |
|--------|--------|
| `xml` (default) | `<system>\n{content}\n</system>\n\n{user message}` |
| `separator` | `{content}{separator}{user message}` |
| `plain` | `{content}\n\n{user message}` |

This is handled automatically for models with `supportsSystemMessage: false` in their configuration. Most users won't need to configure this manually.

---

## Error Handling

LLMService uses consistent error envelopes across all providers.

```typescript
const response = await llmService.sendMessage({
  providerId: 'openai',
  modelId: 'gpt-4.1-mini',
  messages: [{ role: 'user', content: 'Hello' }]
});

if (response.object === 'error') {
  switch (response.error.type) {
    case 'authentication_error':
      console.error('Invalid API key');
      break;

    case 'rate_limit_error':
      console.error('Rate limit exceeded');
      break;

    case 'validation_error':
      console.error('Invalid request:', response.error.message);
      // For thinking tag enforcement errors, check partialResponse
      if (response.partialResponse) {
        console.log('Model did respond:', response.partialResponse.choices[0].message.content);
      }
      break;

    case 'network_error':
      console.error('Server not reachable:', response.error.message);
      break;

    default:
      console.error('Error:', response.error.message);
  }
} else {
  // Success
  console.log('Response:', response.choices[0].message.content);
}
```

See [Core Concepts - Error Handling](core-concepts.md#error-handling) for complete error reference.

---

## Related Documentation

### Essential Reading

- **[Core Concepts](core-concepts.md)** - API keys, presets, error handling, settings hierarchy
- **[Providers & Models](providers-and-models.md)** - All supported providers and models
- **[Prompting Utilities](prompting-utilities.md)** - Template engine, token counting, parsing tools

### Integrations

- **[llama.cpp Integration](llamacpp-integration.md)** - Running local models with llama.cpp

### Examples

- **[Chat Demo Example](example-chat-demo.md)** - Integration patterns for chat applications

### Reference

- **[TypeScript Reference](typescript-reference.md)** - Type definitions
- **[Troubleshooting](troubleshooting.md)** - Common issues and solutions
