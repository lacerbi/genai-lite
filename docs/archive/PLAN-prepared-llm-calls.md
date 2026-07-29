# Plan: Prepared LLM Calls

Created: 2026-07-29
Status: COMPLETE — 2026-07-29 (v0.15.0)

## Implementation Tracking

- [x] Phase 1: Public evidence types and internal contracts
- [x] Phase 2: Truthful usage, termination, and raw evidence
- [x] Phase 3: Canonical credential-free adapter preparation
- [x] Phase 4: Service-owned prepared calls and output-limit provenance
- [x] Phase 5: Token profiles and certified structural bounds
- [x] Phase 6: llama.cpp exact counting and stale-state rejection
- [x] Phase 7: Streaming lifecycle hardening and provider evidence
- [x] Phase 8: Capability metadata, exports, and documentation
- [x] Phase 9: Full verification and issue closure

## Summary

Implement the contract in
[`ISSUE-prepared-llm-calls-and-accounting.md`](ISSUE-prepared-llm-calls-and-accounting.md):
credential-free, mode-bound prepared calls; a stable inspection view of the semantic provider
request; truthful prompt/output accounting; revision-bound local counting; lossless response and
termination evidence; and a service-owned streaming lifecycle.

The work is deliberately staged. First establish additive evidence types and presence-aware
normalization, then split deterministic provider preparation from credentialed transport, expose
the public prepared-call API, add token profiles and certified structural bounds, integrate
llama.cpp's exact chat-input counter, and finally enforce stream terminal semantics. Existing
`sendMessage()` and `streamMessage()` remain the convenience API and route through the canonical
prepared path for every built-in adapter.

## Scope

- **In scope**:
  - Public `prepareMessage`, `inspectPrepared`, `sendPrepared`, and `streamPrepared` methods.
  - Opaque, immutable, reusable, service-bound, nonserializable, mode-bound prepared handles.
  - A stable library-owned semantic request view with no credentials or SDK objects.
  - Explicit native-versus-prompt structured-output delivery, with prompt injection visible before
    inspection and accounting.
  - Provider request preparation for OpenAI, Anthropic, Gemini, Mistral, OpenRouter, llama.cpp,
    and Mock.
  - Output-limit provenance and counting semantics.
  - Presence-aware usage, raw and normalized termination, pre-normalization answer evidence, and
    partial-failure evidence.
  - Model-aware content/prepared-message token profiles.
  - Certified retokenization and code-point structural bounds with no consumer safety margin.
  - Exact active-template prompt counting and observable state binding for current llama.cpp.
  - Stable stream attempt IDs, exactly one terminal event, cancellation acknowledgement, and
    late-event suppression.
  - Public exports, user/developer documentation, summaries, unit/property tests, and a gated
    llama.cpp E2E smoke test.

- **Out of scope**:
  - Application routing, admission policy, prompt truncation, or a library-owned capacity/fitting
    helper.
  - Applying Palimpsest's `heuristicMargin`; genai-lite returns structural evidence only.
  - Authenticated cloud token-count calls during preparation.
  - Bundling additional tokenizer runtimes or model tokenizer assets.
  - Inventing exact tokenizer revisions for arbitrary GGUF conversions.
  - Automatic streaming retries.
  - Changing the existing non-stream retry policy based on whether a failed attempt produced
    partial content; this issue preserves evidence but does not decide content-retry policy.
  - Adding a new public `LLMService.registerAdapter()` API. The exported adapter interface remains
    source-compatible; inaccurate documentation examples are corrected.
  - Paid provider E2E calls unless separately authorized.

## Confirmed Current State

- `LLMService.prepareRequest()` in `src/llm/LLMService.ts` already centralizes model resolution,
  validation, settings, filtering, and adapter lookup, but it also retrieves the API key and stops
  before provider-specific transformations.
- Every built-in adapter still formats the actual provider request at dispatch time. System
  conversion, schema rewriting, reasoning translation, and stream-only fields therefore happen
  after the current private preparation seam.
- Non-stream retries rebuild provider request objects on every attempt.
- `SettingsManager` returns final values without provenance and does not distinguish a model
  default from a verified hard output limit.
- Gemini and Mistral fabricate missing usage as zero through truthiness mappings; Anthropic's
  streaming usage merge also fills missing fields with zero.
- Anthropic and Gemini discard raw provider stop reasons; Mistral can invent `"stop"` when no
  terminal reason was observed.
- Service and llama.cpp reasoning cleanup mutate content without retaining the pre-normalization
  value.
- `LLMService.streamMessage()` forwards adapter events after a terminal event, can emit two
  terminals, and silently accepts a stream that ends without a terminal event.
- `countTokens()` in `src/prompting/content.ts` returns only a number and silently falls back to
  `ceil(text.length / 4)`.
- `js-tiktoken@1.0.21` is the only tokenizer dependency. Its installed footprint is about
  21.4 MiB, so certificates should ship as small constants rather than adding tokenizer bundles.
- Current llama.cpp documents
  [`POST /v1/chat/completions/input_tokens`](https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md)
  and exposes `model_path`, `chat_template`, `chat_template_caps`, and `build_info` through
  `/props`.
- A live probe against the user-started e4b server (build `b9860-fdb1db877`) confirmed:
  - `/v1/chat/completions/input_tokens` returned the same count twice for the same body;
  - complete and stream bodies both counted 21 input tokens;
  - changing `chat_template_kwargs.enable_thinking` changed the count from 21 to 23;
  - `/props?model=...` routed correctly;
  - the active 16,804-character template and server/model fields can be hashed into an observable
    state fingerprint.

## Design Decisions

### Public artifact and errors

- `prepareMessage(request, { mode })` requires `"complete"` or `"stream"`; there is no
  mode-changing dispatch.
- A successful preparation returns a small frozen, nominal handle with no replayable serialized
  representation. Its private adapter command and inspection data live in a `WeakMap` owned by the
  creating `LLMService`; JSON serialization either rejects explicitly or produces no data that can
  be deserialized into a valid handle.
- Recoverable request/preparation failures use the existing `LLMFailureResponse` convention.
  Forged, deserialized, cross-service, and mode-mismatched handles receive explicit typed failure
  codes rather than being dispatched.
- The handle stores no API key, signal, timeout, retry counter, SDK client, or mutable provider
  request.
- Model `PreparedPromptAccounting` so `status: "available"` requires at least one of `count` or
  `upperBound`; enforce the same invariant at runtime for adapter-provided evidence.

### Adapter seam

- Add an optional prepared-call capability to the exported adapter contract rather than making new
  methods mandatory on legacy implementations.
- A built-in adapter's credential-free preparation returns an internal immutable command
  containing:
  - its final semantic provider payload;
  - the public normalized request view;
  - adapter/request-shape revisions;
  - output-limit evidence;
  - optional prompt-counting and staleness hooks;
  - credentialed complete and/or stream dispatch functions.
- SDK clients, credential validation, abort timers, and timeout state are created only during
  dispatch.
- All built-in adapters implement this capability. A legacy adapter reports the new capability as
  unsupported rather than receiving fabricated inspection data. Because `LLMService` currently
  exposes no custom-adapter registration API, compatibility means unchanged implementations still
  satisfy the exported adapter interface and work in existing lower-level seams; this issue does
  not invent a service path that does not exist.

### Inspection view

- Define a stable library-owned `PreparedProviderRequestView` rather than exporting SDK request
  classes.
- The view records operation/mode, provider-role messages, system placement, structured-output
  delivery, reasoning/template settings, effective sampling/output settings, and provider
  extensions that affect semantics.
- Prompt-based structured output is an explicit additive delivery option. Native delivery remains
  the compatibility default; prompt delivery deterministically injects one versioned schema
  instruction and suppresses provider-native schema fields. Inspection labels its enforcement as
  instruction-only, and capability validation rejects unsupported native delivery without
  rejecting an explicitly selected prompt fallback.
- Inspection returns a deeply immutable copy or view so consumer mutation cannot alter dispatch.
- Provider transport headers, SDK instances, API keys, signals, and timeouts never appear.

### Token evidence and margins

- Point counts and certified upper bounds are separate evidence objects; neither is inferred from
  the other.
- Exact point counts carry zero or absent `uncertaintyTokens`. Non-exact uncertainty is evidence
  metadata, never `countingSlack` or `heuristicMargin`.
- Certified bounds include tokenizer/framing structural allowances only. They never accept or
  apply `heuristicMargin`.
- The documented consumer formula remains:

  ```ts
  const effectiveCapacity = rawCapacity - heuristicMargin;
  const fits =
    promptTokenUpperBound + outputBound + countingSlack <= effectiveCapacity;
  ```

- Retokenization certificates cover text decoded from at most the declared number of ordinary
  source-generation tokens. They do not cover arbitrary input erased by source normalization.
- No same-profile `n -> n` identity certificate is assumed. It is registered only after proving the
  pinned decoder's complete round trip, including invalid bytes, terminal flush, special-token
  exclusions, and cross-token composition; otherwise use a derived affine bound or unavailable.
- `countTokens()` remains as a compatible numeric wrapper; new APIs return method, profile,
  revision, and uncertainty evidence.

### Local binding

- Always bind the model, adapter revision, and request-shape revision.
- Bind optional endpoint/profile/template/server fields only when observable; do not invent cloud
  endpoint revisions.
- For llama.cpp, hash a canonical selection of `/props` and `/v1/models` fields, including model
  identity, build information, chat template, and template capabilities. Expose only the hash and
  non-sensitive metadata, not the absolute local model path.
- Revalidate observable bindings before each physical inference request. A preflight request is
  allowed; the guarantee is detection before inference dispatch, not before all network traffic.

### Response and stream compatibility

- Keep `finish_reason` and existing usage fields during migration.
- Add termination and evidence fields without changing missing values into zero.
- Add attempt identity at the service boundary. Keep an adapter-facing event type that does not
  require external adapters to manufacture service attempt IDs.
- All built-ins use the canonical prepared path. Legacy implementations remain assignable to the
  exported adapter interface; optional capability detection reports prepared/counting support as
  unavailable, with no fabricated view or service-registration promise.
- A public consumed stream has one attempt ID and one terminal completion/error event. Validation
  failures receive an invocation ID even if no provider stream was opened.
- Abandoned iteration triggers best-effort cancellation but cannot deliver a terminal event to a
  consumer that stopped reading.
- `rawContent` is the exact pre-normalization text that feeds `choice.content`. Providers with
  ordered typed parts also expose a JSON-safe, library-owned ordered raw-parts view so
  concatenation does not erase boundaries/types; native reasoning remains separately identifiable.

## Provider Migration Matrix

| Provider | Canonical preparation | Initial prepared prompt accounting | Key accounting/termination work |
| --- | --- | --- | --- |
| OpenAI | Freeze messages, `max_completion_tokens`, selected native/prompt schema delivery, reasoning effort, sampling, and mode fields before dispatch | Prepared-message point count only if a versioned framing calculator covers the canonical view; otherwise unavailable | Preserve current usage absence/zero behavior; add raw termination and classify generic `length` as ambiguous |
| Anthropic | Freeze reordered/alternating messages, separate system prompt, selected schema delivery, thinking budget, and endpoint method | Prepared-message point count only with verified framing; authenticated `countTokens()` remains out of scope | Presence-aware cache/input/output usage; retain raw stop reason; map `max_tokens` to output limit |
| Gemini | Split semantic config from credentialed SDK client and abort timer; freeze role/system/schema/safety/thinking conversion | Prepared-message point count only with verified framing; authenticated `countTokens()` remains out of scope | Remove fabricated zero usage; preserve raw finish reason and thought/cache evidence |
| Mistral | Freeze messages, selected JSON-object/prompt delivery, sampling, output limit, and stream selector | Prepared-message heuristic only with versioned framing; otherwise unavailable | Presence-aware aliases; never invent `"stop"` for partial/unknown termination |
| OpenRouter | Freeze messages, routing, selected native/prompt schema delivery, reasoning, attribution, sampling, and mode fields | Prepared-message point count only with versioned framing; otherwise unavailable | Preserve gateway usage absence and raw underlying finish reason |
| llama.cpp | Freeze the exact OpenAI-compatible body including template kwargs, grammar, logprobs, selected schema delivery, and mode fields | Exact `/v1/chat/completions/input_tokens` under active template | Add observable state fingerprint, exact count, raw pre-cleanup content, and stale rejection |
| Mock | Freeze deterministic mock semantics, selected schema delivery, and mode | Explicit prepared-request heuristic with versioned framing provenance | Retain legacy `usage` while labeling its heuristic provenance; preserve partial evidence and cancellation |

## Phases

### Phase 1: Public Evidence Types and Internal Contracts

**Goal**: Establish additive types and internal seams before moving provider behavior.

**Work**:

- Extend `src/llm/types.ts` with:
  - `PreparedCallMode`, mode-specific opaque prepared-handle types, and preparation options;
  - stable request-view types;
  - a nonempty prepared-accounting union, prompt count/upper-bound evidence, and output-limit
    evidence with `library_default`, requested-value, and clamp provenance;
  - prepared bindings and inspection types;
  - token-profile and certificate references;
  - an explicit native/prompt structured-output delivery selector;
  - `LLMTermination`, raw-answer evidence, per-choice `rawContent`, and ordered raw parts;
  - a service-dispatched stream event type with required `attemptId`.
- Extend `src/llm/clients/types.ts` with:
  - an adapter-facing stream event type without a required attempt ID;
  - optional prepared-call capability and internal immutable command types;
  - preparation/revalidation result types;
  - explicit prepared-handle/staleness error codes.
- Add deep-freeze/JSON-view helpers only where shared behavior is real; do not expose SDK objects.
- Add type-level fixtures proving complete handles cannot call `streamPrepared` and stream handles
  cannot call `sendPrepared`.

**Steps**:

- [x] Define additive public types without removing `LLMUsage`, `finish_reason`, or existing stream
      variants.
- [x] Define the internal prepared adapter capability and legacy capability check.
- [x] Define failure codes for invalid handle, mode mismatch, unsupported preparation, and stale
      binding.
- [x] Add compile-time contract tests; runtime handle/immutability tests land with Phase 4.

**Verification**:

- [x] Existing consumer-facing request/response types still compile.
- [x] Legacy adapter literals can use the adapter event type without an `attemptId`.
- [x] Service stream return types guarantee an `attemptId`.
- [x] Prepared request views are JSON-safe and deeply immutable.
- [x] No prepared public type contains credential or transport fields.
- [x] Available accounting cannot be constructed without a count or bound.
- [x] Exact counts have zero/absent uncertainty; non-exact uncertainty is never reused as capacity
      slack or an application margin.
- [x] Output-limit types represent library defaults and request values clamped by separately
      proven model/provider caps without conflating those sources.

### Phase 2: Truthful Usage, Termination, and Raw Evidence

**Goal**: Fix fabricated accounting and establish equivalent final evidence before the larger
request refactor.

**Work**:

- Add `src/shared/adapters/usageUtils.ts` and tests for presence-aware alias selection and total
  derivation:
  - use presence checks/`??`, never truthiness;
  - preserve explicit zero;
  - omit unavailable fields;
  - derive total only when all required inputs are present;
  - omit the usage object when it contains no evidence;
  - identify provider-reported versus library-derived fields.
- Add an LLM termination mapper with provider-specific raw and normalized output.
- Update every built-in adapter:
  - Gemini: remove `usageMetadata || {}` and `|| 0`;
  - Mistral: remove alias truthiness and fabricated zeros/stops;
  - Anthropic streaming: merge partial usage without zero-filling;
  - OpenAI/OpenRouter/llama.cpp: retain existing correct absence behavior while adding evidence;
  - Mock: mark character counts as heuristic rather than provider usage.
- Capture the pre-normalization textual answer in every built-in before flattening/cleanup; retain
  ordered JSON-safe raw parts for Anthropic, Gemini, and any provider where typed-part boundaries
  would otherwise be lost. Capture before llama.cpp marker/nothink cleanup and service-level
  thinking-tag extraction.
- Add raw-answer accounting only when a profile can count the captured sequence honestly; record
  source and reasoning inclusion as included/excluded/unknown.
- Preserve usage, termination, and raw evidence in partial failures even when `choices` is empty.
- Preserve the existing non-stream retry policy. This phase makes final returned partial failures
  truthful but does not decide whether an intermediate partial-generating attempt should suppress
  an otherwise configured retry.
- Keep Mock's legacy `response.usage` fields for compatibility while adding explicit heuristic
  method/source evidence.

**Steps**:

- [x] Implement and exhaustively test shared usage normalization.
- [x] Add raw/normalized termination while retaining `finish_reason`.
- [x] Update non-stream response mappers provider by provider.
- [x] Update stream accumulators so usage-only and termination-only evidence survives failure.
- [x] Capture pre-normalization content without changing normalized output.
- [x] Add compatibility tests for every old response field.

**Verification**:

- [x] Missing Gemini/Mistral/Anthropic streaming fields remain absent.
- [x] Explicit zero survives every provider mapper.
- [x] Derived total appears only when its operands exist and is labeled derived.
- [x] Mistral partial failure with no stop reason remains unknown.
- [x] Provider-native and normalized termination are both available.
- [x] Generic OpenAI-compatible `length` remains `limit: "unknown"`.
- [x] Raw content survives tag extraction, llama.cpp cleanup, structured parsing, and partial
      failure.
- [x] Raw parts preserve provider order/type boundaries, and raw-answer evidence always identifies
      method, profile/revision, source, and native/extracted reasoning inclusion.
- [x] Provider completion usage is not mislabeled as visible-answer-only usage.
- [x] Mock retains its legacy usage fields while labeling their heuristic provenance.

### Phase 3: Canonical Credential-Free Adapter Preparation

**Goal**: Move every deterministic provider transformation ahead of inspection and make dispatch
consume an immutable prepared command.

**Work**:

- Refactor existing adapter builders instead of creating parallel formatting implementations:
  - `OpenAIClientAdapter.prepareCompletionRequest`;
  - `AnthropicClientAdapter.prepareMessageRequest`;
  - `GeminiClientAdapter.prepareGenerateContentRequest`;
  - `MistralClientAdapter.prepareCompletionRequest`;
  - `OpenRouterClientAdapter.prepareCompletionRequest`;
  - `LlamaCppClientAdapter.prepareCompletionRequest`;
  - Mock request generation.
- Split semantic preparation from:
  - SDK client construction;
  - API key validation/use;
  - abort-controller/timer creation;
  - transport timeout options;
  - inference invocation.
- Assign explicit adapter and request-shape revision constants to each built-in adapter.
- Add revision-guard fixtures so changing canonical shape snapshots requires an intentional
  request-shape revision bump.
- Make mode-specific behavior part of the command:
  - OpenAI/OpenRouter/llama.cpp `stream` and `stream_options`;
  - Mistral stream selector;
  - Anthropic/Gemini SDK operation choice.
- Add explicit structured-output delivery:
  - preserve native delivery as the default;
  - for prompt delivery, inject one versioned schema instruction at a deterministic provider-aware
    position before final message conversion;
  - expose that instruction and delivery mode in inspection;
  - label prompt delivery as instruction-only rather than provider-enforced;
  - suppress native schema/JSON response fields in prompt mode;
  - branch capability validation on the selected delivery;
  - ensure prepared accounting consumes the injected form.
- Build the normalized request view from the same final semantic representation used by dispatch.
- Clone only as required to protect a frozen canonical payload from SDK mutation; do not rerun
  formatting or capability selection.
- Preserve current validation diagnostics and exact provider request shapes.

**Steps**:

- [x] Implement the adapter capability in Mock as the deterministic reference.
- [x] Migrate OpenAI and OpenRouter, sharing helpers only where payload semantics are identical.
- [x] Migrate Anthropic, preserving message reorder/alternation and strict-schema behavior.
- [x] Migrate Gemini, separating the API client and abort timer from semantic config.
- [x] Migrate Mistral.
- [x] Migrate llama.cpp while leaving exact counting/state binding for Phase 6.
- [x] For each adapter, compare the prepared command/view with existing SDK-call request assertions.

**Verification**:

- [x] Every built-in adapter prepares without retrieving credentials.
- [x] Complete and stream modes expose all mode-specific semantic differences.
- [x] Schema normalization, system conversion, reasoning, routing, grammar, and logprobs are fixed
      before inspection.
- [x] Native and prompt schema delivery are mutually exclusive; prompt instructions are stable,
      visible, counted, and dispatch-identical.
- [x] Repeated dispatches use semantically identical provider payloads.
- [x] Existing adapter request-shape tests pass without silent behavior changes.
- [x] An unchanged legacy adapter still satisfies the public adapter interface; capability guards
      report prepared/counting support unavailable rather than fabricated.

### Phase 4: Service-Owned Prepared Calls and Output-Limit Provenance

**Goal**: Expose the public lifecycle and route convenience APIs through it.

**Work**:

- Add a service-owned `WeakMap` from frozen public handles to private prepared records.
- Split the current `LLMService.prepareRequest()` responsibilities into:
  1. resolve/validate/filter and record settings provenance;
  2. adapter credential-free preparation;
  3. public handle registration;
  4. credentialed dispatch.
- Add:
  - `prepareMessage(request, { mode })`;
  - `inspectPrepared(handle)`;
  - `sendPrepared(completeHandle, options)`;
  - `streamPrepared(streamHandle, options)`.
- Resolve and validate API keys only at dispatch.
- Revalidate bindings immediately before each physical inference attempt.
- Make `sendMessage()` equivalent to prepare-complete plus `sendPrepared()`.
- Make `streamMessage()` equivalent to prepare-stream plus `streamPrepared()`.
- Allocate the public stream attempt ID at `streamMessage()` entry, before validation,
  preparation, credential resolution, or provider iteration. `streamPrepared()` likewise
  allocates before handle validation.
- Implement the service stream coordinator before exposing the public stream wrappers:
  - manually drive the adapter iterator;
  - race each pending `next()` against cancellation;
  - emit `REQUEST_ABORTED` without depending on adapter signal compliance;
  - suppress a late `next()` result;
  - make `return()` cleanup bounded/detached so a noncompliant iterator cannot hang termination.
- Extend settings resolution to carry per-field source. Introduce an explicit verified hard output
  limit separate from a default setting:
  - clamp only against verified provider/model caps;
  - report `library_default` for the current global 4096-token default when it is the winner;
  - report the final field actually sent, its requested value when applicable, and separate
    clamp-cap value/source;
  - report absent when max tokens were filtered or cannot be proven;
  - mark whether the provider counts visible output, visible plus reasoning, provider-defined
    units, or unknown.
- Keep preset and nested-setting precedence byte-for-byte compatible unless a separate defect is
  identified and approved.

**Steps**:

- [x] Add provenance-bearing output-limit resolution while retaining existing setting precedence.
- [x] Add verified output-limit metadata to model/provider config without inferring it for unknown
      models.
- [x] Implement handle creation, lookup, mode checks, and inspection.
- [x] Implement complete dispatch and retry against the same adapter command.
- [x] Implement the stream coordinator and its cancellation/terminal primitives.
- [x] Convert both convenience methods to thin wrappers.
- [x] Add artifact security, redispatch, retry identity, credential timing, and wrapper-equivalence
      tests.

**Verification**:

- [x] Forged, serialized, cross-service, and mode-mismatched handles fail before dispatch.
- [x] Inspection mutation cannot alter dispatch.
- [x] Preparation never calls `ApiKeyProvider`; dispatch does.
- [x] Complete transport retries reuse the same frozen semantic command and revalidate each
      observable binding.
- [x] Concurrent redispatches do not share mutable attempt, usage, cancellation, or SDK state.
- [x] Content-modifying fallbacks require a newly visible prepared call.
- [x] Wrapper and explicit flows send the same provider representation and normalize the same
      response.
- [x] Output-limit value, provenance, clamp, filtering, and reasoning-count semantics are tested.
- [x] Validation, preparation, handle, and API-key failures in public streams carry the allocated
      attempt ID even when no provider iterator is opened.
- [x] Cancellation terminates when a fake adapter's `next()` and `return()` never settle.

### Phase 5: Token Profiles and Certified Structural Bounds

**Goal**: Add reusable, evidence-bearing counting without increasing the runtime tokenizer bundle.

**Work**:

- Create `src/llm/tokenization/` with:
  - public profile/count/certificate types;
  - a token-profile registry and provider/model mapping table;
  - versioned provider framing calculators that consume canonical prepared views;
  - tiktoken-backed synchronous content profiles;
  - certified bound registry and arithmetic;
  - focused tests and directory summaries.
- Keep tokenizer profile revision separate from model-to-profile mapping revision.
- Define ordinary-text/special-token semantics explicitly so special-token literals cannot silently
  trigger a heuristic fallback.
- Keep `countTokens()` behavior compatible, but implement/document it as the legacy numeric wrapper.
- Keep content-only counting distinct from prepared-message accounting. A cloud adapter populates
  `promptAccounting.count` only when a versioned calculator covers its final message order,
  system placement, schema/tool or prompt-fallback framing, and mode semantics. Otherwise prepared
  accounting is unavailable even when content strings can be counted.
- The composed prepared-count method is no stronger than its weakest component: exact only when
  tokenizer and framing are exact, otherwise `model`/`heuristic` with explicit uncertainty.
- Initially register only proof-backed profiles/certificates:
  - same-profile bounds only where the pinned decoder/encoder round trip proves them;
  - `cl100k_base` and `o200k_base` byte-complete profiles when their rank/config hashes match known
    revisions;
  - model aliases mapped to those profiles only when verified;
  - all other pairs unavailable.
- Derive and check certificate constants from the installed rank artifacts:
  - source maximum decoded bytes per ordinary generation token;
  - the source decoder's invalid-byte/replacement-character behavior and any UTF-8 re-encoding
    expansion;
  - terminal decoder flush, excluded special/control tokens, and cross-token byte composition;
  - target byte completeness/maximum tokens per byte;
  - fixed/affine additions where a profile needs them.
- Add:
  - `retokenizationUpperBound`;
  - `codePointBoundToTokenUpperBound`;
  - separate heuristic estimation only if a real consumer requires it.
- Validate nonnegative safe integers and fail unavailable/typed-error on overflow.
- Do not add another runtime tokenizer dependency.

**Steps**:

- [x] Implement profile identity, revision hashing, mapping revision, and exact/model/heuristic evidence.
- [x] Refactor tiktoken construction/cache around encoding profiles rather than model strings.
- [x] Derive certificate properties from pinned rank artifacts at runtime and check in the small
      expected hashes/constants/provenance.
- [x] Implement safe bound arithmetic and registry lookup.
- [x] Leave cloud prepared-message accounting unavailable until a verified framing calculator
      covers the entire canonical provider view.
- [x] Wire profile-backed raw-answer counts into the evidence fields introduced in Phase 2.
- [x] Add deterministic property/adversarial tests over ASCII, dense scripts, astral characters,
      combining sequences, variation selectors, ZWJ emoji, controls/NUL, special-token literals,
      maximum scalars, and documented lone-surrogate behavior.
- [x] Add the double-margin and exact-profile zero-margin fixtures against real evidence results.

**Verification**:

- [x] Unknown models/pairs are explicitly heuristic or unavailable.
- [x] No concatenated-content count is exposed as prepared-message accounting; each available cloud
      count includes every framing component or is marked unavailable.
- [x] Certificate availability is disabled when tokenizer data hashes do not match.
- [x] Retokenization tests generate/decode source token sequences and confirm actual target counts
      never exceed the bound.
- [x] Code-point tests confirm actual target counts never exceed `4 * codePoints` only for profiles
      whose byte-complete proof supports it.
- [x] `Number.MAX_SAFE_INTEGER` boundaries cannot round down or overflow.
- [x] Numeric margin test obtains `700` from a certified-bound API fixture that has no margin
      parameter, then shows raw 1000, margin 100, output 150, and slack 25 evaluate `875 <= 900`;
      a duplicate margin produces `975 <= 900` and is rejected by the test.
- [x] An exact prepared-count fixture uses `heuristicMargin = 0`, keeps any explicit
      `countingSlack` separate, and never manufactures uncertainty.
- [x] The production dependency list and installed tokenizer-asset footprint do not grow.

### Phase 6: llama.cpp Exact Counting and Stale-State Rejection

**Goal**: Count the exact active-template input and bind it to observable server/model/template
state.

**Work**:

- Extend `LlamaCppServerClient` with:
  - typed chat-input-token response;
  - `countChatCompletionInputTokens(finalBody, options)`;
  - typed `/props` fields needed for binding;
  - optional router-mode model selector for `/props`;
  - signal/timeout handling for count and revalidation calls.
- Add a canonical fingerprint helper over stable observable fields from `/props` and `/v1/models`.
- Ensure the count endpoint receives the exact final mode-bound llama.cpp body, including:
  messages, system fallback, template kwargs, structured output, grammar, and other framing fields.
- Record:
  - exact count and active-profile evidence;
  - chat-template hash;
  - server-state fingerprint;
  - build/model metadata suitable for diagnostics without exposing the absolute model path.
- Re-read state immediately before each physical inference dispatch and reject a mismatch with
  `PREPARED_CALL_STALE`.
- Bypass the old capability cache for binding validation; key cached detected capabilities by the
  state fingerprint or invalidate them when the fingerprint changes.
- If the endpoint or required state fields are unavailable on an older server, report exact
  prepared counting/binding unavailable; never relabel raw `/tokenize` as exact chat counting.

**Steps**:

- [x] Add server-client methods and mocked endpoint tests.
- [x] Add canonical fingerprint serialization/hash tests.
- [x] Wire exact counting into llama.cpp adapter preparation.
- [x] Wire fresh state revalidation into each complete retry and stream dispatch.
- [x] Test model/template/build changes and unchanged redispatch.
- [x] Add a llama.cpp-only `prepared-counting.e2e.test.ts` comparison between inspection count and
      terminal `usage.prompt_tokens`, using module-scope `describe.skip` gating.

**Verification**:

- [x] Exact count changes when template kwargs change.
- [x] Stream-only transport fields do not accidentally change the counted semantic input.
- [x] Same observable state redispatches; changed model/template/build state rejects before
      inference.
- [x] Router-mode model selection is encoded and tested.
- [x] Older/unavailable endpoints degrade to unavailable without using concatenated `/tokenize`.
- [x] Optional live e4b smoke test reproduces the count endpoint and fingerprint flow.

### Phase 7: Streaming Lifecycle Hardening and Provider Evidence

**Goal**: Complete the Phase 4 coordinator across every provider and stress it against
noncompliant iterators, evidence-only events, and cancellation races.

**Work**:

- Harden the focused service-level stream coordinator introduced before public stream exposure.
- Stamp the ID allocated at `streamMessage()`/`streamPrepared()` entry on every public event.
- Compose the caller signal with a service-owned abort controller.
- Manually drive `iterator.next()` and race it with cancellation; do not rely on an adapter to
  observe the composed signal.
- While open:
  - forward start/content/reasoning/usage events;
  - preserve partial evidence;
  - accept the first complete/error terminal only.
- On terminal:
  - post-process the final/partial response once;
  - yield exactly one terminal;
  - close the provider iterator and return;
  - suppress all later adapter events/errors.
- If the adapter ends without a terminal, synthesize one provider error.
- On cancellation, emit one `REQUEST_ABORTED` terminal if the consumer is still iterating.
- In `finally`, invoke iterator `return()` where available and abort internal transport, but bound
  or detach cleanup so a never-resolving `return()` cannot block the terminal envelope.
- Never wrap physical streams in `withRetry`; redispatching the prepared stream creates a new
  attempt ID.

**Steps**:

- [x] Extend the lifecycle tests with deliberately noncompliant fake adapters.
- [x] Update built-in accumulators to preserve usage-only/raw evidence and cooperate with
      cancellation.
- [x] Add pre-provider failure, late-result suppression, and abandonment cleanup tests without
      promising delivery to an abandoned consumer.
- [x] Add an iterator whose `next()` and `return()` never resolve and prove cancellation still emits
      one terminal promptly.

**Verification**:

- [x] Every emitted event has the same attempt ID for one invocation.
- [x] Delta-after-complete, error-after-complete, and two-terminal adapters expose one terminal.
- [x] End-without-terminal becomes one error.
- [x] Validation/preparation/API-key failures have the invocation ID allocated before provider
      dispatch.
- [x] Cancellation after deltas preserves partial evidence and ends with `REQUEST_ABORTED`.
- [x] Cancellation does not wait for a noncompliant `next()` or `return()`.
- [x] No post-cancellation delta is exposed.
- [x] Redispatch uses a new attempt ID and no transparent retry occurs.
- [x] Streaming and non-streaming final usage/termination fixtures are semantically equivalent.

### Phase 8: Capability Metadata, Exports, and Documentation

**Goal**: Make the new contract discoverable and maintainable without overstating provider facts.

**Work**:

- Extend `ModelCapabilities`/`ModelInfo` additively with:
  - context-window provenance;
  - content and prepared-message counting availability;
  - tokenizer/profile and mapping identity;
  - structured-output delivery;
  - expected prompt/completion usage reporting;
  - limit-termination distinguishability;
  - runtime-only active-server exact-count status.
- Preserve `getModelCapabilities()` as static/no-credential/no-network. Active llama.cpp facts belong
  to prepared inspection, not static preflight.
- Export public prepared, token-profile, certificate, accounting, and stream types/functions from
  `src/index.ts` and relevant subpath barrels.
- Add a packed-tarball consumer typecheck fixture/script that imports only the published surface and
  verifies mode-bound handles, required service event IDs, output provenance, and an unchanged
  legacy adapter implementation against generated declarations. It packs/installs in an isolated
  temporary directory and cleans that directory after the check.
- Add `genai-lite-docs/prepared-calls-and-accounting.md`.
  - **Durable audience/question**: application authors who need to inspect the exact semantic
    request, budget safely, and interpret incomplete provider evidence.
  - **Unique ownership**: the end-to-end contract spans service dispatch, token profiles, capacity
    boundaries, response evidence, and streaming; no existing page owns that combined workflow.
- Add `docs/dev/token-bound-certificates.md`.
  - **Durable audience/question**: maintainers adding or revising proof-backed tokenizer profiles.
  - **Unique ownership**: certificate derivation, artifact hashes, decoded-output domain, Unicode
    assumptions, and adversarial verification are maintenance rules rather than general API usage.
- Update:
  - `README.md` and `genai-lite-docs/index.md` with short examples/links;
  - `genai-lite-docs/llm-service.md`;
  - `genai-lite-docs/prompting-utilities.md`;
  - `genai-lite-docs/llamacpp-integration.md`;
  - `genai-lite-docs/providers-and-models.md`;
  - `genai-lite-docs/core-concepts.md`;
  - `genai-lite-docs/typescript-reference.md`;
  - `docs/dev/adding-models-and-providers.md`.
- Correct the existing usage docs that show optional token fields as required and the existing
  `service.registerAdapter()` examples for a method that is not public.
- Refresh the hand-maintained root/`src`/`src/llm`/client/service/prompting summaries, add summaries
  for the new tokenization directory, and update the context-build date in `AGENTS.md`.

**Verification**:

- [x] Examples use mode-bound preparation and check preparation failures.
- [x] Docs distinguish semantic request view from credentials/transport.
- [x] Docs show explicit native versus prompt structured-output delivery and state that injected
      prompt/schema framing is included in prepared accounting.
- [x] Docs distinguish point count, structural bound, counting slack, and application margin.
- [x] The `875 <= 900` single-margin example appears exactly and is not contradicted elsewhere.
- [x] Provider capability tables use unknown/unavailable rather than assumptions.
- [x] llama.cpp docs distinguish `/tokenize` from exact chat-input counting.
- [x] TypeScript reference matches optional usage fields and attempt-ID guarantees.
- [x] New public exports are present in built output.
- [x] The packed consumer fixture typechecks without relying on source-only paths.

### Phase 9: Full Verification and Issue Closure

**Goal**: Verify compatibility, package integrity, and every acceptance criterion before resolving
the issue.

**Work**:

- Run focused suites after each phase.
- Run build and the complete Jest suite.
- Run the production dependency audit and package dry run.
- Verify CommonJS exports from `dist` and declaration-level use from a packed temporary consumer.
- Run the gated local llama.cpp E2E suite while the user-provided server is healthy; do not start or
  stop it implicitly during normal unit tests.
- Perform a file-by-file acceptance-criteria audit against the issue.
- When complete:
  - add the issue `## Resolution` with date/version;
  - mark criteria complete;
  - set issue status to `RESOLVED`;
  - set plan status to `COMPLETE`;
  - move both files to `docs/archive/`;
  - update references to their archived locations.

**Commands**:

```powershell
npm.cmd test -- LLMService.prepared.test.ts LLMService.accounting.test.ts
npm.cmd test -- OpenAIClientAdapter.test.ts AnthropicClientAdapter.test.ts GeminiClientAdapter.test.ts
npm.cmd test -- MistralClientAdapter.test.ts OpenRouterClientAdapter.test.ts LlamaCppClientAdapter.test.ts
npm.cmd test -- TokenProfileRegistry.test.ts CertifiedTokenBounds.test.ts StreamLifecycle.test.ts
npm.cmd run build
npm.cmd test
npm.cmd audit --omit=dev --audit-level=high
npm.cmd pack --dry-run
node -e "const lib = require('./dist'); console.log('Exports:', Object.keys(lib));"
npm.cmd run test:packed-api
npx.cmd jest --config jest.e2e.config.js prepared-counting.e2e.test.ts --runInBand
```

Do not use the full E2E command for this issue unless paid cloud calls are separately authorized.
The llama.cpp-only suite uses the existing availability gate without converting missing
availability into a pass.

**Verification**:

- [x] Focused suites pass.
- [x] Full build and unit suite pass.
- [x] Production audit has no high-severity blocking advisory.
- [x] Package contents and exports include the new public API and no tokenizer asset explosion.
- [x] Packed CommonJS/runtime and TypeScript/declaration consumer fixtures pass, including the
      unchanged legacy adapter compile fixture.
- [x] Local exact-count E2E passes when the server is available.
- [x] Every issue acceptance criterion has a test or documented verification.

## Phase Checkpoints and Rollback

- Keep each phase buildable and commit it separately with the required DCO sign-off.
- Preserve existing request-shape and response-compatibility tests as migration guards until the
  final phase; do not delete the old builder path before its replacement passes parity tests.
- If a provider migration fails parity, revert that provider's phase commit while leaving completed
  additive evidence types/utilities intact.
- Keep token-profile/certificate registrations fail-closed and data-driven so a bad mapping or hash
  can be disabled without removing the prepared-call API.
- Keep exact llama.cpp counting optional: older/incompatible servers continue through the prepared
  path with accounting marked unavailable, so the integration can be rolled back independently.
- Archive the issue and plan only after the complete verification gate; until then they remain the
  authoritative open-work record at the repository root.

## Testing Strategy

### Service contract

- Handle ownership, forgery, serialization, mode mismatch, immutability, credential timing.
- Explicit versus convenience path equivalence.
- Sequential/concurrent same-payload redispatch and per-attempt stale checks.
- Output-limit filtering, library-default/request provenance, separate cap/clamp provenance, and
  reasoning semantics.
- Attempt IDs on failures before preparation, credentials, or provider iteration.

### Provider request parity

- Preserve every existing outbound SDK-call assertion.
- Add a corresponding prepared-view assertion for system conversion, schemas, reasoning, sampling,
  routing, grammar, logprobs, and mode.
- Compare native and explicit prompt structured-output delivery, including injected instruction
  placement, mutual exclusion, framing count, and request-shape revision.
- Assert no provider builder runs again during dispatch/retry.

### Accounting matrix

For every built-in adapter:

- usage absent;
- partial usage object;
- explicit zero;
- derived total with both operands;
- usage-only partial failure;
- raw and normalized termination;
- absent/unknown termination;
- ambiguous limit;
- raw pre-normalization content;
- ordered raw parts and reasoning-inclusion provenance;
- partial raw content;
- provider versus derived/heuristic evidence.
- nonempty available accounting and exact/non-exact uncertainty invariants.

### Certificate verification

- Exhaustively verify constants against pinned tokenizer artifacts.
- Use deterministic seeded generation rather than adding a runtime dependency.
- Exercise decoded source-token sequences, adversarial Unicode, special-token literals, safe
  integer edges, invalid-byte replacement and terminal flush, unsupported pairs, artifact hash
  mismatches, same-profile round trips, the single-margin fixture, and exact zero-margin behavior.

### Stream lifecycle

- Normal sequence, cancellation before/after deltas, thrown adapter, terminal then delta, terminal
  then throw, two terminals, silent end, abandoned iterator, never-settling `next()`/`return()`,
  usage-only partial, pre-provider failures, and redispatch.

## Risks and Mitigations

- **Large cross-cutting refactor**: land phases as small conventional commits and keep old request
  shape assertions active throughout.
- **SDK mutation of request objects**: store a frozen canonical representation and use a mechanical
  transport clone, never rerun semantic formatting.
- **Output-limit ambiguity**: represent the library default and request provenance separately from
  verified cap/clamp provenance; report unknown/absent instead of treating every default as a cap.
- **Cloud exact count versus no credentials**: keep authoritative authenticated endpoints out of
  preparation; require versioned full-framing calculators for prepared point counts and otherwise
  report unavailable.
- **GGUF identity ambiguity**: use live endpoint count for the prepared text and observable state
  binding; do not certify cross-token bounds for unpinned conversions.
- **Server TOCTOU**: revalidate immediately before inference and document that only observable
  state is covered.
- **Certificate overclaim**: define decoded-output domain, verify artifact hashes, document proofs,
  and fail closed on unsupported profiles or overflow.
- **Double-applied margin**: APIs accept no application margin and the numeric regression locks the
  single application boundary.
- **Stream cleanup races**: centralize terminal/cancellation state in the service, race pending
  iterator reads explicitly, bound/detach cleanup, and test noncompliant adapters.
- **Legacy adapter source compatibility**: keep prepared capability optional, keep adapter/public
  stream event requirements separate, and typecheck an unchanged implementation from the package.
- **Documentation drift**: update API docs, provider matrix, TypeScript reference, and context
  summaries in the same change.

## Open Questions

No product decision is currently blocking implementation. If exploration during execution reveals
that a provider/model hard output cap or tokenizer mapping cannot be verified, that metadata will
remain unknown/unavailable rather than being inferred.

---

## Resolution

Completed on 2026-07-29 for v0.15.0. All nine phases were implemented and
verified. Three specialized final reviews covered prepared-call architecture,
tokenization/documentation, and response-accounting/streaming behavior; no
high- or medium-severity findings remain.
