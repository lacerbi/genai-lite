# genai-lite

A lightweight, portable Node.js/TypeScript library providing a unified interface for interacting with multiple Generative AI providers (OpenAI, Anthropic, Google Gemini, Mistral, and more).

## Features

- 🔌 **Unified API** - Single interface for multiple AI providers
- 🔐 **Flexible API Key Management** - Bring your own key storage solution
- 📦 **Zero Electron Dependencies** - Works in any Node.js environment
- 🎯 **TypeScript First** - Full type safety and IntelliSense support
- ⚡ **Lightweight** - Minimal dependencies, focused functionality
- 🛡️ **Provider Normalization** - Consistent responses across different AI APIs

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
  modelId: 'gpt-4',
  messages: [
    { role: 'system', content: 'You are a helpful assistant.' },
    { role: 'user', content: 'Hello, how are you?' }
  ]
});

if (response.object === 'text_completion') {
  console.log(response.content);
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

### OpenAI
- GPT-4 models: `gpt-4`, `gpt-4-turbo-preview`, `gpt-4o`, `gpt-4o-mini`
- GPT-3.5 models: `gpt-3.5-turbo`

### Anthropic (Claude)
- Claude 3 models: `claude-3-opus`, `claude-3-sonnet`, `claude-3-haiku`
- Claude 3.5 models: `claude-3.5-sonnet`, `claude-3.5-haiku`

### Google Gemini
- Gemini models: `gemini-1.5-pro`, `gemini-1.5-flash`, `gemini-2.0-flash`

### Mistral
- Mistral models: `mistral-tiny`, `mistral-small`, `mistral-medium`

## Advanced Usage

### Custom Settings

```typescript
const response = await llmService.sendMessage({
  providerId: 'openai',
  modelId: 'gpt-4',
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
```

### Error Handling

```typescript
const response = await llmService.sendMessage({
  providerId: 'openai',
  modelId: 'gpt-4',
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

## Migration from Electron

If you're migrating from an Electron app using the previous version:

```typescript
// Before (Electron-specific)
import { ApiKeyServiceMain } from 'genai-key-storage-lite';
const llmService = new LLMServiceMain(apiKeyService);

// After (Portable)
import { LLMService, ApiKeyProvider } from 'genai-lite';
const keyProvider: ApiKeyProvider = async (providerId) => {
  // Your Electron-specific key retrieval logic
  return await myElectronKeyStore.getKey(providerId);
};
const llmService = new LLMService(keyProvider);
```

## TypeScript Support

genai-lite is written in TypeScript and provides comprehensive type definitions:

```typescript
import type { 
  LLMChatRequest,
  LLMResponse,
  LLMFailureResponse,
  LLMSettings,
  ApiKeyProvider
} from 'genai-lite';
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