# Example App Plan: genai-lite Interactive Demo

**Date:** October 12, 2025
**Status:** Planning Phase - Decisions Finalized
**Purpose:** Comprehensive plan for building an interactive example application to showcase genai-lite features

**Key Decisions Made:**
- Frontend: React + TypeScript (developer has React experience)
- Module System: ESM (verified compatible with genai-lite)
- Styling: Minimal CSS initially (can upgrade later)
- UI: Single page with collapsible sections
- Testing: Manual initially
- Streaming: Future enhancement

---

## 1. Executive Summary

### What We're Building

An interactive web-based chat application that demonstrates all major features of the genai-lite library. The app will allow users to:
- Chat with multiple LLM providers (OpenAI, Anthropic, Gemini, llama.cpp)
- Switch between providers and models dynamically
- Configure settings (temperature, maxTokens, etc.)
- See reasoning/thinking output from models
- Test template rendering and prompt engineering features
- Compare local (llama.cpp) vs cloud providers

### Goals

1. **Living Documentation** - Show real working code rather than static examples
2. **Feature Showcase** - Demonstrate all major library capabilities
3. **Development Tool** - Quick testing environment for library changes
4. **User Onboarding** - Help new users understand how to use the library
5. **Integration Testing** - Real-world usage context for the library

### Why This Matters

- genai-lite just added llama.cpp support - this is a perfect showcase
- README examples are limited - a full app shows real integration
- Developers learn better from working code
- Can be used in demos, documentation links, etc.

---

## 2. Architecture Overview

### High-Level Architecture

```
┌─────────────────────────────────────┐
│         Browser (Frontend)          │
│      Vite + React + TypeScript      │
│   - Chat UI                         │
│   - Settings Panel                  │
│   - Provider Selection              │
└──────────────┬──────────────────────┘
               │ HTTP/WebSocket
               │
┌──────────────▼──────────────────────┐
│      Backend (Express Server)       │
│   - API endpoints                   │
│   - Uses genai-lite                 │
│   - API key management              │
│   - Server-sent events for streaming│
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│          genai-lite Library         │
│   - LLMService                      │
│   - Provider adapters               │
│   - Template engine                 │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│     LLM Providers (Cloud/Local)     │
│   - OpenAI API                      │
│   - Anthropic API                   │
│   - Google Gemini API               │
│   - llama.cpp local server          │
└─────────────────────────────────────┘
```

### Why Backend + Frontend?

**Cannot run genai-lite directly in browser because:**
1. Uses Node.js-specific APIs (OpenAI SDK, file system, etc.)
2. API keys must not be exposed in browser code
3. CORS issues with direct API calls
4. llama.cpp SDK is Node.js only

**Solution:** Express backend that uses genai-lite, frontend makes requests to backend

---

## 3. Project Structure

```
genai-lite/
├── examples/
│   └── chat-demo/
│       ├── package.json              # Separate package.json for the demo
│       ├── .env.example              # Example environment variables
│       ├── README.md                 # How to run the demo
│       ├── tsconfig.json             # TypeScript config
│       ├── vite.config.ts            # Vite config
│       │
│       ├── server/                   # Backend (Express)
│       │   ├── index.ts              # Express server entry point
│       │   ├── routes/
│       │   │   ├── chat.ts           # POST /api/chat endpoint
│       │   │   ├── providers.ts      # GET /api/providers
│       │   │   └── models.ts         # GET /api/models/:providerId
│       │   └── services/
│       │       └── llm.ts            # genai-lite service initialization
│       │
│       └── src/                      # Frontend (Vite + React)
│           ├── main.tsx              # Entry point (React)
│           ├── App.tsx               # Root React component
│           ├── index.html            # HTML template
│           ├── style.css             # Styling
│           ├── components/
│           │   ├── ChatInterface.tsx # Main chat UI
│           │   ├── SettingsPanel.tsx # Settings configuration
│           │   ├── ProviderSelector.tsx
│           │   ├── MessageList.tsx
│           │   └── MessageInput.tsx
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
- Developer has experience with React
- Excellent component reuse and state management
- Large ecosystem and community
- Industry standard for this type of application
- Works seamlessly with Vite and TypeScript
- Better developer experience than vanilla JS for complex UIs

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
- Easy to add endpoints
- Good for server-sent events (streaming responses)
- Small footprint

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
1. Create `examples/chat-demo/` directory
2. Initialize package.json with dependencies
3. Set up TypeScript configs (one for backend, one for frontend)
4. Set up Vite config
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

**Goal:** Backend that can communicate with LLMs via genai-lite

**Tasks:**
1. Initialize genai-lite LLMService in `server/services/llm.ts`
2. Implement `/api/providers` endpoint
   - Returns list of available providers
3. Implement `/api/models/:providerId` endpoint
   - Returns models for a provider
4. Implement `/api/chat` endpoint
   - Accepts: { providerId, modelId, messages, settings }
   - Returns: LLM response
5. Handle API key management via environment variables
6. Add error handling and logging

**API Endpoints:**

```typescript
// GET /api/providers
Response: {
  providers: Array<{
    id: string,
    name: string,
    available: boolean  // False if API key missing
  }>
}

// GET /api/models/:providerId
Response: {
  models: Array<{
    id: string,
    name: string,
    description: string
  }>
}

// POST /api/chat
Request: {
  providerId: string,
  modelId: string,
  messages: Array<{ role: string, content: string }>,
  settings?: {
    temperature?: number,
    maxTokens?: number,
    topP?: number,
    reasoning?: { enabled: boolean, effort?: string },
    thinkingExtraction?: { enabled: boolean }
  }
}

Response: {
  success: boolean,
  response?: {
    content: string,
    reasoning?: string,
    usage?: { inputTokens: number, outputTokens: number }
  },
  error?: { message: string, code: string }
}
```

### Phase 3: Frontend UI (User Interface)

**Goal:** Clean, functional chat interface

**Tasks:**
1. Build ChatInterface component
   - Message list (with user/assistant styling)
   - Input box with send button
   - Show reasoning/thinking output separately
2. Build ProviderSelector component
   - Dropdown for provider
   - Dropdown for model (populated based on provider)
3. Build SettingsPanel component
   - Sliders for temperature, maxTokens, topP
   - Toggles for reasoning, thinking extraction
4. Add loading states and error handling
5. Make it responsive (works on mobile)

**UI Layout:**

```
┌─────────────────────────────────────────────────┐
│  Provider: [OpenAI ▼]  Model: [gpt-4.1-mini ▼] │
│  [Settings ⚙️]                                   │
├─────────────────────────────────────────────────┤
│  Chat Messages:                                 │
│  ┌──────────────────────────────────┐          │
│  │ User: Hello!                     │          │
│  │ Assistant: Hi there!             │          │
│  │ [Thinking: ...]                  │          │
│  └──────────────────────────────────┘          │
│                                                  │
│  [Type a message...         ] [Send]            │
└─────────────────────────────────────────────────┘
```

### Phase 4: Advanced Features (Showcase)

**Goal:** Demonstrate unique genai-lite capabilities

**Tasks:**
1. **Template Examples Tab**
   - Show pre-made templates
   - Allow variable substitution
   - Render with `createMessages()`
   - Show how model context is injected

2. **Reasoning Mode Demo**
   - Toggle for enabling reasoning
   - Effort level selector (low/medium/high)
   - Display reasoning output clearly

3. **Thinking Extraction Demo**
   - Prompt that uses `<thinking>` tags
   - Show extracted thinking separately
   - Compare with/without extraction

4. **llama.cpp Features**
   - Tokenization tool (show token count)
   - Server health check
   - Show it works with no API key

5. **Preset Selection**
   - Dropdown with library presets
   - Show how settings come from preset

### Phase 5: Polish & Documentation

**Goal:** Production-ready demo

**Tasks:**
1. Add example templates (5-10 good examples)
2. Write comprehensive README for the demo
3. Add error messages that are helpful
4. Add "Copy conversation" button
5. Add "Clear chat" button
6. Persist settings in localStorage
7. Add loading animations
8. Test on different browsers
9. Add screenshots to demo README

---

## 6. Features to Implement

### Core Features (Must Have)

- ✅ Chat with any supported provider
- ✅ Switch providers/models on the fly
- ✅ Adjust settings (temperature, maxTokens, topP)
- ✅ Multi-turn conversations
- ✅ Display reasoning output
- ✅ Display thinking extraction
- ✅ Error handling with user-friendly messages
- ✅ Loading states
- ✅ Clear conversation

### Showcase Features (Should Have)

- ✅ Template rendering demo
- ✅ Model preset selection
- ✅ Reasoning mode toggle with effort levels
- ✅ Thinking extraction configuration
- ✅ Token counting display
- ✅ llama.cpp health check
- ✅ Side-by-side reasoning comparison

### Nice to Have (Could Have)

- Export conversation (JSON/Markdown)
- Import conversation
- Multiple conversation tabs
- System message editor
- Model comparison (two models, same prompt)
- Streaming responses (with server-sent events)
- Code syntax highlighting in messages
- Markdown rendering in messages

---

## 7. Dependencies

### Root package.json (No Changes Needed)

The example app will reference genai-lite using a local file reference.

### examples/chat-demo/package.json

```json
{
  "name": "genai-lite-chat-demo",
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
ANTHROPIC_API_KEY=sk-ant-...
GEMINI_API_KEY=AIza...
MISTRAL_API_KEY=...

# llama.cpp (optional, defaults to http://localhost:8080)
LLAMACPP_API_BASE_URL=http://localhost:8080

# Server configuration
PORT=3000
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
    "resolveJsonModule": true
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
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
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
cd examples/chat-demo
npm install
cp .env.example .env
# Edit .env with your API keys
```

### Running the Demo

```bash
# Start both frontend and backend
npm run dev

# Or run separately:
npm run dev:frontend  # Vite on http://localhost:5173
npm run dev:backend   # Express on http://localhost:3000
```

### For llama.cpp Testing

```bash
# In a separate terminal, start llama.cpp server
llama-server -m /path/to/model.gguf --port 8080
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
// server/services/llm.ts
import { LLMService, fromEnvironment } from 'genai-lite';

export const llmService = new LLMService(fromEnvironment);

// Get providers
export async function getProviders() {
  const providers = await llmService.getProviders();

  // Check which providers have API keys
  return providers.map(provider => ({
    ...provider,
    available: checkApiKeyAvailable(provider.id)
  }));
}

function checkApiKeyAvailable(providerId: string): boolean {
  const envVar = `${providerId.toUpperCase()}_API_KEY`;
  return !!process.env[envVar] || providerId === 'llamacpp';
}

// Get models for a provider
export async function getModels(providerId: string) {
  return await llmService.getModels(providerId);
}

// Send chat message
export async function sendChatMessage(request: {
  providerId: string;
  modelId: string;
  messages: Array<{ role: string; content: string }>;
  settings?: any;
}) {
  const response = await llmService.sendMessage({
    providerId: request.providerId,
    modelId: request.modelId,
    messages: request.messages,
    settings: request.settings
  });

  if (response.object === 'chat.completion') {
    return {
      success: true,
      response: {
        content: response.choices[0].message.content,
        reasoning: response.choices[0].reasoning,
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

### Template Rendering Example

```typescript
// Demonstrate createMessages with templates
export async function renderTemplate(
  template: string,
  variables: Record<string, any>,
  providerId: string,
  modelId: string
) {
  const { messages, modelContext, settings } = await llmService.createMessages({
    template,
    variables,
    providerId,
    modelId
  });

  return { messages, modelContext, settings };
}
```

---

## 11. UI/UX Considerations

### Layout Strategy

**Single Page with Tabs:**
- Tab 1: Chat (main interface)
- Tab 2: Templates (showcase)
- Tab 3: Advanced Features (reasoning, thinking, etc.)
- Tab 4: llama.cpp Tools (tokenization, health)

**OR Simpler: Single Page with Expandable Sections**

Start simple, can expand later.

### Styling

**Keep it minimal:**
- Clean, modern look
- Light/dark mode (optional)
- Responsive (mobile-friendly)
- Focus on functionality over aesthetics

**CSS Variables for theming:**
```css
:root {
  --primary-color: #2563eb;
  --background: #ffffff;
  --text: #1f2937;
  --border: #e5e7eb;
}
```

### Components

**MessageList:**
- User messages on the right (blue background)
- Assistant messages on the left (gray background)
- Reasoning/thinking in collapsible section
- Timestamp on hover

**SettingsPanel:**
- Collapsible panel (starts collapsed)
- Sliders with current value display
- Tooltips explaining each setting

**ProviderSelector:**
- Clear indication of available vs unavailable providers
- Show warning if API key missing

---

## 12. Code Snippets

### Frontend API Client

```typescript
// src/api/client.ts
export async function chatWithLLM(request: {
  providerId: string;
  modelId: string;
  messages: Array<{ role: string; content: string }>;
  settings?: any;
}) {
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request)
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  return await response.json();
}

export async function getProviders() {
  const response = await fetch('/api/providers');
  return await response.json();
}

export async function getModels(providerId: string) {
  const response = await fetch(`/api/models/${providerId}`);
  return await response.json();
}
```

### Backend Chat Endpoint

```typescript
// server/routes/chat.ts
import express from 'express';
import { sendChatMessage } from '../services/llm.js';

export const chatRouter = express.Router();

chatRouter.post('/chat', async (req, res) => {
  try {
    const { providerId, modelId, messages, settings } = req.body;

    // Validate request
    if (!providerId || !modelId || !messages) {
      return res.status(400).json({
        success: false,
        error: { message: 'Missing required fields', code: 'VALIDATION_ERROR' }
      });
    }

    const result = await sendChatMessage({
      providerId,
      modelId,
      messages,
      settings
    });

    res.json(result);
  } catch (error) {
    console.error('Chat error:', error);
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

## 13. Potential Issues & Solutions

### Issue 1: API Keys in Frontend

**Problem:** Users might try to put API keys in frontend code
**Solution:**
- Clear documentation that keys go in backend `.env`
- Frontend should never see raw API keys
- Show clear error if key is missing

### Issue 2: llama.cpp Server Not Running

**Problem:** User tries to use llama.cpp but server isn't running
**Solution:**
- Health check endpoint that tests llama.cpp connection
- Clear error message: "llama.cpp server not reachable. Start with: llama-server -m model.gguf"
- Show server status in UI

### Issue 3: CORS Issues

**Problem:** Browser blocks requests to backend
**Solution:**
- Use Vite proxy for development (already in vite.config.ts)
- Add CORS middleware to Express:
```typescript
import cors from 'cors';
app.use(cors({ origin: 'http://localhost:5173' }));
```

### Issue 4: Large Dependencies

**Problem:** genai-lite has several provider SDKs
**Solution:**
- This is expected - the demo shows how to use the library
- Document that production apps might only use one provider
- Consider tree-shaking in future library versions

### Issue 5: Rate Limiting

**Problem:** Demo users hitting API rate limits
**Solution:**
- Add basic rate limiting on backend
- Show error gracefully
- Suggest using llama.cpp for unlimited testing

---

## 14. Future Enhancements

### Streaming Responses

Use Server-Sent Events (SSE) for real-time streaming:
- Backend sends chunks as they arrive
- Frontend displays incrementally
- Better UX for long responses

### Multiple Conversations

- Save multiple conversation threads
- Switch between them
- Persist to localStorage

### Model Comparison Mode

- Split screen
- Send same prompt to two different models
- Compare responses side-by-side

### Prompt Library

- Save frequently used prompts
- Share prompts (export/import)
- Community prompt templates

### Visual Template Builder

- Drag-and-drop interface
- See variables highlighted
- Live preview

### Advanced llama.cpp Features

- Model loading interface
- Quantization options
- Performance metrics visualization
- Slot monitoring

---

## 15. Success Criteria

The example app is successful if:

1. ✅ **Functional:** Can chat with all supported providers
2. ✅ **Educational:** New users understand how to use genai-lite
3. ✅ **Maintainable:** Easy to update when library changes
4. ✅ **Performant:** Fast, responsive, no unnecessary delays
5. ✅ **Documented:** Clear README, comments in code
6. ✅ **Stable:** Handles errors gracefully, doesn't crash

---

## 16. Implementation Checklist

Before starting implementation, ensure:

- [ ] All dependencies are available
- [ ] Architecture is clear and approved
- [ ] Can allocate sufficient time (~8-12 hours for initial version)
- [ ] Have test API keys for at least one provider
- [ ] Have llama.cpp server available for testing (optional but recommended)

During implementation:

- [ ] Phase 1: Project setup complete
- [ ] Phase 2: Backend API working
- [ ] Phase 3: Frontend UI functional
- [ ] Phase 4: Advanced features implemented
- [ ] Phase 5: Polished and documented

After implementation:

- [ ] Test with all providers
- [ ] Test error cases
- [ ] Update demo README
- [ ] Add screenshots
- [ ] Test on different browsers
- [ ] Consider adding to main README as showcase

---

## 17. Key Decisions Summary

**Architecture:** Backend (Express) + Frontend (Vite + React) - REQUIRED for Node.js library
**Frontend Framework:** React + TypeScript - Developer experience, component reuse
**Module System:** ESM (`"type": "module"`) - Modern standard, works with Vite + React + genai-lite
**Styling:** Minimal CSS - Focus on functionality (can upgrade to Tailwind later)
**UI Structure:** Single page with collapsible sections - Simpler initially
**Location:** `examples/chat-demo/` - Standard pattern
**Package Management:** Separate package.json, local link to parent (`"genai-lite": "file:../.."`)
**API Keys:** Environment variables on backend only
**Testing:** Manual testing initially, can add automated tests later
**Streaming:** Future enhancement, not in initial version

---

## 18. Next Steps

1. Review this plan with stakeholders
2. Confirm technical approach
3. Begin Phase 1: Project Setup
4. Iterate based on feedback

---

**Note:** This document should be sufficient to pick up implementation after memory clear. All key decisions, technical details, and implementation guidance are included.
