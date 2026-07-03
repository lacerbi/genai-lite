# ISSUE: Post-v0.9.2 TODO — deferred follow-ups

Created: 2026-07-03
Updated: 2026-07-03 (v0.11.0 work: items 2, 5 resolved)
Status: OPEN
Package: genai-lite

Session context: on 2026-07-03, v0.9.1 (Gemma 4 catalog corrections: 12B added,
nonexistent `gemma-4-4b-it` removed, context windows fixed) and v0.9.2 (Gemini
timeout/abort classification; genai-electron `'cancelled'` terminal status) were
released, published to npm, and tagged. The five stale Dependabot PRs (#82–#85,
#87) were consolidated in #91 and merged. Resolved issue files are archived
under `docs/` (`ISSUE-gemini-timeout-classification.md`,
`ISSUE-cancelled-generation-status.md`); this file tracks what was deliberately
deferred.

Later on 2026-07-03, **v0.10.0** shipped items 6 and 7 below (plus: ImageService
failure envelopes now propagate adapter `code`/`type`/`status` instead of always
`PROVIDER_ERROR`/`server_error`, guarded so non-adapter errors — e.g. a failing
`ApiKeyProvider` with `.code = 'ENOENT'` — keep the generic fallback; the
genai-electron default base URL changed `localhost` → `127.0.0.1`; new
`src/image/ImageService.test.ts`). See `docs/PLAN-image-cancellation-error-fixes.md`
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
   `docs/ISSUE-gemini-timeout-classification.md` (verified against 1.34/1.37)
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

13. **Anthropic structured-output param drift** (pre-existing, found in the
    item 4 review). `AnthropicClientAdapter` sends `output_format` via
    `(messageParams as any)`, but the SDK/API renamed the param to
    `output_config` at SDK v0.72.0. Because it bypasses SDK typing, nothing
    fails loudly — verify against the live API (does `output_format` still
    work? does structured output work at all?) and migrate. Needs a paid e2e
    check (`npm run test:e2e` structured-output suite).

14. **Anthropic reasoning-path response parsing** (pre-existing, found in the
    item 4 review). `createSuccessResponse` reads `completion.thinking_content`
    / `completion.reasoning_details`, which are not Anthropic response fields —
    thinking arrives as `content` blocks of `type: "thinking"` — and it assumes
    `content[0].type === 'text'` (throws "Invalid completion structure"
    otherwise). With `reasoning.enabled` the first block is a thinking block,
    so the extended-thinking path likely misbehaves. Verify with a paid e2e
    reasoning run (`npm run test:e2e:reasoning`) and fix the parsing to walk
    content blocks.

## Pickup point

Open items: 12 (dual packaging — unblocks Mistral 2.x), 13–14 (Anthropic
pre-existing issues; both need paid e2e verification before/with the fix).

**v0.11.0 release state**: items 2, 3 (as deferred+fixes), 4, 5, 8, 9, 10, 11
all shipped on branch `upgrade/google-genai-2x` / PR #92 (2026-07-03); unit
suite green (837 tests), audit clean. Adapter transport behavior (network /
timeout / abort classification) live-verified without API keys against real
SDK wire behavior for Gemini, Mistral, and Anthropic (refused port, hanging
server, mid-flight abort). **Paid e2e wire smoke not run** — no `E2E_*_API_KEY`
in the dev environment; given the three SDK bumps, a full `npm run test:e2e`
(all providers) is warranted before tagging/publishing this release. Not yet
merged/tagged/published.

Sister-repo follow-up: DONE (2026-07-03, genai-electron commit `064a3d2`) —
genai-electron's docs (`image-generation.md`, `index.md`,
`typescript-reference.md`, 0.5→0.6 migration note) now state that the polling
caveat applies only to genai-lite ≤ 0.9.0, and that ≥ 0.10.0 sends the DELETE
itself.
