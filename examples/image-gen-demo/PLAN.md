# Image Generation Demo App Plan: genai-lite Image API Showcase

**Date:** October 22, 2025
**Status:** Planning Phase - Decisions Finalized
**Purpose:** Comprehensive plan for building an interactive demo application to showcase genai-lite image generation features

**Key Decisions Made:**
- Frontend: React + TypeScript (consistent with chat-demo)
- Module System: ESM (verified compatible with genai-lite)
- Styling: Minimal CSS initially (can upgrade later)
- UI: Grid gallery view with settings panel
- Batch Generation: Core feature from Phase 1
- Scope: Text-to-image only (matches current API)
- Progress: Detailed progress bar (no partial results)

---

## 1. Executive Summary

### What We're Building

An interactive web-based image generation application that demonstrates all major features of the genai-lite ImageService API. The app will allow users to:
- Generate images using text prompts with multiple AI providers (OpenAI Images, genai-electron diffusion)
- Switch between cloud and local providers dynamically
- Configure universal settings (width, height, quality) and provider-specific options
- Generate multiple images in a single request (batch generation)
- Monitor real-time progress for local diffusion models
- View generated images in a responsive grid gallery
- Download and manage generated images
- Test image generation presets

### Goals

1. **Living Documentation** - Show real working code for image generation rather than static examples
2. **Feature Showcase** - Demonstrate all ImageService capabilities (presets, batch generation, progress callbacks)
3. **Development Tool** - Quick testing environment for image API changes
4. **User Onboarding** - Help developers understand how to integrate image generation
5. **Integration Testing** - Real-world usage context for the ImageService API

### Why This Matters

- genai-lite just added comprehensive image generation support - this showcases it end-to-end
- Image APIs are complex (async polling, progress, multiple providers) - a working demo clarifies usage
- Developers learn better from interactive examples with visual feedback
- Complements chat-demo to show genai-lite's full capabilities (LLM + Images)
- Can be used in demos, documentation links, and API testing

---

## 2. Architecture Overview

### High-Level Architecture

```
┌─────────────────────────────────────┐
│         Browser (Frontend)          │
│      Vite + React + TypeScript      │
│   - Prompt Input                    │
│   - Settings Panel                  │
│   - Provider Selection              │
│   - Image Gallery                   │
│   - Progress Display                │
└──────────────┬──────────────────────┘
               │ HTTP/REST API
               │
┌──────────────▼──────────────────────┐
│      Backend (Express Server)       │
│   - Image generation endpoints      │
│   - Uses genai-lite ImageService    │
│   - API key management              │
│   - Async polling for diffusion     │
│   - Binary image handling           │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│        genai-lite Library           │
│   - ImageService                    │
│   - Provider adapters               │
│   - Progress callbacks              │
│   - Settings resolution             │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│  Image Providers (Cloud/Local)      │
│   - OpenAI Images API               │
│   - genai-electron diffusion server │
└─────────────────────────────────────┘
```

### Why Backend + Frontend?

**Cannot run genai-lite directly in browser because:**
1. Uses Node.js-specific APIs (HTTP clients, Buffer handling, etc.)
2. API keys must not be exposed in browser code
3. CORS issues with direct API calls
4. Binary image data handling requires Node.js Buffer
5. Async polling for diffusion requires server-side state

**Solution:** Express backend that uses genai-lite ImageService, frontend makes requests to backend

---

## 3. Project Structure

```
genai-lite/
├── examples/
│   └── image-gen-demo/
│       ├── package.json              # Separate package.json for the demo
│       ├── .env.example              # Example environment variables
│       ├── README.md                 # How to run the demo
│       ├── PLAN.md                   # This file
│       ├── tsconfig.json             # TypeScript config
│       ├── vite.config.ts            # Vite config
│       │
│       ├── server/                   # Backend (Express)
│       │   ├── index.ts              # Express server entry point
│       │   ├── routes/
│       │   │   ├── image.ts          # POST /api/generate endpoint
│       │   │   ├── providers.ts      # GET /api/image-providers
│       │   │   ├── models.ts         # GET /api/image-models/:providerId
│       │   │   └── presets.ts        # GET /api/image-presets
│       │   └── services/
│       │       └── image.ts          # genai-lite ImageService initialization
│       │
│       └── src/                      # Frontend (Vite + React)
│           ├── main.tsx              # Entry point (React)
│           ├── App.tsx               # Root React component
│           ├── index.html            # HTML template
│           ├── style.css             # Styling
│           ├── components/
│           │   ├── ImageGenInterface.tsx  # Main orchestrator
│           │   ├── PromptInput.tsx        # Prompt text area
│           │   ├── ProviderSelector.tsx   # Provider/model selection
│           │   ├── SettingsPanel.tsx      # Settings configuration
│           │   ├── ImageGallery.tsx       # Grid display of images
│           │   ├── ImageCard.tsx          # Single image with metadata
│           │   ├── ProgressDisplay.tsx    # Progress bar for diffusion
│           │   └── ErrorDisplay.tsx       # Error messages
│           ├── api/
│           │   └── client.ts         # API client for backend
│           └── types/
│               └── index.ts          # TypeScript types
```

---

## 4. Technical Stack

### Frontend

**Vite + React + TypeScript**

**Why Vite?**
- Fast hot module reload (instant feedback during development)
- Excellent React support with official plugin
- Built-in TypeScript support
- Simple configuration
- Modern, well-maintained

**Why React?**
- Consistent with chat-demo (developer experience)
- Excellent for handling image galleries and dynamic UI
- Large ecosystem and community
- Works seamlessly with Vite and TypeScript
- Component reuse for image cards, settings, etc.

**Frontend Dependencies:**
```json
{
  "react": "^18.3.0",
  "react-dom": "^18.3.0",
  "@types/react": "^18.3.0",
  "@types/react-dom": "^18.3.0",
  "@vitejs/plugin-react": "^4.3.0",
  "vite": "^5.0.0",
  "typescript": "^5.3.0"
}
```

### Backend

**Express + TypeScript**

**Why Express?**
- Minimal, well-known
- Easy to add endpoints for image generation
- Handles binary data (image Buffers) well
- Small footprint
- Good for async operations (polling for diffusion)

**Backend Dependencies:**
```json
{
  "express": "^4.18.0",
  "@types/express": "^4.17.0",
  "genai-lite": "file:../..",  // Local link to parent package
  "dotenv": "^16.0.0",
  "cors": "^2.8.5",
  "@types/cors": "^2.8.0",
  "tsx": "^4.0.0"  // For running TypeScript directly
}
```

### Development Tools

- **tsx** - Run TypeScript files directly without build step
- **concurrently** - Run frontend and backend simultaneously
- **nodemon** - Auto-restart backend on changes

---

## 5. Implementation Phases

### Phase 1: Project Setup (Foundation)

**Goal:** Get a basic project structure running

**Tasks:**
1. Create `examples/image-gen-demo/` directory
2. Initialize package.json with dependencies
3. Set up TypeScript configs (one for backend, one for frontend)
4. Set up Vite config with proxy for backend API
5. Create basic HTML template
6. Create `.env.example` with required API keys
7. Add npm scripts:
   - `dev` - Run both frontend and backend
   - `dev:frontend` - Vite dev server
   - `dev:backend` - Express server with tsx
   - `build` - Build frontend for production

**Expected Output:**
- Can run `npm run dev` and see "Hello World" in browser
- Backend responds to `/api/health` endpoint
- Frontend can fetch from backend

### Phase 2: Backend API (Core Functionality)

**Goal:** Backend that can generate images via genai-lite ImageService

**Tasks:**
1. Initialize genai-lite ImageService in `server/services/image.ts`
2. Implement `/api/image-providers` endpoint
   - Returns list of available image providers
3. Implement `/api/image-models/:providerId` endpoint
   - Returns models for a provider
4. Implement `/api/image-presets` endpoint
   - Returns configured image presets
5. Implement `/api/generate` endpoint (core image generation)
   - Accepts: { providerId, modelId, prompt, count, settings }
   - Returns: Base64-encoded image(s) with metadata
   - Handles progress callbacks for diffusion
6. Handle API key management via environment variables
7. Add error handling and logging

**API Endpoints:**

```typescript
// GET /api/image-providers
Response: {
  providers: Array<{
    id: string,
    name: string,
    available: boolean  // False if API key missing
  }>
}

// GET /api/image-models/:providerId
Response: {
  models: Array<{
    id: string,
    name: string,
    description: string,
    capabilities: { ... }
  }>
}

// GET /api/image-presets
Response: {
  presets: Array<{
    id: string,
    displayName: string,
    providerId: string,
    modelId: string,
    settings: { ... }
  }>
}

// POST /api/generate
Request: {
  providerId: string,
  modelId: string,
  prompt: string,
  count?: number,  // Default 1, max 4
  settings?: {
    width?: number,
    height?: number,
    quality?: 'auto' | 'high' | 'medium' | 'low',
    style?: 'vivid' | 'natural',
    diffusion?: {
      negativePrompt?: string,
      steps?: number,
      cfgScale?: number,
      sampler?: string,
      seed?: number
    }
  }
}

Response: {
  success: boolean,
  result?: {
    images: Array<{
      index: number,
      data: string,  // Base64-encoded PNG
      seed?: number,
      width: number,
      height: number
    }>,
    created: number,
    providerId: string,
    modelId: string
  },
  progress?: {  // For diffusion (server-sent during generation)
    stage: string,
    currentStep: number,
    totalSteps: number,
    percentage: number
  },
  error?: { message: string, code: string }
}
```

### Phase 3: Frontend UI (User Interface)

**Goal:** Clean, functional image generation interface

**Tasks:**
1. Build ImageGenInterface component (main orchestrator)
   - Provider/model selection at top
   - Settings panel (collapsible sidebar)
   - Prompt input area
   - Generate button with loading state
   - Image gallery below

2. Build PromptInput component
   - Text area for prompt
   - Character count (show limit per provider)
   - Generate button

3. Build ProviderSelector component
   - Dropdown for provider (OpenAI, genai-electron)
   - Dropdown for model (populated based on provider)
   - Show availability status

4. Build SettingsPanel component
   - Universal settings: width, height, quality, style
   - Provider-specific sections:
     - OpenAI: quality, style, output format
     - Diffusion: negative prompt, steps, CFG, sampler, seed
   - Batch generation: count slider (1-4)
   - Preset selector

5. Build ImageGallery component
   - Responsive grid layout (2-4 columns based on screen size)
   - Shows all generated images
   - Auto-scroll to latest

6. Build ImageCard component
   - Image thumbnail/full size
   - Metadata (seed, dimensions, generation time)
   - Download button
   - Delete button

7. Build ProgressDisplay component
   - Progress bar with percentage
   - Stage indicator (loading, diffusion, decoding)
   - Current step / total steps
   - Time elapsed

8. Add loading states and error handling
9. Make it responsive (works on mobile)

**UI Layout:**

```
┌─────────────────────────────────────────────────┐
│  Provider: [OpenAI ▼]  Model: [gpt-image-1 ▼]  │
│  [Settings ⚙️]                                   │
├─────────────────────────────────────────────────┤
│  Prompt:                                         │
│  ┌─────────────────────────────────────────────┐│
│  │ A serene mountain lake at sunrise...        ││
│  │                                              ││
│  └─────────────────────────────────────────────┘│
│  [Generate Image] [⚙️ Settings]                 │
├─────────────────────────────────────────────────┤
│  Progress: ████████████░░░░░░ 60% (Diffusion)   │
│  Step 18/30 - 5.2s elapsed                      │
├─────────────────────────────────────────────────┤
│  Generated Images:                               │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐           │
│  │  img 1  │ │  img 2  │ │  img 3  │           │
│  │ 1024x   │ │ 1024x   │ │ 1024x   │           │
│  │ [⬇️][🗑️]│ │ [⬇️][🗑️]│ │ [⬇️][🗑️]│           │
│  └─────────┘ └─────────┘ └─────────┘           │
└─────────────────────────────────────────────────┘
```

### Phase 4: Advanced Features (genai-lite Showcase)

**Goal:** Demonstrate core genai-lite ImageService features

**Tasks:**
1. **Image Preset Integration**
   - Dropdown with library presets (12 presets from image-presets.json)
   - "Load Preset" button applies provider, model, and all settings
   - Display preset description and current selection
   - Show which settings came from the loaded preset

2. **genai-electron Health Check**
   - Server status indicator (green/red)
   - Model info display (which model is loaded)
   - "Test Connection" button
   - Health check endpoint integration

3. **Real-Time Progress for Diffusion**
   - Wire up ImageService progress callbacks to UI
   - Real-time progress bar with actual data
   - Stage indicators (loading, diffusion, decoding)
   - Step counter with actual steps (e.g., 18/30)
   - Percentage display from progress callbacks
   - Time elapsed during generation

### Phase 5: Polish & Documentation

**Goal:** Production-ready demo

**Tasks:**
1. Add example prompts (~5 good examples)
2. Write comprehensive README for the demo
3. Test on different browsers
4. Final testing with both OpenAI and genai-electron providers

---

## 6. Features to Implement

### Core Features (Must Have)

- ✅ Generate images from text prompts
- ✅ Switch providers/models on the fly
- ✅ Universal settings (width, height, quality, style)
- ✅ Provider-specific settings (diffusion controls)
- ✅ Batch generation (1-4 images per request)
- ✅ Progress monitoring for diffusion (real-time)
- ✅ Grid gallery display
- ✅ Download individual images
- ✅ Error handling with user-friendly messages
- ✅ Loading states
- ✅ Clear gallery

### Showcase Features (genai-lite Library Features)

- ❌ Image preset selection (12 library presets) - **Phase 4 Task 1**
- ✅ Negative prompts (diffusion)
- ✅ Seed display (metadata)
- ✅ Generation metadata (time, dimensions)
- ❌ Progress stages (loading, diffusion, decoding) - **Phase 4 Task 3**
- ❌ Provider health status - **Phase 4 Task 2**

### Nice to Have (Could Have)

- Export all images as ZIP
- Prompt templates/examples
- Side-by-side comparison (two providers, same prompt)
- Image upscaling (future API feature)
- Prompt refinement suggestions
- Cost estimation per generation
- Generation queue (multiple requests)
- Image variations (future API feature)

---

## 7. Dependencies

### Root package.json (No Changes Needed)

The example app will reference genai-lite using a local file reference.

### examples/image-gen-demo/package.json

```json
{
  "name": "genai-lite-image-gen-demo",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "concurrently \"npm:dev:backend\" \"npm:dev:frontend\"",
    "dev:frontend": "vite",
    "dev:backend": "tsx watch server/index.ts",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "genai-lite": "file:../..",
    "express": "^4.18.0",
    "cors": "^2.8.5",
    "dotenv": "^16.0.0",
    "react": "^18.3.0",
    "react-dom": "^18.3.0"
  },
  "devDependencies": {
    "@types/express": "^4.17.0",
    "@types/cors": "^2.8.0",
    "@types/node": "^20.0.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.0",
    "typescript": "^5.3.0",
    "vite": "^5.0.0",
    "tsx": "^4.0.0",
    "concurrently": "^8.0.0"
  }
}
```

---

## 8. Configuration

### Environment Variables

Create `.env.example`:

```bash
# API Keys (at least one required for cloud providers)
OPENAI_API_KEY=sk-...

# genai-electron diffusion (optional, defaults to http://localhost:8081)
GENAI_ELECTRON_IMAGE_BASE_URL=http://localhost:8081

# Server configuration
PORT=3001  # Different from chat-demo to allow running both
```

Create `.env` (gitignored) with actual keys during development.

### TypeScript Configs

**tsconfig.json** (shared base):
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "jsx": "react-jsx"
  }
}
```

**server/tsconfig.json** (backend):
```json
{
  "extends": "../tsconfig.json",
  "compilerOptions": {
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "./dist"
  },
  "include": ["server/**/*"]
}
```

**vite.config.ts**:
```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,  // Different from chat-demo (5173)
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true
      }
    }
  }
});
```

---

## 9. Development Workflow

### Initial Setup

```bash
cd examples/image-gen-demo
npm install
cp .env.example .env
# Edit .env with your API keys
```

### Running the Demo

```bash
# Start both frontend and backend
npm run dev

# Or run separately:
npm run dev:frontend  # Vite on http://localhost:5174
npm run dev:backend   # Express on http://localhost:3001
```

### For genai-electron Diffusion Testing

```bash
# In a separate terminal, start genai-electron diffusion server
# (Assumes genai-electron is installed and configured)
# Server should run on http://localhost:8081
```

### Building for Production

```bash
npm run build
npm run preview  # Preview the built app
```

---

## 10. Integration Points with genai-lite

### Backend Service Initialization

```typescript
// server/services/image.ts
import { ImageService, fromEnvironment } from 'genai-lite';

export const imageService = new ImageService(fromEnvironment);

// Get image providers
export async function getImageProviders() {
  const providers = await imageService.getProviders();

  // Check which providers have API keys or are available
  return providers.map(provider => ({
    ...provider,
    available: checkProviderAvailable(provider.id)
  }));
}

function checkProviderAvailable(providerId: string): boolean {
  if (providerId === 'genai-electron-images') {
    // TODO: Add health check for genai-electron
    return true;
  }
  const envVar = `${providerId.toUpperCase().replace(/-/g, '_')}_API_KEY`;
  return !!process.env[envVar];
}

// Get models for a provider
export async function getImageModels(providerId: string) {
  return await imageService.getModels(providerId);
}

// Get image presets
export function getImagePresets() {
  return imageService.getPresets();
}

// Generate image(s)
export async function generateImage(request: {
  providerId: string;
  modelId: string;
  prompt: string;
  count?: number;
  settings?: any;
  onProgress?: (progress: any) => void;
}) {
  const response = await imageService.generateImage({
    providerId: request.providerId,
    modelId: request.modelId,
    prompt: request.prompt,
    count: request.count,
    settings: {
      ...request.settings,
      diffusion: {
        ...request.settings?.diffusion,
        onProgress: request.onProgress
      }
    }
  });

  if (response.object === 'image.result') {
    return {
      success: true,
      result: {
        images: response.data.map(img => ({
          index: img.index,
          data: img.data.toString('base64'),  // Convert Buffer to base64 for JSON
          seed: img.seed,
          width: img.metadata?.width || request.settings?.width,
          height: img.metadata?.height || request.settings?.height
        })),
        created: response.created,
        providerId: response.providerId,
        modelId: response.modelId,
        usage: response.usage
      }
    };
  } else {
    return {
      success: false,
      error: {
        message: response.error.message,
        code: response.error.code
      }
    };
  }
}
```

### Progress Handling for Diffusion

```typescript
// server/routes/image.ts
import express from 'express';
import { generateImage } from '../services/image.js';

export const imageRouter = express.Router();

imageRouter.post('/generate', async (req, res) => {
  try {
    const { providerId, modelId, prompt, count, settings } = req.body;

    // Validate request
    if (!providerId || !modelId || !prompt) {
      return res.status(400).json({
        success: false,
        error: { message: 'Missing required fields', code: 'VALIDATION_ERROR' }
      });
    }

    // For diffusion with progress, we'll handle progress callbacks
    // Frontend can poll a separate endpoint, or we can use SSE
    // For simplicity, we'll return the result after completion

    const result = await generateImage({
      providerId,
      modelId,
      prompt,
      count,
      settings,
      onProgress: (progress) => {
        // TODO: In future, send progress via SSE
        console.log('Generation progress:', progress);
      }
    });

    res.json(result);
  } catch (error) {
    console.error('Image generation error:', error);
    res.status(500).json({
      success: false,
      error: {
        message: error instanceof Error ? error.message : 'Unknown error',
        code: 'SERVER_ERROR'
      }
    });
  }
});
```

---

## 11. UI/UX Considerations

### Layout Strategy

**Single Page with Main Content Area:**
- Top bar: Provider/model selection, health status
- Left sidebar: Settings panel (collapsible)
- Center: Prompt input and generate button
- Below: Progress display (when generating)
- Bottom: Image gallery (responsive grid)

**Settings Panel Sections:**
1. Universal Settings (always visible)
   - Width / Height sliders
   - Quality dropdown
   - Style dropdown

2. Batch Generation
   - Count slider (1-4)

3. Provider-Specific (conditional)
   - OpenAI: Output format, background
   - Diffusion: Negative prompt, steps, CFG, sampler, seed

### Styling

**Keep it minimal:**
- Clean, modern look
- Focus on the generated images (they are the star)
- Responsive grid gallery
- Clear visual feedback for loading states
- Smooth transitions for new images

**CSS Variables for theming:**
```css
:root {
  --primary-color: #8b5cf6;  /* Purple for image theme */
  --background: #ffffff;
  --text: #1f2937;
  --border: #e5e7eb;
  --success: #10b981;
  --warning: #f59e0b;
  --error: #ef4444;
}
```

### Components

**ImageGallery:**
- Responsive grid (2-4 columns)
- Images maintain aspect ratio
- Hover effects (brightness, overlay)
- Click to expand (lightbox)
- Show metadata on hover

**ImageCard:**
- Image with border
- Download button (top-right)
- Delete button (top-left)
- Metadata overlay (bottom): seed, dimensions, time
- Loading placeholder during generation

**SettingsPanel:**
- Collapsible sections
- Sliders with current value display
- Tooltips explaining each setting
- Validation feedback (e.g., min/max values)

**ProgressDisplay:**
- Horizontal progress bar with percentage
- Stage indicator with icons
- Current step / total steps
- Time elapsed
- Smooth animation

**PromptInput:**
- Multi-line text area
- Character count with provider limit
- Placeholder with example prompt
- Clear button

---

## 12. Code Snippets

### Frontend API Client

```typescript
// src/api/client.ts

export async function generateImage(request: {
  providerId: string;
  modelId: string;
  prompt: string;
  count?: number;
  settings?: any;
}) {
  const response = await fetch('/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request)
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  return await response.json();
}

export async function getImageProviders() {
  const response = await fetch('/api/image-providers');
  return await response.json();
}

export async function getImageModels(providerId: string) {
  const response = await fetch(`/api/image-models/${providerId}`);
  return await response.json();
}

export async function getImagePresets() {
  const response = await fetch('/api/image-presets');
  return await response.json();
}
```

### React Component Example (ImageCard)

```typescript
// src/components/ImageCard.tsx
import React from 'react';

interface ImageCardProps {
  image: {
    data: string;  // base64
    seed?: number;
    width: number;
    height: number;
    generatedAt: number;
  };
  onDownload: () => void;
  onDelete: () => void;
}

export function ImageCard({ image, onDownload, onDelete }: ImageCardProps) {
  const timeTaken = Date.now() - image.generatedAt;

  return (
    <div className="image-card">
      <img
        src={`data:image/png;base64,${image.data}`}
        alt="Generated"
        loading="lazy"
      />

      <div className="image-actions">
        <button onClick={onDownload} title="Download">⬇️</button>
        <button onClick={onDelete} title="Delete">🗑️</button>
      </div>

      <div className="image-metadata">
        <span>{image.width}x{image.height}</span>
        {image.seed && <span>Seed: {image.seed}</span>}
        <span>{(timeTaken / 1000).toFixed(1)}s</span>
      </div>
    </div>
  );
}
```

### Progress Display Component

```typescript
// src/components/ProgressDisplay.tsx
import React from 'react';

interface ProgressDisplayProps {
  stage: 'loading' | 'diffusion' | 'decoding';
  currentStep: number;
  totalSteps: number;
  percentage: number;
  elapsed: number;  // milliseconds
}

export function ProgressDisplay({
  stage,
  currentStep,
  totalSteps,
  percentage,
  elapsed
}: ProgressDisplayProps) {
  const stageNames = {
    loading: 'Loading Model',
    diffusion: 'Generating Image',
    decoding: 'Finalizing'
  };

  return (
    <div className="progress-display">
      <div className="progress-header">
        <span className="progress-stage">{stageNames[stage]}</span>
        <span className="progress-time">{(elapsed / 1000).toFixed(1)}s</span>
      </div>

      <div className="progress-bar-container">
        <div
          className="progress-bar-fill"
          style={{ width: `${percentage}%` }}
        />
      </div>

      <div className="progress-footer">
        <span>Step {currentStep}/{totalSteps}</span>
        <span>{percentage.toFixed(1)}%</span>
      </div>
    </div>
  );
}
```

---

## 13. Potential Issues & Solutions

### Issue 1: Large Base64 Images in JSON Responses

**Problem:** Base64-encoded images are large (1-4MB per image), can slow responses
**Solution:**
- Backend converts Buffer to base64 efficiently
- Frontend receives and caches images in memory
- Clear old images from memory after a threshold

### Issue 2: genai-electron Server Not Running

**Problem:** User tries to use diffusion but server isn't running
**Solution:**
- Health check endpoint that tests genai-electron connection
- Clear error message: "genai-electron server not reachable. Start the server on port 8081"
- Show server status indicator in UI (green/red dot)
- Link to genai-electron setup documentation

### Issue 3: Progress Updates Not Showing

**Problem:** Diffusion progress is async polling, may not reflect in UI
**Solution:**
- Backend handles progress callbacks from ImageService
- Option 1: Poll a `/api/generation-status/:id` endpoint from frontend
- Option 2: Use Server-Sent Events (SSE) for real-time updates
- Start with Option 1 (simpler), upgrade to SSE in Phase 4 if needed

### Issue 4: CORS Issues

**Problem:** Browser blocks requests to backend
**Solution:**
- Use Vite proxy for development (already in vite.config.ts)
- Add CORS middleware to Express:
```typescript
import cors from 'cors';
app.use(cors({ origin: 'http://localhost:5174' }));
```

### Issue 5: Memory Usage from Generated Images

**Problem:** Keeping many images in browser memory can cause slowdown
**Solution:**
- Limit gallery to last 20 images
- Implement "Clear Gallery" button
- Store images in component state, not global state
- Use lazy loading for image rendering
- Consider indexedDB for persistent storage (future)

### Issue 6: Long Generation Times

**Problem:** Diffusion can take 20-120 seconds, feels slow
**Solution:**
- Show detailed progress with percentage and time elapsed
- Allow multiple generations in queue (future)
- Clear messaging about expected wait times
- Show time estimate based on settings (steps × ~0.5s per step)

---

## 14. Future Enhancements

### Real-Time Progress with Server-Sent Events

Use SSE for true real-time progress updates:
- Backend sends progress events as they occur
- Frontend displays incrementally
- No polling needed
- Better UX for long generations

### Generation Queue

- Allow queuing multiple prompts
- Show queue status (2/5 complete)
- Generate in parallel (if provider supports)
- Cancel individual generations

### Prompt Library

- Save frequently used prompts
- Tag prompts by category
- Share prompts (export/import)
- Community prompt templates

### Advanced Diffusion Features

- LoRA support (when genai-electron adds it)
- ControlNet integration
- Img2Img conversion
- Inpainting/outpainting

### Image Editing Tools

- Basic cropping
- Brightness/contrast adjustments
- Filters
- Before/after comparison

### Cost Tracking

- Estimate cost per generation
- Track total spending
- Show cost before generating
- Provider comparison (cost vs quality)

### Model Comparison Mode

- Split screen
- Send same prompt to two providers
- Compare side-by-side
- Show generation time and cost

---

## 15. Success Criteria

The image-gen-demo is successful if:

1. ✅ **Functional:** Can generate images with all supported providers
2. ✅ **Educational:** New users understand how to use ImageService
3. ✅ **Maintainable:** Easy to update when library changes
4. ✅ **Performant:** Fast UI, efficient image handling
5. ✅ **Documented:** Clear README, comments in code
6. ✅ **Stable:** Handles errors gracefully, doesn't crash
7. ✅ **Visual:** Generated images display correctly and look good

---

## 16. Implementation Checklist

Before starting implementation, ensure:

- [ ] All dependencies are available
- [ ] Architecture is clear and approved
- [ ] Can allocate sufficient time (~10-15 hours for initial version)
- [ ] Have API key for OpenAI Images OR genai-electron running
- [ ] Understand image generation flow (prompt → settings → generate → display)

During implementation:

- [ ] Phase 1: Project setup complete
- [ ] Phase 2: Backend API working (can generate images via curl)
- [ ] Phase 3: Frontend UI functional (can generate and display images)
- [ ] Phase 4: Advanced features implemented (batch, progress, presets)
- [ ] Phase 5: Polished and documented

After implementation:

- [ ] Test with OpenAI Images provider
- [ ] Test with genai-electron diffusion provider
- [ ] Test batch generation (2-4 images)
- [ ] Test progress monitoring for diffusion
- [ ] Test error cases (missing API key, invalid settings)
- [ ] Test responsive design (mobile, tablet, desktop)
- [ ] Test on different browsers (Chrome, Firefox, Safari)
- [ ] Add to main genai-lite README as showcase

---

## 17. Key Decisions Summary

**Architecture:** Backend (Express) + Frontend (Vite + React) - REQUIRED for Node.js library and image handling
**Frontend Framework:** React + TypeScript - Consistent with chat-demo, good for galleries
**Module System:** ESM (`"type": "module"`) - Modern standard, works with all dependencies
**Styling:** Minimal CSS - Focus on functionality (images are the visual element)
**UI Structure:** Single page with collapsible settings sidebar and grid gallery
**Location:** `examples/image-gen-demo/` - Standard pattern, parallel to chat-demo
**Package Management:** Separate package.json, local link to parent (`"genai-lite": "file:../.."`)
**API Keys:** Environment variables on backend only (never expose in frontend)
**Image Transfer:** Base64-encoded in JSON responses (Buffer on backend, base64 for frontend)
**Progress Updates:** Initially handled in backend callbacks, option for SSE in Phase 5
**Gallery Display:** Grid layout (2-4 columns), responsive, last 20 images
**Batch Generation:** Core feature (Phase 1), 1-4 images per request
**Scope:** Text-to-image only (no editing/variations) - matches current API
**Testing:** Manual testing initially, can add automated tests later
**Ports:** 3001 (backend), 5174 (frontend) - different from chat-demo to avoid conflicts

---

## 18. Next Steps

1. Review this plan with stakeholders
2. Confirm technical approach and scope
3. Set up development environment
4. Begin Phase 1: Project Setup
5. Iterate based on testing and feedback

---

## Appendix A: Example Prompts

Good prompts to include as examples in the UI:

1. **Photorealistic:**
   - "A professional photograph of a mountain lake at golden hour, crystal clear water reflecting snow-capped peaks"
   - "Portrait of a wise elderly person with kind eyes, natural lighting, shallow depth of field"

2. **Artistic:**
   - "An oil painting of a bustling medieval marketplace, warm colors, impressionist style"
   - "Watercolor illustration of cherry blossoms in spring, soft pastels, Japanese art style"

3. **Fantasy/Sci-Fi:**
   - "A futuristic city with flying cars and neon lights, cyberpunk aesthetic, night scene"
   - "A majestic dragon perched on a mountain peak, fantasy art, dramatic lighting"

4. **Product/Logo:**
   - "A minimalist logo design for a tech startup, clean lines, modern, professional"
   - "Product photography of a smartwatch on a marble surface, studio lighting"

5. **Nature:**
   - "A dense rainforest with morning mist and sun rays piercing through the canopy"
   - "Northern lights over a frozen lake in Iceland, long exposure photography"

6. **Abstract:**
   - "Abstract geometric shapes in vibrant colors, modern art, bold contrasts"
   - "Flowing liquid metal patterns, iridescent colors, macro photography"

---

**Note:** This document is comprehensive enough to pick up implementation after memory clear. All key decisions, technical details, and implementation guidance are included.
