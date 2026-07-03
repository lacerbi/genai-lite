# ISSUE: Post-v0.9.2 TODO — deferred follow-ups

Created: 2026-07-03
Updated: 2026-07-03 (v0.10.0 work: items 1, 6, 7 resolved; items 8–10 added)
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

2. **`@google/genai` 2.x major upgrade** (floor `^1.0.1`, lockfile 1.52.0;
   latest 2.10.0 as of 2026-07-03). Breaking. Review `GeminiClientAdapter`
   against the 2.x API and re-verify the v0.9.2 adapter-owned timeout/abort
   classification against 2.x internals. The adapter leans on exactly two SDK
   surfaces that must still exist/behave the same in 2.x: `config.abortSignal`
   on `models.generateContent`, and `httpOptions.timeout` (sent padded +1s as a
   server-side hint; the adapter's own timer fires first). Note: 1.52 already
   changed the SDK's fetch-rejection wrapper (typed `AbortError` in some paths
   vs the old plain `Error`) — the state-based classification is unaffected,
   but re-check item 5 assumptions while here.

3. **`@mistralai/mistralai` 2.x major upgrade** (floor `^1.11.0`, lockfile
   1.15.1; latest 2.4.0). Breaking; Speakeasy-generated SDK — check error
   shapes and the `rawResponse` Retry-After extraction in
   `src/shared/adapters/errorUtils.ts` still match.

4. **`@anthropic-ai/sdk` catch-up** (0.72.1 vs 0.110.0 latest). 0.x caret pins
   the minor, so every step needs a manual floor bump; Dependabot proposes one
   minor at a time. Consider a deliberate jump with adapter review instead of
   38 incremental PRs.

5. **Gemini network-error flattening** (documented in
   `docs/ISSUE-gemini-timeout-classification.md` Resolution notes).
   `@google/genai` wraps network-level fetch failures (DNS, connection refused)
   in plain Errors (`exception TypeError: fetch failed sending request`), so
   they surface as `UNKNOWN_ERROR`/`client_error` and are never retried —
   unlike every other provider. Fix requires best-effort message sniffing in
   the Gemini adapter or an upstream SDK change; re-check under 2.x (item 2)
   before building anything — 2.x may preserve `error.cause`, enabling
   cause-code classification instead of message sniffing.

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

8. **404-on-poll (expired generation TTL) remap.** A genai-electron generation
   that expires from the registry (default TTL 300s) returns 404 `NOT_FOUND`
   on the poll GET, which the common mapping turns into
   `MODEL_NOT_FOUND`/`invalid_request_error` — misleading ("model not found"
   for an expired generation). Low priority: the adapter polls every 500ms, so
   expiry mid-poll requires an extreme TTL/timeout mismatch. Fix: branch on
   the attached server code `NOT_FOUND` in `handleError` with a clearer
   message/mapping (the code now reaches the error object since v0.10.0).

9. **Per-call `timeoutMs` for images** (LLM parity). `GenerateImageOptions`
   currently carries only `signal`; the adapters' timeouts are fixed at
   construction (60s OpenAI, 120s genai-electron). Deferred from v0.10.0 to
   keep the bundle focused.

10. **Retry layer for ImageService.** `withRetry` is LLM-only; OpenAI Images
    calls get no 429/5xx retries (local diffusion doesn't need them). Since
    v0.10.0 the envelopes carry retryable-vs-not classification, so a shared
    retry layer would slot in cleanly if wanted.

## Pickup point

Item 2 (`@google/genai` 2.x) is next, the largest chunk; item 5 folds into it. For items 2–4: branch per upgrade, bump floor + lockfile,
`npm run build` (tsc catches type breaks), full unit suite (adapters are
mocked, so unit tests alone don't prove wire behavior), then a targeted e2e
smoke (`npm run test:e2e` — real API calls, costs money, use sparingly per
CLAUDE.md).

Sister-repo follow-up: DONE (2026-07-03, genai-electron commit `064a3d2`) —
genai-electron's docs (`image-generation.md`, `index.md`,
`typescript-reference.md`, 0.5→0.6 migration note) now state that the polling
caveat applies only to genai-lite ≤ 0.9.0, and that ≥ 0.10.0 sends the DELETE
itself.
