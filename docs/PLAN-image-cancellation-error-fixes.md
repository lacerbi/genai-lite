# Plan: Image cancellation + error-envelope fixes (v0.10.0)

Created: 2026-07-03
Status: COMPLETE (2026-07-03) — Phases 1-4 implemented and verified
(three-agent doublecheck: code/tests/docs all PASS; 810 tests green);
Phase 5 released as v0.10.0. Archived under docs/.

## Summary

Implement ISSUE-next-steps items 6 (request-side image cancellation via
`AbortSignal` + genai-electron `DELETE`) and 7 (full error code/type mapping fix
in `GenaiElectronImageAdapter.handleError`), plus two findings from planning:
`ImageService` flattens every adapter error to `PROVIDER_ERROR`/`server_error`
(must be fixed for 6 and 7 to be visible at all), and the genai-electron default
base URL uses `localhost` (Windows IPv6-fallback stall risk, worst for a 500ms
poll loop). Ship as **v0.10.0**, which also flushes the pending #91 deps delta
(resolving item 1).

## Scope

- **In scope**
  - `ImageService.generateImage(request, options?: { signal })` — new optional
    second argument mirroring `LLMService.sendMessage`.
  - Signal threading through `ImageProviderAdapter.generate` (additive config
    field) to both real adapters + `MockImageAdapter`.
  - genai-electron: abort → best-effort `DELETE /v1/images/generations/:id`;
    poll-timeout → same DELETE (cancel-on-timeout) but classified as timeout.
  - Full error mapping fix in `GenaiElectronImageAdapter` (codes **and** types),
    including typed timeouts and attaching the server's JSON error code in
    `createHttpError` (without it, the `SERVER_BUSY` branch can never fire).
  - `ImageService` failure envelope propagates adapter `code`/`type`/`status`.
  - Default base URL `http://localhost:8081` → `http://127.0.0.1:8081`.
  - New `src/image/ImageService.test.ts` (none exists today) + adapter tests.
  - Docs updates (genai-lite-docs, README, CLAUDE.md, issue bookkeeping).
  - Release v0.10.0 (version bump, tag, npm publish).
- **Out of scope**
  - ISSUE items 2–5 (SDK majors, Gemini network-error flattening) — next bundle.
  - Retry layer for ImageService (noted as future item in ISSUE-next-steps).
  - Per-call `timeoutMs` override for images (see Open Questions).
  - 404-on-poll (expired generation TTL) remap — currently surfaces as
    `MODEL_NOT_FOUND`/`invalid_request_error`; log as a new ISSUE-next-steps
    entry rather than fixing here.
  - `.summary_*.md` regeneration (repo convention: not updated per-change).
  - genai-electron (sister repo) doc caveat update — post-release follow-up
    there, not part of this repo's changes.

## Reference facts (verified during planning)

- Cancel endpoint (genai-electron ≥ 0.6.0, unchanged in 0.7.x):
  `DELETE /v1/images/generations/:id` → 200 `{id, status:'cancelled'}`;
  404 `NOT_FOUND`; 409 `ALREADY_TERMINAL`; idempotent when already cancelled.
- Server error codes in spec: `SERVER_BUSY`, `NOT_FOUND`, `INVALID_REQUEST`,
  `BACKEND_ERROR`, `IO_ERROR`. (`SERVER_NOT_RUNNING` is not produced over HTTP —
  branch kept as defensive mapping only.)
- `ImageService.generateImage` inner catch (src/image/ImageService.ts:186-202)
  hardcodes `code: 'PROVIDER_ERROR', type: 'server_error'`.
- `createHttpError` (GenaiElectronImageAdapter.ts:316-336) parses the JSON error
  body for `message` but drops `code`; sets only `status`/`url`.
- Poll-timeout and start-POST timeout both currently produce plain Errors →
  `UNKNOWN_ERROR`/`client_error` after mapping.
- `ImageFailureResponse.error` has no `status` field (src/types/image.ts:280-291);
  LLM's error object carries one.
- OpenAI SDK call `client.images.generate(params)` accepts per-request options
  (second arg) incl. `signal` — parity is one line.
- LLM precedent to mirror: `SendMessageOptions { signal?, timeoutMs?, maxRetries? }`
  (src/llm/LLMService.ts:77), signal chaining pattern in GeminiClientAdapter
  (manual `addEventListener('abort', ...)` — avoids `AbortSignal.any` floor questions).
- Tests mock `global.fetch` (GenaiElectronImageAdapter.test.ts:13-14), so DELETE
  assertions are straightforward.

## Phases

### Phase 1: Error mapping & envelope correctness (ISSUE item 7, full scope)

**Goal**: Adapter errors carry correct `code`/`type`/`status`, and those fields
actually survive to the `ImageFailureResponse` the consumer sees.

**Work**:
- [x] `src/types/image.ts` — add optional `status?: number` to
  `ImageFailureResponse.error`.
- [x] `src/image/ImageService.ts` — inner catch propagates `(error as any).code`,
  `.type`, `.status` when present, falling back to
  `PROVIDER_ERROR`/`server_error`; keeps `providerError` and message behavior.
  **Guard**: the same catch also wraps `this.getApiKey(...)` (L158), so a
  custom `ApiKeyProvider` throwing e.g. a Node error with `.code = 'ENOENT'`
  must NOT leak into the envelope — propagate only when `error.code` is one of
  `ADAPTER_ERROR_CODES` (adapter-shaped error); otherwise keep the generic
  fallback. Test this guard explicitly.
- [x] `src/adapters/image/GenaiElectronImageAdapter.ts`:
  - `createHttpError`: attach parsed `errorData.error.code` to the thrown error
    (as `.code`), so HTTP-level `SERVER_BUSY` (503 body) is classifiable.
  - `handleError`: replace the dead `(error as any).type` writes with local
    `errorCode`/`errorType` assignments (same shape as the existing
    `GENERATION_CANCELLED` branch):
    - `SERVER_BUSY` → `RATE_LIMIT_EXCEEDED` / `rate_limit_error`
    - `SERVER_NOT_RUNNING` → `NETWORK_ERROR` / `connection_error` (defensive)
    - `BACKEND_ERROR` → `PROVIDER_ERROR` / `server_error`
    - `IO_ERROR` → `PROVIDER_ERROR` / `server_error`
  - Typed timeouts: the `startGeneration` AbortError path and the
    `pollForCompletion` overall-timeout path throw errors that `handleError`
    maps to `REQUEST_TIMEOUT` / `timeout_error` (today: `UNKNOWN_ERROR` /
    `client_error`). Keep the "Try increasing the timeout…" message suffix.

**Steps**:
1. Type change (`status` field).
2. Adapter fixes (`createHttpError`, `handleError`, typed timeouts).
3. `ImageService` envelope propagation.
4. Tests (below), then `npm test`.

**Verification**:
- [x] Extended `GenaiElectronImageAdapter.test.ts`: `toMatchObject` assertions on
      `code`/`type`/`status` for SERVER_BUSY(503), BACKEND_ERROR, IO_ERROR,
      poll-timeout, start-timeout; existing tests still pass.
      (+ ECONNREFUSED typed assertion; both suites green, 36 tests.)
- [x] New `src/image/ImageService.test.ts`: a custom adapter throwing a typed
      error yields an envelope with that `code`/`type`/`status`; an untyped
      `Error` still yields `PROVIDER_ERROR`/`server_error`.
      (+ ENOENT ApiKeyProvider guard test, abort propagation, success passthrough.)

### Phase 2: AbortSignal cancellation (ISSUE item 6)

**Goal**: Callers can cancel an in-flight image generation; genai-electron
generations are actually cancelled server-side (also on client-side timeout).

**Work**:
- [x] `src/types/image.ts`:
  - New `GenerateImageOptions { signal?: AbortSignal }` (JSDoc mirrors
    `SendMessageOptions.signal` wording: client-side, never retried).
  - `ImageProviderAdapter.generate(config)`: add optional `signal?: AbortSignal`
    to the config bag (additive — custom adapters unaffected). Note the config
    bag type is duplicated as inline literals in each adapter
    (OpenAIImageAdapter.ts:75-80, GenaiElectronImageAdapter.ts:101-106,
    MockImageAdapter.ts:33-38) — each literal must also gain the field for the
    adapter to read it.
- [x] `src/index.ts`: export `GenerateImageOptions`.
- [x] `src/image/ImageService.ts`: `generateImage(request, options?)`; if
  `options.signal.aborted` before dispatch, return a `REQUEST_ABORTED` /
  `abort_error` failure without calling the adapter; otherwise pass `signal`
  into the adapter config. (Needs a new `ADAPTER_ERROR_CODES` import — the
  service doesn't import it today; Phase 1's propagation guard needs it too.)
- [x] `src/adapters/image/GenaiElectronImageAdapter.ts`:
  - Chain caller signal into the start-POST's existing timeout controller
    (Gemini-adapter pattern) and pass a signal to every poll GET.
  - Classification by adapter-side state, not error shape: both the POST
    timeout and a caller abort surface as `AbortError` from the shared
    controller, so classify from a local timer-fired flag vs
    `signal.aborted` — user abort wins (mirrors GeminiClientAdapter v0.9.2).
  - Make the inter-poll `sleep` abort-aware (race against signal).
  - On caller abort once a generation ID exists: best-effort
    `DELETE {baseURL}/v1/images/generations/{id}` — own short timeout (~5s),
    swallow *all* failures (404/409/network) with a debug log; then throw the
    existing `REQUEST_ABORTED`/`abort_error` shape. Abort before an ID exists
    needs no DELETE.
  - Cancel-on-timeout: the poll-timeout path sends the same best-effort DELETE
    but still throws the (now typed) `REQUEST_TIMEOUT`/`timeout_error` error —
    the DELETE is cleanup, not a reclassification.
- [x] `src/adapters/image/OpenAIImageAdapter.ts`: pass `{ signal }` as the
  per-request options to `client.images.generate`, and to the hosted-URL fetch
  in `processResponse`. SDK abort (`APIUserAbortError`) already maps to
  `REQUEST_ABORTED` via `getCommonMappedErrorDetails`.
- [x] `src/adapters/image/MockImageAdapter.ts`: throw an abort-typed error when
  `signal` is aborted (mirrors `MockClientAdapter`), enabling service-level tests.

**Steps**:
1. Types + export.
2. ImageService signature + threading + pre-abort check.
3. genai-electron adapter (signal chaining, abortable sleep, DELETE paths).
4. OpenAI + Mock adapters.
5. Tests (below), then `npm test`.

**Verification**:
- [x] genai-electron adapter tests: abort before start (no DELETE, REQUEST_ABORTED);
      abort mid-poll (DELETE sent to right URL with `method: 'DELETE'`,
      REQUEST_ABORTED thrown, polling stops); DELETE rejection swallowed
      (original abort error still surfaces); poll-timeout sends DELETE and
      throws REQUEST_TIMEOUT. (+ caller-abort during POST wins over timeout.)
- [x] OpenAI adapter test: `images.generate` receives options with the signal
      (+ `undefined` options when no signal; dall-e-3 URL-fetch assertion updated
      for the new second fetch arg).
- [x] ImageService tests: pre-aborted signal short-circuits; signal reaches a
      custom adapter's config.
- [x] Full unit suite green after Phases 1-2: 809 tests / 34 suites.

### Phase 3: Default base URL `localhost` → `127.0.0.1`

**Goal**: Avoid the Windows IPv6-fallback stall (documented for llamacpp; worse
here due to 500ms polling).

**Work**:
- [x] `src/image/config.ts:180` (`IMAGE_ADAPTER_CONFIGS`) and
  `GenaiElectronImageAdapter` constructor default (`.ts:92`), plus the stale
  URL in that adapter's header doc comment (`.ts:8`).
- [x] `examples/image-gen-demo` fallback strings: `server/services/image.ts:53`,
  `server/routes/health.ts:10`, `README.md:56,165-166`, `.env.example:11-12`.
- Leave explicit `localhost` in tests as-is (they pass explicit baseURLs).
- **Do NOT touch** `genai-lite-docs/llamacpp-integration.md:135` and
  `genai-lite-docs/core-concepts.md:369` — those `localhost:8081` strings are
  llama.cpp baseURL examples (coincidental port), not genai-electron.
- Doc mentions updated in Phase 4. `GENAI_ELECTRON_IMAGE_BASE_URL` override
  behavior unchanged. Reuse the existing rationale phrasing from
  `providers-and-models.md:177` (llamacpp's 127.0.0.1 note; fuller versions at
  `troubleshooting.md:142-144`, `llamacpp-integration.md:119`).

**Verification**:
- [x] Grep: no remaining `localhost:8081` defaults in `src/` (tests exempt);
      the two llama.cpp false positives untouched. (Only remaining non-test hit
      is a llama.cpp example in `src/llm/clients/.summary_long.md` — out of scope.)

### Phase 4: Documentation & issue bookkeeping

**Goal**: Docs describe the new API and corrected error behavior; issue files
reflect reality.

**Work** (file list from docs sweep):
- [x] `genai-lite-docs/image-service.md`:
  - Cancellation section with `AbortSignal` example (natural home: near
    "Progress Callbacks", L149-181); cancel-on-timeout note.
  - Error Handling section (L366-400): the `switch (result.error.type)` example
    currently lists only `authentication_error`, `rate_limit_error`,
    `validation_error`, `network_error` — bring in line with the real taxonomy
    (`abort_error`, `timeout_error`, `connection_error`, `server_error`,
    `rate_limit_error`) and document the genai-electron code mappings
    (SERVER_BUSY → RATE_LIMIT_EXCEEDED, etc.).
  - Base URL default (L107).
- [x] `genai-lite-docs/typescript-reference.md`:
  - New `GenerateImageOptions` (place beside `SendMessageOptions`, L363-368).
  - `ImageFailureResponse.error.type` union (L422-431) — currently
    `authentication_error | rate_limit_error | validation_error | network_error
    | provider_error`, which doesn't match the code even today; correct it to
    the real set incl. `abort_error`/`timeout_error`/`connection_error`/
    `server_error`, and add `status?: number`.
- [x] `genai-lite-docs/troubleshooting.md`: `localhost:8081` at L176/L179/L276-277;
  "503 Server Busy" (L182-186) now surfaces as `rate_limit_error`; extend the
  L209-218 error-type table and L287-316 timeout/cancellation section to cover
  images.
- [x] `genai-lite-docs/core-concepts.md`: env-var default at L63. Also the
  canonical Error Handling section (L257-324) — image-service.md and
  troubleshooting.md both route readers here, but it is entirely LLM-framed:
  its `ErrorType` union lacks `provider_error` and there's no image coverage.
  Extend the union/notes so the shared taxonomy covers image failures too
  (incl. the genai-electron code mappings, or a pointer to image-service.md).
- [x] `genai-lite-docs/index.md`: base-URL comment/export at L91-92.
- [x] `genai-lite-docs/providers-and-models.md`: defaults at L279 and L363; optional
  one-line cancellation mention in genai-electron capabilities (L286-299).
- [x] `genai-lite-docs/example-image-demo.md`: `localhost:8081` at L82/L417/L466
  (the demo code itself is updated in Phase 3; bare "port 8081" mentions stay —
  the port is unchanged).
- [x] `docs/dev/adding-models-and-providers.md`: the `ImageProviderAdapter.generate`
  config-bag contract (L624-637) gains `signal?: AbortSignal` — this is the only
  doc defining the custom-adapter interface.
- [x] `README.md`: extend the reliability bullet to mention image cancellation
  (no base-URL text in README).
- [x] `CLAUDE.md`: genai-electron section — default URL (L347), polling description
  gains DELETE/cancel-on-timeout (L339-348), reliability section (L357-362)
  gains the image analog.
- [x] `docs/ISSUE-cancelled-generation-status.md`: mark item 3 resolved (v0.10.0).
- [x] `ISSUE-next-steps.md`: mark items 1, 6, 7 resolved; add the deferred
  404-on-poll remap as a new entry; note the ImageService envelope fix and URL
  default change shipped with v0.10.0.
- Explicitly NOT updated: `docs/devlog/*` (historical records),
  `examples/image-gen-demo/PLAN.md` (internal demo planning artifact, treated
  as historical), plain "port 8081" mentions where the port itself is unchanged
  (image-service.md:77, index.md:212, example-image-demo.md:465),
  `.summary_*.md` (no per-directory summaries exist for the image dirs; root
  summaries carry no affected detail), demo Cancel-button wiring (follow-up).

**Verification**:
- [x] Docs sweep findings all addressed or consciously skipped (list above).
- [x] No current (non-devlog) doc still claims errors surface as
      `PROVIDER_ERROR` only, or `localhost:8081` as the genai-electron default.
      (Grep: only the two llama.cpp false positives remain, untouched.)

### Phase 5: Release v0.10.0

**Goal**: Publish, flushing the pending #91 anthropic floor bump (ISSUE item 1).

**Steps**:
- [ ] 1. `npm test` (full suite, coverage), `npm audit --audit-level=high`,
   `npm run build && npm pack --dry-run`.
- [ ] 2. Exports smoke: `node -e "const lib = require('./dist'); console.log(Object.keys(lib))"`
   — verify `GenerateImageOptions` type compiles/exports (types via `tsc` build).
- [ ] 3. Bump `package.json` to `0.10.0`; conventional commit(s) with `-s` (DCO).
- [ ] 4. Push, confirm CI green.
- [ ] 5. Tag `v0.10.0`, push tag, `npm publish`.
- [ ] 6. (Follow-up, sister repo, not this session's scope): update genai-electron's
   `image-generation.md` caveat about genai-lite versions.

**Verification**:
- [ ] CI green on main.
- [ ] `npm view genai-lite version` → 0.10.0.

## Testing strategy

- All unit (mocked fetch / mocked SDK) — no e2e exists for images and none is
  added; real-wire behavior optionally smoke-tested via `examples/image-gen-demo`
  against a running genai-electron server if available (manual, optional).
- New file `src/image/ImageService.test.ts` co-located per repo convention.
- Use real timers + short constructor timeouts (existing pattern; only
  `withRetry.test.ts` uses fake timers). Avoid fake timers for the abortable
  sleep / DELETE-timeout tests — real-timer coordination is simpler and matches
  the existing poll-timeout test (`timeout: 100`).

## Risks

- **User-visible behavior change** in failure envelopes (`code`/`type` now
  meaningful): intended, minor-version-worthy; docs updated accordingly.
- **Interface change** to `ImageProviderAdapter.generate` config: additive
  optional field — existing custom adapters keep compiling and working.
- **DELETE cleanup must never mask the primary error**: enforced by tests
  (swallowed-rejection test).
- Demo apps (`examples/image-gen-demo`) don't use the new option — unaffected;
  wiring a Cancel button is a possible follow-up, not in scope.

## Open Questions

1. Include a per-call `timeoutMs` in `GenerateImageOptions` for LLM parity?
   Proposal: **defer** (adapter-level timeout config already exists; keep this
   bundle focused). Noted in ISSUE-next-steps if deferred.
   → **Resolved 2026-07-03**: deferred (plan approved as proposed).
2. `SERVER_BUSY` → `RATE_LIMIT_EXCEEDED`/`rate_limit_error` — agreed mapping?
   (Alternative: `PROVIDER_ERROR` with 503. Rate-limit chosen because busy =
   "retry later", matching 429 semantics and the original code's intent.)
   → **Resolved 2026-07-03**: RATE_LIMIT_EXCEEDED mapping (plan approved as proposed).

---
Execution log: see checkboxes above ([ ] pending, [~] in progress, [x] done, [!] blocked).

Completion notes (2026-07-03):
- Final doublecheck (3 read-only verifier agents): code PASS (no BLOCKER/MAJOR;
  one by-design MINOR: abort rejection awaits the best-effort DELETE, up to its
  5s cap, before surfacing — deterministic, matches plan intent), tests PASS
  (deterministic under real timers; MockImageAdapter abort-path gap closed with
  an added direct test), docs PASS (all claims match code; anchors resolve).
- The existing start-timeout test was rewritten to a hanging-POST mock: under
  state-based classification a spontaneous AbortError (no timer, no signal) is
  unreachable in production and now maps to REQUEST_ABORTED — the new test has
  higher fidelity to the real timeout mechanism.
- NITs consciously left: pre-abort envelope omits providerError (optional
  field); poll GETs have no per-fetch timeout when no signal is supplied
  (pre-existing behavior, out of scope).
