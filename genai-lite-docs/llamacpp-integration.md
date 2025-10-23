# llama.cpp Integration

Complete guide to running local LLMs with llama.cpp and genai-lite.

## Contents

- [Overview](#overview)
- [Setup](#setup)
- [Basic Usage](#basic-usage)
- [Configuration](#configuration)
- [Automatic Capability Detection](#automatic-capability-detection)
- [Advanced Features](#advanced-features)
- [Error Handling](#error-handling)
- [Best Practices](#best-practices)
- [Troubleshooting](#troubleshooting)
- [Related Documentation](#related-documentation)

## Overview

[llama.cpp](https://github.com/ggml-org/llama.cpp) is an efficient C++ implementation for running LLMs locally. genai-lite provides comprehensive support for llama.cpp, enabling completely offline AI capabilities with the same unified interface as cloud providers.

### Why llama.cpp?

- **Privacy** - Run models locally, no data sent to external servers
- **Cost** - No API costs after model download, no per-token pricing
- **Control** - Use any GGUF model, no deprecation or API changes
- **Performance** - Optimized C++ with hardware acceleration (CUDA, Metal)

## Setup

### 1. Install llama.cpp

**From source:**
```bash
git clone https://github.com/ggml-org/llama.cpp
cd llama.cpp
make
```

**Pre-built binaries:** Download from [llama.cpp releases](https://github.com/ggml-org/llama.cpp/releases)

### 2. Download a GGUF Model

Get models from Hugging Face:
- [Meta-Llama-3.1-8B-Instruct-GGUF](https://huggingface.co/bartowski/Meta-Llama-3.1-8B-Instruct-GGUF)
- [Mistral-7B-Instruct-v0.3-GGUF](https://huggingface.co/bartowski/Mistral-7B-Instruct-v0.3-GGUF)
- [Qwen3-7B-Instruct-GGUF](https://huggingface.co/Qwen/Qwen3-7B-Instruct-GGUF) (supports reasoning)

**Quantization options:**
- **Q4_K_M** - Good balance
- **Q5_K_M** - Higher quality
- **Q8_0** - Very high quality
- **F16** - Full precision

### 3. Start the llama.cpp Server

**Basic:**
```bash
llama-server -m /path/to/model.gguf --port 8080
```

**With reasoning support** (Qwen3, DeepSeek-R1, GPT-OSS):
```bash
llama-server -m /path/to/qwen3-model.gguf \
  --port 8080 \
  --jinja \
  --reasoning-format deepseek
```

**Full configuration:**
```bash
llama-server -m /path/to/model.gguf \
  --port 8080 \
  --jinja \                      # Required for reasoning
  --reasoning-format deepseek \  # Extract reasoning from <think> tags
  -c 4096 \                      # Context size
  -np 4 \                        # Parallel requests
  --threads 8                    # CPU threads
```

## Basic Usage

```typescript
import { LLMService } from 'genai-lite';

const service = new LLMService(async () => 'not-needed');

const response = await service.sendMessage({
  providerId: 'llamacpp',
  modelId: 'llamacpp',
  messages: [
    { role: 'system', content: 'You are a helpful assistant.' },
    { role: 'user', content: 'Explain quantum computing in simple terms.' }
  ],
  settings: {
    temperature: 0.7,
    maxTokens: 500
  }
});

if (response.object === 'chat.completion') {
  console.log(response.choices[0].message.content);
}
```

**Model ID:** Always use `'llamacpp'` - the actual model is determined by the GGUF file loaded in the server.

## Configuration

### Environment Variable

```bash
export LLAMACPP_API_BASE_URL=http://localhost:8080  # Default
```

### Multiple Servers

```typescript
import { LLMService, LlamaCppClientAdapter } from 'genai-lite';

const service = new LLMService(async () => 'not-needed');

service.registerAdapter(
  'llamacpp-small',
  new LlamaCppClientAdapter({ baseURL: 'http://localhost:8080' })
);

service.registerAdapter(
  'llamacpp-large',
  new LlamaCppClientAdapter({ baseURL: 'http://localhost:8081' })
);

const response = await service.sendMessage({
  providerId: 'llamacpp-small',
  modelId: 'llamacpp',
  messages: [{ role: 'user', content: 'Hello!' }]
});
```

### Health Checking

```typescript
import { LlamaCppClientAdapter } from 'genai-lite';

const adapter = new LlamaCppClientAdapter({
  baseURL: 'http://localhost:8080',
  checkHealth: true
});

service.registerAdapter('llamacpp', adapter);
```

## Automatic Capability Detection

genai-lite automatically detects capabilities (reasoning support, context windows, token limits) for known models by matching the GGUF filename from the server. No configuration needed.

**Models with reasoning support:**
- **Qwen3** - Advanced reasoning
- **DeepSeek-R1** - Reasoning and problem-solving
- **GPT-OSS** - Open-source GPT with reasoning

When using these models with `--reasoning-format deepseek`, reasoning is automatically extracted from `<think>` tags.

**Other detected models:** Meta-Llama, Mistral, Mixtral, and more

**Fallback for unrecognized models:** 4096 context, 2048 max tokens, no native reasoning

**Helpers:**
```typescript
import { detectGgufCapabilities, createFallbackModelInfo, KNOWN_GGUF_MODELS } from 'genai-lite';

console.log(KNOWN_GGUF_MODELS);
const capabilities = detectGgufCapabilities('qwen3-7b-instruct.gguf');
const modelInfo = createFallbackModelInfo();
```

## Advanced Features

### Server Management

```typescript
import { LlamaCppServerClient } from 'genai-lite';

const client = new LlamaCppServerClient('http://localhost:8080');

const health = await client.getHealth();
console.log(health.status); // 'ok', 'loading', or 'error'

const props = await client.getProps();
console.log(props.total_slots);

const metrics = await client.getMetrics();
```

### Tokenization

```typescript
const client = new LlamaCppServerClient('http://localhost:8080');

const { tokens } = await client.tokenize('Hello, world!');
console.log(tokens);

const prompt = 'Long text...';
const { tokens: promptTokens } = await client.tokenize(prompt);
if (promptTokens.length > 4000) {
  console.log('Prompt too long, truncating...');
}

const { content } = await client.detokenize([123, 456, 789]);
```

### Text Embeddings

```typescript
const client = new LlamaCppServerClient('http://localhost:8080');

const { embedding } = await client.createEmbedding('Search query text');
console.log(embedding.length);

const { embedding: multimodalEmbed } = await client.createEmbedding(
  'Describe this image',
  'base64_image_data_here'
);
```

### Code Infilling

```typescript
const client = new LlamaCppServerClient('http://localhost:8080');

const result = await client.infill(
  'def calculate_fibonacci(n):\n    ',
  '\n    return result'
);

console.log(result.content);
```

## Error Handling

```typescript
const response = await service.sendMessage({
  providerId: 'llamacpp',
  modelId: 'llamacpp',
  messages: [{ role: 'user', content: 'Hello' }]
});

if (response.object === 'error') {
  switch (response.error.code) {
    case 'NETWORK_ERROR':
      console.error('Server not running or unreachable');
      break;
    case 'PROVIDER_ERROR':
      console.error('Server error:', response.error.message);
      break;
    default:
      console.error('Unknown error:', response.error);
  }
}
```

## Best Practices

1. **Model ID**: Always use `'llamacpp'` as the model ID
2. **Context size**: Set appropriate `-c` flag (8192 for long documents, 2048 for constrained systems)
3. **Parallel requests**: Configure `-np` based on VRAM (higher = more memory)
4. **Health monitoring**: Enable `checkHealth: true` for production
5. **Resource management**: Monitor memory with `top -p $(pgrep llama-server)`

## Troubleshooting

**Server not responding:**
```bash
curl http://localhost:8080/health  # Should return: {"status":"ok"}
ps aux | grep llama-server
lsof -i :8080
```

**Model loading fails:**
- Reduce context: `llama-server -m model.gguf -c 2048`
- Use smaller quantization (Q4_K_M instead of Q8_0)

**Slow responses:**
- Use quantized models (Q4_K_M, Q5_K_M)
- Increase threads: `--threads 16`
- Enable GPU offload: `-ngl 32` (CUDA) or automatic (Metal)

**Out of memory:**
- Use smaller model (7B vs 13B)
- More aggressive quantization (Q4)
- Reduce context: `-c 2048`
- Reduce slots: `-np 1`

**Reasoning not working:**
- Ensure `--jinja` and `--reasoning-format deepseek` flags are set

## Related Documentation

- **[LLM Service](llm-service.md)** - Using llama.cpp with LLMService, reasoning mode
- **[Providers & Models](providers-and-models.md)** - llama.cpp provider details
- **[Core Concepts](core-concepts.md)** - Error handling patterns
- **[TypeScript Reference](typescript-reference.md)** - llama.cpp types

**External:**
- [llama.cpp GitHub](https://github.com/ggml-org/llama.cpp)
- [Hugging Face GGUF Models](https://huggingface.co/models?library=gguf)
