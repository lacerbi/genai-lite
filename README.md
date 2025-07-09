# genai-lite

A lightweight, portable Node.js/TypeScript library providing a unified interface for interacting with multiple Generative AI providers (OpenAI, Anthropic, Google Gemini, Mistral, and more).

## Features

- 🔌 **Unified API** - Single interface for multiple AI providers
- 🔐 **Flexible API Key Management** - Bring your own key storage solution
- 📦 **Zero Electron Dependencies** - Works in any Node.js environment
- 🎯 **TypeScript First** - Full type safety and IntelliSense support
- ⚡ **Lightweight** - Minimal dependencies, focused functionality
- 🛡️ **Provider Normalization** - Consistent responses across different AI APIs
- 🎨 **Configurable Model Presets** - Built-in presets with full customization options
- 🎭 **Template Engine** - Sophisticated templating with conditionals and variable substitution

## Installation

```bash
npm install genai-lite
```

## Quick Start

```typescript
import { LLMService, fromEnvironment } from 'genai-lite';

// Create service with environment variable API key provider
const llmService = new LLMService(fromEnvironment);

// Option 1: Direct message sending
const response = await llmService.sendMessage({
  providerId: 'openai',
  modelId: 'gpt-4.1-mini',
  messages: [
    { role: 'system', content: 'You are a helpful assistant.' },
    { role: 'user', content: 'Hello, how are you?' }
  ]
});

// Option 2: Create messages from template (recommended for complex prompts)
const { messages } = await llmService.createMessages({
  template: '<SYSTEM>You are a helpful assistant.</SYSTEM><USER>Hello, how are you?</USER>',
  providerId: 'openai',
  modelId: 'gpt-4.1-mini'
});

const response2 = await llmService.sendMessage({
  providerId: 'openai',
  modelId: 'gpt-4.1-mini',
  messages
});

if (response.object === 'chat.completion') {
  console.log(response.choices[0].message.content);
} else {
  console.error('Error:', response.error.message);
}
```

## API Key Management

genai-lite uses a flexible API key provider pattern. You can use the built-in environment variable provider or create your own:

### Environment Variables (Built-in)

```typescript
import { fromEnvironment } from 'genai-lite';

// Expects environment variables like:
// OPENAI_API_KEY=sk-...
// ANTHROPIC_API_KEY=sk-ant-...
// GEMINI_API_KEY=...

const llmService = new LLMService(fromEnvironment);
```

### Custom API Key Provider

```typescript
import { ApiKeyProvider, LLMService } from 'genai-lite';

// Create your own provider
const myKeyProvider: ApiKeyProvider = async (providerId: string) => {
  // Fetch from your secure storage, vault, etc.
  const key = await mySecureStorage.getKey(providerId);
  return key || null;
};

const llmService = new LLMService(myKeyProvider);
```

## Supported Providers & Models

**Note:** Model IDs include version dates for precise model selection. Always use the exact model ID as shown below.

### Anthropic (Claude)
- **Claude 4** (Latest generation):
  - `claude-sonnet-4-20250514` - Balanced performance model
  - `claude-opus-4-20250514` - Most powerful for complex tasks
- **Claude 3.7**: `claude-3-7-sonnet-20250219` - Advanced reasoning
- **Claude 3.5**:
  - `claude-3-5-sonnet-20241022` - Best balance of speed and intelligence
  - `claude-3-5-haiku-20241022` - Fast and cost-effective

### Google Gemini
- **Gemini 2.5** (Latest generation):
  - `gemini-2.5-pro` - Most advanced multimodal capabilities
  - `gemini-2.5-flash` - Fast with large context window
  - `gemini-2.5-flash-lite-preview-06-17` - Most cost-effective
- **Gemini 2.0**:
  - `gemini-2.0-flash` - High performance multimodal
  - `gemini-2.0-flash-lite` - Lightweight version

### OpenAI
- **o4 series**: `o4-mini` - Advanced reasoning model
- **GPT-4.1 series**:
  - `gpt-4.1` - Latest GPT-4 with enhanced capabilities
  - `gpt-4.1-mini` - Cost-effective for most tasks
  - `gpt-4.1-nano` - Ultra-efficient version

### Mistral
> **Note:** The official Mistral adapter is under development. Requests made to Mistral models will currently be handled by a mock adapter for API compatibility testing.

- `codestral-2501` - Specialized for code generation
- `devstral-small-2505` - Compact development-focused model

### Models with Reasoning Support

Some models include advanced reasoning/thinking capabilities that enhance their problem-solving abilities:

- **Anthropic**: Claude Sonnet 4, Claude Opus 4, Claude 3.7 Sonnet
- **Google Gemini**: Gemini 2.5 Pro (always on), Gemini 2.5 Flash, Gemini 2.5 Flash-Lite Preview
- **OpenAI**: o4-mini (always on)

See the [Reasoning Mode](#reasoning-mode) section for usage details.

## Advanced Usage

### Custom Settings

```typescript
const response = await llmService.sendMessage({
  providerId: 'anthropic',
  modelId: 'claude-3-5-haiku-20241022',
  messages: [{ role: 'user', content: 'Write a haiku' }],
  settings: {
    temperature: 0.7,
    maxTokens: 100,
    topP: 0.9,
    stopSequences: ['\n\n']
  }
});
```

### Reasoning Mode

Enable advanced reasoning capabilities for supported models to get step-by-step thinking and improved problem-solving:

```typescript
// Enable reasoning with automatic token budget
const response = await llmService.sendMessage({
  providerId: 'gemini',
  modelId: 'gemini-2.5-flash',
  messages: [{ role: 'user', content: 'Solve this step by step: If a train travels 120km in 2 hours, what is its speed in m/s?' }],
  settings: {
    reasoning: {
      enabled: true  // Let the model decide how much thinking to do
    }
  }
});

// Use effort levels for quick control
const response = await llmService.sendMessage({
  providerId: 'anthropic',
  modelId: 'claude-3-7-sonnet-20250219',
  messages: [{ role: 'user', content: 'Analyze this complex problem...' }],
  settings: {
    reasoning: {
      enabled: true,
      effort: 'high'  // 'low', 'medium', or 'high'
    }
  }
});

// Set specific token budget for reasoning
const response = await llmService.sendMessage({
  providerId: 'gemini',
  modelId: 'gemini-2.5-flash-lite-preview-06-17',
  messages: [{ role: 'user', content: 'What is the square root of 144?' }],
  settings: {
    reasoning: {
      enabled: true,
      maxTokens: 5000  // Specific token budget for reasoning
    }
  }
});

// Access reasoning output (if available)
if (response.object === 'chat.completion' && response.choices[0].reasoning) {
  console.log('Model reasoning:', response.choices[0].reasoning);
  console.log('Final answer:', response.choices[0].message.content);
}
```

**Reasoning Options:**
- `enabled`: Turn reasoning on/off (some models like o4-mini and Gemini 2.5 Pro have it always on)
- `effort`: Quick presets - 'low' (20% budget), 'medium' (50%), 'high' (80%)
- `maxTokens`: Specific token budget for reasoning
- `exclude`: Set to `true` to enable reasoning but exclude it from the response

**Important Notes:**
- Reasoning tokens are billed separately and may cost more
- Some models (o4-mini, Gemini 2.5 Pro) cannot disable reasoning
- Not all models support reasoning - check the [supported models](#models-with-reasoning-support) list
- The `reasoning` field in the response contains the model's thought process (when available)

### Automatic Thinking Extraction

genai-lite can capture reasoning from any model by automatically extracting content wrapped in XML tags. When models output their thinking process in tags like `<thinking>`, the library automatically moves this content to the standardized `reasoning` field. This works with all models, providing a consistent interface for accessing model reasoning:

```typescript
// Prompt the model to think step-by-step in a <thinking> tag
const response = await llmService.sendMessage({
  providerId: 'openai',
  modelId: 'gpt-4.1',
  messages: [{
    role: 'system',
    content: 'When solving problems, first write your reasoning inside <thinking> tags, then provide the answer.'
  }, {
    role: 'user',
    content: 'Please think through this problem step by step before answering: What is 15% of 240?'
  }]
});

// If the model responds with:
// "<thinking>15% means 15/100 = 0.15. So 15% of 240 = 0.15 × 240 = 36.</thinking>The answer is 36."
// 
// The response will have:
// - response.choices[0].message.content = "The answer is 36."
// - response.choices[0].reasoning = "<!-- Extracted by genai-lite from <thinking> tag -->\n15% means 15/100 = 0.15. So 15% of 240 = 0.15 × 240 = 36."
```

This feature is enabled by default but can be customized:

```typescript
const response = await llmService.sendMessage({
  providerId: 'anthropic',
  modelId: 'claude-3-5-haiku-20241022',
  messages: [{ role: 'user', content: 'Solve this step by step...' }],
  settings: {
    thinkingExtraction: {
      enabled: false,  // Disable extraction
      tag: 'scratchpad'  // Or use a custom tag name (default: 'thinking')
    }
  }
});
```

### Provider Information

```typescript
// Get list of supported providers
const providers = await llmService.getProviders();

// Get models for a specific provider
const models = await llmService.getModels('anthropic');

// Get configured model presets
const presets = llmService.getPresets();
```

### Model Presets

genai-lite includes a comprehensive set of model presets for common use cases. You can use these defaults, extend them with your own, or replace them entirely.

#### Using Default Presets

The library ships with over 20 pre-configured presets (defined in `src/config/presets.json`), including specialized "thinking" presets for models with reasoning capabilities:

```typescript
const llmService = new LLMService(fromEnvironment);

// Get all default presets
const presets = llmService.getPresets();
// Returns presets like:
// - anthropic-claude-sonnet-4-20250514-default
// - anthropic-claude-sonnet-4-20250514-thinking (reasoning enabled)
// - openai-gpt-4.1-default
// - google-gemini-2.5-flash-thinking (reasoning enabled)
// ... and many more
```

The thinking presets automatically enable reasoning mode for supported models, making it easy to leverage advanced problem-solving capabilities without manual configuration.

#### Extending Default Presets

```typescript
import { LLMService, fromEnvironment, ModelPreset } from 'genai-lite';

const customPresets: ModelPreset[] = [
  {
    id: 'my-creative-preset',
    displayName: 'Creative Writing Assistant',
    providerId: 'openai',
    modelId: 'gpt-4.1',
    settings: {
      temperature: 0.9,
      maxTokens: 2000,
      topP: 0.95
    }
  }
];

const llmService = new LLMService(fromEnvironment, {
  presets: customPresets,
  presetMode: 'extend' // Default behavior - adds to existing presets
});
```

#### Replacing Default Presets

For applications that need full control over available presets:

```typescript
const applicationPresets: ModelPreset[] = [
  {
    id: 'app-gpt4-default',
    displayName: 'GPT-4 Standard',
    providerId: 'openai',
    modelId: 'gpt-4.1',
    settings: { temperature: 0.7 }
  },
  {
    id: 'app-claude-creative',
    displayName: 'Claude Creative',
    providerId: 'anthropic',
    modelId: 'claude-3-5-sonnet-20241022',
    settings: { temperature: 0.8, maxTokens: 4000 }
  }
];

const llmService = new LLMService(fromEnvironment, {
  presets: applicationPresets,
  presetMode: 'replace' // Use ONLY these presets, ignore defaults
});
```

### Using Presets with Messages

You can use presets directly in `sendMessage` calls:

```typescript
// Send a message using a preset
const response = await llmService.sendMessage({
  presetId: 'anthropic-claude-3-7-sonnet-20250219-thinking',
  messages: [{ role: 'user', content: 'Solve this complex problem...' }]
});

// Override preset settings
const response = await llmService.sendMessage({
  presetId: 'openai-gpt-4.1-default',
  messages: [{ role: 'user', content: 'Write a story' }],
  settings: {
    temperature: 0.9, // Override preset's temperature
    maxTokens: 3000
  }
});
```

### Creating Messages from Templates

The library provides a powerful `createMessages` method that combines template rendering, model context injection, and role tag parsing into a single, intuitive API:

```typescript
// Basic example: Create model-aware messages
const { messages, modelContext } = await llmService.createMessages({
  template: `
    <SYSTEM>
      You are a {{ thinking_enabled ? "thoughtful" : "helpful" }} assistant.
      {{ thinking_available && !thinking_enabled ? "Note: Reasoning mode is available for complex problems." : "" }}
    </SYSTEM>
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

// Advanced example: Conditional context and multi-turn conversation
const { messages } = await llmService.createMessages({
  template: `
    <SYSTEM>You are an expert code reviewer.</SYSTEM>
    {{ hasContext ? '<USER>Context: {{context}}</USER>' : '' }}
    <USER>Review this code:
```{{language}}
{{code}}
```</USER>
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

The method provides:
- **Unified API**: Single method for all prompt creation needs
- **Model Context Injection**: Automatically injects model-specific variables
- **Template Rendering**: Full support for conditionals and variable substitution
- **Role Tag Parsing**: Converts `<SYSTEM>`, `<USER>`, and `<ASSISTANT>` tags to messages

Available model context variables:
- `thinking_enabled`: Whether reasoning/thinking is enabled for this request
- `thinking_available`: Whether the model supports reasoning/thinking
- `model_id`: The resolved model ID
- `provider_id`: The resolved provider ID
- `reasoning_effort`: The reasoning effort level if specified
- `reasoning_max_tokens`: The reasoning token budget if specified

#### Advanced Features

**Dynamic Role Injection:**
Variables can dynamically inject entire role blocks, enabling flexible conversation flows:

```typescript
const { messages } = await llmService.createMessages({
  template: `
    {{ includeSystemPrompt ? '<SYSTEM>{{systemPrompt}}</SYSTEM>' : '' }}
    {{ examples ? examples : '' }}
    <USER>{{userQuery}}</USER>
  `,
  variables: {
    includeSystemPrompt: true,
    systemPrompt: 'You are an expert code reviewer.',
    examples: `
      <USER>Review this code: const x = 1</USER>
      <ASSISTANT>The variable name 'x' is not descriptive...</ASSISTANT>
    `,
    userQuery: 'Review this: const data = fetchData()'
  },
  presetId: 'anthropic-claude-3-5-sonnet-20241022'
});
```

**Combining with Thinking Extraction:**
When using models without native reasoning support, combine createMessages with thinking extraction:

```typescript
// Prompt any model to think before answering
const { messages } = await llmService.createMessages({
  template: `
    <SYSTEM>
      When solving problems, first write your step-by-step reasoning inside <thinking> tags,
      then provide your final answer.
    </SYSTEM>
    <USER>{{ question }}</USER>
  `,
  variables: { question: 'If a train travels 120km in 2 hours, what is its speed in m/s?' },
  providerId: 'openai',
  modelId: 'gpt-4.1'
});

// Send with automatic thinking extraction
const response = await llmService.sendMessage({
  providerId: 'openai',
  modelId: 'gpt-4.1',
  messages,
  settings: {
    thinkingExtraction: { enabled: true } // Default, but shown for clarity
  }
});

// Access both reasoning and answer
if (response.object === 'chat.completion') {
  console.log('Reasoning:', response.choices[0].reasoning);
  console.log('Answer:', response.choices[0].message.content);
}
```

### Error Handling

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
      break;
    default:
      console.error('Error:', response.error.message);
  }
}
```

## Using with Electron

`genai-lite` is designed to work seamlessly within an Electron application's main process, especially when paired with a secure storage solution like `genai-key-storage-lite`.

This is the recommended pattern for both new Electron apps and for migrating from older, integrated versions.

### Example with `genai-key-storage-lite`

Here’s how to create a custom `ApiKeyProvider` that uses `genai-key-storage-lite` to securely retrieve API keys.

```typescript
// In your Electron app's main process (e.g., main.ts)
import { app } from 'electron';
import { ApiKeyServiceMain } from 'genai-key-storage-lite';
import { LLMService, type ApiKeyProvider } from 'genai-lite';

// 1. Initialize Electron's secure key storage service
const apiKeyService = new ApiKeyServiceMain(app.getPath("userData"));

// 2. Create a custom ApiKeyProvider that uses the secure storage
const electronKeyProvider: ApiKeyProvider = async (providerId) => {
  try {
    // Use withDecryptedKey to securely access the key only when needed.
    // The key is passed to the callback and its result is returned.
    return await apiKeyService.withDecryptedKey(providerId, async (key) => key);
  } catch {
    // If key is not found or decryption fails, return null.
    // LLMService will handle this as an authentication error.
    return null;
  }
};

// 3. Initialize the genai-lite service with our custom provider
const llmService = new LLMService(electronKeyProvider);

// Now you can use llmService anywhere in your main process.
```

## TypeScript Support

genai-lite is written in TypeScript and provides comprehensive type definitions:

```typescript
import type { 
  LLMChatRequest,
  LLMChatRequestWithPreset,
  LLMResponse,
  LLMFailureResponse,
  LLMSettings,
  LLMReasoningSettings,
  LLMThinkingExtractionSettings,
  ApiKeyProvider,
  ModelPreset,
  LLMServiceOptions,
  PresetMode,
  ModelContext
} from 'genai-lite';
```

## Utilities

genai-lite includes useful utilities for working with LLMs, available through the `genai-lite/prompting` subpath:

### Token Counting

Count the number of tokens in a string using OpenAI's tiktoken library:

```typescript
import { countTokens } from 'genai-lite/prompting';

const text = 'Hello, this is a sample text for token counting.';
const tokenCount = countTokens(text); // Uses gpt-4 tokenizer by default
console.log(`Token count: ${tokenCount}`);

// Specify a different model's tokenizer
const gpt35Tokens = countTokens(text, 'gpt-3.5-turbo');
```

**Note:** The `countTokens` function uses the `js-tiktoken` library and supports all models that have tiktoken encodings.

### Smart Text Preview

Generate intelligent previews of large text blocks that preserve context:

```typescript
import { getSmartPreview } from 'genai-lite/prompting';

const largeCodeFile = `
function calculateTotal(items) {
  let total = 0;
  
  for (const item of items) {
    total += item.price * item.quantity;
  }
  
  return total;
}

function applyDiscount(total, discountPercent) {
  return total * (1 - discountPercent / 100);
}

// ... many more lines of code ...
`;

// Get a preview that shows at least 5 lines but extends to a logical break point
const preview = getSmartPreview(largeCodeFile, { 
  minLines: 5, 
  maxLines: 10 
});
```

The `getSmartPreview` function intelligently truncates text:
- Returns the full content if it's shorter than `maxLines`
- Shows at least `minLines` of content
- Extends to the next blank line (up to `maxLines`) to avoid cutting off in the middle of a code block or paragraph
- Adds `... (content truncated)` when content is truncated

### Example: Building Token-Aware Prompts

Combine these utilities to build prompts that fit within model context windows:

```typescript
import { LLMService, fromEnvironment } from 'genai-lite';
import { countTokens, getSmartPreview } from 'genai-lite/prompting';

const llm = new LLMService(fromEnvironment);

// Large source file
const sourceCode = await fs.readFile('large-file.js', 'utf-8');

// Get a smart preview that fits within token budget
let preview = getSmartPreview(sourceCode, { minLines: 20, maxLines: 50 });
let tokenCount = countTokens(preview, 'gpt-4.1-mini');

// Adjust preview if needed to fit token budget
const maxTokens = 4000;
if (tokenCount > maxTokens) {
  preview = getSmartPreview(sourceCode, { minLines: 10, maxLines: 30 });
}

// Send to LLM
const response = await llm.sendMessage({
  providerId: 'openai',
  modelId: 'gpt-4.1-mini',
  messages: [
    { 
      role: 'user', 
      content: `Analyze this code:\n\n${preview}` 
    }
  ]
});
```

### Template Engine

Generate dynamic prompts and content using the built-in template engine that supports variable substitution and conditional logic:

```typescript
import { renderTemplate } from 'genai-lite/prompting';

// Simple variable substitution
const greeting = renderTemplate('Hello, {{ name }}!', { name: 'World' });
// Result: "Hello, World!"

// Conditional rendering with ternary syntax
const prompt = renderTemplate(
  'Analyze this {{ language }} code:\n{{ hasContext ? `Context: {{context}}\n` : `` }}```\n{{ code }}\n```',
  {
    language: 'TypeScript',
    hasContext: true,
    context: 'React component for user authentication',
    code: 'export const Login = () => { ... }'
  }
);
// Result includes the context line when hasContext is true

// Using logical operators in conditions
const accessControl = renderTemplate(
  '{{ isAuthenticated && !isBanned ? `Welcome {{username}}!` : `Access denied` }}',
  { isAuthenticated: true, isBanned: false, username: 'Alice' }
);
// Result: "Welcome Alice!"

const notification = renderTemplate(
  '{{ hasEmail || hasPhone ? `Contact info available` : `No contact info` }}',
  { hasEmail: false, hasPhone: true }
);
// Result: "Contact info available"

// Complex template with multiple conditionals
const complexTemplate = `
System: You are a {{ role }} assistant.
{{ hasExpertise ? `Expertise: {{expertise}}` : `General knowledge assistant` }}

Task: {{ task }}
{{ hasFiles ? `
Files to analyze:
{{ fileList }}` : `` }}
{{ requiresOutput ? `
Expected output format:
{{ outputFormat }}` : `` }}
`;

const result = renderTemplate(complexTemplate, {
  role: 'coding',
  hasExpertise: true,
  expertise: 'TypeScript, React, Node.js',
  task: 'Review the code for best practices',
  hasFiles: true,
  fileList: '- src/index.ts\n- src/prompting/template.ts',
  requiresOutput: false
});
```

Template syntax supports:
- **Simple substitution**: `{{ variableName }}`
- **Ternary conditionals**: `{{ condition ? `true result` : `false result` }}`
- **Logical operators in conditions**:
  - NOT: `{{ !isDisabled ? `enabled` : `disabled` }}`
  - AND: `{{ hasPermission && isActive ? `show` : `hide` }}`
  - OR: `{{ isAdmin || isOwner ? `allow` : `deny` }}`
  - Combined: `{{ !isDraft && isPublished ? `visible` : `hidden` }}`
- **Nested variables**: `{{ show ? `Name: {{name}}` : `Anonymous` }}`
- **Multi-line strings**: Use backticks to preserve formatting
- **Intelligent newline handling**: Empty results remove trailing newlines

Note: Logical operators support up to 2 operands and don't support parentheses or mixing && and ||.

### Example: Building Dynamic LLM Prompts

Combine the template engine with other utilities for powerful prompt generation:

```typescript
import { LLMService, fromEnvironment } from 'genai-lite';
import { renderTemplate, countTokens } from 'genai-lite/prompting';

const llm = new LLMService(fromEnvironment);

// Define a reusable prompt template
const codeReviewTemplate = `
You are an expert {{ language }} developer.

{{ hasGuidelines ? `Follow these coding guidelines:
{{ guidelines }}

` : `` }}Review the following code:
\`\`\`{{ language }}
{{ code }}
\`\`\`

{{ hasFocus ? `Focus on: {{ focusAreas }}` : `Provide a comprehensive review covering all aspects.` }}
`;

// Render the prompt with specific values
const prompt = renderTemplate(codeReviewTemplate, {
  language: 'TypeScript',
  hasGuidelines: true,
  guidelines: '- Use functional components\n- Prefer composition over inheritance',
  code: sourceCode,
  hasFocus: true,
  focusAreas: 'performance optimizations and error handling'
});

// Check token count before sending
const tokenCount = countTokens(prompt, 'gpt-4.1-mini');
console.log(`Prompt uses ${tokenCount} tokens`);

// Send to LLM
const response = await llm.sendMessage({
  providerId: 'openai',
  modelId: 'gpt-4.1-mini',
  messages: [{ role: 'user', content: prompt }]
});
```

### Prompt Engineering Utilities

genai-lite provides powerful utilities for working with prompts and responses:

#### Creating Messages from Templates

The recommended way to create messages is using `LLMService.createMessages`, which provides a unified API for template rendering, model context injection, and role tag parsing:

```typescript
// Basic multi-turn conversation
const { messages } = await llmService.createMessages({
  template: `
    <SYSTEM>You are a helpful assistant specialized in {{expertise}}.</SYSTEM>
    <USER>Help me with {{task}}</USER>
    <ASSISTANT>I'll help you with {{task}}. Let me analyze the requirements...</ASSISTANT>
    <USER>Can you provide more details?</USER>
  `,
  variables: {
    expertise: 'TypeScript and React',
    task: 'building a custom hook'
  },
  presetId: 'openai-gpt-4.1-default' // Optional: adds model context
});

// Advanced: Leverage model context for adaptive prompts
const { messages, modelContext } = await llmService.createMessages({
  template: `
    <SYSTEM>
      You are a {{ thinking_enabled ? 'analytical problem solver' : 'quick helper' }}.
      {{ model_id.includes('claude') ? 'Use your advanced reasoning capabilities.' : '' }}
    </SYSTEM>
    <USER>
      {{ thinking_enabled ? 'Please solve this step-by-step:' : 'Please answer:' }}
      {{ question }}
    </USER>
  `,
  variables: { question: 'What causes the seasons on Earth?' },
  presetId: 'anthropic-claude-3-7-sonnet-20250219-thinking'
});

console.log('Model context:', modelContext);
// Output: { thinking_enabled: true, thinking_available: true, model_id: 'claude-3-7-sonnet-20250219', ... }
```

**Low-Level Utilities:**
For cases where you need template parsing without model context:

```typescript
import { parseRoleTags, renderTemplate } from 'genai-lite/prompting';

// Render variables first
const rendered = renderTemplate(
  '<SYSTEM>You are a {{role}} assistant.</SYSTEM><USER>{{query}}</USER>',
  { role: 'helpful', query: 'What is TypeScript?' }
);

// Then parse role tags
const messages = parseRoleTags(rendered);
// Result: [{ role: 'system', content: 'You are a helpful assistant.' }, { role: 'user', content: 'What is TypeScript?' }]
```

#### Extracting Random Variables for Few-Shot Learning

Implement few-shot prompting by extracting and shuffling examples:

```typescript
import { extractRandomVariables, renderTemplate } from 'genai-lite/prompting';

// Define examples in your template
const examplesTemplate = `
<RANDOM_INPUT>User: Translate "hello" to Spanish</RANDOM_INPUT>
<RANDOM_OUTPUT>Assistant: The translation of "hello" to Spanish is "hola".</RANDOM_OUTPUT>

<RANDOM_INPUT>User: Translate "goodbye" to French</RANDOM_INPUT>
<RANDOM_OUTPUT>Assistant: The translation of "goodbye" to French is "au revoir".</RANDOM_OUTPUT>

<RANDOM_INPUT>User: Translate "thank you" to German</RANDOM_INPUT>
<RANDOM_OUTPUT>Assistant: The translation of "thank you" to German is "danke".</RANDOM_OUTPUT>
`;

// Extract random variables (shuffled each time)
const variables = extractRandomVariables(examplesTemplate, { maxPerTag: 2 });

// Use in a prompt template
const promptTemplate = `
You are a translation assistant. Here are some examples:

{{ random_input_1 }}
{{ random_output_1 }}

{{ random_input_2 }}
{{ random_output_2 }}

Now translate: "{{word}}" to {{language}}
`;

const prompt = renderTemplate(promptTemplate, {
  ...variables,
  word: 'please',
  language: 'Italian'
});
```

#### Parsing Structured LLM Responses

Extract structured data from LLM responses using custom tags:

```typescript
import { parseStructuredContent } from 'genai-lite/prompting';

// Example LLM response with structured output
const llmResponse = `
Let me analyze this code for you.

<ANALYSIS>
The code has good structure but could benefit from:
1. Better error handling in the API calls
2. Memoization for expensive computations
3. More descriptive variable names
</ANALYSIS>

<SUGGESTIONS>
- Add try-catch blocks around async operations
- Use React.memo() for the expensive component
- Rename 'data' to 'userData' for clarity
</SUGGESTIONS>

<REFACTORED_CODE>
const UserProfile = React.memo(({ userId }) => {
  const [userData, setUserData] = useState(null);
  
  useEffect(() => {
    fetchUserData(userId)
      .then(setUserData)
      .catch(error => console.error('Failed to load user:', error));
  }, [userId]);
  
  return userData ? <Profile data={userData} /> : <Loading />;
});
</REFACTORED_CODE>
`;

// Parse the structured content
const parsed = parseStructuredContent(llmResponse, [
  'ANALYSIS',
  'SUGGESTIONS',
  'REFACTORED_CODE'
]);

console.log(parsed.ANALYSIS);     // The analysis text
console.log(parsed.SUGGESTIONS);  // The suggestions text
console.log(parsed.REFACTORED_CODE); // The refactored code
```

These utilities enable:
- **Structured Conversations**: Build multi-turn conversations from templates with model context awareness
- **Few-Shot Learning**: Randomly sample examples to improve AI responses
- **Reliable Output Parsing**: Extract specific sections from AI responses
- **Automatic Thinking Extraction**: Capture reasoning from any model using XML tags
- **Template Reusability**: Define templates once, use with different variables
- **Type Safety**: Full TypeScript support with LLMMessage types

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request. For major changes, please open an issue first to discuss what you would like to change.

### Development

```bash
# Install dependencies
npm install

# Build the project
npm run build

# Run tests (when available)
npm test
```

### End-to-End Testing

The project includes an end-to-end test suite that makes real API calls to providers. These tests are separate from the main unit test suite and are not run in CI by default.

To run these tests locally, you must first provide API keys as environment variables with the `E2E_` prefix:

```bash
export E2E_OPENAI_API_KEY="sk-..."
export E2E_ANTHROPIC_API_KEY="sk-ant-..."
export E2E_GEMINI_API_KEY="AIza..."
```

Then, run the E2E test script:

```bash
npm run test:e2e
```

The tests will automatically skip any provider for which an API key is not found.

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

Originally developed as part of the Athanor project, genai-lite has been extracted and made standalone to benefit the wider developer community.