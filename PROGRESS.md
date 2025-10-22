# Image API Implementation Progress

**Start Date:** 2025-10-21
**Design Document:** [docs/dev/2025-10-22-genai-lite-image-api-design.md](docs/dev/2025-10-22-genai-lite-image-api-design.md)
**Implementation Approach:** Incremental with review points between phases

---

## Overview

Implementing first-class image generation capabilities for genai-lite following the approved design specification. The implementation adds `ImageService` alongside the existing `LLMService`, supporting both cloud providers (OpenAI) and local diffusion models (via genai-electron).

### Key Deliverables
- ✅ New `ImageService` API mirroring `LLMService` ergonomics
- ✅ Provider adapters for OpenAI Images and Electron Diffusion
- ✅ Comprehensive TypeScript types and error handling
- ✅ Preset system for image generation
- ✅ Full test coverage with TDD approach
- ✅ Updated documentation (README, CLAUDE.md)

---

## Implementation Status

### Phase 1: Project Structure ✅ COMPLETE
**Status:** Complete
**Started:** 2025-10-21
**Completed:** 2025-10-21

#### Tasks
- [x] Create PROGRESS.md in root directory
- [x] Create `src/types/image.ts` (skeleton)
- [x] Create `src/adapters/image/` directory
- [x] Create `src/adapters/image/OpenAIImageAdapter.ts` (skeleton)
- [x] Create `src/adapters/image/ElectronDiffusionAdapter.ts` (skeleton)
- [x] Verify project structure

#### Notes
- Using incremental approach with tests written alongside implementation
- genai-electron batching support confirmed as ready
- All skeleton files created with TODO comments for next phases

---

### Phase 2: Type Definitions and Interfaces ✅ COMPLETE
**Status:** Complete
**Started:** 2025-10-21
**Completed:** 2025-10-21
**Dependencies:** Phase 1 ✅

#### Tasks
- [x] Define core request types
  - [x] `ImageProviderId` type
  - [x] `ImageGenerationRequestBase` interface
  - [x] `ImageGenerationRequest` interface (with count)
  - [x] `ImageGenerationRequestWithPreset` interface
- [x] Define response types
  - [x] `ImageGenerationResponse` interface
  - [x] `GeneratedImage` interface
  - [x] `ImageUsage` interface
  - [x] `ImageFailureResponse` type
- [x] Define settings types
  - [x] `ImageGenerationSettings` interface (base + diffusion namespace)
  - [x] `DiffusionSettings` interface
  - [x] `ResolvedImageGenerationSettings` type
  - [x] `ImageProgressCallback` type
  - [x] Type literals (ImageMimeType, ImageResponseFormat, ImageQuality, ImageStyle, DiffusionSampler, ImageProgressStage)
- [x] Define provider/model types
  - [x] `ImageProviderInfo` interface
  - [x] `ImageProviderCapabilities` interface
  - [x] `ImageModelInfo` interface
  - [x] `ImagePreset` interface
- [x] Define adapter interface
  - [x] `ImageProviderAdapter` interface
  - [x] `ImageProviderAdapterConfig` interface
- [x] Define service options
  - [x] `ImageServiceOptions` interface
  - [x] `PresetMode` type
  - [x] `CreatePromptResult` interface
- [x] Write unit tests for type validation (24 tests)
- [x] Export all types from `src/index.ts`
- [x] Run tests: `npm test -- src/types/image.test.ts` (all passing)
- [x] Build verification: `npm run build` (successful)

#### Review Checkpoint
- [x] Types compile without errors
- [x] All tests passing (24/24)
- [x] Types exported correctly from package
- [x] All types follow existing LLM patterns
- [x] Comprehensive JSDoc comments added
- [x] Fixed TypeScript compatibility issue with ResolvedImageGenerationSettings

#### Notes
- Total types defined: 27 (15 interfaces, 8 type aliases, 4 type literals)
- All types include comprehensive JSDoc documentation
- Diffusion namespace properly structured for provider-specific settings
- Error response structure mirrors LLM error handling patterns

---

### Phase 3: ImageService Core Implementation
**Status:** Ready to Start
**Dependencies:** Phase 2 ✅

#### Tasks
- [ ] Create `src/image/ImageService.ts` class
- [ ] Implement constructor
  - [ ] Accept `ApiKeyProvider` parameter
  - [ ] Accept `ImageServiceOptions` parameter
  - [ ] Initialize adapter registry
  - [ ] Load default presets
- [ ] Implement preset management
  - [ ] `getPresets(): ImagePreset[]` method
  - [ ] Preset resolution logic (by ID)
  - [ ] Preset mode handling (extend/replace)
- [ ] Implement provider/model management
  - [ ] `getProviders(): Promise<ImageProviderInfo[]>` method
  - [ ] `getModels(providerId): Promise<ImageModelInfo[]>` method
  - [ ] `registerAdapter(id, adapter)` method
  - [ ] Default adapter registration
- [ ] Implement settings merge hierarchy
  - [ ] Model defaults → Preset → Runtime
  - [ ] Handle diffusion namespace properly
- [ ] Implement error envelope handling
  - [ ] Wrap adapter errors in `ImageFailureResponse`
  - [ ] Reuse existing `GenaiLiteError` hierarchy
- [ ] Implement `generateImage()` method (core orchestration)
  - [ ] Validate request (providerId, modelId, prompt)
  - [ ] Retrieve API key via provider
  - [ ] Resolve settings hierarchy
  - [ ] Route to appropriate adapter
  - [ ] Handle errors and wrap responses
- [ ] Implement `generateImages()` helper (optional)
- [ ] Write unit tests for service orchestration
  - [ ] Test preset loading and resolution
  - [ ] Test settings merge hierarchy
  - [ ] Test error handling
  - [ ] Test adapter routing
  - [ ] Mock adapters for isolated testing
- [ ] Export `ImageService` from `src/index.ts`
- [ ] Run tests: `npm test -- ImageService.test`

#### Review Checkpoint
- [ ] Service class compiles and exports correctly
- [ ] All unit tests passing
- [ ] Error handling comprehensive
- [ ] Ready for adapter integration

---

### Phase 4: OpenAI Images Adapter
**Status:** Not Started
**Dependencies:** Phase 3

#### Tasks
- [ ] Implement `src/adapters/image/OpenAIImageAdapter.ts`
- [ ] Implement adapter class
  - [ ] Constructor with config (baseURL, timeout)
  - [ ] Implement `ImageProviderAdapter` interface
  - [ ] Define capabilities object
- [ ] Implement `generate()` method
  - [ ] Build request payload for `/v1/images/generations`
  - [ ] Map settings to OpenAI parameters (size, quality, style, n)
  - [ ] Set up HTTP headers (Authorization, Content-Type)
  - [ ] Make POST request
  - [ ] Handle response formats (url, b64_json)
- [ ] Implement response processing
  - [ ] Fetch images from URLs if needed
  - [ ] Convert base64 to Buffer
  - [ ] Populate `GeneratedImage[]` array
  - [ ] Extract usage metadata (if available)
- [ ] Implement error handling
  - [ ] Map OpenAI errors to `GenaiLiteError` types
  - [ ] Handle authentication errors
  - [ ] Handle rate limits
  - [ ] Handle network errors
  - [ ] Include resolved base URL in error messages
- [ ] Configuration
  - [ ] Support `OPENAI_API_BASE_URL` env var
  - [ ] Default to `https://api.openai.com/v1`
  - [ ] Support custom base URLs via options
- [ ] Write unit tests
  - [ ] Test request building
  - [ ] Test response parsing (url format)
  - [ ] Test response parsing (b64_json format)
  - [ ] Test error handling (all error types)
  - [ ] Mock HTTP client
- [ ] Write integration test (manual/optional)
  - [ ] Test with real OpenAI API (if key available)
- [ ] Update `ImageService` to register OpenAI adapter by default
- [ ] Run tests: `npm test -- OpenAIImageAdapter.test`

#### Review Checkpoint
- [ ] Adapter implements interface correctly
- [ ] All unit tests passing
- [ ] Error handling comprehensive
- [ ] Integration with ImageService works

---

### Phase 5: Electron Diffusion Adapter
**Status:** Not Started
**Dependencies:** Phase 4

#### Tasks
- [ ] Implement `src/adapters/image/ElectronDiffusionAdapter.ts`
- [ ] Implement adapter class
  - [ ] Constructor with config (baseURL, timeout, checkHealth)
  - [ ] Implement `ImageProviderAdapter` interface
  - [ ] Define capabilities object (with progress support)
- [ ] Implement health checking (optional)
  - [ ] `GET /health` endpoint call
  - [ ] Handle loading/error states
- [ ] Implement `generate()` method
  - [ ] Build request payload for `/v1/images/generations`
  - [ ] Map diffusion settings (prompt, negativePrompt, width, height, steps, cfgScale, seed, sampler)
  - [ ] Include `count` parameter
  - [ ] Set up HTTP headers
  - [ ] Make POST request
- [ ] Implement progress handling
  - [ ] Wire up `onProgress` callback from settings
  - [ ] Handle progress events from genai-electron
  - [ ] Emit stage updates (loading, diffusion, decoding)
- [ ] Implement response processing
  - [ ] Parse `images` array from response
  - [ ] Convert base64 to Buffer
  - [ ] Populate `GeneratedImage[]` with metadata (seed, width, height)
  - [ ] Extract usage data (timeTaken)
- [ ] Implement error handling
  - [ ] Map genai-electron errors to `GenaiLiteError`
  - [ ] Handle network errors (server not running)
  - [ ] Handle timeout errors
  - [ ] Include resolved base URL in errors
- [ ] Configuration
  - [ ] Support `GENAI_ELECTRON_IMAGE_BASE_URL` env var
  - [ ] Default to `http://localhost:8081`
  - [ ] Support custom base URLs via options
- [ ] Write unit tests
  - [ ] Test request building with diffusion settings
  - [ ] Test response parsing (single image)
  - [ ] Test response parsing (multiple images via count)
  - [ ] Test progress callback invocation
  - [ ] Test error handling
  - [ ] Mock HTTP client
- [ ] Write integration test (manual/optional)
  - [ ] Test with real genai-electron server (if running)
- [ ] Update `ImageService` to register Electron adapter by default
- [ ] Run tests: `npm test -- ElectronDiffusionAdapter.test`

#### Review Checkpoint
- [ ] Adapter implements interface correctly
- [ ] Batching support (count parameter) working
- [ ] Progress callbacks working
- [ ] All unit tests passing
- [ ] Integration with ImageService works

---

### Phase 6: Presets and Utilities
**Status:** Not Started
**Dependencies:** Phase 5

#### Tasks
- [ ] Rename preset file for LLMs
  - [ ] Rename `src/config/presets.json` → `llm-presets.json`
  - [ ] Update `LLMService` to load from `llm-presets.json`
  - [ ] Create backward-compat re-export at `presets.json` location
  - [ ] Add deprecation notice in re-export
  - [ ] Test LLMService still loads presets correctly
- [ ] Create image presets
  - [ ] Create `src/config/image-presets.json`
  - [ ] Add OpenAI presets
    - [ ] Standard quality preset
    - [ ] High quality preset
    - [ ] Different sizes (1024x1024, 1792x1024, 1024x1792)
  - [ ] Add Electron diffusion presets
    - [ ] Quality preset (steps: 30, cfgScale: 7.5)
    - [ ] Fast preset (steps: 20, cfgScale: 7.0)
    - [ ] Different sizes (512x512, 768x768, 1024x1024)
- [ ] Update `ImageService` preset loading
  - [ ] Load from `image-presets.json`
  - [ ] Handle extend/replace modes
  - [ ] Validate preset structure
- [ ] Implement `createPrompt` utility (optional)
  - [ ] Accept template, variables, presetId
  - [ ] Render template with variables
  - [ ] Resolve settings from preset
  - [ ] Return `{ prompt, settings }`
- [ ] Write tests
  - [ ] Test preset loading
  - [ ] Test preset merging (extend/replace modes)
  - [ ] Test settings hierarchy with presets
  - [ ] Test backward compat for LLM presets
  - [ ] Test `createPrompt` utility (if implemented)
- [ ] Run tests: `npm test`

#### Review Checkpoint
- [ ] Preset files created and valid JSON
- [ ] LLM preset backward compatibility maintained
- [ ] Image presets load correctly
- [ ] All tests passing
- [ ] No breaking changes to existing LLM functionality

---

### Phase 7: Documentation and Final Integration
**Status:** Not Started
**Dependencies:** Phase 6

#### Tasks
- [ ] Update `README.md`
  - [ ] Add "Image Generation" section after LLM features
  - [ ] Add installation and quick start for images
  - [ ] Document both providers (OpenAI, Electron)
  - [ ] Add examples for basic usage
  - [ ] Add examples for advanced settings (diffusion namespace)
  - [ ] Add examples for progress callbacks
  - [ ] Add examples for batching (count parameter)
  - [ ] Document error handling patterns
  - [ ] Add TypeScript type imports example
  - [ ] Update table of contents
- [ ] Update `CLAUDE.md`
  - [ ] Add image service to architecture overview
  - [ ] Document new directory structure (src/adapters/image, src/types/image.ts)
  - [ ] Add development guidelines for image features
  - [ ] Document preset file split (llm-presets.json, image-presets.json)
  - [ ] Add testing guidelines for image adapters
  - [ ] Update "Adding New Providers" section to include image providers
  - [ ] Add troubleshooting section for image generation
- [ ] Final integration testing
  - [ ] Run full test suite: `npm test`
  - [ ] Verify all exports from `src/index.ts`
  - [ ] Test example code from README
  - [ ] Build project: `npm run build`
  - [ ] Verify dist output includes image types
  - [ ] Test package exports: `node -e "const lib = require('./dist'); console.log('Image exports:', Object.keys(lib).filter(k => k.includes('Image')))"`
- [ ] Manual testing (if possible)
  - [ ] Test OpenAI adapter with real API key
  - [ ] Test Electron adapter with local server
  - [ ] Verify error messages are helpful
  - [ ] Verify progress callbacks work
  - [ ] Verify batching works
- [ ] Update PROGRESS.md with final status
- [ ] Create summary of changes

#### Review Checkpoint
- [ ] All documentation complete and accurate
- [ ] All tests passing (100% coverage goal)
- [ ] Build succeeds
- [ ] Package exports correct
- [ ] Ready for PR/commit

---

## Implementation Notes

### Key Decisions
- **Incremental approach:** Each phase is reviewed before proceeding
- **TDD methodology:** Tests written alongside implementation
- **Backward compatibility:** LLM preset rename includes re-export
- **Diffusion namespace:** Using feature-based namespace for diffusion settings
- **Progress callbacks:** Using callback pattern (not async iterables)

### Dependencies
- genai-electron batching support: ✅ Confirmed ready
- Existing error handling utilities: Will reuse `GenaiLiteError` hierarchy
- Existing HTTP client: Will follow patterns from LLM adapters

### Testing Strategy
- Unit tests for all components (services, adapters, utilities)
- Mock HTTP clients for adapter tests
- Integration tests optional (gated behind API keys)
- Manual testing when possible

---

## Next Steps

**Current Phase:** Phase 3 - ImageService Core Implementation
**Next Action:** Create `src/image/ImageService.ts` with core orchestration logic

---

## Blockers

None currently.

---

## Questions / Issues

None currently.

---

_Last Updated: 2025-10-21_
