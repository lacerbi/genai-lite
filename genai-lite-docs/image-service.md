# Image Service

Complete guide to AI image generation using genai-lite's ImageService.

## Contents

- [Overview](#overview) - When to use ImageService
- [Basic Usage - Cloud](#basic-usage---cloud-openai-images) - OpenAI image generation
- [Basic Usage - Local](#basic-usage---local-genai-electron-diffusion) - Local diffusion models
- [Provider Capabilities](#provider-capabilities) - What each provider supports
- [Progress Callbacks](#progress-callbacks-local-diffusion) - Real-time generation monitoring
- [Generating Multiple Images](#generating-multiple-images) - Batch generation
- [Image Presets](#image-presets) - Pre-configured settings
- [Provider-Specific Settings](#provider-specific-settings) - Advanced configuration
- [Error Handling](#error-handling) - Handling failures
- [Related Documentation](#related-documentation) - Provider info, examples

## Overview

The `ImageService` class provides a unified interface for AI image generation across cloud providers (OpenAI Images: gpt-image-1, DALL-E 3, DALL-E 2) and local providers (genai-electron: Stable Diffusion via stable-diffusion.cpp).

## Basic Usage - Cloud (OpenAI Images)

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
} else {
  console.error('Error:', result.error.message);
}
```

**Using different models**:

```typescript
// gpt-image-1: 32K char prompts, highest quality
{ modelId: 'gpt-image-1', settings: { quality: 'high' } }

// dall-e-3: 4K char prompts, portrait/landscape support
{ modelId: 'dall-e-3', settings: { width: 1024, height: 1792, quality: 'hd', style: 'vivid' } }

// dall-e-2: 1K char prompts, multiple images supported
{ modelId: 'dall-e-2', count: 4, settings: { width: 512, height: 512 } }
```

See [Providers & Models - OpenAI Images](providers-and-models.md#openai-images) for complete capabilities.

---

## Basic Usage - Local (genai-electron Diffusion)

Start the genai-electron diffusion server on port 8081, then:

```typescript
import { ImageService } from 'genai-lite';

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
      seed: 42
    }
  }
});

if (result.object === 'image.result') {
  console.log('Seed:', result.data[0].seed);
  require('fs').writeFileSync('dragon.png', result.data[0].data);
}
```

**Configuration**: Set `GENAI_ELECTRON_IMAGE_BASE_URL` environment variable to override default `http://localhost:8081`.

See [Providers & Models - genai-electron Diffusion](providers-and-models.md#genai-electron-diffusion-local).

---

## Provider Capabilities

### OpenAI Images

**Models**: gpt-image-1, gpt-image-1-mini, dall-e-3, dall-e-2

**Capabilities**:
- Multiple images per request (n parameter, except dall-e-3 which only supports n=1)
- Quality settings: `auto`, `high`, `medium`, `low`, `hd`, `standard`
- Style options: `vivid` (hyper-real), `natural` (photographic)
- Multiple formats: PNG, JPEG, WebP
- Background options: auto, transparent, opaque (gpt-image-1 models)
- Prompt lengths: 32K (gpt-image-1), 4K (dall-e-3), 1K (dall-e-2)

**Dimensions**:
- gpt-image-1/mini: Multiple resolutions
- DALL-E 3: 1024×1024, 1024×1792, 1792×1024
- DALL-E 2: 256×256, 512×512, 1024×1024

### genai-electron Diffusion

**Models**: stable-diffusion (generic ID for loaded model)

**Capabilities**:
- Negative prompts for better control
- Multiple samplers: `euler_a`, `euler`, `heun`, `dpm2`, `dpm++2s_a`, `dpm++2m`, `dpm++2mv2`, `lcm`
- Adjustable steps (1-150), CFG scale (1.0-30.0)
- Custom seeds for reproducibility
- Real-time progress callbacks
- Batch generation support
- Arbitrary dimensions (64-2048 pixels)

See [Providers & Models](providers-and-models.md#image-generation-providers) for complete capabilities.

---

## Progress Callbacks (Local Diffusion)

Monitor generation progress in real-time:

```typescript
const result = await imageService.generateImage({
  providerId: 'genai-electron-images',
  modelId: 'stable-diffusion',
  prompt: 'A detailed landscape painting',
  settings: {
    width: 1024,
    height: 1024,
    diffusion: {
      steps: 30,
      onProgress: (progress) => {
        console.log(`${progress.stage}: ${progress.currentStep}/${progress.totalSteps} (${progress.percentage}%)`);
      }
    }
  }
});
```

**Stages**: `loading` (model loading), `diffusion` (image generation), `decoding` (latents to final image)

**Callback type**:
```typescript
type ImageProgressCallback = (progress: {
  stage: 'loading' | 'diffusion' | 'decoding';
  currentStep?: number;
  totalSteps?: number;
  percentage?: number;
}) => void;
```

---

## Generating Multiple Images

Use `count` parameter to generate multiple variations:

```typescript
const result = await imageService.generateImage({
  providerId: 'openai-images',
  modelId: 'gpt-image-1-mini',
  prompt: 'A cute robot assistant',
  count: 4,
  settings: { width: 512, height: 512 }
});

result.data.forEach((image, index) => {
  require('fs').writeFileSync(`output-${index}.png`, image.data);
  console.log(`Image ${index} seed:`, image.seed);
});
```

**Notes**:
- DALL-E 3 only supports `count: 1`
- genai-electron automatically varies seeds for each image in batch
- Use same `seed` value with genai-electron to reproduce exact results

---

## Image Presets

genai-lite includes 10+ built-in presets for common use cases.

```typescript
const presets = imageService.getPresets();

// Use a preset
const result = await imageService.generateImage({
  presetId: 'openai-dalle-3-hd',
  prompt: 'A futuristic city at night'
});

// Override preset settings
const result2 = await imageService.generateImage({
  presetId: 'genai-electron-sdxl-quality',
  prompt: 'A portrait of a wise old wizard',
  settings: {
    width: 768,
    diffusion: { steps: 40 }
  }
});
```

### Available Presets

**OpenAI Presets**:
- `openai-gpt-image-1-mini-default` - Default gpt-image-1-mini settings
- `openai-gpt-image-1-quality` - High-quality gpt-image-1
- `openai-dalle-3-hd` - DALL-E 3 HD quality
- `openai-dalle-3-natural` - DALL-E 3 natural style
- `openai-dalle-2-default` - DALL-E 2 default
- `openai-dalle-2-fast` - DALL-E 2 fast generation

**genai-electron Diffusion Presets**:
- `genai-electron-sdxl-quality` - High quality (30 steps)
- `genai-electron-sdxl-balanced` - Balanced quality/speed (20 steps)
- `genai-electron-sdxl-fast` - Fast generation (15 steps)
- `genai-electron-sdxl-portrait` - Portrait aspect ratio
- `genai-electron-sdxl-turbo` - Ultra-fast (8 steps)
- `genai-electron-sdxl-lightning` - Lightning-fast (4 steps)
- `genai-electron-sdxl-lightning-medium` - Lightning medium quality (6 steps)

### Custom Presets

Create your own presets:

```typescript
import { ImageService, fromEnvironment, ImagePreset } from 'genai-lite';

const customPresets: ImagePreset[] = [
  {
    id: 'my-portrait-preset',
    displayName: 'Custom Portrait Generator',
    description: 'Optimized for portrait photography',
    providerId: 'genai-electron-images',
    modelId: 'stable-diffusion',
    settings: {
      width: 768,
      height: 1024,
      diffusion: {
        steps: 35,
        cfgScale: 8.0,
        sampler: 'dpm++2m',
        negativePrompt: 'deformed, ugly, bad anatomy'
      }
    }
  }
];

const imageService = new ImageService(fromEnvironment, {
  presets: customPresets,
  presetMode: 'extend'  // 'extend' adds to defaults, 'replace' uses only custom
});
```

See [Core Concepts - Preset System](core-concepts.md#preset-system) for details.

---

## Provider-Specific Settings

### OpenAI-Specific Settings

Use the `openai` namespace for gpt-image-1 models:

```typescript
const result = await imageService.generateImage({
  providerId: 'openai-images',
  modelId: 'gpt-image-1',
  prompt: 'A professional product photo',
  settings: {
    width: 1024,
    height: 1024,
    quality: 'high',
    style: 'natural',
    openai: {
      outputFormat: 'png',
      background: 'transparent',
      moderation: 'auto',
      outputCompression: 85
    }
  }
});
```

**OpenAI-Specific Options** (gpt-image-1 models only):
- **outputFormat**: `'png' | 'jpeg' | 'webp'`
- **background**: `'auto' | 'transparent' | 'opaque'`
- **moderation**: `'auto' | 'low'`
- **outputCompression**: 0-100 (JPEG/WebP only)

### Diffusion-Specific Settings

Use the `diffusion` namespace for local diffusion:

```typescript
const result = await imageService.generateImage({
  providerId: 'genai-electron-images',
  modelId: 'stable-diffusion',
  prompt: 'A mystical forest with glowing mushrooms',
  settings: {
    width: 1024,
    height: 1024,
    diffusion: {
      negativePrompt: 'ugly, blurry, low quality, oversaturated',
      steps: 30,
      cfgScale: 7.5,
      sampler: 'dpm++2m',
      seed: 12345,
      onProgress: (progress) => console.log(`${progress.percentage}%`)
    }
  }
});
```

**Diffusion Options**:
- **negativePrompt**: What to avoid
- **steps**: 1-150 (more = higher quality, slower)
- **cfgScale**: 1.0-30.0 (prompt adherence, 7-8 typical)
- **sampler**: Algorithm (see below)
- **seed**: For reproducibility
- **onProgress**: Progress callback

**Available Samplers**:
- `euler_a` - Fast, recommended for beginners
- `euler` - Deterministic variant of euler_a
- `dpm++2m` - High quality, recommended for finals
- `dpm++2s_a` - Balanced speed/quality
- `heun` - High quality, slower
- `dpm2` - Alternative high-quality
- `lcm` - Extremely fast (LCM models only, 4-8 steps)

---

## Error Handling

All responses use error envelopes with discriminated unions:

```typescript
const result = await imageService.generateImage({
  providerId: 'openai-images',
  modelId: 'gpt-image-1-mini',
  prompt: 'A beautiful sunset'
});

if (result.object === 'error') {
  switch (result.error.type) {
    case 'authentication_error':
      console.error('Invalid API key');
      break;
    case 'rate_limit_error':
      console.error('Rate limit exceeded');
      break;
    case 'validation_error':
      console.error('Invalid request:', result.error.message);
      break;
    case 'network_error':
      console.error('Server not reachable:', result.error.message);
      break;
    default:
      console.error('Error:', result.error.message);
  }
} else {
  const image = result.data[0];
  console.log('Generated:', image.seed);
}
```

See [Core Concepts - Error Handling](core-concepts.md#error-handling).

---

## Related Documentation

### Essential Reading

- **[Core Concepts](core-concepts.md)** - API keys, presets, error handling
- **[Providers & Models](providers-and-models.md)** - Image model capabilities and details

### Examples

- **[Image Demo Example](example-image-demo.md)** - Integration patterns for image generation applications

### Reference

- **[TypeScript Reference](typescript-reference.md)** - Type definitions for image generation
- **[Troubleshooting](troubleshooting.md)** - Common image generation issues
