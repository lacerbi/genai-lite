# ISSUE: Post-v0.9.2 TODO — deferred follow-ups

Created: 2026-07-03
Updated: 2026-07-26 (v0.13.1 shipped; items 13, 14, 17 resolved; item 16 open)
Status: OPEN
Package: genai-lite

Session context: on 2026-07-03, v0.9.1 (Gemma 4 catalog corrections: 12B added,
nonexistent `gemma-4-4b-it` removed, context windows fixed) and v0.9.2 (Gemini
timeout/abort classification; genai-electron `'cancelled'` terminal status) were
released, published to npm, and tagged. The five stale Dependabot PRs (#82–#85,
#87) were consolidated in #91 and merged. Resolved issue files are archived
under `docs/archive/` (`ISSUE-gemini-timeout-classification.md`,
`ISSUE-cancelled-generation-status.md`); this file tracks what was deliberately
deferred.

Later on 2026-07-03, **v0.10.0** shipped items 6 and 7 below (plus: ImageService
failure envelopes now propagate adapter `code`/`type`/`status` instead of always
`PROVIDER_ERROR`/`server_error`, guarded so non-adapter errors — e.g. a failing
`ApiKeyProvider` with `.code = 'ENOENT'` — keep the generic fallback; the
genai-electron default base URL changed `localhost` → `127.0.0.1`; new
`src/image/ImageService.test.ts`). See `docs/archive/PLAN-image-cancellation-error-fixes.md`
(or git history) for the full change record.

**v0.10.0 release state**: commit `440410a` on main, CI green, tag `v0.10.0`
pushed, **published to npm on 2026-07-03** (`npm view genai-lite version` →
0.10.0). Release complete.

Note: all "latest" package versions below were checked via `npm view` on
2026-07-03 — re-check before starting any upgrade item.

## TODO (rough priority order)

1. ~~**Release the pending main delta.**~~ **RESOLVED (v0.10.0, 2026-07-03)** —
   the unpublished `@anthropic-ai/sdk` floor bump `^0.71.2` → `^0.72.1` from
   #91 shipped with v0.10.0.

2. ~~**`@google/genai` 2.x major upgrade**~~ **RESOLVED (v0.11.0, 2026-07-03)** —
   floor bumped `^1.0.1` → `^2.10.0`. Much smaller than feared: 2.0.0's breaking
   changes are confined to the new Interactions API (`generateContent` untouched
   per changelog, verified against 2.10.0 source). Both load-bearing surfaces
   unchanged: `config.abortSignal` still funnels into the SDK's internal
   controller; `httpOptions.timeout` still `setTimeout`+abort plus
   `X-Server-Timeout` header (default headers always set, so the headerless
   `{ timeout }` we pass does emit the hint). State-based timeout/abort
   classification from v0.9.2 unaffected. New discovery, recorded in the adapter:
   the SDK now has an **opt-in** internal retry layer
   (`httpOptions.retryOptions`, p-retry, 5 attempts on 408/429/5xx) — verified
   off by default in 1.52 and 2.10; it must stay unset or it would multiply
   attempts under `withRetry`.

3. ~~**`@mistralai/mistralai` 2.x major upgrade**~~ **RESOLVED-AS-DEFERRED
   (v0.11.0, 2026-07-03)** — 2.x (2.4.1) is **ESM-only** (`type: module`, no
   CJS build): genai-lite's CJS output can only `require()` it on Node ≥ 20.19,
   and Jest's CJS module registry cannot load it at all (`type: module`
   packages bypass the transform pipeline — 8 unit suites and all e2e would
   break). Deferred to item 12 (dual packaging); floor bumped `^1.11.0` →
   `^1.15.1` (latest 1.x) instead. The item's real payload shipped anyway —
   the "check error shapes" review found three production bugs, all fixed in
   shared `errorUtils`/adapter and live-verified: (a) `MistralError` exposes
   `statusCode`, not `status`, so HTTP errors (429/401/5xx) mapped to
   `UNKNOWN_ERROR` and were never retried; (b) Speakeasy's typed
   `RequestAbortedError`/`RequestTimeoutError`/`ConnectionError` were
   unrecognized; (c) the SDK silently drops `timeoutMs` whenever a signal is
   supplied — the adapter now composes
   `AbortSignal.any([signal, AbortSignal.timeout(ms)])`.

4. ~~**`@anthropic-ai/sdk` catch-up**~~ **RESOLVED (v0.11.0, 2026-07-03)** —
   deliberate jump `^0.72.1` → `^0.110.0`. Changelog review (0.73–0.110): no
   breaking changes on our surfaces; still CJS; no engines change. Live no-key
   verification exposed a **pre-existing** bug (also on 0.72.1, and affecting
   every OpenAI-SDK-based adapter: openai, openrouter, llamacpp):
   `APIUserAbortError`/`APIConnectionTimeoutError`/`APIConnectionError` never
   assign `this.name` (instances report name `'Error'`), so the shared
   name-based classification never fired — aborts/timeouts/network failures
   fell through to `UNKNOWN_ERROR`/`client_error` and timeouts were never
   retried. Fixed generically: `errorUtils` now matches constructor names too
   and walks nested `cause` chains (anthropic buries the socket code at
   `error.cause.cause.code`). See also new items 13–14 for pre-existing
   adapter issues found during review.

5. ~~**Gemini network-error flattening**~~ **RESOLVED (v0.11.0, 2026-07-03)** —
   turned out to be already unlocked: since 1.52 the SDK rethrows fetch
   rejections that are `Error` instances unwrapped (`if (e instanceof Error)
   throw e`), so network failures reach the adapter as undici's raw
   `TypeError: fetch failed` with the real failure on `error.cause`
   (`.code = 'ECONNREFUSED'` etc.). Fixed generically in
   `src/shared/adapters/errorUtils.ts`: the network branch now checks
   `error.cause` too (no message sniffing) and appends the cause message to
   undici's generic "fetch failed". Gemini network failures now map to
   `NETWORK_ERROR`/`connection_error` and are retried like every other
   provider. The old flattening wrapper documented in
   `docs/archive/ISSUE-gemini-timeout-classification.md` (verified against 1.34/1.37)
   no longer exists.

6. ~~**Request-side image cancellation.**~~ **RESOLVED (v0.10.0, 2026-07-03)** —
   `ImageService.generateImage(request, { signal })` added; the genai-electron
   adapter chains the signal through POST/GET, sends a best-effort
   `DELETE /v1/images/generations/:id` on caller abort **and** on client-side
   poll timeout (cancel-on-timeout), classifying by adapter-side state (user
   abort wins). OpenAI Images passes the signal to the SDK and the hosted-URL
   fetch.

7. ~~**Cleanup in `GenaiElectronImageAdapter.handleError`.**~~ **RESOLVED
   (v0.10.0, 2026-07-03)** — dead `(error as any).type` writes replaced with
   real mappings (`SERVER_BUSY` → `RATE_LIMIT_EXCEEDED`/`rate_limit_error`,
   `SERVER_NOT_RUNNING` → `NETWORK_ERROR`/`connection_error`,
   `BACKEND_ERROR`/`IO_ERROR` → `PROVIDER_ERROR`/`server_error`);
   `createHttpError` now attaches the server's JSON `error.code` (without it
   the `SERVER_BUSY` branch was unreachable); both timeout paths are typed
   `REQUEST_TIMEOUT`/`timeout_error`.

8. ~~**404-on-poll (expired generation TTL) remap.**~~ **RESOLVED (v0.11.0,
   2026-07-03)** — `handleError` branches on the attached server code
   `NOT_FOUND` → `PROVIDER_ERROR`/`server_error` with an expired-registry
   message instead of the misleading `MODEL_NOT_FOUND`.

9. ~~**Per-call `timeoutMs` for images**~~ **RESOLVED (v0.11.0, 2026-07-03)** —
   `GenerateImageOptions.timeoutMs` threads through the `generate()` config
   bag. OpenAI Images: SDK per-request timeout + the dall-e hosted-URL fetch
   bounded by the same budget. genai-electron: overrides both the POST timer
   and the poll-loop budget; cancel-on-timeout DELETE and abort-wins
   precedence preserved.

10. ~~**Retry layer for ImageService.**~~ **RESOLVED (v0.11.0, 2026-07-03)** —
    shared `withRetry` around adapter calls, mirroring the LLM options
    (`ImageServiceOptions.retry`, per-call `maxRetries`), gated on a new
    per-provider `retryable` flag in `src/image/config.ts`: `openai-images`
    true, `genai-electron-images` explicitly false (a blind retry of a
    mid-poll failure would start a second GPU generation), unknown/custom
    providers default false. Correction found during design: `retryAfterMs`
    was computed by `getCommonMappedErrorDetails` but dropped by both image
    adapters — it now propagates onto `ImageFailureResponse.error` and the
    retry layer honors it.

11. ~~**Node 18 support drift.**~~ **RESOLVED (v0.11.0, 2026-07-03)** —
    Node 18 dropped: CI matrix now 20.x/22.x/24.x, `engines: node >=20.0.0`
    declared in package.json (matching `@google/genai` ≥ 2.x), bug-report
    template and demo-doc prerequisites updated 18+ → 20+. Note for consumers
    still on Node 18: stay on genai-lite ≤ 0.10.0.

12. **Dual ESM/CJS packaging.** genai-lite ships CJS-only, which now blocks
    the `@mistralai/mistralai` 2.x major (ESM-only; see item 3) and will bite
    again as more SDKs drop CJS. Ship `exports` with both `require` and
    `import` conditions (e.g. tsup/tshy dual build, or ESM-only with an
    engines bump). Revisit the Mistral 2.x upgrade (and the Jest strategy for
    ESM-only deps — likely `moduleNameMapper` stubs or vm-modules) as part of
    this. Filed 2026-07-03.

13. ~~**Anthropic structured-output param drift**~~ **RESOLVED (2026-07-26,
    v0.13.1).** `AnthropicClientAdapter` now sends the generally-available
    `output_config.format` through SDK typing, with no `as any` and no
    `anthropic-beta: structured-outputs-2025-11-13` header, on both
    `sendMessage()` and `streamMessage()`. Anthropic model entries declare
    `structuredOutput` capabilities (Claude 4.5 supported/strict; Claude 4,
    3.7, 3.5 unsupported), so capability preflight rejects pre-4.5 models
    before spending a request. Unit tests assert the outbound request shape and
    fail if it regresses; the E2E test no longer converts an incompatibility
    into a pass. See `docs/archive/ISSUE-anthropic-structured-output-compatibility.md`.
    The schema walker's `$defs`/`anyOf` gap was split out to
    `docs/archive/ISSUE-structured-output-schema-traversal.md`. **Shipped**: merged as
    PR #103 (`438db55`), tagged `v0.13.1`, published to npm on 2026-07-26
    (`npm view genai-lite version` → 0.13.1; the published `dist/` was verified
    to contain `output_config` and zero occurrences of `output_format` /
    `anthropic-beta`). The live-API confirmation is **still open** — see item 16.

14. ~~**Anthropic reasoning-path response parsing**~~ **RESOLVED (2026-07-26).**
    This item was half stale when re-examined: the `content[0].type === 'text'`
    assumption had already been fixed by the streaming work —
    `createSuccessResponse` filters *all* text blocks and joins them, throwing
    only when there are zero, so a thinking-first response was already handled.

    What was still real: `completion.thinking_content` and
    `completion.reasoning_details` were being read, and neither is an Anthropic
    response field. Verified against the SDK — `Message` is exactly
    `id | container | content | model | role | stop_details | stop_reason |
    stop_sequence | type | usage`, and neither string appears anywhere in the
    SDK types. `reasoning_details` is an **OpenRouter** concept that was
    copy-pasted here, where it could never fire. Both dead branches removed;
    reasoning now comes solely from `thinking` content blocks, covered by mock
    tests including one asserting those two bogus fields are ignored.

    Adjacent bug fixed in the same function: `mapAnthropicStopReason` had a
    `content_filter` key that Anthropic never emits (that is OpenAI's
    vocabulary) and was **missing** two real members of Anthropic's
    `StopReason` union, so both silently became `"other"`. Now `refusal` maps to
    `content_filter` (so callers detect a policy-blocked completion with the
    same check they use for OpenAI and Gemini) and `pause_turn` maps to
    `"other"` explicitly rather than by fallthrough. ⚠️ **Review the `refusal`
    mapping** — it changes observable `finish_reason` output for consumers who
    switch on it. The full union is now covered by tests.

    Still outstanding: the paid reasoning e2e run
    (`npm run test:e2e:reasoning`) has not been done; the fix above rests on SDK
    types and mocks.

15. **Dev-only `brace-expansion` advisory, blocked on jest** (2026-07-26,
    v0.13.1). GHSA-mh99-v99m-4gvg (`brace-expansion` OOM DoS) is fixed only in
    `brace-expansion@5.0.8`, which is a **breaking API change** — 5.x replaced
    the callable default export (`module.exports = fn`) with a named
    `exports.expand` and sets `__esModule: true`. `minimatch@3.1.5`
    (`require('brace-expansion')(…)`) and `minimatch@9.0.9`
    (`__importDefault(…).default(…)`) both break under an override, so forcing
    5.0.8 is not viable. Clearing it needs upstream: `@jest/reporters` (latest
    30.4.1) pins `glob: ^10.5.0` → `minimatch ^9` → `brace-expansion 2.x`, and
    `babel-plugin-istanbul` → `test-exclude@6` → `minimatch@3`. `glob@11` /
    `test-exclude@8` use `minimatch ^10.2.x` → `brace-expansion ^5`, so the fix
    arrives when jest moves. **Production deps are clean** (0 vulnerabilities)
    after `gaxios` 7.1.3 → 7.3.0, which dropped `rimraf` and with it the whole
    `glob`/`minimatch`/`brace-expansion` chain. The CI Security Audit job now
    gates on `npm audit --omit=dev --audit-level=high` and runs the full-tree
    audit `continue-on-error`. Re-check when jest ships a glob@11 bump; if the
    full-tree audit goes quiet, consider restoring the single blocking gate.

16. **Confirm Anthropic GA structured output against the live API** (2026-07-26,
    after v0.13.1). The `output_config.format` request shape has **never been
    exercised against the real Anthropic API**. It rests on the live docs
    ("generally available … for Claude 4.5 and later models") and on
    `@anthropic-ai/sdk` 0.110.0's own types (`MessageCreateParams.output_config`,
    `OutputConfig.format`, `JSONOutputFormat { type, schema }`) — strong evidence,
    but not a 200.

    What the 2026-07-26 run did establish, with `E2E_ANTHROPIC_API_KEY` set:

    - ✅ **Capability preflight works live.** `should reject structured output
      for a pre-4.5 model before calling the API` passed in **2 ms** — the
      timing is the proof that no network round trip happened, so it costs
      nothing and needs no credits.
    - ❌ **The GA request itself is unconfirmed.** It failed with
      `400 invalid_request_error: "Your credit balance is too low to access the
      Anthropic API."` The credit check gates *ahead of* request-body
      validation, so the API almost certainly never inspected the body. Do
      **not** read "the error wasn't about `output_config`" as a pass — the run
      is inconclusive, not green.

    To close: add credits to the Anthropic account, then

    ```bash
    npm run test:e2e -- structured-output.e2e.test.ts   # needs E2E_ANTHROPIC_API_KEY
    ```

    One cheap Sonnet call. If it passes, tick the last box in
    `docs/archive/ISSUE-anthropic-structured-output-compatibility.md` and close
    this item. If it fails on the request shape, it is a 0.13.2 — and consumers
    are no worse off than on 0.13.0, whose beta shape is itself deprecated and
    on a transition clock.

17. **E2E suite reports vacuous passes when providers are unavailable**
    (found 2026-07-26 during the item 13 e2e run). In
    `e2e-tests/structured-output.e2e.test.ts`, `runIfAvailable` does
    `if (!available) return;` and `runWithAnyProvider` logs "Skipping test - no
    provider available" and returns — both with **no assertions**, so Jest
    counts the empty function as **passed**. With no llama-server and no keys,
    two llama.cpp tests and two auto-parse tests report `√` while asserting
    nothing; only the key-gated `describe.skip` blocks report as `skipped`.

    This is the same silent-skip anti-pattern that v0.13.1 removed from the
    Anthropic block, and it is what let the `output_format` drift hide. It
    inflates the green count and would mask a real regression.

    **RESOLVED (2026-07-26).** A `beforeAll` gate is not enough — Jest needs the
    availability decision *before* it registers tests. New
    `e2e-tests/globalSetup.js` (wired via `jest.e2e.config.js`) probes
    llama-server once and publishes `E2E_LLAMACPP_AVAILABLE`, so suites gate with
    `(AVAILABLE ? describe : describe.skip)` — the same idiom the key-gated blocks
    already use. `providers.e2e.test.ts` had the identical defect and got the same
    treatment; `reasoning.e2e.test.ts` had a dead unused copy of the probe helper,
    now deleted. The auto-parse block resolves its provider inside the test bodies,
    because `describe.skip` still executes its callback to register test names.

    Verified both directions: with no keys and no server the whole e2e suite now
    reports **19 skipped, 0 passed** (was 4 vacuous passes), and with
    `E2E_LLAMACPP_AVAILABLE=true` forced against no server those same 4 tests
    **fail** instead of passing — proving they actually execute. `globalSetup`
    honors a pre-set value as an override, which is what makes that check
    possible. Probe default also moved `localhost` → `127.0.0.1` to match the
    adapter and avoid the Windows IPv6-fallback stall.

## Pickup point

Open items: 12 (dual packaging — unblocks Mistral 2.x), 15 (dev-only audit
advisory, blocked on jest upstream), 16 (confirm Anthropic GA structured output
against the live API). Items 13, 14, and 17 are resolved.

**Resume here (2026-07-26, post-v0.13.1 cleanup):** everything actionable
without credits is done. The next decision is **item 16** — add credits to the
Anthropic account and run
`npm run test:e2e -- structured-output.e2e.test.ts` to confirm the shipped
`output_config.format` request shape against the real API. Two paid runs are now
pending and can share one top-up: item 16 (structured output) and the item 14
reasoning run (`npm run test:e2e:reasoning`).

Unreleased on main since v0.13.1: the item 14 / 17 fixes plus the shared schema
walker (`src/shared/adapters/schemaUtils.ts`). Two of these change observable
behavior and want a version bump when next released — the `refusal` →
`content_filter` finish-reason mapping, and `$defs`/`anyOf` branches now
receiving `additionalProperties: false` on **both** the Anthropic and OpenAI
paths.

Dependabot: 6 open PRs (#93, #95, #98, #100, #101, #102). **#101**
(`@anthropic-ai/sdk` 0.110.0 → 0.115.0) was **verified safe on 2026-07-26** —
`JSONOutputFormat` and `OutputConfig` are byte-identical to 0.110.0,
`output_config` is still on `MessageCreateParams`, the error classes
`errorUtils` matches by constructor name all survive, and the full suite passes
against it; it is 2 commits behind main so it needs a rebase before merge.
**#95** is the Mistral 2.x ESM-only bump that item 12 blocks. **#100** is a
TypeScript 5.9 → 7.0 major and deserves its own verification pass. The stale
`dependabot/.../google/genai-2.11.0` branch is superseded — v0.13.1 already took
`@google/genai` to 2.13.0.

**v0.11.0 release state**: items 2, 3 (as deferred+fixes), 4, 5, 8, 9, 10, 11
shipped via PR #92, merged to main (`800a9c8`), CI green, tagged `v0.11.0`,
**published to npm on 2026-07-03** (`npm view genai-lite version` → 0.11.0).
Adapter transport behavior (network / timeout / abort classification) was
live-verified without API keys against real SDK wire behavior for Gemini,
Mistral, and Anthropic (refused port, hanging server, mid-flight abort).
**Paid e2e wire smoke still pending** — owner will run a full
`npm run test:e2e` (all providers) post-release; items 14 and 16 depend on that
run too. (Partially attempted 2026-07-26 with an Anthropic key only; blocked by
a zero credit balance — see item 16 for exactly what it did and did not
establish.)

Sister-repo follow-up: DONE (2026-07-03, genai-electron commit `36952da`) —
pairing notes updated for 0.11 (per-request image timeouts; genai-electron is
never auto-retried, apps own retry-on-`SERVER_BUSY`), and the control-panel
example pin bumped `^0.9.0` → `^0.11.0` (typechecks clean against 0.11.0).

Packaging nit for item 12: the `exports` map doesn't expose
`./package.json`, so `require('genai-lite/package.json')` throws
`ERR_PACKAGE_PATH_NOT_EXPORTED` — add `"./package.json": "./package.json"`
when reworking packaging.

Sister-repo follow-up: DONE (2026-07-03, genai-electron commit `064a3d2`) —
genai-electron's docs (`image-generation.md`, `index.md`,
`typescript-reference.md`, 0.5→0.6 migration note) now state that the polling
caveat applies only to genai-lite ≤ 0.9.0, and that ≥ 0.10.0 sends the DELETE
itself.
