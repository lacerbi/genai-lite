# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Essential Commands

**Build & Development:**
- `npm install` - Install dependencies
- `npm run build` - Compile TypeScript to JavaScript (outputs to `dist/`)
- `npm test` - Run tests with coverage
- `npm run test:watch` - Run tests in watch mode for development

**Testing the Library:**
```bash
# After building, test the exports
node -e "const lib = require('./dist'); console.log('Exports:', Object.keys(lib));"
```

**Development Workflow:**
- No watch mode currently configured
- Manual rebuild required after changes
- The `dist/` folder is gitignored
- `package-lock.json` is committed for reproducible CI builds

## Documentation

**User Documentation**: Complete API documentation and usage guides are in the **`genai-lite-docs/`** folder:
- [Documentation Hub](genai-lite-docs/index.md) - Navigation and quick starts
- [Core Concepts](genai-lite-docs/core-concepts.md) - API keys, presets, settings, errors
- [LLM Service](genai-lite-docs/llm-service.md) - Text generation API
- [Image Service](genai-lite-docs/image-service.md) - Image generation API
- [llama.cpp Integration](genai-lite-docs/llamacpp-integration.md) - Local LLM setup
- [Prompting Utilities](genai-lite-docs/prompting-utilities.md) - Template engine, parsing
- [Providers & Models](genai-lite-docs/providers-and-models.md) - All supported providers
- [TypeScript Reference](genai-lite-docs/typescript-reference.md) - Type definitions
- [Troubleshooting](genai-lite-docs/troubleshooting.md) - Common issues

**Note**: The docs folder is portable and self-contained - designed to be copied into other projects for AI-assisted development.

## Architecture Overview

genai-lite is a lightweight, standalone Node.js/TypeScript library providing a unified interface for interacting with various Generative AI APIs, supporting both **Large Language Models (LLMs)** and **AI Image Generation**. The library has been successfully extracted from an Electron application (Athanor) and is now fully portable across different JavaScript environments.

### Core Services

**LLMService** - Orchestrates text generation and chat completions across multiple providers
**ImageService** - Orchestrates AI image generation across cloud and local providers

### Supported Providers

**LLM Providers:**
- **Cloud:** OpenAI (GPT-4.1, o4-mini), Anthropic (Claude 4, Claude 3.x), Google Gemini (2.5 Pro, 2.5 Flash), Mistral (Codestral, Devstral)
- **Local:** llama.cpp - Run any GGUF model locally with no API keys required. Includes `LlamaCppClientAdapter` for chat completions and `LlamaCppServerClient` for server utilities (tokenization, embeddings, health checks, metrics).

**Image Generation Providers:**
- **Cloud:** OpenAI Images (gpt-image-1, gpt-image-1-mini, dall-e-3, dall-e-2)
- **Local:** genai-electron diffusion - Run Stable Diffusion models locally via genai-electron's HTTP wrapper around stable-diffusion.cpp. Supports progress callbacks, negative prompts, and advanced diffusion settings.

### Key Capabilities

**Prompt Engineering:**
- **Template Engine** - Dynamic prompts with variable substitution, conditionals, and logical operators
- **Model-Aware Templates** - Access model capabilities (reasoning support, provider ID, etc.) in templates
- **Self-Contained Templates** - Templates can include their own settings via `<META>` blocks
- **Unified Prompt Creation** - `createMessages()` method combines template rendering, model context injection, and role tag parsing

**Advanced Reasoning:**
- **Native Reasoning Support** - Unified `reasoning` field for models with built-in thinking capabilities (Claude 4, Claude 3.7, Gemini 2.5 Pro, o4-mini)
- **Thinking Extraction** - Automatic extraction of reasoning from `<thinking>` tags (or custom tags) for models without native support
- **Smart Enforcement** - Auto mode intelligently decides when to require thinking tags based on model capabilities

**Response Processing:**
- **Structured Content Parsing** - Extract sections from LLM responses using custom XML tags
- **Role Tag Parsing** - Convert `<SYSTEM>`, `<USER>`, `<ASSISTANT>` tags to message format
- **Token Counting** - Count tokens using OpenAI's tiktoken library
- **Smart Text Previews** - Generate context-aware previews of large text blocks

**Image Generation:**
- **Multi-Provider Support** - Unified API for cloud (OpenAI) and local (genai-electron) image generation
- **Diffusion Controls** - Negative prompts, samplers, steps, CFG scale, seeds for local models
- **Progress Monitoring** - Real-time progress callbacks during local diffusion generation (async polling architecture)
- **Batch Generation** - Generate multiple images in a single request with automatic seed variation
- **Preset System** - 12 built-in presets for common use cases (quality, speed, aspect ratios)
- **Flexible Settings** - Provider-specific namespaces (`openai`, `diffusion`) for specialized controls

### Core Architecture Principles

**Adapter Pattern Implementation:**
- **LLM Adapters:** Each provider (OpenAI, Anthropic, Gemini, Mistral, llama.cpp) has a dedicated adapter implementing `ILLMClientAdapter` interface
- **Image Adapters:** Each image provider (OpenAI Images, genai-electron) implements `ImageProviderAdapter` interface
- Adapters handle provider-specific API quirks and normalize responses
- All adapters use shared error handling utilities (`src/shared/adapters/errorUtils.ts`)

**Service Layer:**
- **LLMService** (`src/llm/LLMService.ts`) orchestrates all LLM operations
- **ImageService** (`src/image/ImageService.ts`) orchestrates all image generation operations
- Both services validate requests, resolve settings hierarchies, and route to appropriate adapters
- Unified error handling with consistent error envelopes across both services

**Shared Utilities (Phase 3.5 Abstraction):**
- **PresetManager<TPreset>** - Generic preset management (extend/replace modes) used by both LLM and Image services
- **AdapterRegistry<TAdapter, TProviderId>** - Generic adapter registration and management
- **errorUtils** - Shared error mapping and normalization for all adapters
- Located in `src/shared/services/` and `src/shared/adapters/`
- Eliminates ~390 lines of duplicate code between LLM and Image implementations

**Configuration System:**
- **LLM:** `src/llm/config.ts` + `src/config/llm-presets.json` (24 presets)
- **Image:** `src/image/config.ts` + `src/config/image-presets.json` (12 presets)
- Each model has default settings (max tokens, temperature ranges, dimensions, etc.)
- New providers/models are registered in respective config files
- Supports flexible model validation: llama.cpp and genai-electron allow arbitrary model IDs; cloud providers warn but proceed with unknown models

### API Key Management

**Migration Complete:**
The library has been successfully extracted from its Electron origins and is now a standalone Node.js package. The Electron-specific `genai-key-storage-lite` dependency has been completely removed.

**API Key Provider Pattern:**
The library uses a flexible `ApiKeyProvider` pattern for API key management:
```typescript
type ApiKeyProvider = (providerId: string) => Promise<string | null>
```
This abstraction allows the library to work in any environment. Consumers can:
- Use the built-in `fromEnvironment` provider for environment variables
- Implement custom providers for their specific storage needs (databases, vaults, etc.)

### Basic Usage Patterns

See [genai-lite-docs/](genai-lite-docs/index.md) for comprehensive usage examples. Quick references:

- **Basic LLM**: [index.md Quick Start](genai-lite-docs/index.md#quick-start-llm-cloud)
- **Local llama.cpp**: [llamacpp-integration.md](genai-lite-docs/llamacpp-integration.md)
- **Image Generation**: [image-service.md](genai-lite-docs/image-service.md)
- **Template Engine**: [prompting-utilities.md](genai-lite-docs/prompting-utilities.md)
- **Demo Apps**: [example-chat-demo.md](genai-lite-docs/example-chat-demo.md), [example-image-demo.md](genai-lite-docs/example-image-demo.md)

### Adding Models and Providers

See [docs/dev/adding-models-and-providers.md](docs/dev/adding-models-and-providers.md) for the complete guide on:
- Adding new LLM models (cloud and local GGUF)
- Adding new image models
- Adding entirely new LLM or image providers
- Using [Cline's api.ts](https://github.com/cline/cline/blob/main/src/shared/api.ts) as a reference for model specs

### Type System

**Core Types:**
- `src/types.ts`:
  - `ApiKeyProvider` - Function type for key retrieval (shared by both services)
  - `PresetMode` - 'extend' | 'replace' (shared by both services)
- `src/llm/types.ts`:
  - `LLMChatRequest` - Unified request format
  - `LLMResponse` - Success response format
  - `LLMFailureResponse` - Error response format
  - `ProviderInfo` - Provider information
  - `ModelInfo` - Model capabilities and settings
  - `LLMSettings` - Configuration options
  - `LLMThinkingTagFallbackSettings` - Settings for thinking tag fallback extraction
- `src/types/image.ts`:
  - `ImageGenerationRequest` - Image generation request format
  - `ImageGenerationResponse` - Success response with image data
  - `ImageFailureResponse` - Error response
  - `ImageProviderInfo` - Image provider information
  - `ImageModelInfo` - Image model capabilities
  - `ImageGenerationSettings` - Universal settings + provider-specific namespaces
  - `DiffusionSettings` - Diffusion-specific controls (steps, CFG, sampler, etc.)
  - `OpenAISpecificSettings` - OpenAI-specific options (outputFormat, background, etc.)
  - `ImagePreset` - Image generation preset definition
  - `GeneratedImage` - Individual image result with metadata
  - `ImageProgressCallback` - Progress monitoring callback type

**Always maintain type safety:**
- Use strict TypeScript settings
- Define explicit types for all provider-specific data
- Avoid `any` types in adapter implementations
- Use feature-based namespaces for provider-specific settings (e.g., `diffusion`, `openai`)

### Project Structure

**Main Entry Point:**
- `src/index.ts` - Exports public API including:
  - **Services:** `LLMService`, `ImageService`
  - **API Key:** `fromEnvironment`, `ApiKeyProvider` type
  - **LLM Types:** All from `src/llm/types.ts` and `src/llm/clients/types.ts`
  - **Image Types:** All from `src/types/image.ts` (27 types total)
  - **Utilities:** `renderTemplate`, `countTokens`, `getSmartPreview`, `extractRandomVariables`
  - **Parsers:** `parseRoleTags`, `parseStructuredContent`, `extractInitialTaggedContent`, `parseTemplateWithMetadata`
  - **llama.cpp:** `LlamaCppClientAdapter`, `LlamaCppServerClient`, and related types
  - **Helpers:** `createFallbackModelInfo`, `detectGgufCapabilities`, `KNOWN_GGUF_MODELS`
  - **Shared Types:** `PresetMode`

**Directory Structure:**
```
src/
├── types.ts                      # Global shared types (ApiKeyProvider, PresetMode)
├── types/
│   ├── image.ts                  # All image generation types (27 types)
│   └── presets.ts                # Preset type definitions
├── llm/                          # LLM service and adapters
│   ├── LLMService.ts             # Main LLM service
│   ├── config.ts                 # LLM provider/model configuration
│   ├── types.ts                  # LLM-specific types
│   ├── clients/                  # LLM provider adapters
│   │   ├── OpenAIClientAdapter.ts
│   │   ├── AnthropicClientAdapter.ts
│   │   ├── GeminiClientAdapter.ts
│   │   ├── LlamaCppClientAdapter.ts
│   │   └── ...
│   └── services/                 # LLM helper services
│       ├── ModelResolver.ts
│       ├── SettingsManager.ts
│       └── ...
├── image/                        # Image service and helpers
│   ├── ImageService.ts           # Main image service
│   ├── config.ts                 # Image provider/model configuration
│   └── services/                 # Image helper services
│       ├── ImageModelResolver.ts
│       ├── ImageRequestValidator.ts
│       ├── ImageSettingsResolver.ts
│       └── ...
├── adapters/                     # Provider adapters
│   └── image/                    # Image provider adapters
│       ├── OpenAIImageAdapter.ts
│       ├── GenaiElectronImageAdapter.ts
│       └── MockImageAdapter.ts
├── shared/                       # Shared utilities (Phase 3.5)
│   ├── services/                 # Generic service utilities
│   │   ├── PresetManager.ts      # Generic preset management
│   │   └── AdapterRegistry.ts    # Generic adapter registration
│   └── adapters/                 # Shared adapter utilities
│       └── errorUtils.ts         # Error mapping/normalization
├── prompting/                    # Prompt engineering utilities
│   ├── template.ts               # Template rendering
│   ├── content.ts                # Token counting, text preview
│   └── parser.ts                 # Structured parsing, role tags
├── providers/                    # API key providers
│   └── fromEnvironment.ts        # Environment variable provider
└── config/                       # Configuration files
    ├── llm-presets.json          # LLM presets (24 presets)
    └── image-presets.json        # Image presets (12 presets)
```

**Key Architectural Changes (Phase 3.5):**
- **Shared Utilities:** Created `src/shared/` for generic patterns (~390 lines of duplication eliminated)
- **Generic PresetManager:** Used by both LLM and Image services
- **Generic AdapterRegistry:** Shared adapter management logic
- **Preset File Split:** Separated `presets.json` → `llm-presets.json` + `image-presets.json` for clarity

**Testing:**
- Jest with ts-jest for TypeScript support
- All tests co-located with source files (e.g., `LLMService.test.ts`)
- 100% test coverage for core functionality
- **E2E Tests:** Separate suite in `e2e-tests/` that makes real API calls
  - Run with `npm run test:e2e` (requires `E2E_*_API_KEY` environment variables)
  - Run reasoning tests only: `npm run test:e2e:reasoning`
  - **Use sparingly** - only when modifying provider adapters or LLMService
  - Costs real money - uses cheapest models but still incurs API charges
  - Not run in CI by default to avoid costs

**Quick Testing with chat-demo:**
The `examples/chat-demo` application provides a quick way to test library changes interactively. Run `cd examples/chat-demo && npm install && npm run dev` to start the demo server and test features across all providers.

**GitHub Automation & CI/CD:**
- **CI runs automatically** on push/PR to main branch
- **When CI fails**, check GitHub Actions tab for specific errors:
  - Missing `package-lock.json` - run `npm install` locally
  - Test failures - fix tests before pushing
  - Audit issues - may need to update dependencies
- **Before pushing changes**, run locally:
  - `npm test` - ensure all tests pass
  - `npm audit --audit-level=high` - check for vulnerabilities
  - `npm run build && npm pack --dry-run` - validate package
- **Dependency updates**: Dependabot will create PRs weekly
- **Note on versioning**: Production deps use `^`, dev deps use `>=`

**Still Missing:**
- Linting configuration (ESLint/Prettier)
- Release automation workflow

### Provider-Specific Considerations

**IMPORTANT: LLM Knowledge and API Interfaces**
- Claude Code's knowledge of LLMs, models, and provider APIs may be outdated
- **DO NOT make assumptions** about models, capabilities, endpoints, or parameters
- **Always verify** by:
  - Reading `src/llm/config.ts` for current model definitions
  - Checking adapter implementations in `src/llm/clients/`
  - Reviewing tests and error handling for actual behavior
  - Searching online documentation if needed
  - Asking the user for clarification
- APIs and models change frequently with new features, pricing, and parameters

**Anthropic/Claude:**
- Uses system messages differently than OpenAI
- Requires explicit max_tokens parameter

**Google Gemini:**
- Different role naming (user/model vs user/assistant)
- Unique safety settings structure

**OpenAI:**
- Supports response_format for JSON mode
- Has specific tool/function calling format

**Mistral:**
- Similar to OpenAI but with some parameter differences
- Limited model selection

**llama.cpp:**
- Local inference server - no API keys needed
- OpenAI-compatible API (uses OpenAI SDK with custom baseURL)
- Accepts arbitrary model IDs (users load their own GGUF models)
- Additional endpoints: tokenization, embeddings, health checks, server metrics
- Hybrid architecture: `LlamaCppClientAdapter` for chat, `LlamaCppServerClient` for utilities
- Configure via `LLAMACPP_API_BASE_URL` environment variable (default: http://localhost:8080)

**Image Provider Considerations:**

**OpenAI Images:**
- Multiple models with different capabilities: gpt-image-1 (32K prompts), dall-e-3 (4K prompts, n=1 only), dall-e-2 (1K prompts)
- Prompt length validation enforced per model
- Returns hosted URLs (fetched and converted to Buffer internally)
- Supports quality settings: `auto`, `high`, `medium`, `low`, `hd`, `standard`
- Style options: `vivid` (hyper-real), `natural` (photographic)
- Provider-specific settings in `openai` namespace (outputFormat, background, moderation, compression)

**genai-electron Diffusion:**
- Local stable-diffusion.cpp server - no API keys needed
- Async polling architecture (POST starts generation, GET polls for progress/result)
- Generic `stable-diffusion` model ID (like llama.cpp pattern)
- Accepts arbitrary dimensions (width/height) within 64-2048 pixel range
- Diffusion settings in `diffusion` namespace (negativePrompt, steps, cfgScale, sampler, seed)
- Progress callbacks via polling (500ms interval, 120s timeout)
- Batch generation support (count parameter)
- Configure via `GENAI_ELECTRON_IMAGE_BASE_URL` environment variable (default: http://localhost:8081)
- See `docs/devlog/2025-10-22-genai-electron-changes.md` for async API specification

### Error Handling

All adapters should use `adapterErrorUtils.ts` patterns:
- Wrap provider errors in consistent format
- Include provider context in error messages
- Maintain error stack traces for debugging

## Code Style

**TypeScript Configuration:**
- TypeScript 5+ with strict mode enabled (`"strict": true` in tsconfig.json)
- Always use explicit types for function parameters and return values
- Prefer `import type` for type-only imports
- Use interfaces for object shapes, types for unions/primitives

**Code Formatting Conventions:**
- 2 spaces for indentation
- Double quotes for strings
- Always use semicolons
- Maximum line length: keep reasonable (~100-120 chars)
- Consistent file naming: camelCase for files, matching export names

**Naming Conventions:**
- Classes and interfaces: PascalCase (e.g., `LLMService`, `ILLMClientAdapter`)
- Functions and variables: camelCase (e.g., `createCompletion`, `apiKeyProvider`)
- Constants: UPPER_SNAKE_CASE (e.g., `DEFAULT_MAX_TOKENS`)
- Private class members: prefix with underscore (e.g., `_clientAdapters`)

**Documentation:**
- Use JSDoc comments for all public APIs
- Include parameter descriptions and return types
- Add code examples for complex functionality

**Import Organization:**
1. Node.js built-in modules
2. External dependencies
3. Internal modules (use relative paths)
4. Type imports (using `import type`)

**Async/Promise Patterns:**
- Always use async/await over raw promises
- Handle errors with try/catch blocks
- Avoid nested promises

**Quality Tools (Currently Missing):**
- Consider adding ESLint for code quality enforcement
- Consider adding Prettier for consistent formatting
- No linting/formatting tools currently configured

## Common Development Tasks

**Adding models or providers:** See [docs/dev/adding-models-and-providers.md](docs/dev/adding-models-and-providers.md) for the complete pipeline for LLM models, image models, and new providers.

**Debugging provider issues:**
1. Check console logs - adapters log API calls and responses
2. Verify API key is being retrieved correctly (or check base URL for local providers)
3. Check provider-specific error messages in adapter's error handling
4. For image generation: verify dimensions, settings namespaces, and progress callbacks

**Quick-testing library changes:**
1. Make your changes to the library and build: `npm run build`
2. Start the chat-demo: `cd examples/chat-demo && npm run dev`
3. Test your changes interactively in the browser at http://localhost:5173

**Running CI locally before pushing:**
1. Run tests: `npm test`
2. Check for vulnerabilities: `npm audit --audit-level=high`
3. Validate package: `npm run build && npm pack --dry-run`

**Publishing updates:**
1. Update version in `package.json`
2. Build with `npm run build`
3. Test exports with the verification command
4. Ensure CI passes on GitHub
5. Publish to npm (when configured)

## **IMPORTANT: Project Structure Context**

In each directory, you'll find:

- `.summary_short.md`: One-line descriptions of the directory and its files
- `.summary_long.md`: Detailed analysis of components, dependencies, and architecture

**ALWAYS START ANY TASK BY READING THE SUMMARY FILES.**
Start with `.summary_short.md` broadly, then consult `.summary_long.md` for relevant folders.

These summary files provide hierarchical context throughout the project:
- **Root level**: Overall project structure and configuration
- **src/**: Main source code organization and public API
- **src/llm/**: Core LLM service implementation and configuration
- **src/llm/clients/**: Provider-specific adapter implementations
- **src/providers/**: API key provider implementations
- **src/prompting/**: Sophisticated utilities for prompt engineering (template rendering, content preparation, message building, response parsing)

The summaries enable efficient navigation and understanding of the codebase without processing every file. They include cross-references, usage examples, and architectural decisions at each level.

Last Context Build: 2025-10-12

## Commit Guidelines

**Conventional Commits:** Use format like `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`

**DCO Sign-off Required:** Always commit with `git commit -s`. If git config not set, check with `git config user.name` and `git config user.email`. Fix unsigned commits with `git rebase --signoff` or `git commit --amend -s`.