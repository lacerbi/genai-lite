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

**Gemini 2.0 Series:**
- `gemini-2.0-flash` - Gemini 2.0 Flash (1M context, multimodal, no native reasoning)
- `gemini-2.0-flash-lite` - Gemini 2.0 Flash-Lite (1M context, multimodal, no native reasoning)

**Gemma 3 (Open Weights, Free):**
- `gemma-3-27b-it` - Gemma 3 27B (128K context, multimodal, free via Gemini API)

**Notes:**
- Role naming: `user`/`model` instead of `user`/`assistant`
- Unique safety settings structure
- Gemini models support multimodal (text, images, audio, video)
- Gemma 3 27B is open-weight and **free** via the Gemini API (no API costs)

---

### Mistral

**Provider ID**: `mistral`
**Environment Variable**: `MISTRAL_API_KEY`

**⚠️ Status**: Adapter under development. Currently uses mock adapter for testing.

**Models (when complete):**

- `codestral-2501` - Codestral (256K context, code-focused)
- `devstral-small-2505` - Devstral Small (131K context, compact)

---

### llama.cpp (Local Models)

**Provider ID**: `llamacpp`
**Environment Variable**: `LLAMACPP_API_BASE_URL` (default: `http://localhost:8080`)
**API Key**: Not required

**Generic Model ID:**

- `llamacpp` - Generic ID for whatever GGUF model you've loaded in the server

**Automatic Capability Detection:**

genai-lite automatically detects capabilities (reasoning support, context windows, token limits) by matching GGUF filenames from the server. No configuration needed.

**Currently recognized:**
- **Qwen3** (all sizes: 30B, 14B, 8B, 4B, 1.7B, 0.6B) - Native reasoning support (requires `--reasoning-format deepseek` server flag)

For unrecognized models, uses sensible fallback defaults.

**Notes:**
- OpenAI-compatible API (uses OpenAI SDK internally)
- Supports any GGUF model from Hugging Face
- No API costs, completely private
- See [llama.cpp Integration](llamacpp-integration.md) for setup

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
**Environment Variable**: `GENAI_ELECTRON_IMAGE_BASE_URL` (default: `http://localhost:8081`)
**API Key**: Not required

**Generic Model ID:**

- `stable-diffusion` - Generic ID for whatever diffusion model is loaded (SDXL, SD 1.5, etc.)

**Capabilities:**
- Dimensions: 64-2048 pixels
- Negative prompts, custom seeds, progress callbacks, batch generation
- Steps: 1-150, CFG scale: 1.0-30.0

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

**llama.cpp**: Qwen3 models (requires `--reasoning-format deepseek` server flag)

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

**Base URLs** (optional):
- `OPENAI_API_BASE_URL` (default: `https://api.openai.com/v1`)
- `LLAMACPP_API_BASE_URL` (default: `http://localhost:8080`)
- `GENAI_ELECTRON_IMAGE_BASE_URL` (default: `http://localhost:8081`)

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
