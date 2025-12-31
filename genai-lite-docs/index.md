# genai-lite Documentation

Complete documentation for genai-lite - A lightweight, portable TypeScript library for interacting with multiple Generative AI providers.

**Version**: Latest

## Navigation

### Getting Started
- [Overview](#overview) - What is genai-lite?
- [Installation](#installation) - Setup and dependencies
- [Quick Start: LLM (Cloud)](#quick-start-llm-cloud) - First chat with cloud providers
- [Quick Start: LLM (Local)](#quick-start-llm-local) - First chat with llama.cpp
- [Quick Start: Image (Cloud)](#quick-start-image-generation-cloud) - Generate images with OpenAI
- [Quick Start: Image (Local)](#quick-start-image-generation-local) - Generate images with local diffusion
- [What's Next?](#whats-next) - Where to go from here

### Core Concepts
- **[Core Concepts](core-concepts.md)** - API keys, presets, settings, errors

### API Reference
- **[LLM Service](llm-service.md)** - Text generation and chat
- **[Image Service](image-service.md)** - Image generation (cloud and local)
- **[llama.cpp Integration](llamacpp-integration.md)** - Local LLM inference

### Utilities & Advanced
- **[Prompting Utilities](prompting-utilities.md)** - Template engine, token counting, content parsing
- **[Logging](logging.md)** - Configure logging and debugging
- **[TypeScript Reference](typescript-reference.md)** - Type definitions

### Provider Reference
- **[Providers & Models](providers-and-models.md)** - Supported providers and models

### Examples & Help
- **[Example: Chat Demo](example-chat-demo.md)** - Reference implementation for chat applications
- **[Example: Image Demo](example-image-demo.md)** - Reference implementation for image generation applications
- **[Troubleshooting](troubleshooting.md)** - Common issues and solutions

---

## Overview

genai-lite is a lightweight TypeScript library providing a unified interface for LLM chat and AI image generation across multiple providers (cloud and local).

**Core Services**:
- **LLMService** - Text generation (OpenAI, Anthropic, Gemini, Mistral, llama.cpp)
- **ImageService** - Image generation (OpenAI Images, genai-electron diffusion)

**Key Features**: Unified API, TypeScript-first, flexible API key management, model presets, template engine, local model support (llama.cpp, stable-diffusion.cpp).

See [Core Concepts](core-concepts.md) for patterns like ApiKeyProvider, preset system, settings hierarchy, and error handling.

---

## Installation

Install via npm:

```bash
npm install genai-lite
```

### Environment Setup (Cloud Providers)

For cloud providers, set API keys as environment variables:

```bash
# OpenAI
export OPENAI_API_KEY=sk-...

# Anthropic
export ANTHROPIC_API_KEY=sk-ant-...

# Google Gemini
export GEMINI_API_KEY=AIza...

# Mistral
export MISTRAL_API_KEY=...
```

**Note:** You can also use `.env` files with the `dotenv` package instead of exporting manually.

### Local Models (No API Keys)

For local models via llama.cpp or genai-electron, no API keys are needed:

```bash
# llama.cpp base URL (optional, default: http://localhost:8080)
export LLAMACPP_API_BASE_URL=http://localhost:8080

# genai-electron base URL (optional, default: http://localhost:8081)
export GENAI_ELECTRON_IMAGE_BASE_URL=http://localhost:8081
```

### Logging Configuration (Optional)

Control genai-lite's logging verbosity:

```bash
# Default is 'warn' - errors and warnings only
export GENAI_LITE_LOG_LEVEL=debug  # Enable verbose logging
export GENAI_LITE_LOG_LEVEL=silent # Suppress all logs
```

Valid levels: `silent`, `error`, `warn`, `info`, `debug`. See [Logging](logging.md) for details.

See [Providers & Models](providers-and-models.md) for provider-specific setup details.

---

## Quick Start: LLM (Cloud)

Send a chat message to a cloud provider (OpenAI, Anthropic, Gemini):

```typescript
import { LLMService, fromEnvironment } from 'genai-lite';

// Create service with environment variable API key provider
const llmService = new LLMService(fromEnvironment);

const response = await llmService.sendMessage({
  providerId: 'openai',
  modelId: 'gpt-4.1-mini',
  messages: [
    { role: 'system', content: 'You are a helpful assistant.' },
    { role: 'user', content: 'Hello, how are you?' }
  ]
});

// Type-safe response handling
if (response.object === 'chat.completion') {
  console.log(response.choices[0].message.content);
} else {
  console.error('Error:', response.error.message);
}
```

See [LLM Service](llm-service.md) for more details.

---

## Quick Start: LLM (Local)

Run models locally via llama.cpp (no API keys needed):

```typescript
import { LLMService } from 'genai-lite';

// Start llama.cpp server first:
// llama-server -m /path/to/model.gguf --port 8080

// Create service (no API key needed for local models)
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

See [llama.cpp Integration](llamacpp-integration.md) for setup and advanced features.

---

## Quick Start: Image Generation (Cloud)

Generate images with OpenAI Images:

```typescript
import { ImageService, fromEnvironment } from 'genai-lite';

// Create service with API key provider
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
} else {
  console.error('Error:', result.error.message);
}
```

See [Image Service](image-service.md) for more details.

---

## Quick Start: Image Generation (Local)

Generate images locally with genai-electron diffusion:

```typescript
import { ImageService } from 'genai-lite';

// Start genai-electron diffusion server on port 8081

// Create service (no API key needed for local generation)
const imageService = new ImageService(async () => 'not-needed');

const result = await imageService.generateImage({
  providerId: 'genai-electron-images',
  modelId: 'stable-diffusion',
  prompt: 'A majestic dragon soaring through clouds, highly detailed',
  settings: {
    width: 1024,
    height: 1024,
    diffusion: {
      negativePrompt: 'blurry, low quality, distorted',
      steps: 30,
      cfgScale: 7.5,
      sampler: 'dpm++2m',
      seed: 42,  // For reproducible results
      onProgress: (progress) => {
        console.log(`${progress.stage}: ${progress.percentage?.toFixed(1)}%`);
      }
    }
  }
});

if (result.object === 'image.result') {
  console.log('Generated image with seed:', result.data[0].seed);
  require('fs').writeFileSync('dragon.png', result.data[0].data);
}
```

See [Image Service](image-service.md) for diffusion settings and progress callbacks.

---

## What's Next?

**Core Guides**:
- [LLM Service](llm-service.md) - Reasoning mode, templates, presets
- [Image Service](image-service.md) - Progress callbacks, batch generation
- [llama.cpp Integration](llamacpp-integration.md) - Local models setup
- [Prompting Utilities](prompting-utilities.md) - Template engine, token counting
- [Providers & Models](providers-and-models.md) - All providers and models

**Examples**:
- [Chat Demo](example-chat-demo.md) - Integration patterns for chat apps
- [Image Demo](example-image-demo.md) - Integration patterns for image apps

**Help**:
- [Troubleshooting](troubleshooting.md) - Common issues
- [TypeScript Reference](typescript-reference.md) - Type definitions

---

## Additional Resources

**Repository**: [genai-lite on GitHub](https://github.com/yourusername/genai-lite)

**Examples**:
- `examples/chat-demo/` - Interactive chat application
- `examples/image-gen-demo/` - Interactive image generation application

**Contributing**: See the main repository README for contribution guidelines.

**License**: MIT
