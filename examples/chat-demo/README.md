# genai-lite Chat Demo

An interactive web application demonstrating the capabilities of the genai-lite library.

## Current Status: Phase 2 Complete ✅

Phase 2 (Backend API) is complete. The backend is fully functional:
- ✅ Express backend with health check endpoint
- ✅ React frontend with Vite
- ✅ TypeScript configuration
- ✅ Development environment setup
- ✅ **genai-lite LLMService integration**
- ✅ **Provider and model listing endpoints**
- ✅ **Chat completion endpoint with full validation**
- ✅ **Support for OpenAI, Anthropic, Gemini, and llama.cpp**

**Next:** Phase 3 - Frontend UI implementation (React components, chat interface)

## Features

**Backend (Implemented):**
- ✅ **Multi-Provider Support**: Backend APIs for OpenAI, Anthropic, Google Gemini, Mistral, and llama.cpp
- ✅ **Provider Listing**: API endpoint to list all providers with availability status
- ✅ **Model Listing**: API endpoint to get models for each provider
- ✅ **Chat Completion**: Full chat API with message validation and error handling
- ✅ **Settings Support**: Temperature, maxTokens, topP, reasoning, thinking extraction, and more
- ✅ **llama.cpp Integration**: Local model support without API keys

**Frontend (Coming in Phase 3):**
- ⏳ **Provider Selection**: Switch between AI providers on the fly
- ⏳ **Model Selection**: Choose from available models for each provider
- ⏳ **Settings Control**: UI for adjusting LLM parameters
- ⏳ **Chat Interface**: Interactive message list and input

**Advanced (Planned for Phase 4+):**
- 🔮 **Template Rendering**: Demonstrate genai-lite's template engine
- 🔮 **Reasoning Mode**: Toggle reasoning for supported models
- 🔮 **Thinking Extraction**: Display extracted thinking blocks

## Prerequisites

- Node.js 20+ installed
- npm or yarn
- At least one LLM provider API key (optional for Phase 1)

## Quick Start

### 1. Install Dependencies

```bash
cd examples/chat-demo
npm install
```

### 2. Configure Environment Variables

```bash
cp .env.example .env
# Edit .env and add your API keys
```

### 3. Run the Application

```bash
npm run dev
```

This will start:
- Backend server on http://localhost:3000
- Frontend dev server on http://localhost:5173

Visit http://localhost:5173 in your browser.

## Available Scripts

- `npm run dev` - Start both frontend and backend in development mode
- `npm run dev:frontend` - Start only the Vite frontend dev server
- `npm run dev:backend` - Start only the Express backend server
- `npm run build` - Build the frontend for production
- `npm run preview` - Preview the production build

## Project Structure

```
examples/chat-demo/
├── server/                 # Express backend
│   ├── index.ts           # Server entry point
│   ├── services/          # Business logic (Phase 2)
│   └── routes/            # API endpoints (Phase 2)
├── src/                   # React frontend
│   ├── main.tsx          # React entry point
│   ├── App.tsx           # Root component
│   ├── style.css         # Global styles
│   ├── api/              # API client (Phase 3)
│   ├── components/       # React components (Phase 3)
│   └── types/            # TypeScript types (Phase 3)
├── package.json          # Dependencies and scripts
├── tsconfig.json         # TypeScript config (frontend)
├── vite.config.ts        # Vite configuration
├── PROGRESS.md           # Implementation progress tracker
└── README.md             # This file
```

## Development Phases

### Phase 1: Project Setup ✅ (Complete)
- Basic Express backend with health endpoint
- Minimal React frontend
- TypeScript configuration
- Development environment

### Phase 2: Backend API ✅ (Complete)
- ✅ LLM service integration with genai-lite
- ✅ Provider and model endpoints
- ✅ Chat completion endpoint
- ✅ Full request validation
- ✅ Error handling and logging

### Phase 3: Frontend UI 🚧 (Next)
- Chat interface components
- Provider/model selectors
- Settings panel
- Message list

### Phase 4: Advanced Features (Planned)
- Template examples
- Reasoning mode controls
- Thinking extraction demo
- llama.cpp integration showcase

### Phase 5: Polish & Documentation (Planned)
- Comprehensive documentation
- Example templates
- Settings persistence
- Export/import features

## Backend API Endpoints

The backend provides the following REST API endpoints:

**GET /api/health**
- Health check endpoint
- Returns server status and timestamp

**GET /api/providers**
- Lists all AI providers with availability status
- Shows which providers have API keys configured

**GET /api/models/:providerId**
- Lists all models for a specific provider
- Returns model details (pricing, context window, capabilities)

**POST /api/chat**
- Sends a message to an LLM
- Request body:
  ```json
  {
    "providerId": "openai",
    "modelId": "gpt-4.1-mini",
    "messages": [{"role": "user", "content": "Hello!"}],
    "settings": {
      "temperature": 0.7,
      "maxTokens": 1000
    }
  }
  ```
- Returns completion with content, reasoning, and usage stats

## Environment Variables

Create a `.env` file based on `.env.example`:

```bash
# API Keys (at least one required for cloud providers)
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GEMINI_API_KEY=AIza...
MISTRAL_API_KEY=...

# llama.cpp Configuration (optional)
LLAMACPP_API_BASE_URL=http://localhost:8080

# Server Configuration
PORT=3000
```

## Using llama.cpp (Local Models)

To use local models via llama.cpp:

1. Install llama.cpp and download a GGUF model
2. Start the llama.cpp server:
   ```bash
   llama-server -m /path/to/model.gguf --port 8080
   ```
3. No API key needed - llama.cpp will be available as a provider

## Troubleshooting

### Backend Not Starting
- Make sure port 3000 is not in use
- Check that all dependencies are installed: `npm install`

### Frontend Not Loading
- Verify the backend is running on port 3000
- Check browser console for errors
- Try clearing browser cache

### CORS Errors
- The Vite dev server proxies API requests to avoid CORS issues
- Make sure you're accessing via http://localhost:5173, not a different port

## Contributing

This is an example application for the genai-lite library. To contribute:

1. Follow the implementation phases in PROGRESS.md
2. Test thoroughly before moving to the next phase
3. Update PROGRESS.md as you complete tasks
4. Keep code clean and well-documented

## License

Same as genai-lite parent project (MIT)
