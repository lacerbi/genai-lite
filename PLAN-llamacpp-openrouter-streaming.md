# Plan: llama.cpp and OpenRouter Text Streaming

Created: 2026-07-06
Status: COMPLETE

## Implementation Tracking
- [x] Phase 1: Shared service plumbing
- [x] Phase 2: Mock adapter test support
- [x] Phase 3: llama.cpp streaming
  - [x] Throwaway local llama-server smoke test (`127.0.0.1:8080`)
- [x] Phase 4: OpenRouter streaming
- [x] Phase 5: Documentation
- [x] Phase 6: Build and test
- [x] Final doublecheck

## Summary
Add a public text streaming API to `LLMService`, with llama.cpp as the primary target and OpenRouter as the first low-risk cloud/OpenAI-compatible adapter. The implementation should keep `sendMessage()` behavior stable, reuse the current validation/settings/API-key pipeline, and return a final normalized `LLMResponse` after streaming completes.

## Scope
- **In scope**: `LLMService.streamMessage()`, shared stream event types, adapter contract extension, llama.cpp streaming, OpenRouter streaming, unit tests, and docs.
- **Out of scope**: Anthropic/Gemini/Mistral/OpenAI streaming in this first pass, Electron UI/IPC implementation, and genai-electron server-manager changes.
- **Related but not blocking**: genai-electron auto-port ergonomics. `ServerInfo.port` is enough for callers to build `LLAMACPP_API_BASE_URL`, but a future `baseURL`/`getBaseURL()` helper would make that cleaner.

## Proposed Public API
Add an async iterable API rather than a `settings.stream` flag:

```typescript
for await (const event of llmService.streamMessage({
  providerId: "llamacpp",
  modelId: "llamacpp",
  messages: [{ role: "user", content: "Explain streaming briefly." }]
})) {
  if (event.type === "content_delta") {
    process.stdout.write(event.delta);
  }
  if (event.type === "reasoning_delta") {
    process.stderr.write(event.delta);
  }
  if (event.type === "complete") {
    console.log(event.response.usage);
  }
  if (event.type === "error") {
    console.error(event.error.error.message);
  }
}
```

Recommended event union in `src/llm/types.ts`:

```typescript
export type LLMStreamEvent =
  | { type: "start"; provider: ApiProviderId; model: string; id?: string; created?: number }
  | { type: "content_delta"; delta: string; index: number }
  | { type: "reasoning_delta"; delta: string; index: number }
  | { type: "usage"; usage: LLMUsage }
  | { type: "complete"; response: LLMResponse }
  | { type: "error"; error: LLMFailureResponse };
```

Add `StreamMessageOptions` with `signal` and `timeoutMs`. Do not expose automatic streaming retries in the first pass; once a stream has started, retrying would duplicate partial output. The installed OpenAI SDK types expose `stream_options?: ChatCompletionStreamOptions`, so `stream_options: { include_usage: true }` can be typed rather than passed as an unknown extra field.

## Phases

### Phase 1: Shared Service Plumbing
**Goal**: Add streaming without duplicating the entire `sendMessage()` request pipeline.

**Work**:
- Add `LLMStreamEvent` and `StreamMessageOptions`.
- Extend `ILLMClientAdapter` with optional `streamMessage(...)`.
- Add `LLMService.streamMessage(...)`.
- Refactor `LLMService.sendMessage()` internals into private helpers for:
  - resolving preset/provider/model,
  - validating request/settings/reasoning/structured output,
  - applying defaults and filtering unsupported settings,
  - retrieving and validating API keys,
  - final response post-processing.
- Reuse the final post-processing helper for both `sendMessage()` and `streamMessage()`:
  - thinking-tag fallback extraction/enforcement,
  - structured-output JSON auto-parse.

**Steps**:
1. Extract a private request preparation helper returning either a prepared internal request or `LLMFailureResponse`.
2. Extract a private response post-processing helper.
3. Implement `streamMessage()` so validation/API-key errors are yielded as a single `error` event.
4. If an adapter lacks `streamMessage`, yield a clear `PROVIDER_ERROR` instead of falling back to non-streaming behavior.
5. Keep `sendMessage()` behavior and retry handling unchanged.

**Verification**:
- [x] Existing `sendMessage()` tests still pass unchanged.
- [x] New service tests cover validation error event, missing adapter stream support, API-key failure, final post-processing, and abort option forwarding.

### Phase 2: Mock Adapter Test Support
**Goal**: Give service-level streaming tests a deterministic adapter.

**Work**:
- Add `MockClientAdapter.streamMessage(...)`.
- Emit small deterministic content chunks.
- Preserve existing mock special cases where useful, especially `test_thinking:`, `test_reasoning:`, `json:`, and error triggers.
- Honor already-aborted signals.

**Steps**:
1. Implement a simple async generator in `MockClientAdapter`.
2. Accumulate a final `LLMResponse` and emit `complete`.
3. Emit `error` for mock error patterns and aborts.

**Verification**:
- [x] `MockClientAdapter` stream tests cover content chunks, final response, error event, and abort.

### Phase 3: llama.cpp Streaming
**Goal**: Stream local llama.cpp text through the OpenAI-compatible `/v1/chat/completions` endpoint.

**Work**:
- Refactor `LlamaCppClientAdapter` so non-streaming and streaming share request construction:
  - messages,
  - sampling params,
  - structured output,
  - reasoning toggle and assistant-prefill guard,
  - grammar,
  - logprobs.
- Add `stream: true` and `stream_options: { include_usage: true }` for streaming calls.
- Iterate OpenAI SDK `ChatCompletionChunk` async iterable.
- Emit:
  - `start` on first chunk,
  - `content_delta` for `choice.delta.content`,
  - `reasoning_delta` for provider-specific `delta.reasoning_content` / `delta.reasoning` when present and `reasoning.exclude !== true`,
  - `usage` when a usage chunk arrives,
  - `complete` with accumulated normalized `LLMResponse`.
- If the underlying async iterator throws after partial output, emit an `error` event whose `LLMFailureResponse.partialResponse` contains the accumulated response so far when enough data exists.
- Build the final response from accumulated chunks, then apply the same local reasoning cleanup as non-streaming:
  - server-separated `reasoning_content` wins,
  - marker extraction remains authoritative in the final response,
  - nothink prefix stripping remains applied.
- For live deltas, suppress detected `localReasoning.nothinkPrefix` at the beginning of content so users do not see the empty `<think></think>` prefix while reasoning is off.
- Do not attempt full live marker-based reasoning splitting in the first pass; if llama-server does not stream separated reasoning fields, the live stream may contain raw marker text, while the final `complete.response` will be normalized.

**Steps**:
1. Extract request-param construction from `sendMessage()`.
2. Extract success-response construction so it can accept a synthetic accumulated completion.
3. Implement `streamMessage()` as an async generator.
4. Preserve health check behavior.
5. Preserve connection-error cache clearing.
6. Preserve timeout and abort transport options.

**Verification**:
- [x] llama.cpp adapter tests verify `stream: true`, `stream_options.include_usage`, and all existing request params.
- [x] Tests cover content deltas, reasoning deltas, final usage, final normalized response, nothink-prefix suppression, abort/timeout options, health-check errors, assistant-prefill guard, and connection error mapping/cache clearing.
- [x] Tests cover thrown mid-stream errors preserving `partialResponse`.
- [x] Optional manual smoke test if a local llama-server is already running.

### Phase 4: OpenRouter Streaming
**Goal**: Add the easiest second provider by reusing the same OpenAI-compatible streaming mechanics.

**Work**:
- Refactor `OpenRouterClientAdapter` so non-streaming and streaming share request construction:
  - messages,
  - OpenRouter provider routing,
  - structured output,
  - reasoning forwarding,
  - logprobs and sampling params,
  - custom headers.
- Add `stream: true` and `stream_options: { include_usage: true }`.
- Emit content deltas and provider-specific reasoning deltas defensively from `delta.reasoning` / `delta.reasoning_content`.
- Accumulate final `LLMResponse` with OpenRouter reasoning and `reasoning_details` when present.
- If the stream throws after partial output, emit an `error` event with `partialResponse` when possible.

**Steps**:
1. Extract OpenRouter client/request builders from `sendMessage()`.
2. Implement `streamMessage()` using the OpenAI SDK async iterable.
3. Share a small internal chunk accumulator with llama.cpp only if it reduces real duplication.

**Verification**:
- [x] OpenRouter tests verify streaming request construction preserves provider routing, reasoning, structured output, sampling, logprobs, headers, timeout, and abort.
- [x] Tests cover content deltas, reasoning deltas, final usage, final normalized response, and error mapping.
- [x] Tests cover thrown mid-stream errors preserving `partialResponse`.

### Phase 5: Documentation
**Goal**: Make the new API discoverable and set correct expectations.

**Work**:
- Update `README.md` with a short `streamMessage()` example.
- Update `genai-lite-docs/llm-service.md` with the event union and usage pattern.
- Update `genai-lite-docs/llamacpp-integration.md` with local streaming usage and caveats:
  - use `127.0.0.1`,
  - `--jinja` for reasoning toggles,
  - `--reasoning-format` improves separated reasoning,
  - marker fallback is normalized in the final response.
- Update `genai-lite-docs/providers-and-models.md` and `genai-lite-docs/typescript-reference.md` if they enumerate LLM service methods/types.
- Consider adding `STREAM_MESSAGE` to `LLM_IPC_CHANNELS` for consumers that mirror these constants, without implementing Electron IPC here.

**Verification**:
- [x] Docs examples type-check conceptually against the exported API.
- [x] Docs do not claim streaming support for providers not implemented in this pass.

### Phase 6: Build and Test
**Goal**: Verify the package remains stable and the new API compiles.

**Work**:
- Run focused unit tests first.
- Run TypeScript build.
- Run full test suite if focused tests and build pass.

**Commands**:
```bash
npm test -- LLMService.test.ts MockClientAdapter.test.ts LlamaCppClientAdapter.test.ts OpenRouterClientAdapter.test.ts
npm run build
npm test
```

**Verification**:
- [x] Focused tests pass.
- [x] `npm run build` passes.
- [x] Full test suite passes, or any unrelated pre-existing failures are clearly documented.

## Risks
- **Streaming retries**: Retrying after partial output would duplicate tokens. Initial implementation should not retry streams automatically.
- **Reasoning deltas**: The OpenAI SDK types do not document `reasoning_content` on chat chunks, but llama.cpp/OpenRouter may provide provider-specific fields. Handle them defensively with `any` reads and final-response normalization.
- **Marker fallback during live streaming**: Fully splitting streamed `<think>...</think>` marker content is stateful and easy to get subtly wrong. Defer full live marker splitting; normalize the final response.
- **Final response mismatch**: Some live deltas may differ from final normalized content when marker fallback or structured parsing applies. Document that `complete.response` is authoritative.
- **Docs/API drift**: Existing llama.cpp docs show `service.registerAdapter(...)`, but `LLMService` currently does not expose that public method. Do not expand this streaming task to fix it unless explicitly approved.

## Decisions
- Public method name: `streamMessage()`.
- First implementation pass includes `llamacpp`, `openrouter`, and deterministic mock streaming for tests.
- Live marker-based reasoning splitting is deferred; provider-separated reasoning deltas stream live when available, and `complete.response` is normalized.
