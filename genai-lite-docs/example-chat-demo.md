# Example: Chat Demo Application

Reference implementation demonstrating integration patterns for chat applications using genai-lite.

## Contents

- [Overview](#overview) - What the demo shows
- [Features](#features) - Key capabilities
- [Architecture](#architecture) - Tech stack
- [Key Patterns](#key-patterns) - Non-obvious implementation patterns
- [Running the Demo](#running-the-demo) - Quick start
- [Using for Testing](#using-for-testing) - Library testing workflow
- [Related Documentation](#related-documentation)

## Overview

**Location**: `examples/chat-demo/`

Full-featured React + Express application demonstrating integration patterns for chat applications. Shows multi-provider chat, advanced prompt engineering with templates, and local model integration via llama.cpp.

**Purpose**:
- Reference implementation for chat application integration
- Demonstrate real-world LLMService patterns
- Provide interactive testing for library changes
- Showcase advanced features (reasoning, thinking extraction, templates)

**For full setup details**, see the demo's own [README](../../examples/chat-demo/README.md).

## Features

**Multi-Provider LLM Support**:
- 5 providers: OpenAI, Anthropic, Gemini, Mistral, llama.cpp
- Dynamic availability detection (API keys + health checks)
- All reasoning-capable models supported (Claude 4, Gemini 2.5, o4-mini)

**Chat Interface**:
- Tab navigation (Chat, Templates, llama.cpp Tools)
- Collapsible settings sidebar
- Message history with reasoning display
- Copy/export (JSON, Markdown)
- Settings persistence (localStorage)

**Template System**:
- 10+ example templates across 4 categories (General, Code, Creative, Analysis)
- Variable substitution with model-aware conditionals
- Self-contained templates with `<META>` settings
- Two modes: Open in Chat (conversation starter) or Render Preview (demo `createMessages()`)

**llama.cpp Tools**:
- Tokenization, embeddings, health checks
- No API keys required

## Architecture

**Tech Stack**:
- Frontend: React 18 + TypeScript + Vite
- Backend: Express + TypeScript
- Communication: REST API (JSON)

**Structure**:
- Frontend: 8 React components + `src/data/exampleTemplates.ts` (10+ templates)
- Backend: Express routes + `server/services/llm.ts` (LLMService wrapper with availability checking)

## Key Patterns

These patterns demonstrate non-obvious implementations that may be useful in your own applications.

### Pattern: Provider Availability Checking (llama.cpp)

**Challenge**: Detect if llama.cpp server is running before showing it as available.

**Solution** (`server/services/llm.ts`):
```typescript
async function checkApiKeyAvailable(providerId: string): Promise<boolean> {
  // For llama.cpp, check if the server is running
  if (providerId === 'llamacpp') {
    try {
      const baseURL = process.env.LLAMACPP_API_BASE_URL || 'http://localhost:8080';
      const response = await fetch(`${baseURL}/health`, {
        signal: AbortSignal.timeout(2000)  // 2 second timeout
      });
      return response.ok;
    } catch (error) {
      return false;  // Server not running
    }
  }

  // For cloud providers, check environment variable
  const envVar = `${providerId.toUpperCase()}_API_KEY`;
  return !!process.env[envVar];
}

export async function getProviders() {
  const providers = await llmService.getProviders();

  // Add availability flag (checks run in parallel)
  return await Promise.all(
    providers.map(async (provider) => ({
      ...provider,
      available: await checkApiKeyAvailable(provider.id)
    }))
  );
}
```

**Frontend usage**:
```typescript
<select disabled={!provider.available}>
  <option>{provider.name} {provider.available ? '✓' : '(unavailable)'}</option>
</select>
```

### Pattern: Enhanced Error Messages

Map technical errors to actionable messages with specific commands:

```typescript
function enhanceErrorMessage(error: any, context?: { providerId?: string }): string {
  let errorStr = typeof error === 'string' ? error : error?.message || String(error);

  if (errorStr.includes('API key') || errorStr.includes('authentication')) {
    const provider = context?.providerId || 'this provider';
    return `Missing or invalid API key for ${provider}. Add your API key to the .env file (e.g., ${provider.toUpperCase()}_API_KEY=your-key-here) and restart the server.`;
  }

  if (errorStr.includes('llamacpp') || context?.providerId === 'llamacpp') {
    if (errorStr.includes('ECONNREFUSED') || errorStr.includes('connect')) {
      return 'llama.cpp server not running. Start it with: `llama-server -m /path/to/model.gguf --port 8080`';
    }
  }

  return errorStr;
}
```

### Pattern: Template as Conversation Starter

**Challenge**: Load templates into Chat tab with editable variables and settings.

**Solution** (`src/components/TemplateExamples.tsx` → `ChatInterface.tsx`):
```typescript
// In TemplateExamples: Extract settings from <META> block
const handleOpenInChat = () => {
  let settings: Partial<LLMSettings> | undefined;
  const metaMatch = selectedTemplate.template.match(/<META>\s*(\{[\s\S]*?\})\s*<\/META>/);
  if (metaMatch) {
    try {
      const metadata = JSON.parse(metaMatch[1]);
      settings = metadata.settings;
    } catch (err) {
      console.warn('Failed to parse template metadata:', err);
    }
  }

  onOpenInChat({
    template: selectedTemplate.template,  // Raw template with {{ variables }}
    variables,
    settings,
    templateName: selectedTemplate.name
  });
};

// In ChatInterface: Parse and populate UI
const handleOpenTemplateInChat = (data) => {
  setActiveTab('chat');  // Switch to Chat tab

  // Parse template to extract system prompt and user message
  const systemMatch = data.template.match(/<SYSTEM>([\s\S]*?)<\/SYSTEM>/);
  const userMatch = data.template.match(/<USER>([\s\S]*?)<\/USER>/);

  if (systemMatch) setSystemPrompt(systemMatch[1].trim());
  if (userMatch) setUserMessage(userMatch[1].trim());

  // Store variables and apply settings from template
  setTemplateVariables(data.variables);
  setSettings({ ...DEFAULT_SETTINGS, ...data.settings });

  showNotification(`Loaded template: ${data.templateName}`);
};
```

**Key insight**: Keep variables in `{{ name }}` format so user can edit them before sending.

### Pattern: Template Rendering with createMessages API

Backend endpoint demonstrating `createMessages()`:

```typescript
// server/routes/templates.ts
templatesRouter.post('/render', async (req, res) => {
  const { template, variables, providerId, modelId, presetId, settings } = req.body;

  const result = await llmService.createMessages({
    template,
    variables: variables || {},
    providerId,
    modelId,
    presetId,
    settings
  });

  res.json({
    success: true,
    result: {
      messages: result.messages,            // Parsed messages
      modelContext: result.modelContext,    // Model-aware variables
      settings: result.settings             // Resolved settings (including <META>)
    }
  });
});
```

Frontend displays rendered messages, model context variables, and resolved settings.

### Pattern: llama.cpp Integration

**Using LlamaCppServerClient** for utilities beyond chat:

```typescript
// server/routes/llamacpp.ts
import { LlamaCppServerClient } from 'genai-lite';

const baseURL = process.env.LLAMACPP_API_BASE_URL || 'http://localhost:8080';
const llamacppClient = new LlamaCppServerClient(baseURL);

// Tokenization
llamacppRouter.post('/tokenize', async (req, res) => {
  const { content } = req.body;
  const result = await llamacppClient.tokenize(content);
  res.json({
    success: true,
    tokens: result.tokens,
    tokenCount: result.tokens.length
  });
});

// Embeddings with helpful error for missing --embeddings flag
llamacppRouter.post('/embedding', async (req, res) => {
  try {
    const { content } = req.body;
    const result = await llamacppClient.createEmbedding(content);
    res.json({
      success: true,
      embedding: result.embedding,
      dimension: result.embedding.length
    });
  } catch (error) {
    const errorMessage = error.message || '';
    if (errorMessage.includes('501') || errorMessage.includes('--embeddings')) {
      res.status(501).json({
        success: false,
        error: {
          message: 'Embeddings not enabled. Restart llama-server with --embeddings flag',
          code: 'EMBEDDINGS_NOT_ENABLED',
          hint: 'llama-server -m /path/to/model.gguf --embeddings'
        }
      });
    } else {
      res.status(500).json({ success: false, error: { message: errorMessage } });
    }
  }
});

// Get loaded model and clean up ID
llamacppRouter.get('/models', async (req, res) => {
  const data = await llamacppClient.getModels();

  // Clean up model ID (strip "models/" prefix and .gguf extension)
  const modelId = data.data[0].id
    .replace(/^models\//, '')
    .replace(/\.gguf$/, '');

  res.json({
    success: true,
    models: [{ id: modelId, name: modelId, providerId: 'llamacpp' }]
  });
});
```

### Pattern: Categorized Example Templates

**Template structure** (`src/data/exampleTemplates.ts`):

```typescript
export interface ExampleTemplate {
  id: string;
  name: string;
  description: string;
  template: string;  // With role tags and variables
  defaultVariables: Record<string, string | boolean | number>;
  category: 'general' | 'code' | 'creative' | 'analysis';
  tags: string[];
}

export const exampleTemplates: ExampleTemplate[] = [
  {
    id: 'basic-greeting',
    name: 'Basic Greeting Assistant',
    description: 'Simple greeting template with variable substitution',
    template: `<SYSTEM>You are a friendly assistant.</SYSTEM>
<USER>Hello! My name is {{ name }} and I'm interested in {{ topic }}.</USER>`,
    defaultVariables: { name: 'Alex', topic: 'learning TypeScript' },
    category: 'general',
    tags: ['basic', 'greeting']
  },
  {
    id: 'code-review',
    name: 'Code Review with Thinking',
    description: 'Demonstrates thinking extraction for code review',
    template: `<META>
{
  "settings": {
    "temperature": 0.3,
    "maxTokens": 2000,
    "thinkingTagFallback": { "enabled": true }
  }
}
</META>
<SYSTEM>You are an expert code reviewer.{{ requires_tags_for_thinking ? ' When reviewing code, first write your analysis inside <thinking> tags, then provide actionable feedback.' : ' Analyze the code carefully and provide actionable feedback.' }}</SYSTEM>
<USER>Review this {{ language }} code:

\`\`\`{{ language }}
{{ code }}
\`\`\`

Focus on: {{ focus_areas }}</USER>`,
    defaultVariables: {
      language: 'typescript',
      code: 'function add(a, b) {\n  return a + b;\n}',
      focus_areas: 'type safety, error handling, and best practices'
    },
    category: 'code',
    tags: ['code-review', 'thinking', 'meta-settings']
  }
  // ... 8 more templates (10 total)
];
```

**Type-Aware Variable Parsing**: Template variables support strings, booleans, and numbers. The UI automatically parses input values:

```typescript
const handleVariableChange = (key: string, value: string) => {
  // Try to parse as boolean or number
  let parsedValue: any = value;
  if (value === 'true') parsedValue = true;
  else if (value === 'false') parsedValue = false;
  else if (!isNaN(Number(value)) && value !== '') parsedValue = Number(value);

  setVariables(prev => ({ ...prev, [key]: parsedValue }));
};
```

This allows users to input "true"/"false" or numbers in text fields, and the template receives properly typed values.

**Four categories**: general, code, creative, analysis. Templates showcase different features (thinking, META blocks, conditionals, few-shot learning).

### Other Patterns

**Settings Persistence**: All settings (provider, model, system prompt, active tab, sidebar state) persist to localStorage.

**Tab Navigation**: Three tabs (Chat, Templates, llama.cpp Tools) with string union type (`'chat' | 'templates' | 'llamacpp'`) and conditional rendering.

## Running the Demo

### Quick Start

```bash
cd examples/chat-demo
npm install

# Configure API keys in .env (at least one required for cloud providers)
cp .env.example .env
# Edit .env: OPENAI_API_KEY=sk-..., ANTHROPIC_API_KEY=sk-ant-..., etc.

# For llama.cpp (optional):
# export LLAMACPP_API_BASE_URL=http://localhost:8080

npm run dev
# Frontend: http://localhost:5173
# Backend: http://localhost:3000
```

For complete setup details, configuration options, and troubleshooting, see the demo's [README](../../examples/chat-demo/README.md).

## Using for Testing

The chat demo is excellent for quickly testing LLMService changes interactively.

### Workflow

1. **Make changes** to genai-lite LLMService source code
2. **Build the library**: `npm run build` (in genai-lite root)
3. **Restart the demo**: Stop and restart `npm run dev`
4. **Test interactively** in browser at http://localhost:5173

### What to Test

**Provider Integration**:
- Provider availability detection
- API key handling
- Server health monitoring (llama.cpp)

**Chat Functionality**:
- Message sending with different providers
- Reasoning mode (Claude 4, Gemini 2.5, o4-mini)
- Thinking extraction (`<thinking>` tags)
- Error handling (invalid API key, rate limits)

**Template Engine**:
- `createMessages()` rendering
- Variable substitution
- Model context injection (requires_tags_for_thinking)
- `<META>` block parsing

**Settings Management**:
- Preset application
- Settings hierarchy (model → preset → runtime)
- localStorage persistence

**llama.cpp Features**:
- Tokenization
- Embeddings (requires `--embeddings` flag)
- Health monitoring
- Model auto-detection

## Related Documentation

### APIs Used in This Demo

- **[LLM Service](llm-service.md)** - Main API for LLM chat
- **[LLM Service - Reasoning Mode](llm-service.md#reasoning-mode)** - Native reasoning features
- **[LLM Service - Thinking Extraction](llm-service.md#thinking-tag-fallback)** - Extract reasoning from tags
- **[LLM Service - Template Messages](llm-service.md#creating-messages-from-templates)** - `createMessages()` API
- **[Core Concepts](core-concepts.md)** - API keys, presets, error handling

### Reference

- **[llama.cpp Integration](llamacpp-integration.md)** - Local model setup and utilities
- **[Providers & Models](providers-and-models.md)** - Supported LLM providers
- **[Prompting Utilities](prompting-utilities.md)** - Template engine, token counting, parsing
- **[Troubleshooting](troubleshooting.md)** - Common issues and solutions
