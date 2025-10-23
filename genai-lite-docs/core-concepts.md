# Core Concepts

Fundamental patterns and concepts used across genai-lite's LLM and Image services.

## Contents

- [Overview](#overview)
- [API Key Management](#api-key-management)
- [Preset System](#preset-system)
- [Settings Hierarchy](#settings-hierarchy)
- [Error Handling](#error-handling)
- [Provider Architecture](#provider-architecture)
- [Related Documentation](#related-documentation)

## Overview

genai-lite uses several core patterns across both LLM and Image generation services to provide a consistent, flexible API:

- **API Key Provider Pattern**: Flexible authentication supporting any storage backend
- **Preset System**: Reusable model configurations with extend/replace modes
- **Settings Hierarchy**: Clear precedence rules for configuration merging
- **Error Envelopes**: Consistent error structure across all providers
- **Adapter Pattern**: Provider-specific implementations behind a unified interface

These concepts are referenced throughout the documentation. Understanding them will help you use the library effectively.

## API Key Management

### The ApiKeyProvider Pattern

```typescript
type ApiKeyProvider = (providerId: string) => Promise<string | null>
```

This function accepts a provider ID and returns the API key (or `null` if not found).

### Built-in: Environment Variables

The simplest approach uses the `fromEnvironment` provider:

```typescript
import { LLMService, ImageService, fromEnvironment } from 'genai-lite';

// Expects environment variables like:
// OPENAI_API_KEY=sk-...
// ANTHROPIC_API_KEY=sk-ant-...
// GEMINI_API_KEY=...

const llmService = new LLMService(fromEnvironment);
const imageService = new ImageService(fromEnvironment);
```

**Environment variable names** match the provider ID in uppercase:
- `openai` → `OPENAI_API_KEY`
- `anthropic` → `ANTHROPIC_API_KEY`
- `gemini` → `GEMINI_API_KEY`
- `mistral` → `MISTRAL_API_KEY`
- `openai-images` → `OPENAI_API_KEY` (same as openai)

**Optional: Override base URLs** via environment variables:
- `OPENAI_API_BASE_URL` - Override OpenAI endpoint (default: `https://api.openai.com/v1`)
- `LLAMACPP_API_BASE_URL` - Local llama.cpp server (default: `http://localhost:8080`)
- `GENAI_ELECTRON_IMAGE_BASE_URL` - Local diffusion server (default: `http://localhost:8081`)

### Custom API Key Providers

Create your own provider to integrate with databases, vaults, or key management systems:

```typescript
import { ApiKeyProvider, LLMService } from 'genai-lite';

const myKeyProvider: ApiKeyProvider = async (providerId: string) => {
  const key = await mySecureStorage.getKey(providerId);
  return key || null;
};

const llmService = new LLMService(myKeyProvider);
```

### Electron Integration Example

Using genai-lite in an Electron application with `genai-key-storage-lite`:

```typescript
import { app } from 'electron';
import { ApiKeyServiceMain } from 'genai-key-storage-lite';
import { LLMService, type ApiKeyProvider } from 'genai-lite';

const apiKeyService = new ApiKeyServiceMain(app.getPath("userData"));

const electronKeyProvider: ApiKeyProvider = async (providerId) => {
  try {
    return await apiKeyService.withDecryptedKey(providerId, async (key) => key);
  } catch {
    return null;
  }
};

const llmService = new LLMService(electronKeyProvider);
```

### Local Providers (No API Key Required)

Local providers (llama.cpp, genai-electron) don't require API keys:

```typescript
import { LLMService, ImageService } from 'genai-lite';

const llmService = new LLMService(async () => 'not-needed');
const imageService = new ImageService(async () => 'not-needed');
```

## Preset System

Presets combine provider, model, and settings for common use cases.

### Using Presets

```typescript
const llmPresets = llmService.getPresets();
const imagePresets = imageService.getPresets();

// Use a preset
const response = await llmService.sendMessage({
  presetId: 'openai-gpt-4.1-default',
  messages: [{ role: 'user', content: 'Hello!' }]
});

// Override preset settings
const response = await llmService.sendMessage({
  presetId: 'anthropic-claude-3-7-sonnet-20250219-thinking',
  messages: [{ role: 'user', content: 'Solve this problem...' }],
  settings: { temperature: 0.9 }
});
```

### Default Presets

genai-lite includes built-in presets:
- **LLM Presets**: 20+ presets in `src/config/llm-presets.json` (standard and "thinking" variants)
- **Image Presets**: 10+ presets in `src/config/image-presets.json` (quality/speed variants, aspect ratios)

### Custom Presets

**Extend mode** (default) adds your presets to built-ins:

```typescript
import { LLMService, fromEnvironment, ModelPreset } from 'genai-lite';

const customPresets: ModelPreset[] = [{
  id: 'my-creative-writing',
  displayName: 'Creative Writing',
  providerId: 'openai',
  modelId: 'gpt-4.1',
  settings: { temperature: 0.9, maxTokens: 2000 }
}];

const llmService = new LLMService(fromEnvironment, {
  presets: customPresets,
  presetMode: 'extend'
});
```

**Replace mode** uses only your custom presets:

```typescript
import { ImageService, fromEnvironment, ImagePreset } from 'genai-lite';

const myPresets: ImagePreset[] = [{
  id: 'my-portrait',
  displayName: 'Portrait',
  providerId: 'genai-electron-images',
  modelId: 'stable-diffusion',
  settings: {
    width: 768,
    height: 1024,
    diffusion: { steps: 35, cfgScale: 8.0 }
  }
}];

const imageService = new ImageService(fromEnvironment, {
  presets: myPresets,
  presetMode: 'replace'
});
```

## Settings Hierarchy

When multiple sources provide settings, they are merged in a specific order of precedence:

```
Model Defaults < Preset Settings < Template <META> Settings < Runtime Settings
(lowest)                                                        (highest priority)
```

### How It Works

1. **Model Defaults** (lowest priority)
   - Each model has default settings defined in config
   - Example: Claude models require explicit `maxTokens`

2. **Preset Settings**
   - Settings from the selected preset
   - Override model defaults

3. **Template Metadata Settings**
   - Settings embedded in `<META>` blocks in templates
   - Override preset settings
   - See [LLM Service](llm-service.md#self-contained-templates-with-metadata)

4. **Runtime Settings** (highest priority)
   - Settings passed directly in `sendMessage()` or `generateImage()`
   - Override all other sources

### Example of Settings Merging

```typescript
// Given: Model defaults (temp: 0.7), Preset (temp: 0.8, maxTokens: 2000),
//        Template (temp: 0.85), Runtime (temp: 0.9, topP: 0.95)

const response = await llmService.sendMessage({
  presetId: 'some-preset',
  messages,
  settings: { temperature: 0.9, topP: 0.95 }
  // Result: { temperature: 0.9, maxTokens: 2000, topP: 0.95 }
});
```

## Error Handling

genai-lite uses a consistent error envelope structure across all providers and services.

### Error Envelope Structure

All responses use a discriminated union type with an `object` field:

```typescript
// Success response
{
  object: 'chat.completion',  // or 'image.result'
  // ... success data
}

// Error response
{
  object: 'error',
  error: {
    type: 'authentication_error',  // Error type
    message: 'Invalid API key',     // Human-readable message
    code: 'INVALID_API_KEY',        // Machine-readable code (optional)
    provider: 'openai'              // Which provider failed
  }
}
```

### Error Types

```typescript
type ErrorType =
  | 'authentication_error'   // Invalid or missing API key
  | 'rate_limit_error'       // Rate limit exceeded
  | 'validation_error'       // Invalid request parameters
  | 'invalid_request_error'  // Bad request (4xx errors)
  | 'server_error'           // Server error (5xx errors)
  | 'connection_error';      // Network/connection issues
```

### Handling Errors

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
      console.error('Invalid request');
      if (response.partialResponse) {
        console.log('Partial:', response.partialResponse);
      }
      break;
    case 'connection_error':
      console.error('Server unreachable');
      break;
    case 'server_error':
      console.error('Server error');
      break;
    default:
      console.error(response.error.message);
  }
} else {
  console.log('Success:', response);
}
```

### Partial Responses

Validation errors may include `partialResponse` (e.g., thinking tag enforcement):

```typescript
if (response.object === 'error' && response.error.type === 'validation_error') {
  if (response.partialResponse) {
    console.log('Output:', response.partialResponse.choices[0].message.content);
  }
}
```

### Provider Error Mapping

Each provider adapter maps provider-specific errors to these standard types. This ensures consistent error handling regardless of which provider you use.

## Provider Architecture

genai-lite uses the **adapter pattern** for a unified interface across providers.

```
Your Application → LLMService/ImageService → Provider Adapter → External API/Local Server
```

**Benefits**: Unified API, normalized errors/responses, easy extension.

### Adapter Interfaces

```typescript
// LLM Adapter
interface ILLMClientAdapter {
  readonly id: string;
  sendMessage(request: NormalizedLLMRequest, apiKey: string | null): Promise<LLMResponse>;
}

// Image Adapter
interface ImageProviderAdapter {
  readonly id: ImageProviderId;
  readonly supports: ImageProviderCapabilities;
  generate(config: {
    request: ImageGenerationRequest;
    resolvedPrompt: string;
    settings: ResolvedImageGenerationSettings;
    apiKey: string | null;
  }): Promise<ImageGenerationResponse>;
}
```

### Adapter Registry

Register custom adapters for additional providers:

```typescript
import { LlamaCppClientAdapter } from 'genai-lite';

const service = new LLMService(fromEnvironment);

service.registerAdapter(
  'llamacpp-large',
  new LlamaCppClientAdapter({ baseURL: 'http://localhost:8081' })
);

const response = await service.sendMessage({
  providerId: 'llamacpp-large',
  modelId: 'llamacpp',
  messages: [{ role: 'user', content: 'Hello!' }]
});
```

## Related Documentation

### Using These Concepts

- **[LLM Service](llm-service.md)** - Apply these concepts to text generation
- **[Image Service](image-service.md)** - Apply these concepts to image generation
- **[llama.cpp Integration](llamacpp-integration.md)** - Local models (no API keys needed)

### Reference

- **[Providers & Models](providers-and-models.md)** - Complete provider and model listings
- **[TypeScript Reference](typescript-reference.md)** - Type definitions for these concepts
- **[Troubleshooting](troubleshooting.md)** - Common issues and solutions
