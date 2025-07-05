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

## Installation

```bash
npm install genai-lite
```

## Quick Start

```typescript
import { LLMService, fromEnvironment } from 'genai-lite';

// Create service with environment variable API key provider
const llmService = new LLMService(fromEnvironment);

// Send a message to OpenAI
const response = await llmService.sendMessage({
  providerId: 'openai',
  modelId: 'gpt-4.1-mini',
  messages: [
    { role: 'system', content: 'You are a helpful assistant.' },
    { role: 'user', content: 'Hello, how are you?' }
  ]
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

genai-lite includes a built-in set of model presets for common use cases. You can use these defaults, extend them with your own, or replace them entirely.

#### Using Default Presets

```typescript
const llmService = new LLMService(fromEnvironment);

// Get all default presets
const presets = llmService.getPresets();
// Returns presets like:
// - anthropic-claude-3-5-sonnet-20241022-default
// - openai-gpt-4.1-default
// - google-gemini-2.5-pro
// ... and more
```

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
  LLMResponse,
  LLMFailureResponse,
  LLMSettings,
  ApiKeyProvider,
  ModelPreset,
  LLMServiceOptions,
  PresetMode
} from 'genai-lite';
```

## Utilities

genai-lite includes useful utilities for working with LLMs, available through the `genai-lite/utils` subpath:

### Token Counting

Count the number of tokens in a string using OpenAI's tiktoken library:

```typescript
import { countTokens } from 'genai-lite/utils';

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
import { getSmartPreview } from 'genai-lite/utils';

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
import { countTokens, getSmartPreview } from 'genai-lite/utils';

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

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

Originally developed as part of the Athanor project, genai-lite has been extracted and made standalone to benefit the wider developer community.