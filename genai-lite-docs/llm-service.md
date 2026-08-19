# LLM Service

Complete guide to text generation and chat completions using genai-lite's LLMService.

## Contents

- [Overview](#overview) - When to use LLMService
- [Basic Usage](#basic-usage) - Simple message sending
- [Capability Preflight](#capability-preflight) - Check provider/model support before sending
- [Streaming Text](#streaming-text) - Token deltas from streaming-capable providers
- [Prepared Calls and Accounting](prepared-calls-and-accounting.md) - Inspect and budget the exact semantic request
- [Structured Output](#structured-output) - Guaranteed JSON responses with schema validation
- [Reasoning Mode](#reasoning-mode) - Advanced problem-solving with native reasoning
- [Thinking Tag Fallback](#thinking-tag-fallback) - Structured reasoning for non-reasoning models
- [Creating Messages from Templates](#creating-messages-from-templates) - Model-aware prompt building
- [Self-Contained Templates](#self-contained-templates-with-metadata) - Templates with embedded settings
- [Model Presets](#model-presets) - Pre-configured model settings
- [Advanced Settings](#advanced-settings) - Fine-tuning model behavior
  - [System Message Fallback](#system-message-fallback) - Handling models without system message support
  - [Log Probabilities](#log-probabilities) - Per-token log probabilities
- [Retries, Timeouts and Cancellation](#retries-timeouts-and-cancellation) - Resilience and per-call control
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
- Streaming text deltas for providers that implement streaming
- Consistent error handling
- Credential-free, mode-bound prepared requests with immutable inspection

For applications that enforce context boundaries or need lossless accounting
evidence, see [Prepared Calls and Token Accounting](prepared-calls-and-accounting.md).

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

Message `content` must be a string, but an empty string is valid for `system`,
`user`, and `assistant` messages. Missing, `null`, and non-string content still
fail structural validation.

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

## Capability Preflight

Use capability APIs when you need to validate a provider/model choice before retrieving an API key or calling a provider adapter.

```typescript
const capabilities = await llmService.getModelCapabilities(
  'gemini',
  'gemma-4-31b-it'
);

if (capabilities.object !== 'error') {
  console.log(capabilities.structuredOutput.status); // 'unsupported'
}
```

For actual request settings, use `validateRequestCapabilities()`:

```typescript
const preflight = await llmService.validateRequestCapabilities({
  providerId: 'gemini',
  modelId: 'gemma-4-31b-it',
  settings: {
    structuredOutput: {
      name: 'prompt_response',
      schema: { type: 'object', properties: { answer: { type: 'string' } } }
    }
  }
});

if (preflight.object === 'error') {
  console.error(preflight.error.code); // 'structured_output_not_supported'
}
```

Capability calls perform no external I/O:
- no API key lookup
- no provider adapter call
- no network I/O

Capability calls read the current in-memory content-profile registry snapshot
without closing registration. After appending a local tokenizer backend or
exact alias, call the capability API again; previously returned results are not
mutated.

Structured-output support is reported as:
- `supported`: genai-lite has metadata that native structured output is available.
- `unsupported`: genai-lite has metadata that native structured output is unavailable.
- `unknown`: genai-lite has no explicit metadata. This is not treated as failure by default; callers decide whether to allow it, reject it, or use a prompt-text fallback.

`capabilities.contentTokenCounting` reports `exact` for built-in hash-verified
profiles, `model` for host-registered tokenizers, and `unavailable` when no
exact `(providerId, modelId)` alias exists. An unavailable result may become
available after registration. `tokenProfileMappingRevision`, when present,
identifies the complete registry snapshot used for that capability result and
may change after unrelated additions. See
[Content-token profiles](prepared-calls-and-accounting.md#content-token-profiles).

Built-in rank loading and validation also fail closed to `unavailable` rather
than throwing from capability inspection. If that profile remains unavailable
when a response is processed, genai-lite preserves provider-output accounting
but omits library-generated raw-content token accounting.

`validateRequestCapabilities()` returns the same validation diagnostic shape as `sendMessage()` where possible. For example, Gemini-hosted Gemma models return `type: 'validation_error'` and `code: 'structured_output_not_supported'` when structured output is requested.

---

## Streaming Text

`streamMessage()` returns an async iterable of events. It uses the same request shape as `sendMessage()` and the same validation, preset resolution, defaults, API-key lookup, structured-output parsing, and thinking-tag cleanup. The final `complete.response` event is the authoritative normalized response.

```typescript
for await (const event of llmService.streamMessage({
  providerId: 'llamacpp',
  modelId: 'llamacpp',
  messages: [{ role: 'user', content: 'Explain streaming in one sentence.' }],
  settings: {
    maxTokens: 80,
    reasoning: { enabled: false }
  }
})) {
  switch (event.type) {
    case 'content_delta':
      process.stdout.write(event.delta);
      break;
    case 'reasoning_delta':
      process.stderr.write(event.delta);
      break;
    case 'usage':
      console.log('Usage:', event.usage);
      break;
    case 'complete':
      console.log('Final:', event.response.choices[0].message.content);
      break;
    case 'error':
      console.error(event.error.error.message);
      break;
  }
}
```

### Stream Events

```typescript
type LLMStreamEvent =
  | { type: 'start'; provider: string; model: string; id?: string; created?: number }
  | { type: 'content_delta'; delta: string; index: number }
  | { type: 'reasoning_delta'; delta: string; index: number }
  | { type: 'usage'; usage: LLMUsage }
  | { type: 'complete'; response: LLMResponse }
  | { type: 'error'; error: LLMFailureResponse };

type LLMServiceStreamEvent = LLMStreamEvent & { attemptId: string };
```

`LLMStreamEvent` is the source-compatible custom-adapter event shape.
`streamMessage()` and `streamPrepared()` emit `LLMServiceStreamEvent`; all
events from one physical invocation share its `attemptId`.

### Provider Support

| Provider | Streaming | Notes |
|----------|-----------|-------|
| `openai` | Yes | Uses OpenAI chat-completion streaming with usage chunks when available. Reasoning deltas are forwarded defensively if the API emits them. |
| `anthropic` | Yes | Uses Anthropic Messages streaming. Text blocks emit `content_delta`; thinking blocks emit `reasoning_delta` when reasoning is not excluded. |
| `gemini` | Yes | Uses `generateContentStream()`. Gemini thought parts are emitted as `reasoning_delta` when thoughts are included and not excluded. |
| `mistral` | Yes | Uses the Mistral SDK streaming endpoint. String text deltas and text content chunks emit `content_delta`; thinking chunks emit `reasoning_delta` when reasoning is not excluded. |
| `llamacpp` | Yes | Uses llama-server's OpenAI-compatible streaming endpoint. `reasoning_delta` appears when the server emits separated reasoning fields. |
| `openrouter` | Yes | Uses OpenRouter's OpenAI-compatible streaming endpoint. Reasoning deltas are forwarded when the underlying model/provider emits them. |

### Cancellation and Timeouts

```typescript
const controller = new AbortController();

for await (const event of llmService.streamMessage(request, {
  signal: controller.signal,
  timeoutMs: 30_000
})) {
  // ...
}
```

Streaming does not use automatic retries. Once tokens have been emitted, retrying could duplicate output. If a provider fails after partial output, the `error` event may include `error.partialResponse` with the accumulated normalized response so far.

---

## Structured Output

Structured output guarantees that the model returns valid JSON conforming to a schema you define. This is useful for extracting data, function calling, and building reliable integrations.

### Basic Example

```typescript
const response = await llmService.sendMessage({
  providerId: 'openai',
  modelId: 'gpt-4.1',
  messages: [{
    role: 'user',
    content: 'Extract the person info from: "John Smith is 42 years old."'
  }],
  settings: {
    structuredOutput: {
      name: 'person_info',
      schema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'The person\'s full name' },
          age: { type: 'integer', description: 'The person\'s age' }
        },
        required: ['name', 'age']
      }
    }
  }
});

if (response.object === 'chat.completion') {
  // Automatically parsed JSON is available in parsedContent
  const data = response.choices[0].parsedContent as { name: string; age: number };
  console.log(data.name);  // "John Smith"
  console.log(data.age);   // 42

  // Raw JSON string is still in message.content
  console.log(response.choices[0].message.content);  // '{"name":"John Smith","age":42}'
}
```

### Provider Support

| Provider | Support | Notes |
|----------|---------|-------|
| OpenAI | Full | Schema validation via `json_schema` response format |
| llama.cpp | Full | Schema validation via grammar-based generation |
| Gemini | Full | Schema validation via `responseSchema` |
| Anthropic | Beta | Requires beta header (handled automatically) |
| Mistral | Partial | JSON mode only—no schema enforcement |
| OpenRouter | Passthrough | Depends on underlying model |

### Configuration Options

```typescript
settings: {
  structuredOutput: {
    name: 'my_schema',      // Required: Schema name (for provider APIs)
    schema: {               // Required: JSON Schema definition
      type: 'object',
      properties: { /* ... */ },
      required: ['field1', 'field2']
    },
    strict: true,           // Optional: Enable strict mode (default: true)
    autoParse: true,        // Optional: Auto-parse JSON (default: true)
    enabled: true           // Optional: Enable/disable (default: true)
  }
}
```

### Schema Definition

Use JSON Schema syntax to define your output structure:

```typescript
const orderSchema = {
  name: 'order_extraction',
  schema: {
    type: 'object',
    properties: {
      orderId: { type: 'string', pattern: '^ORD-[0-9]+$' },
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            quantity: { type: 'integer', minimum: 1 },
            price: { type: 'number' }
          },
          required: ['name', 'quantity', 'price']
        }
      },
      total: { type: 'number' },
      status: {
        type: 'string',
        enum: ['pending', 'shipped', 'delivered']
      }
    },
    required: ['orderId', 'items', 'total', 'status']
  }
};
```

**Supported schema properties:**
- `type`: `object`, `array`, `string`, `number`, `integer`, `boolean`, `null`
- `properties`: Object field definitions
- `required`: Array of required field names
- `items`: Schema for array elements
- `enum`: Allowed values
- `minimum`, `maximum`: Number constraints
- `minLength`, `maxLength`: String length constraints
- `pattern`: Regex pattern for strings
- `description`: Field documentation (helps model accuracy)

### Auto-Parsing

By default, genai-lite automatically parses the JSON response:

```typescript
// Auto-parsing enabled (default)
const response = await llmService.sendMessage({ /* ... */ });

if (response.object === 'chat.completion') {
  const choice = response.choices[0];

  if (choice.parsedContent) {
    // Successfully parsed JSON object
    console.log(choice.parsedContent);
  } else if (choice.parseError) {
    // JSON parsing failed (rare with strict mode)
    console.error('Parse error:', choice.parseError);
    console.log('Raw content:', choice.message.content);
  }
}
```

Disable auto-parsing if you want to handle parsing yourself:

```typescript
settings: {
  structuredOutput: {
    name: 'my_schema',
    schema: { /* ... */ },
    autoParse: false  // Disable auto-parsing
  }
}
// parsedContent will be undefined; use choice.message.content
```

### Strict Mode

Strict mode ensures the model's output exactly matches your schema:

```typescript
// Strict mode (default) - guaranteed schema compliance
settings: {
  structuredOutput: {
    name: 'test',
    schema: { type: 'object', properties: { x: { type: 'integer' } } },
    strict: true  // Default
  }
}

// Non-strict mode - model attempts to follow schema but may deviate
settings: {
  structuredOutput: {
    name: 'test',
    schema: { /* ... */ },
    strict: false
  }
}
```

**Note:** Mistral does not support strict mode. The library will warn you but proceed with JSON mode only.

### Disabling Structured Output

To disable structured output that was set in a preset or template:

```typescript
settings: {
  structuredOutput: {
    name: 'ignored',
    schema: { type: 'object' },
    enabled: false  // Explicitly disable
  }
}
```

### Error Handling

If the model doesn't support structured output, you'll get a validation error:

```typescript
const response = await llmService.sendMessage({
  providerId: 'some-provider',
  modelId: 'model-without-structured-output',
  messages: [{ role: 'user', content: 'Test' }],
  settings: {
    structuredOutput: {
      name: 'test',
      schema: { type: 'object' }
    }
  }
});

if (response.object === 'error' && response.error.code === 'structured_output_not_supported') {
  console.error('This model does not support structured output');
}
```

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
    stopSequences: ['\n\n'],    // Stop generation at these strings
    // For Anthropic, set either temperature or topP, never both.
  }
});
```

### Common Settings

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `temperature` | number | 0.5 | Controls randomness (0=deterministic, 2=very random). Mutually exclusive with `topP` on Anthropic |
| `maxTokens` | number | Model default | Maximum tokens to generate |
| `topP` | number | 0.95 | Nucleus sampling threshold. Mutually exclusive with `temperature` on Anthropic |
| `stopSequences` | string[] | `[]` | Stop generation at these sequences |
| `topK` | number | - | Limit sampling to the K most likely tokens (integer ≥ 0; 0 disables). Anthropic, Gemini, llama.cpp, OpenRouter |
| `minP` | number | - | Minimum probability relative to the top token (0.0-1.0; 0 disables). llama.cpp, OpenRouter |
| `repeatPenalty` | number | - | Multiplicative repetition penalty over prompt + output (1.0 = disabled). llama.cpp, OpenRouter |
| `seed` | number | - | Best-effort deterministic sampling (integer; llama.cpp uses -1 for random). OpenAI (non-reasoning models), Gemini, Mistral, llama.cpp, OpenRouter |
| `logprobs` | boolean | - | Return per-token log probabilities on `choice.logprobs` (see [Log Probabilities](#log-probabilities)). llama.cpp, OpenAI, OpenRouter |
| `topLogprobs` | number | - | Number of alternatives to return per token (0-20; requires `logprobs: true`) |
| `reasoning` | object | - | Reasoning configuration (see [Reasoning Mode](#reasoning-mode)) |
| `thinkingTagFallback` | object | - | Thinking tag configuration (see [Thinking Tag Fallback](#thinking-tag-fallback)) |
| `systemMessageFallback` | object | - | System message format when model lacks native support (see below) |
| `llamacpp` | object | - | llama.cpp-only settings (`grammar`, `chatTemplateKwargs`); see [llama.cpp Integration](llamacpp-integration.md#advanced-features) |

**Provider support:** Sampling parameters that the selected provider or model doesn't support are silently stripped before the request is sent (via the provider's `unsupportedParameters` list). For example, `topK` is dropped for OpenAI and Mistral, and `seed` is dropped for Anthropic and for OpenAI reasoning models. See [Providers & Models](providers-and-models.md#llm-providers) for the per-provider breakdown.

For Anthropic, genai-lite sends at most one of `temperature` and `topP`. If you
set neither, only the temperature default is applied. Setting both explicitly
(including through presets or template metadata) returns `INVALID_SETTINGS`
before API-key lookup or provider transport.

### System Messages

You can provide system messages in two ways:

1. **Using the `systemMessage` field:**
   ```typescript
   await llmService.sendMessage({
     providerId: 'openai',
     modelId: 'gpt-4.1-mini',
     systemMessage: 'You are a helpful assistant.',
     messages: [{ role: 'user', content: 'Hello' }]
   });
   ```

2. **Using `role: 'system'` in the messages array** (OpenAI-style):
   ```typescript
   await llmService.sendMessage({
     providerId: 'openai',
     modelId: 'gpt-4.1-mini',
     messages: [
       { role: 'system', content: 'You are a helpful assistant.' },
       { role: 'user', content: 'Hello' }
     ]
   });
   ```

> **Important:** You cannot use both approaches simultaneously. If you provide both a `systemMessage` field and system role messages in the messages array, an error will be returned.

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

### Log Probabilities

Set `logprobs: true` to receive per-token log probabilities on `choice.logprobs`. Add `topLogprobs` (0-20) to also get the most likely alternatives at each position. llama.cpp has explicit supported capability metadata; OpenAI and OpenRouter transport these fields but remain statically `unknown` because support is model/route-dependent. The fields are silently stripped for Anthropic, Gemini, and Mistral.

```typescript
const response = await llmService.sendMessage({
  providerId: 'openai',
  modelId: 'gpt-4.1-mini',
  messages: [{ role: 'user', content: 'Reply with exactly one word: yes' }],
  settings: {
    logprobs: true,
    topLogprobs: 5   // up to 5 alternatives per token (requires logprobs: true)
  }
});

if (response.object === 'chat.completion') {
  for (const tok of response.choices[0].logprobs ?? []) {
    console.log(tok.token, tok.logprob);
    tok.topLogprobs?.forEach((alt) => console.log('  alt:', alt.token, alt.logprob));
  }
}
```

Each entry is a `TokenLogprob` (`{ token, logprob, topLogprobs? }`). In streams, logprobs are attached to the terminal `complete` response rather than emitted as deltas.

For single-position classification, combine `generateAnswerTokenGrammar()` with `extractSingleTokenLabelProbs()`. The grammar constrains character sequences, so a `maxTokens: 1` request requires labels known to tokenize as one output token for the selected model. The extractor separates absolute visible mass from probabilities conditional on recognized labels and reports ambiguous/residual mass explicitly. Its absolute fields require full-distribution-normalized provider evidence before top-N truncation. See [Constrained Answer Labels](constrained-answer-labels.md) and [TypeScript Reference](typescript-reference.md#constrained-answer-label-types).

Starting in `v0.18.0`, `topLogprobs` without effective `logprobs: true` returns a validation error after all settings sources are merged.

---

## Retries, Timeouts and Cancellation

`LLMService` includes a unified retry layer and per-request timeout/cancellation controls. Retries are configured at the service level; timeouts, cancellation, and a retry cap can also be set per call via the second argument to `sendMessage()`.

```typescript
import { LLMService, fromEnvironment } from 'genai-lite';

// Service-level defaults for every request
const llmService = new LLMService(fromEnvironment, {
  timeoutMs: 30000,      // default per-request timeout (SDK default applies when unset)
  retry: {
    maxRetries: 2,        // retries after the first attempt (default 2 → up to 3 attempts)
    initialDelayMs: 500,  // first backoff delay in ms (default 500)
    maxDelayMs: 10000,    // cap on any single delay in ms (default 10000)
    backoffFactor: 2,     // exponential growth per attempt (default 2)
    retryOnTimeout: true  // whether REQUEST_TIMEOUT is retryable (default true)
  }
});

// Per-call overrides + client-side cancellation
const controller = new AbortController();
setTimeout(() => controller.abort(), 5000); // cancel after 5s

const response = await llmService.sendMessage(
  {
    providerId: 'openai',
    modelId: 'gpt-4.1-mini',
    messages: [{ role: 'user', content: 'Summarize the theory of relativity.' }]
  },
  {
    signal: controller.signal, // cancel the request (see caveat below)
    timeoutMs: 8000,           // overrides the service-level timeout for this call
    maxRetries: 0              // disable retries for this call
  }
);

if (response.object === 'error') {
  if (response.error.code === 'REQUEST_ABORTED') {
    console.log('Cancelled by the caller');
  } else if (response.error.code === 'REQUEST_TIMEOUT') {
    console.log('Timed out; provider retry-after hint (ms):', response.error.retryAfterMs);
  }
}
```

**What gets retried:** only transient failures — `RATE_LIMIT_EXCEEDED`, `NETWORK_ERROR`, `REQUEST_TIMEOUT` (unless `retryOnTimeout: false`), and `PROVIDER_ERROR` responses carrying HTTP status **408**, **409**, or **5xx**. A provider `Retry-After` header is honored (used when larger than the computed backoff). Backoff is exponential with ±20% jitter.

**What never gets retried:** aborts (`REQUEST_ABORTED`), authentication errors, validation errors, and other non-transient failures. Set `maxRetries: 0` to disable retries entirely.

**Attempt count:** provider SDK-internal retries are disabled, so this layer is the single owner of retry behavior — the total number of attempts is `maxRetries + 1`.

**Cancellation caveat:** aborting is **client-side only**. The provider may still process (and bill) a request that was already dispatched. Each retry attempt is logged at `warn` level (see [Logging](logging.md)).

Two new error codes accompany this feature: `REQUEST_TIMEOUT` (error `type: 'timeout_error'`) and `REQUEST_ABORTED` (`type: 'abort_error'`). The error object also exposes typed `status` (HTTP status) and `retryAfterMs` fields. See [Core Concepts - Error Handling](core-concepts.md#error-handling).

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
