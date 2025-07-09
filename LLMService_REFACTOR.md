# LLMService Refactoring Plan

## Overview
The `LLMService.ts` file has grown to 872 lines and handles multiple responsibilities. This refactoring will extract distinct concerns into separate, focused classes while maintaining the existing public API.

## Current Issues
- Single file handling validation, settings, presets, adapters, and request processing
- Difficult to test individual components in isolation
- Complex to understand the flow due to mixed concerns
- Hard to modify one aspect without affecting others

## Proposed Structure

### Directory Layout
```
src/llm/
├── LLMService.ts              # Main orchestrator (reduced to ~250-300 lines)
└── services/                  # New directory for extracted services
    ├── PresetManager.ts       # Preset loading and resolution
    ├── AdapterRegistry.ts     # Adapter registration and management
    ├── RequestValidator.ts    # Request and settings validation
    ├── SettingsManager.ts     # Settings merging and filtering
    └── ModelResolver.ts       # Model and provider resolution
```

## Extracted Components

### 1. PresetManager (~100 lines)
**Responsibilities:**
- Load and merge default/custom presets
- Handle preset modes (extend/replace)
- Resolve preset by ID
- Get all presets

**Extracted from LLMService:**
- Lines 84-103: Preset initialization logic
- Line 647-649: `getPresets()` method
- Lines 670-715: Preset resolution from `resolveModelInfo()`

**Interface:**
```typescript
class PresetManager {
  constructor(customPresets: ModelPreset[], mode: PresetMode);
  getPresets(): ModelPreset[];
  resolvePreset(presetId: string): PresetResolution | null;
}
```

### 2. AdapterRegistry (~150 lines)
**Responsibilities:**
- Initialize and register adapters
- Get adapter for provider
- Provide adapter status/summary

**Extracted from LLMService:**
- Lines 105-141: Adapter initialization
- Lines 566-577: `getClientAdapter()`
- Lines 585-591: `registerClientAdapter()`
- Lines 598-610: `getRegisteredAdapters()`
- Lines 617-640: `getProviderSummary()`

**Interface:**
```typescript
class AdapterRegistry {
  constructor();
  registerAdapter(providerId: ApiProviderId, adapter: ILLMClientAdapter): void;
  getAdapter(providerId: ApiProviderId): ILLMClientAdapter;
  getRegisteredAdapters(): Map<ApiProviderId, AdapterInfo>;
  getProviderSummary(): ProviderSummary;
}
```

### 3. RequestValidator (~150 lines)
**Responsibilities:**
- Validate request structure
- Validate message format
- Validate reasoning settings
- Validate general settings

**Extracted from LLMService:**
- Lines 405-457: `validateRequestStructure()`
- Lines 467-502: `validateReasoningSettings()`
- Lines 214-230: Settings validation logic

**Interface:**
```typescript
class RequestValidator {
  validateRequest(request: LLMChatRequest): ValidationResult;
  validateSettings(settings: LLMSettings): ValidationResult;
  validateReasoningSettings(modelInfo: ModelInfo, reasoning?: ReasoningSettings): ValidationResult;
}
```

### 4. SettingsManager (~100 lines)
**Responsibilities:**
- Merge settings with model defaults
- Filter unsupported parameters
- Handle reasoning settings for non-supporting models

**Extracted from LLMService:**
- Lines 512-558: `mergeSettingsForModel()`
- Lines 249-313: Settings filtering logic

**Interface:**
```typescript
class SettingsManager {
  mergeSettings(modelId: string, providerId: ApiProviderId, userSettings?: Partial<LLMSettings>): Required<LLMSettings>;
  filterUnsupportedSettings(settings: LLMSettings, modelInfo: ModelInfo, providerInfo: ProviderInfo): LLMSettings;
}
```

### 5. ModelResolver (~120 lines)
**Responsibilities:**
- Resolve model from preset or direct IDs
- Validate provider/model combinations
- Return complete model information

**Extracted from LLMService:**
- Lines 658-772: `resolveModelInfo()`
- Provider/model validation logic

**Interface:**
```typescript
class ModelResolver {
  constructor(presetManager: PresetManager);
  resolve(options: ModelSelectionOptions): ModelResolution;
}
```

## Refactored LLMService

The main `LLMService` class will be reduced to:
- Constructor that initializes all services
- Public API methods that orchestrate the services
- Error handling and response formatting
- API key management integration

**Key methods remain:**
- `getProviders()`
- `getModels()`
- `sendMessage()`
- `prepareMessage()`
- `getPresets()`

## Benefits

1. **Single Responsibility:** Each class has one clear purpose
2. **Testability:** Components can be tested in isolation with mocks
3. **Maintainability:** Changes to validation don't affect settings management
4. **Readability:** Easier to understand the flow and find specific logic
5. **Extensibility:** New features can be added to specific components

## Migration Strategy

1. Create new `services/` directory
2. Extract each component one by one, starting with the least dependent
3. Write unit tests for each extracted component
4. Update LLMService to use the new components
5. Ensure all existing tests still pass
6. Remove old code from LLMService

## Order of Extraction

1. **SettingsManager** - No dependencies on other components
2. **RequestValidator** - Depends only on types
3. **PresetManager** - Independent component
4. **ModelResolver** - Depends on PresetManager
5. **AdapterRegistry** - Can be done anytime
6. **LLMService refactor** - Final step to wire everything together

## Testing Approach

Each extracted component should have:
- Unit tests covering all methods
- Mock dependencies where needed
- Focus on edge cases and error conditions
- Integration tests for LLMService to ensure behavior is preserved