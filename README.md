# genai-lite

A lightweight, portable Node.js/TypeScript library providing a unified interface for interacting with multiple Generative AI providers—both cloud-based (OpenAI, Anthropic, Google Gemini, Mistral, OpenRouter) and local (llama.cpp, stable-diffusion.cpp). Supports both LLM chat and AI image generation.

## Features

- 🔌 **Unified API** - Single interface for multiple AI providers
- 🏠 **Local & Cloud Models** - Run models locally with llama.cpp or use cloud APIs
- ⚡ **Text Streaming** - Async iterable token deltas for OpenAI, Anthropic, Gemini, Mistral, OpenRouter, and llama.cpp
- 🖼️ **Image Generation** - First-class support for AI image generation (OpenAI, local diffusion)
- 🔐 **Flexible API Key Management** - Bring your own key storage solution
- 📦 **Zero Electron Dependencies** - Works in any Node.js environment
- 🎯 **TypeScript First** - Full type safety and IntelliSense support
- ⚡ **Lightweight** - Minimal dependencies, focused functionality
- 🛡️ **Provider Normalization** - Consistent responses across different AI APIs
- 🧠 **Local Reasoning Toggle** - Turn thinking on/off for detected GGUF models (Qwen 3.5-class, Gemma 4, and more) with vendor-tuned sampling defaults
- 🔁 **Built-in Reliability** - Automatic retries with backoff/`Retry-After`, per-request timeouts, and abort signals — for both LLM and image generation (local diffusion additionally gets server-side cancel and is never blind-retried)
- 🎨 **Configurable Model Presets** - Built-in presets with full customization options
- 🎭 **Template Engine** - Sophisticated templating with conditionals and variable substitution
- 📊 **Configurable Logging** - Debug mode, custom loggers (pino, winston), and silent mode for tests

## Installation

```bash
npm install genai-lite
```

Set API keys as environment variables:

```bash
export OPENAI_API_KEY=sk-...
export ANTHROPIC_API_KEY=sk-ant-...
export GEMINI_API_KEY=AIza...
```

## Quick Start

### Cloud Providers (OpenAI, Anthropic, Gemini, Mistral)

```typescript
import { LLMService, fromEnvironment } from 'genai-lite';

const llmService = new LLMService(fromEnvironment);

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
}
```

### Local Models (llama.cpp)

```typescript
import { LLMService } from 'genai-lite';

// Start llama.cpp server first: llama-server -m /path/to/model.gguf --port 8080
const llmService = new LLMService(async () => 'not-needed');

const response = await llmService.sendMessage({
  providerId: 'llamacpp',
  modelId: 'llamacpp',  // Generic ID for whatever model is loaded
  messages: [
    { role: 'system', content: 'You are a helpful assistant.' },
    { role: 'user', content: 'Explain quantum computing briefly.' }
  ]
});

if (response.object === 'chat.completion') {
  console.log(response.choices[0].message.content);
}
```

### Streaming Text

```typescript
import { LLMService } from 'genai-lite';

const llmService = new LLMService(async () => 'not-needed');

for await (const event of llmService.streamMessage({
  providerId: 'llamacpp',
  modelId: 'llamacpp',
  messages: [{ role: 'user', content: 'Say hello in five words.' }],
  settings: { maxTokens: 32 }
})) {
  if (event.type === 'content_delta') {
    process.stdout.write(event.delta);
  } else if (event.type === 'reasoning_delta') {
    process.stderr.write(event.delta);
  } else if (event.type === 'complete') {
    console.log('\nTokens:', event.response.usage?.total_tokens);
  } else if (event.type === 'error') {
    console.error(event.error.error.message);
  }
}
```

Streaming is implemented for all text providers: `openai`, `anthropic`, `gemini`, `mistral`, `openrouter`, and `llamacpp`. The final `complete.response` event contains the same normalized response shape returned by `sendMessage()`.

### Image Generation

```typescript
import { ImageService, fromEnvironment } from 'genai-lite';

const imageService = new ImageService(fromEnvironment);

const result = await imageService.generateImage({
  providerId: 'openai-images',
  modelId: 'gpt-image-1-mini',
  prompt: 'A serene mountain lake at sunrise, photorealistic',
  settings: {
    width: 1024,
    height: 1024,
    quality: 'high'
  }
});

if (result.object === 'image.result') {
  require('fs').writeFileSync('output.png', result.data[0].data);
}
```

## Documentation

Comprehensive documentation is available in the **[`genai-lite-docs`](./genai-lite-docs/index.md)** folder.

### Getting Started
- **[Documentation Hub](./genai-lite-docs/index.md)** - Navigation and overview
- **[Core Concepts](./genai-lite-docs/core-concepts.md)** - API keys, presets, settings, errors

### API Reference
- **[LLM Service](./genai-lite-docs/llm-service.md)** - Text generation and chat
- **[Image Service](./genai-lite-docs/image-service.md)** - Image generation (cloud and local)
- **[llama.cpp Integration](./genai-lite-docs/llamacpp-integration.md)** - Local LLM inference

### Utilities & Advanced
- **[Prompting Utilities](./genai-lite-docs/prompting-utilities.md)** - Template engine, token counting, content parsing
- **[Logging](./genai-lite-docs/logging.md)** - Configure logging and debugging
- **[TypeScript Reference](./genai-lite-docs/typescript-reference.md)** - Type definitions

### Provider Reference
- **[Providers & Models](./genai-lite-docs/providers-and-models.md)** - Supported providers and models

### Examples & Help
- **[Example: Chat Demo](./genai-lite-docs/example-chat-demo.md)** - Reference implementation for chat applications
- **[Example: Image Demo](./genai-lite-docs/example-image-demo.md)** - Reference implementation for image generation applications
- **[Troubleshooting](./genai-lite-docs/troubleshooting.md)** - Common issues and solutions

## Supported Providers

### LLM Providers
- **OpenAI** - GPT-5 (5.2, 5.1, mini, nano), GPT-4.1, o4-mini
- **Anthropic** - Claude 4.5 (Opus, Sonnet, Haiku), Claude 4, Claude 3.7, Claude 3.5
- **Google Gemini** - Gemini 3 (Pro, Flash preview), Gemini 2.5, Gemma 3 & 4 (free)
- **Mistral** - Codestral, Devstral
- **OpenRouter** - Unified gateway to 100+ models (unknown models assumed reasoning-capable)
- **llama.cpp** - Run any GGUF model locally (no API keys required); streaming and local reasoning toggle for detected models

### Image Providers
- **OpenAI Images** - gpt-image-1, dall-e-3, dall-e-2
- **genai-electron** - Local Stable Diffusion models

See **[Providers & Models](./genai-lite-docs/providers-and-models.md)** for complete model listings and capabilities.

## API Key Management

genai-lite uses a flexible API key provider pattern. Use the built-in `fromEnvironment` provider or create your own:

```typescript
import { ApiKeyProvider, LLMService } from 'genai-lite';

const myKeyProvider: ApiKeyProvider = async (providerId: string) => {
  const key = await mySecureStorage.getKey(providerId);
  return key || null;
};

const llmService = new LLMService(myKeyProvider);
```

See **[Core Concepts](./genai-lite-docs/core-concepts.md#api-key-management)** for detailed examples including Electron integration.

## Logging Configuration

Control logging verbosity via environment variable or service options:

```bash
# Environment variable (applies to all services)
export GENAI_LITE_LOG_LEVEL=debug  # Options: silent, error, warn, info, debug
```

```typescript
// Per-service configuration
const llmService = new LLMService(fromEnvironment, {
  logLevel: 'debug',        // Override env var
  logger: customPinoLogger  // Inject pino/winston/etc.
});
```

See **[Logging](./genai-lite-docs/logging.md)** for custom logger integration and testing patterns.

## Example Applications

The library includes two complete demo applications showcasing all features:

- **[chat-demo](examples/chat-demo)** - Interactive chat application with all LLM providers, template rendering, and advanced features
- **[image-gen-demo](examples/image-gen-demo)** - Interactive image generation UI with OpenAI and local diffusion support

Both demos are production-ready React + Express applications that serve as reference implementations and testing environments. See **[Example: Chat Demo](./genai-lite-docs/example-chat-demo.md)** and **[Example: Image Demo](./genai-lite-docs/example-image-demo.md)** for detailed documentation.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request. For major changes, please open an issue first to discuss what you would like to change.

### Development

```bash
npm install
npm run build
npm test
```

See **[Troubleshooting](./genai-lite-docs/troubleshooting.md)** for information about E2E tests and development workflows.

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

Originally developed as part of the Athanor project, genai-lite has been extracted and made standalone to benefit the wider developer community.
