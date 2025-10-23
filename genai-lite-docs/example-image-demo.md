# Example: Image Generation Demo Application

Reference implementation demonstrating integration patterns for image generation applications using genai-lite.

## Contents

- [Overview](#overview) - What the demo shows
- [Features](#features) - Key capabilities demonstrated
- [Architecture](#architecture) - Technical structure
- [Key Patterns](#key-patterns--learnings) - Implementation insights
- [Running the Demo](#running-the-demo) - Setup and usage
- [Using for Testing](#using-for-testing) - Quick testing workflow
- [Related Documentation](#related-documentation) - API references

## Overview

**Location**: `examples/image-gen-demo/`

Full-featured React + Express application demonstrating integration patterns for image generation. Shows both cloud (OpenAI Images) and local (genai-electron diffusion) providers with real-time progress monitoring, batch generation, and comprehensive provider-specific settings.

**Use this demo to**: Learn integration patterns for image generation apps, test library changes interactively, reference UI/backend implementation approaches.

## Features

### Multi-Provider Support
- OpenAI Images (all DALL-E models) and genai-electron diffusion
- Dynamic availability checking (API keys + server health)
- Provider-specific settings (quality, style, samplers, etc.)

### Settings & Presets
- Universal settings (width, height, quality) + provider-specific namespaces
- 7 size presets (512×512, 1024×1024, etc.) + custom dimensions
- 10+ built-in presets with auto-clear on manual changes
- Batch generation (1-4 images)

### Progress & Image Management
- Real-time SSE progress for diffusion (loading → diffusion → decoding)
- Gallery with responsive grid + auto-scroll
- Lightbox with keyboard navigation (← → ESC)
- Download, delete, view metadata (dimensions, seed, time)

## Architecture

### Technology Stack

**Frontend**: React 18 + TypeScript + Vite, SSE for real-time updates, responsive CSS Grid

**Backend**: Express + TypeScript, genai-lite ImageService, SSE streaming, Buffer→base64 conversion

**Communication**: REST API + SSE for progress, JSON with base64-encoded images

### Project Structure

```
examples/image-gen-demo/
├── server/
│   ├── index.ts
│   ├── services/image.ts       # ImageService wrapper + availability checks
│   └── routes/                 # health, providers, models, presets, image
└── src/
    ├── components/             # 13 React components
    │   ├── ImageGenInterface.tsx   # Main orchestrator
    │   ├── ImageGallery.tsx        # Gallery + modal
    │   ├── ImageModal.tsx          # Lightbox with keyboard nav
    │   ├── SettingsPanel.tsx       # Settings UI
    │   └── ...                     # ProviderSelector, ProgressDisplay, etc.
    ├── types/index.ts
    ├── api/client.ts           # SSE client
    └── App.tsx
```

## Key Patterns & Learnings

### Pattern: Provider Availability Checking

Check provider availability before displaying as options (`server/services/image.ts`):

```typescript
async function checkProviderAvailable(providerId: string): Promise<boolean> {
  if (providerId === 'genai-electron-images') {
    try {
      const baseURL = process.env.GENAI_ELECTRON_IMAGE_BASE_URL || 'http://localhost:8081';
      const response = await fetch(`${baseURL}/health`, {
        signal: AbortSignal.timeout(2000)  // Prevent UI hangs
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  if (providerId === 'openai-images') {
    return !!process.env.OPENAI_API_KEY;
  }

  return false;
}

export async function getImageProviders() {
  const providers = await imageService.getProviders();
  return await Promise.all(
    providers.map(async (provider) => ({
      ...provider,
      available: await checkProviderAvailable(provider.id)
    }))
  );
}
```

**Key insight**: Use `AbortSignal.timeout()` to prevent long-running health checks from hanging the UI.

### Pattern: Buffer to Base64 Conversion

ImageService returns Buffers, but JSON requires strings. Convert on backend, decode on frontend:

**Backend** (`server/services/image.ts`):
```typescript
export async function generateImage(request) {
  const response = await imageService.generateImage(imageRequest);

  if (response.object === 'image.result') {
    return {
      images: response.data.map(img => ({
        index: img.index,
        data: img.data.toString('base64'),
        seed: img.seed,
        width: img.metadata?.width || request.settings?.width,
        height: img.metadata?.height || request.settings?.height
      })),
      // ... other fields
    };
  }
}
```

**Frontend** - Display and download:
```typescript
// Display
<img src={`data:image/png;base64,${image.data}`} alt="Generated" />

// Download
const blob = base64ToBlob(image.data, 'image/png');
const url = URL.createObjectURL(blob);
const a = document.createElement('a');
a.href = url;
a.download = `generated-${Date.now()}.png`;
a.click();
```

### Pattern: Real-Time Progress with SSE

Stream progress updates using Server-Sent Events with manual parsing via fetch + ReadableStream.

**Backend** (`server/routes/image.ts`):
```typescript
imageRouter.post('/generate-stream', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const startTime = Date.now();

  // Helper to send SSE events with proper format
  const sendEvent = (eventType: string, data: any) => {
    res.write(`event: ${eventType}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  sendEvent('start', { message: 'Generation started', timestamp: startTime });

  const onProgress = (progress) => {
    sendEvent('progress', {
      ...progress,
      elapsed: Date.now() - startTime
    });
  };

  const result = await generateImage({ ...req.body, onProgress });

  if (result.success) {
    sendEvent('complete', { result: result.result, elapsed: Date.now() - startTime });
  } else {
    sendEvent('error', { error: result.error, elapsed: Date.now() - startTime });
  }

  res.end();
});
```

**Frontend** (`src/api/client.ts`) - Manual SSE parsing:
```typescript
export async function generateImageStream(request, callbacks) {
  return new Promise((resolve, reject) => {
    fetch(`${API_BASE}/generate-stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    })
    .then(async (response) => {
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let currentEvent = '';
      let currentData = '';
      let isProcessing = true;

      const processChunk = async () => {
        const { done, value } = await reader.read();
        if (done) return;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('event:')) {
            currentEvent = line.slice(6).trim();
          } else if (line.startsWith('data:')) {
            currentData = line.slice(5).trim();
          } else if (line === '' && currentEvent && currentData) {
            handleEvent(currentEvent, currentData);
            currentEvent = '';
            currentData = '';
          }
        }

        if (isProcessing) processChunk();
      };

      const handleEvent = (eventType, dataStr) => {
        const data = JSON.parse(dataStr);

        switch (eventType) {
          case 'start':
            callbacks?.onStart?.();
            break;
          case 'progress':
            callbacks?.onProgress?.(data);
            break;
          case 'complete':
            isProcessing = false;
            resolve({ success: true, result: data.result });
            break;
          case 'error':
            isProcessing = false;
            resolve({ success: false, error: data.error });
            break;
        }
      };

      processChunk();
    })
    .catch(reject);
  });
}
```

**Key insight**: Native EventSource doesn't support POST requests. Use fetch + ReadableStream + manual parsing to handle SSE with POST. Buffer incomplete lines between chunks.

### Pattern: Preset State Management

Track active preset separately and clear when user manually changes settings:

```typescript
function ImageGenInterface() {
  const [activePresetId, setActivePresetId] = useState<string | null>(null);
  const [settings, setSettings] = useState(defaultSettings);

  const handleApplyPreset = (preset) => {
    setProviderId(preset.providerId);
    setModelId(preset.modelId);
    setSettings(preset.settings);
    setActivePresetId(preset.id);
  };

  const handleSettingsChange = (newSettings) => {
    setSettings(newSettings);
    setActivePresetId(null);  // Auto-clear on manual change
  };

  return (
    <>
      <PresetSelector presets={presets} activePresetId={activePresetId} onApply={handleApplyPreset} />
      <SettingsPanel settings={settings} onChange={handleSettingsChange} />
    </>
  );
}
```

**Key insight**: Separate `activePresetId` state enables visual indication of which preset is active and auto-clears when user modifies settings.

### Pattern: Keyboard Navigation in Lightbox

Keyboard controls with proper event cleanup:

```typescript
function ImageModal({ images, currentIndex, onClose, onNavigate }) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft') onNavigate(Math.max(0, currentIndex - 1));
      else if (e.key === 'ArrowRight') onNavigate(Math.min(images.length - 1, currentIndex + 1));
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [currentIndex, images.length, onClose, onNavigate]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <img src={images[currentIndex].src} alt="Full size" />
        <div className="modal-nav">
          {currentIndex > 0 && <button onClick={() => onNavigate(currentIndex - 1)}>←</button>}
          {currentIndex < images.length - 1 && <button onClick={() => onNavigate(currentIndex + 1)}>→</button>}
        </div>
      </div>
    </div>
  );
}
```

**Key insight**: Use `stopPropagation()` on content to prevent closing when clicking image. Clean up listeners in useEffect return.

### Pattern: Error Display with User-Friendly Messages

Map error types to actionable messages:

```typescript
const getUserMessage = (errorType: string) => {
  switch (errorType) {
    case 'authentication_error':
      return 'Invalid API key. Check your .env file and restart the server.';
    case 'network_error':
      return 'Cannot reach the server. For genai-electron, ensure it\'s running on port 8081.';
    // ... other cases
    default:
      return error.message || 'An unexpected error occurred.';
  }
};
```

Provide specific actionable guidance (file locations, port numbers) when possible.

### Pattern: Request Validation & Error Mapping

Validate inputs and map error types to appropriate HTTP status codes:

```typescript
// Validate required fields
imageRouter.post('/generate', async (req, res) => {
  const { providerId, modelId, prompt, count, settings } = req.body;

  if (!providerId || !modelId || !prompt) {
    return res.status(400).json({
      success: false,
      error: {
        message: 'Missing required fields: providerId, modelId, and prompt are required',
        code: 'VALIDATION_ERROR',
        type: 'validation_error'
      }
    });
  }

  // Validate ranges
  if (count !== undefined && (count < 1 || count > 4)) {
    return res.status(400).json({
      success: false,
      error: {
        message: 'Count must be between 1 and 4',
        code: 'VALIDATION_ERROR',
        type: 'validation_error'
      }
    });
  }

  const result = await generateImage({ providerId, modelId, prompt, count, settings });

  if (result.success) {
    res.json(result);
  } else {
    const statusCode = getStatusCodeForError(result.error?.type);
    res.status(statusCode).json(result);
  }
});

// Map error types to HTTP status codes
function getStatusCodeForError(errorType?: string): number {
  switch (errorType) {
    case 'authentication_error': return 401;
    case 'rate_limit_error': return 429;
    case 'validation_error': return 400;
    case 'network_error': return 503;
    case 'provider_error': return 502;
    default: return 500;
  }
}
```

## Prerequisites

- Node.js 18+ and npm
- At least one of:
  - **OpenAI API key** for cloud image generation
  - **genai-electron** server running locally for diffusion

**Note**: OpenAI Images accepts both `OPENAI_API_KEY` (standard) and `OPENAI_IMAGES_API_KEY`.

## Running the Demo

```bash
cd examples/image-gen-demo
npm install

# Configure .env with API keys
# OPENAI_API_KEY=sk-...
# GENAI_ELECTRON_IMAGE_BASE_URL=http://localhost:8081  # optional

npm run dev
# Frontend: http://localhost:5174
# Backend: http://localhost:3001

# Optional: Run backend/frontend separately
# npm run dev:backend
# npm run dev:frontend
```

## API Endpoints

The backend provides:

- `GET /api/health` - Health check
- `GET /api/image-providers` - List providers with availability status
- `GET /api/image-models/:providerId` - Get models for a provider
- `GET /api/image-presets` - List configured presets
- `POST /api/generate` - Generate image(s) (standard JSON)
- `POST /api/generate-stream` - Generate with SSE progress updates

## Using for Testing

Quick workflow for testing ImageService changes:

1. Make changes to genai-lite ImageService
2. Build: `npm run build` (in genai-lite root)
3. Restart demo: `npm run dev`
4. Test at http://localhost:5174

**What to test**:
- Provider availability detection, API key handling
- Settings validation (universal + provider namespaces)
- Progress monitoring (stage transitions, percentages)
- Error handling (authentication, network, validation errors)
- Batch generation (seed variation, gallery display)

**Debugging**: Backend logs in terminal, frontend logs in DevTools Console (F12), network inspection in DevTools Network tab for SSE events.

## Troubleshooting

### OpenAI Images Not Available
- Verify API key is set in `.env` and starts with `sk-`
- Ensure you have credits in your OpenAI account
- Restart the server after adding API key

### genai-electron Not Available
- Start genai-electron diffusion server on port 8081
- Verify: `curl http://localhost:8081/health`
- Check `GENAI_ELECTRON_IMAGE_BASE_URL` in `.env`

### Port Already in Use
- Change `PORT` in `.env` for backend (default: 3001)
- Change `server.port` in `vite.config.ts` for frontend (default: 5174)

## Related Documentation

### APIs Used in This Demo

- **[Image Service](image-service.md)** - Main API for image generation
- **[Image Service - Progress Callbacks](image-service.md#progress-callbacks-local-diffusion)** - Real-time progress monitoring
- **[Image Service - Presets](image-service.md#image-presets)** - Built-in preset system
- **[Core Concepts](core-concepts.md)** - API keys, presets, error handling

### Reference

- **[Providers & Models](providers-and-models.md#image-generation-providers)** - Image provider capabilities
- **[TypeScript Reference](typescript-reference.md#image-types)** - Image type definitions
- **[Troubleshooting](troubleshooting.md)** - Common image generation issues
