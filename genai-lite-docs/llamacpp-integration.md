# llama.cpp Integration

Complete guide to running local LLMs with llama.cpp and genai-lite.

## Contents

- [Overview](#overview)
- [Setup](#setup)
- [Basic Usage](#basic-usage)
- [Streaming Usage](#streaming-usage)
- [Configuration](#configuration)
- [Automatic Capability Detection](#automatic-capability-detection)
- [Reasoning on/off for Hybrid Models](#reasoning-onoff-for-hybrid-models)
- [Advanced Features](#advanced-features)
  - [GBNF Grammar](#gbnf-grammar)
  - [Log Probabilities](#log-probabilities)
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

## Streaming Usage

`LLMService.streamMessage()` streams text from llama-server through the same OpenAI-compatible chat completions endpoint used by `sendMessage()`.

```typescript
import { LLMService } from 'genai-lite';

const service = new LLMService(async () => 'not-needed');

for await (const event of service.streamMessage({
  providerId: 'llamacpp',
  modelId: 'llamacpp',
  messages: [{ role: 'user', content: 'Write a short haiku about local models.' }],
  settings: {
    maxTokens: 120,
    reasoning: { enabled: false }
  }
})) {
  if (event.type === 'content_delta') {
    process.stdout.write(event.delta);
  } else if (event.type === 'reasoning_delta') {
    process.stderr.write(event.delta);
  } else if (event.type === 'usage') {
    console.log('\nUsage:', event.usage);
  } else if (event.type === 'complete') {
    console.log('\nFinal:', event.response.choices[0].message.content);
  } else if (event.type === 'error') {
    console.error(event.error.error.message);
  }
}
```

Use `http://127.0.0.1:8080` for the base URL on Windows; avoid `localhost` unless your server is listening on IPv6 as well. For hybrid reasoning models, start llama-server with `--jinja` so `settings.reasoning.enabled` can control `chat_template_kwargs.enable_thinking`. Adding `--reasoning-format deepseek` (or the matching reasoning format for your build/model) improves the chance that live reasoning appears as `reasoning_delta` instead of inline marker text.

If a server streams raw `<think>...</think>` markers instead of separated reasoning fields, live `content_delta` events may contain those markers. The final `complete.response` still goes through genai-lite's normal reasoning cleanup and is the authoritative normalized result.

## Configuration

### Environment Variable

```bash
export LLAMACPP_API_BASE_URL=http://127.0.0.1:8080  # Default
```

> **Note (Windows):** the default base URL is `http://127.0.0.1:8080`, not `http://localhost:8080`. On Windows, `localhost` resolves to IPv6 (`::1`) first; when llama-server listens on IPv4 only, every fresh connection waits ~2s for the IPv6 attempt to time out (measured ~9x per-request slowdown). Using `127.0.0.1` avoids this. Set `LLAMACPP_API_BASE_URL` to override.

### Multiple Servers

`LLMService` does not expose a public adapter-registration method. Configure
`LLAMACPP_API_BASE_URL` before constructing the service. Applications that need
simultaneous differently configured local endpoints should isolate those
configurations in separate processes or use the lower-level exported adapter
interface deliberately.

### Health Checking

```typescript
import { LlamaCppServerClient, LLMService } from 'genai-lite';

const server = new LlamaCppServerClient('http://127.0.0.1:8080');
const health = await server.getHealth();
if (health.status !== 'ok') throw new Error(`llama.cpp: ${health.status}`);

const service = new LLMService(async () => 'not-needed');
```

### Exact Prepared-Message Counting

Raw `/tokenize` counts content only and does not apply the active chat template.
`prepareMessage()` instead sends the final mode-bound completion body to
`/v1/chat/completions/input_tokens`. When the current server exposes the
required `/props` and `/v1/models` state, inspection reports an exact prompt
count plus server/template fingerprints. `sendPrepared()` and
`streamPrepared()` re-read those observable fields and reject changed state
before inference.

See [Prepared Calls and Token Accounting](prepared-calls-and-accounting.md).

## Automatic Capability Detection

genai-lite automatically detects capabilities (reasoning support, context windows, token limits, and vendor-recommended sampling defaults) for known models by matching the GGUF filename (case-insensitive substring match) reported by the server. No configuration needed — detection applies even when you use the generic `modelId: 'llamacpp'` or the built-in llamacpp presets, since the server decides which model is actually loaded.

**Currently recognized families (38 patterns):**

| Family | Variants | Reasoning | Notes |
|--------|----------|-----------|-------|
| **Qwen 3.5** | 2B, 4B, 9B, generic | Hybrid (toggle) | `enable_thinking` flag |
| **Qwen 3.6** | 27B, 35B-A3B, generic | Hybrid (toggle) | `enable_thinking` flag |
| **Qwen 3 (2507)** | 4B / 30B-A3B Instruct + Thinking | Instruct: none · Thinking: always-on | Separate checkpoints |
| **Qwen 3 (original)** | 30B, 14B, 8B, 4B, 1.7B, 0.6B | Hybrid (toggle) | `enable_thinking` flag |
| **Gemma 4** | E2B, E4B, 12B, 26B-A4B, 31B, generic | Hybrid (toggle) | Also supports the system role |
| **Gemma 3** | 1B, 4B, 12B, 27B, generic | None | No thinking, no system role |
| **GPT-OSS** | 20B, 120B, generic | Always-on | Harmony format, cannot be disabled |
| **Ministral 3** | 3B/8B/14B Reasoning, Instruct | Reasoning: always-on · Instruct: none | Reasoning is a separate checkpoint |
| **Granite 4.1** | — | None | IBM Granite |
| **DeepSeek R1** | — | Always-on | |
| **Llama 3.2** | — | None | Meta Llama |

**Vendor sampling defaults:** detected models automatically receive their vendor-recommended sampling profile (temperature / top-P / top-K / min-P / repeat-penalty). For example, Gemma uses `temperature 1.0 / topP 0.95 / topK 64`, and non-thinking Qwen uses `0.7 / 0.8 / 20`. Because llama.cpp's own server defaults (temperature 0.8, top-k 40, min-p 0.05) match no vendor's recommendation, detected models always set an explicit `minP: 0` and `repeatPenalty: 1.0`. Hybrid models that recommend a different profile in thinking mode (e.g. Qwen) also carry a `reasoningDefaultSettings` overlay that applies only when reasoning is active. These sit between provider defaults and your request settings, so anything you pass in `settings` still wins. See [Reasoning on/off for Hybrid Models](#reasoning-onoff-for-hybrid-models).

**Fallback for unrecognized models:** 4096 context, 2048 max tokens, no native reasoning.

**Helpers:**
```typescript
import { detectGgufCapabilities, createFallbackModelInfo, KNOWN_GGUF_MODELS } from 'genai-lite';

console.log(KNOWN_GGUF_MODELS);
// Substring match against the GGUF filename → Partial<ModelInfo> | null
const capabilities = detectGgufCapabilities('Qwen3.5-4B-Q4_K_M.gguf');
const modelInfo = createFallbackModelInfo('llamacpp', 'llamacpp', capabilities ?? undefined);
```

## Reasoning on/off for Hybrid Models

Many local models (Qwen 3.x, Gemma 4, Ministral 3) are **hybrid**: the same weights can answer directly or "think" first, controlled by a chat-template flag. genai-lite drives this through the standard `settings.reasoning.enabled` field.

For a detected hybrid model, genai-lite sends llama-server's `chat_template_kwargs.enable_thinking`:
- **`reasoning.enabled: false`** (or omitted) → `enable_thinking: false` is sent **explicitly**. This matters: without it, some templates default to thinking on and silently burn thinking tokens on every request.
- **`reasoning.enabled: true`** → `enable_thinking: true`.

> **Requires `--jinja`.** The reasoning toggle only works when llama-server is started with `--jinja` (so it applies the model's Jinja chat template). Servers started without it ignore the kwarg. Adding `--reasoning-format deepseek` lets the server separate the trace into `reasoning_content` for cleaner extraction.

### Same request, thinking off vs on

```typescript
import { LLMService } from 'genai-lite';

const service = new LLMService(async () => 'not-needed');

// Works for any detected hybrid model (Qwen 3.5, Gemma 4, ...).
const base = {
  providerId: 'llamacpp' as const,
  modelId: 'llamacpp',
  messages: [{ role: 'user' as const, content: 'Is 91 a prime number? Explain briefly.' }]
};

// Thinking OFF (default) — sends chat_template_kwargs.enable_thinking = false
const plain = await service.sendMessage({
  ...base,
  settings: { reasoning: { enabled: false } }
});
if (plain.object === 'chat.completion') {
  console.log(plain.choices[0].reasoning);           // undefined — no thinking trace
  console.log(plain.choices[0].message.content);     // the direct answer
}

// Thinking ON — sends enable_thinking = true (requires llama-server --jinja)
const thinking = await service.sendMessage({
  ...base,
  settings: { reasoning: { enabled: true } }
});
if (thinking.object === 'chat.completion') {
  console.log(thinking.choices[0].reasoning);        // the reasoning trace
  console.log(thinking.choices[0].message.content);  // the final answer
}
```

The two built-in presets are shorthands for exactly this:

```typescript
await service.sendMessage({ presetId: 'llamacpp-local-default', messages: base.messages });   // thinking off
await service.sendMessage({ presetId: 'llamacpp-local-thinking', messages: base.messages });  // thinking on
```

### How the reasoning trace is returned

The trace is placed on `choice.reasoning` via a two-tier extraction:
1. **Preferred:** the server-separated `reasoning_content` field (populated when the server's `--reasoning-format` handling recognizes the template).
2. **Fallback:** marker extraction from the message content (e.g. `<think>…</think>`), used when `reasoning_content` isn't populated. This is model/template dependent and only extracts fully-closed marker pairs.

Template-injected "nothink" prefixes (an empty think block some templates leak into content when thinking is disabled, e.g. Qwen's `<think>\n\n</think>\n\n`) are stripped automatically. Set `reasoning.exclude: true` to run thinking but omit the trace from the response.

### Caveats

- **Assistant prefill + thinking is rejected.** llama-server does not allow a trailing `assistant` message (prefill) together with `enable_thinking: true`. genai-lite fails fast with a clear `PROVIDER_ERROR` (`"llama.cpp does not support assistant prefill … while thinking is enabled …"`) instead of surfacing the raw server error. Remove the trailing assistant message or disable reasoning.
- **Assistant-prefill echoes are normalized when thinking is disabled.** Some llama-server builds return the complete assistant turn in `message.content`: the exact trailing assistant prefill followed by the newly generated continuation. genai-lite removes one exact, case-sensitive echoed copy from normalized `message.content` and public content deltas. Continuation-only responses remain unchanged. The provider's unaltered text remains available through `choice.rawContent` and `choice.rawContentParts`, while usage and logprob evidence continue to describe the provider response.
- **Gemma 4 `enable_thinking: true` is best-effort.** In battle-testing, Gemma 4's chat-template flag activates the thought channel unreliably; `enable_thinking: false` works reliably. Don't depend on always getting a trace from Gemma 4.
- **llama.cpp build variance.** Whether the server populates `reasoning_content` (vs. leaving markers inline) differs across builds. If reasoning markers leak into `message.content`, update to a recent llama.cpp build (e.g. `b9028` or newer).

## Advanced Features

### Server Management

```typescript
import { LlamaCppServerClient } from 'genai-lite';

const client = new LlamaCppServerClient('http://127.0.0.1:8080');

const health = await client.getHealth();
console.log(health.status); // 'ok', 'loading', or 'error'

const props = await client.getProps();
console.log(props.total_slots);

const metrics = await client.getMetrics();
```

### Tokenization

```typescript
const client = new LlamaCppServerClient('http://127.0.0.1:8080');

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
const client = new LlamaCppServerClient('http://127.0.0.1:8080');

const { embedding } = await client.createEmbedding('Search query text');
console.log(embedding.length);

const { embedding: multimodalEmbed } = await client.createEmbedding(
  'Describe this image',
  'base64_image_data_here'
);
```

### Code Infilling

```typescript
const client = new LlamaCppServerClient('http://127.0.0.1:8080');

const result = await client.infill(
  'def calculate_fibonacci(n):\n    ',
  '\n    return result'
);

console.log(result.content);
```

### GBNF Grammar

Constrain the output with a raw [GBNF](https://github.com/ggml-org/llama.cpp/blob/master/grammars/README.md) grammar via the llama.cpp-only `settings.llamacpp.grammar` field:

```typescript
const response = await service.sendMessage({
  providerId: 'llamacpp',
  modelId: 'llamacpp',
  messages: [{ role: 'user', content: 'Pick a primary color.' }],
  settings: {
    llamacpp: {
      grammar: 'root ::= "red" | "green" | "blue"'
    }
  }
});
```

For a one-label answer position, generate the grammar instead of hand-writing it:

```typescript
import { generateAnswerTokenGrammar } from 'genai-lite';

const labels = ['red', 'green', 'blue'] as const;
const grammar = generateAnswerTokenGrammar(labels);
```

The generated grammar accepts one optional leading ASCII space and one complete label. It does
not accept a trailing newline, which prevents a token such as `"red\n"` from satisfying the
grammar but then losing its mass during extraction. Strict-prefix label sets are rejected.

When labels share a leading substring, a returned token can stop on the shared part. That position
can optionally be resolved with follow-up requests you dispatch yourself:
`generateSuffixGrammar(suffixes)` builds the grammar for such a continuation, and the walk supplies
the exact decoded text to reissue as **assistant prefill** so the model continues the same answer
rather than restarting it. The result is an approximation, because reissued text may retokenize
differently. See [Constrained Answer Labels](constrained-answer-labels.md#resolving-shared-prefixes-suffix-walk)
for the complete workflow.

Notes:
- **Mutually exclusive with `structuredOutput`.** llama-server rejects a request that carries both a raw grammar and a JSON schema (`"Either 'json_schema' or 'grammar' can be specified, but not both"`); genai-lite validates this up front and returns a `validation_error`.
- **Grammar may not apply while thinking is active.** Current llama.cpp builds may not constrain output during the thinking phase — prefer grammar with reasoning disabled (`reasoning.enabled: false`).

`settings.llamacpp.chatTemplateKwargs` is a raw escape hatch for chat-template kwargs (requires `--jinja`). It is merged **over** any library-derived kwargs, so an explicit value here always wins over the reasoning toggle's `enable_thinking`.

### Log Probabilities

llama.cpp returns per-token log probabilities in the OpenAI-compatible shape. Set `logprobs: true` (and optionally `topLogprobs`, 0-20) to get them on `choice.logprobs`:

```typescript
const response = await service.sendMessage({
  providerId: 'llamacpp',
  modelId: 'llamacpp',
  messages: [{ role: 'user', content: 'Reply with exactly one word: yes' }],
  settings: {
    logprobs: true,
    topLogprobs: 5
  }
});

if (response.object === 'chat.completion') {
  for (const tok of response.choices[0].logprobs ?? []) {
    console.log(tok.token, tok.logprob);
  }
}
```

See [Constrained Answer Labels](constrained-answer-labels.md) for the complete grammar-plus-extraction workflow and [LLM Service - Log Probabilities](llm-service.md#log-probabilities) for the shared `TokenLogprob` shape.

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
curl http://127.0.0.1:8080/health  # Should return: {"status":"ok"}
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
