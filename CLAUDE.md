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

## Architecture Overview

genai-lite is a lightweight, standalone Node.js/TypeScript library providing a unified interface for interacting with various Generative AI APIs, currently focusing on Large Language Models (LLMs). The library has been successfully extracted from an Electron application (Athanor) and is now fully portable across different JavaScript environments.

### Core Architecture Principles

**Adapter Pattern Implementation:**
- Each AI provider (OpenAI, Anthropic, Gemini, Mistral) has a dedicated client adapter
- All adapters implement the `ILLMClientAdapter` interface in `src/llm/clients/types.ts`
- Adapters handle provider-specific API quirks and normalize responses

**Service Layer:**
- `LLMService.ts` orchestrates all LLM operations
- Validates requests against provider/model capabilities
- Routes requests to appropriate adapters
- Provides unified error handling via `adapterErrorUtils.ts`

**Configuration System:**
- `src/llm/config.ts` centralizes all provider and model definitions
- Each model has default settings (max tokens, temperature ranges)
- New providers/models are registered here

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

### Usage Examples

**Basic Usage:**
```typescript
import { LLMService, fromEnvironment } from 'genai-lite';

const service = new LLMService(fromEnvironment);
const response = await service.sendMessage({
  providerId: 'openai',
  modelId: 'gpt-4',
  messages: [{ role: 'user', content: 'Hello!' }]
});
```

**Custom API Key Provider:**
```typescript
const customProvider: ApiKeyProvider = async (providerId) => {
  // Your custom key retrieval logic
  return await getKeyFromVault(providerId);
};
const service = new LLMService(customProvider);
```

### Adding New AI Providers

1. Create adapter in `src/llm/clients/[Provider]ClientAdapter.ts`
2. Implement `ILLMClientAdapter` interface
3. Register in `src/llm/config.ts`:
   - Add to `ADAPTER_CONSTRUCTORS` map
   - Define models in `defaultProviderConfigs`
   - Add to `SUPPORTED_PROVIDERS`
4. Add provider-specific dependencies to `package.json`
5. Export any new types from `src/index.ts` if needed

### Type System

**Core Types:**
- `src/types.ts`:
  - `ApiKeyProvider` - Function type for key retrieval
- `src/llm/types.ts`:
  - `LLMChatRequest` - Unified request format
  - `LLMResponse` - Success response format
  - `LLMFailureResponse` - Error response format
  - `ProviderInfo` - Provider information
  - `ModelInfo` - Model capabilities and settings
  - `LLMSettings` - Configuration options

**Always maintain type safety:**
- Use strict TypeScript settings
- Define explicit types for all provider-specific data
- Avoid `any` types in adapter implementations

### Project Structure

**Main Entry Point:**
- `src/index.ts` - Exports public API including:
  - `LLMService` - Main service class
  - `fromEnvironment` - Built-in environment variable provider
  - `renderTemplate` - Template engine for dynamic prompt generation
  - All types from `src/llm/types.ts` and `src/llm/clients/types.ts`
  - `ApiKeyProvider` type from `src/types.ts`

**Key Files:**
- `src/types.ts` - Global types (ApiKeyProvider)
- `src/llm/LLMService.ts` - Main service implementation
- `src/providers/fromEnvironment.ts` - Environment variable provider
- `src/llm/config.ts` - Provider and model configurations
- `src/llm/clients/` - Provider-specific adapters
- `src/prompting/template.ts` - Template rendering utility
- `src/prompting/content.ts` - Token counting, text preview, and content preparation utilities
- `src/prompting/builder.ts` - Message building from templates
- `src/prompting/parser.ts` - Structured content parsing from LLM responses

**Testing:**
- Jest with ts-jest for TypeScript support
- All tests co-located with source files (e.g., `LLMService.test.ts`)
- 100% test coverage for core functionality
- **E2E Tests:** Separate suite in `e2e-tests/` that makes real API calls
  - Run with `npm run test:e2e` (requires `E2E_*_API_KEY` environment variables)
  - **Use sparingly** - only when modifying provider adapters or LLMService
  - Costs real money - uses cheapest models but still incurs API charges
  - Not run in CI by default to avoid costs

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

**Adding a new model to an existing provider:**
1. Update model list in `src/llm/config.ts` under the provider's configuration
2. Add model-specific defaults if needed
3. Test with the new model ID

**Debugging provider issues:**
1. Check console logs - adapters log API calls and responses
2. Verify API key is being retrieved correctly
3. Check provider-specific error messages in adapter's error handling

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

Last Context Build: 2025-07-05

## Commit Guidelines

**Conventional Commits:** Use format like `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`

**DCO Sign-off Required:** Always commit with `git commit -s`. If git config not set, check with `git config user.name` and `git config user.email`. Fix unsigned commits with `git rebase --signoff` or `git commit --amend -s`.