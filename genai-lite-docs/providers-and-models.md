# Providers & Models

Complete reference of all supported AI providers and models in genai-lite.

## Contents

- [Overview](#overview)
- [LLM Providers](#llm-providers)
- [Image Generation Providers](#image-generation-providers)
- [Models with Reasoning Support](#models-with-reasoning-support)
- [Environment Variables](#environment-variables)

## Overview

**Cloud Providers** (require API keys):
- Anthropic (Claude)
- OpenAI (GPT, DALL-E)
- Google Gemini
- Mistral
- OpenRouter (unified gateway to 100+ models)

**Local Providers** (no API keys):
- llama.cpp (local LLMs)
- genai-electron (local diffusion models)

**Note:** Model IDs include version dates for precise model selection. Always use the exact model ID as shown below.

## LLM Providers

### Anthropic (Claude)

**Provider ID**: `anthropic`
**Environment Variable**: `ANTHROPIC_API_KEY`

**Models:**

**Claude 4.5 Series (Latest):**
- `claude-opus-4-5-20251101` - Claude 4.5 Opus (200K context, native reasoning)
- `claude-sonnet-4-5-20250929` - Claude 4.5 Sonnet (200K context, native reasoning)
- `claude-haiku-4-5-20251001` - Claude 4.5 Haiku (200K context, native reasoning)

**Claude 4 Series:**
- `claude-sonnet-4-20250514` - Claude 4 Sonnet (200K context, native reasoning)
- `claude-opus-4-20250514` - Claude 4 Opus (200K context, native reasoning)

**Claude 3.x Series:**
- `claude-3-7-sonnet-20250219` - Claude 3.7 Sonnet (200K context, native reasoning)
- `claude-3-5-sonnet-20241022` - Claude 3.5 Sonnet (200K context, no native reasoning)
- `claude-3-5-haiku-20241022` - Claude 3.5 Haiku (200K context, no native reasoning)

**Notes:**
- Requires explicit `maxTokens` parameter (no default)
- System messages handled differently than OpenAI
- Sampling parameters: supports `topK`. Does not support `seed`, `minP`, `repeatPenalty`, or `logprobs`/`topLogprobs` (silently stripped)

---

### OpenAI

**Provider ID**: `openai`
**Environment Variable**: `OPENAI_API_KEY`
**Optional**: `OPENAI_API_BASE_URL` (default: `https://api.openai.com/v1`)

**Models:**

**GPT-5 Series (Latest):**
- `gpt-5.2` - GPT-5.2 (272K context, native reasoning)
- `gpt-5.1` - GPT-5.1 (272K context, native reasoning)
- `gpt-5-mini-2025-08-07` - GPT-5 Mini (272K context, native reasoning)
- `gpt-5-nano-2025-08-07` - GPT-5 Nano (272K context, native reasoning)

**o-Series (Reasoning):**
- `o4-mini` - o4-mini (200K context, native reasoning always on, reasoning tokens billed separately)

**GPT-4.1 Series:**
- `gpt-4.1` - GPT-4.1 (1M context, no native reasoning)
- `gpt-4.1-mini` - GPT-4.1 Mini (1M context, no native reasoning)
- `gpt-4.1-nano` - GPT-4.1 Nano (1M context, no native reasoning)

**Notes:**
- Supports `response_format` for JSON mode
- Specific tool/function calling format
- Sampling parameters: supports `seed` (beta; ignored by reasoning models such as GPT-5 and o4-mini) and `logprobs`/`topLogprobs`. Does not support `topK`, `minP`, `repeatPenalty`, or `frequencyPenalty` (silently stripped)

---

### Google Gemini

**Provider ID**: `gemini`
**Environment Variable**: `GEMINI_API_KEY`

**Models:**

**Gemini 3 Series (Preview):**
- `gemini-3-pro-preview` - Gemini 3 Pro Preview (1M context, multimodal, native reasoning always on)
- `gemini-3-flash-preview` - Gemini 3 Flash Preview (1M context, multimodal, native reasoning optional)

**Gemini 2.5 Series:**
- `gemini-2.5-pro` - Gemini 2.5 Pro (1M context, multimodal, native reasoning always on)
- `gemini-2.5-flash` - Gemini 2.5 Flash (1M context, multimodal, native reasoning optional)
- `gemini-2.5-flash-lite` - Gemini 2.5 Flash-Lite (1M context, multimodal, native reasoning optional)

**Gemma 3 (Open Weights, Free):**
- `gemma-3-27b-it` - Gemma 3 27B (128K context, multimodal, free via Gemini API)

**Gemma 4 (Open Weights, Free):**
- `gemma-4-26b-a4b-it` - Gemma 4 26B-A4B MoE (~4B active, 256K context, free via Gemini API)
- `gemma-4-31b-it` - Gemma 4 31B dense (256K context, free via Gemini API)

**Notes:**
- Role naming: `user`/`model` instead of `user`/`assistant`
- Unique safety settings structure
- Gemini models support multimodal (text, images, audio, video)
- Gemma 3 and Gemma 4 are open-weight and **free** via the Gemini API (no API costs)
- **Gemma 3 does not support system instructions** - genai-lite automatically prepends system content to the first user message (see [System Message Fallback](llm-service.md#system-message-fallback)). **Gemma 4 does support a native system role** (unlike Gemma 3)
- **Gemma models do not support structured output (JSON mode)** via Google's API - use OpenRouter instead for JSON output. Reasoning/thinking is not exposed for Gemma on the Gemini API
- Sampling parameters: supports `topK` and `seed`. Does not support `minP`, `repeatPenalty`, or `logprobs`/`topLogprobs` (Gemini's log-probability mechanism has a different shape and is not mapped)

---

### Mistral

**Provider ID**: `mistral`
**Environment Variable**: `MISTRAL_API_KEY`
**Optional**: `MISTRAL_API_BASE_URL` (default: `https://api.mistral.ai`)

**Models:**

**General Purpose:**
- `mistral-small-latest` - Mistral Small (128K context, $0.10/$0.30 per 1M tokens)
- `mistral-large-2512` - Mistral Large 3 (256K context, $0.50/$1.50 per 1M tokens)

**Code-Focused:**
- `codestral-2501` - Codestral (256K context, $0.30/$0.90 per 1M tokens)
- `devstral-small-2505` - Devstral Small (131K context, $0.10/$0.30 per 1M tokens)

**Notes:**
- Real adapter using the official `@mistralai/mistralai` SDK (since v0.8)
- Does not support `frequencyPenalty` or `presencePenalty` parameters
- System messages are natively supported
- Sampling parameters: supports `seed` (mapped to the SDK's `randomSeed`). Does not support `topK`, `minP`, `repeatPenalty`, or `logprobs`/`topLogprobs` (silently stripped)

---

### llama.cpp (Local Models)

**Provider ID**: `llamacpp`
**Environment Variable**: `LLAMACPP_API_BASE_URL` (default: `http://127.0.0.1:8080`)
**API Key**: Not required

**Generic Model ID:**

- `llamacpp` - Generic ID for whatever GGUF model you've loaded in the server

**Automatic Capability Detection:**

genai-lite automatically detects capabilities (reasoning support, context windows, token limits) by matching GGUF filenames from the server. No configuration needed.

**Currently recognized (38 patterns):**
- **Qwen 3.5** (2B, 4B, 9B, generic) and **Qwen 3.6** (27B, 35B-A3B, generic) - hybrid thinking (`enable_thinking` toggle)
- **Qwen 3 2507 refreshes** - Instruct-2507 (4B, 30B-A3B, non-thinking) and Thinking-2507 (4B, 30B-A3B, always-on)
- **Qwen 3 (original)** (30B, 14B, 8B, 4B, 1.7B, 0.6B) - hybrid thinking
- **Gemma 4** (E2B, E4B, 12B, 26B-A4B, 31B, generic) - hybrid thinking, supports the system role
- **Gemma 3** (1B, 4B, 12B, 27B, generic) - no thinking, no system role
- **GPT-OSS** (20B, 120B, generic) - reasoning always on (harmony format)
- **Ministral 3** (3B/8B/14B Reasoning + Instruct) - Reasoning variants always on; Instruct has no thinking
- **Granite 4.1**, **DeepSeek R1** (always-on reasoning), **Llama 3.2**

Detected models also receive vendor-recommended sampling defaults automatically. For unrecognized models, uses sensible fallback defaults. See [llama.cpp Integration - Automatic Capability Detection](llamacpp-integration.md#automatic-capability-detection).

**Notes:**
- OpenAI-compatible API (uses OpenAI SDK internally)
- Supports any GGUF model from Hugging Face
- No API costs, completely private
- Supports `LLMService.streamMessage()` for content deltas, usage events, and final normalized responses
- Reasoning on/off for hybrid models is driven by `settings.reasoning.enabled` (requires llama-server `--jinja`); see [Reasoning on/off for Hybrid Models](llamacpp-integration.md#reasoning-onoff-for-hybrid-models)
- Sampling parameters: supports `topK`, `minP`, `repeatPenalty`, `seed`, and `logprobs`/`topLogprobs`; plus llama.cpp-only `grammar` and `chatTemplateKwargs` via the `llamacpp` namespace
- Default base URL is `http://127.0.0.1:8080` (not `localhost`) to avoid a Windows IPv6-fallback stall
- See [llama.cpp Integration](llamacpp-integration.md) for setup

---

### OpenRouter (API Gateway)

**Provider ID**: `openrouter`
**Environment Variable**: `OPENROUTER_API_KEY`
**Optional**: `OPENROUTER_API_BASE_URL` (default: `https://openrouter.ai/api/v1`)

OpenRouter is an API gateway that provides unified access to 100+ LLM models from various providers through a single API key.

**Free Tier Models:**

- `google/gemma-3-27b-it:free` - Gemma 3 27B (96K context, multimodal)
- `mistralai/mistral-small-3.1-24b-instruct:free` - Mistral Small 3.1 24B (96K context)

**Model ID Format:**

OpenRouter uses `provider/model-name` format with optional suffixes:
- `:free` - Free tier (rate limited)
- `:nitro` - Fast inference
- `:floor` - Cheapest option

**Provider Routing (Optional):**

Control which underlying providers serve your requests:

```typescript
const response = await llmService.sendMessage({
  providerId: 'openrouter',
  modelId: 'google/gemma-3-27b-it:free',
  messages: [{ role: 'user', content: 'Hello' }],
  settings: {
    openRouterProvider: {
      order: ['Together', 'Fireworks'],  // Provider priority
      ignore: ['Azure'],                  // Exclude providers
      dataCollection: 'deny'              // Opt out of training
    }
  }
});
```

**App Attribution (Optional):**

Set environment variables for OpenRouter rankings:
- `OPENROUTER_HTTP_REFERER` - Your app's URL
- `OPENROUTER_SITE_TITLE` - Your app's name

**Reasoning (Optional):**

The unified `settings.reasoning` field is forwarded to OpenRouter's `reasoning` body parameter:
- `maxTokens` → `reasoning.max_tokens` (wins if both `maxTokens` and `effort` are set)
- `effort` → `reasoning.effort`
- neither, with `enabled: true` → `reasoning.enabled: true`
- `exclude: true` → `reasoning.exclude: true`

The reasoning trace is returned on `choice.reasoning`, with any structured details on `choice.reasoning_details`. OpenRouter silently ignores the parameter for models that don't support reasoning, and unknown/unregistered model IDs are assumed reasoning-capable.

**Notes:**
- Single API key for all models
- OpenAI-compatible API format
- Supports `LLMService.streamMessage()` for content deltas, usage events, final normalized responses, and reasoning deltas when the underlying provider emits them
- `allowUnknownModels: true` - Use any OpenRouter model ID
- Free tier models have rate limits
- **Structured output supported** - Both free tier models support JSON mode/structured output
- Sampling parameters: supports `topK`, `minP`, `repeatPenalty`, `seed`, and `logprobs`/`topLogprobs` (pass-through; `repeatPenalty` maps to `repetition_penalty`). OpenRouter ignores any parameter the underlying model doesn't support
- See [openrouter.ai/docs](https://openrouter.ai/docs) for full model list

---

## Image Generation Providers

### OpenAI Images

**Provider ID**: `openai-images`
**Environment Variable**: `OPENAI_API_KEY`
**Optional**: `OPENAI_API_BASE_URL` (default: `https://api.openai.com/v1`)

**Models:**

- `gpt-image-1` - GPT-Image 1 (32K char prompts, multiple images supported)
- `gpt-image-1-mini` - GPT-Image 1 Mini (32K char prompts, multiple images supported, default)
- `dall-e-3` - DALL-E 3 (4K char prompts, n=1 only, style: vivid/natural)
- `dall-e-2` - DALL-E 2 (1K char prompts, multiple images supported)

**Capabilities:**
- Quality settings: `auto`, `high`, `medium`, `low`, `hd`, `standard`
- Multiple formats: PNG, JPEG, WebP
- Multiple images per request (except dall-e-3: n=1 only)

**Provider-specific settings** (use `openai` namespace):
- `outputFormat`: `'png'` | `'jpeg'` | `'webp'`
- `background`: `'auto'` | `'transparent'` | `'white'` | `'black'`
- `moderation`: `'auto'` | `'high'` | `'low'`
- `compression`: `0.0`-`1.0` (for JPEG/WebP)

---

### genai-electron Diffusion (Local)

**Provider ID**: `genai-electron-images`
**Environment Variable**: `GENAI_ELECTRON_IMAGE_BASE_URL` (default: `http://127.0.0.1:8081`)
**API Key**: Not required

**Generic Model ID:**

- `stable-diffusion` - Generic ID for whatever diffusion model is loaded (SDXL, SD 1.5, etc.)

**Capabilities:**
- Dimensions: 64-2048 pixels
- Negative prompts, custom seeds, progress callbacks, batch generation
- Steps: 1-150, CFG scale: 1.0-30.0
- Request-side cancellation: `generateImage(request, { signal })` also cancels the generation server-side (genai-electron ≥ 0.6.0)

**Samplers**: `euler_a`, `euler`, `dpm++2m`, `dpm++2s_a`, `heun`, `dpm2`, `lcm`

**Provider-specific settings** (use `diffusion` namespace):
- `negativePrompt`: string (what to avoid)
- `steps`: 1-150 (generation steps)
- `cfgScale`: 1.0-30.0 (prompt adherence)
- `sampler`: sampler name
- `seed`: number (reproducibility)
- `onProgress`: callback function (progress monitoring)

---

## Models with Reasoning Support

Some models support advanced reasoning capabilities for enhanced problem-solving.

### Models with Native Reasoning

**Anthropic**: `claude-opus-4-5-20251101`, `claude-sonnet-4-5-20250929`, `claude-haiku-4-5-20251001`, `claude-sonnet-4-20250514`, `claude-opus-4-20250514`, `claude-3-7-sonnet-20250219`

**Google Gemini**: `gemini-3-pro-preview` (always on), `gemini-3-flash-preview`, `gemini-2.5-pro` (always on), `gemini-2.5-flash`, `gemini-2.5-flash-lite`

**OpenAI**: `gpt-5.2`, `gpt-5.1`, `gpt-5-mini-2025-08-07`, `gpt-5-nano-2025-08-07`, `o4-mini` (always on)

**llama.cpp** (local, via GGUF detection — requires llama-server `--jinja`):
- **Hybrid (toggle with `reasoning.enabled`)**: Qwen 3.x (3.5, 3.6, original), Gemma 4
- **Always-on**: GPT-OSS, DeepSeek R1, Qwen 3 Thinking-2507, Ministral 3 Reasoning variants
- **Not reasoning-capable** (thinking kept off via the template flag): Ministral 3 Instruct

See [Reasoning on/off for Hybrid Models](llamacpp-integration.md#reasoning-onoff-for-hybrid-models).

**OpenRouter**: forwards the unified `reasoning` settings to any underlying reasoning-capable model (unknown model IDs are assumed capable); trace returned on `choice.reasoning`

### Usage

Enable reasoning in settings:

```typescript
const response = await llmService.sendMessage({
  providerId: 'anthropic',
  modelId: 'claude-3-7-sonnet-20250219',
  messages: [{ role: 'user', content: 'Solve this step by step...' }],
  settings: {
    reasoning: { enabled: true, effort: 'high' }
  }
});

// Access reasoning output
if (response.object === 'chat.completion' && response.choices[0].reasoning) {
  console.log('Reasoning:', response.choices[0].reasoning);
}
```

See [LLM Service - Reasoning Mode](llm-service.md#reasoning-mode) for details.

For models without native reasoning, use [Thinking Tag Fallback](llm-service.md#thinking-tag-fallback).

---

## Environment Variables

**API Keys** (cloud providers):
- `ANTHROPIC_API_KEY`
- `OPENAI_API_KEY`
- `GEMINI_API_KEY`
- `MISTRAL_API_KEY`
- `OPENROUTER_API_KEY`

**Base URLs** (optional):
- `OPENAI_API_BASE_URL` (default: `https://api.openai.com/v1`)
- `OPENROUTER_API_BASE_URL` (default: `https://openrouter.ai/api/v1`)
- `LLAMACPP_API_BASE_URL` (default: `http://127.0.0.1:8080`)
- `GENAI_ELECTRON_IMAGE_BASE_URL` (default: `http://127.0.0.1:8081`)

**OpenRouter App Attribution** (optional):
- `OPENROUTER_HTTP_REFERER` - Your app's URL for rankings
- `OPENROUTER_SITE_TITLE` - Your app's display name

**Setting variables:**

```bash
# macOS/Linux
export OPENAI_API_KEY=sk-...
export ANTHROPIC_API_KEY=sk-ant-...

# Windows (Command Prompt)
set OPENAI_API_KEY=sk-...

# Windows (PowerShell)
$env:OPENAI_API_KEY="sk-..."
```
