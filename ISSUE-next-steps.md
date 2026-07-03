# ISSUE: Post-v0.9.2 TODO — deferred follow-ups

Created: 2026-07-03
Status: OPEN
Package: genai-lite

Session context: on 2026-07-03, v0.9.1 (Gemma 4 catalog corrections: 12B added,
nonexistent `gemma-4-4b-it` removed, context windows fixed) and v0.9.2 (Gemini
timeout/abort classification; genai-electron `'cancelled'` terminal status) were
released, published to npm, and tagged. The five stale Dependabot PRs (#82–#85,
#87) were consolidated in #91 and merged (unreleased — see item 1). Resolved
issue files are archived under `docs/` (`ISSUE-gemini-timeout-classification.md`,
`ISSUE-cancelled-generation-status.md`); this file tracks what was deliberately
deferred.

## TODO (rough priority order)

1. **Release the pending main delta (v0.9.3 or fold into the next fix).**
   Main carries the unpublished `@anthropic-ai/sdk` floor bump `^0.71.2` →
   `^0.72.1` from #91. Caret on 0.x pins the minor, so until published,
   consumers dedupe only against anthropic 0.71.x. Decision on 2026-07-03 was
   to skip a deps-only release and let it ride with the next real change.

2. **`@google/genai` 2.x major upgrade** (floor `^1.0.1`, lockfile 1.52.0;
   latest 2.10.0 as of 2026-07-03). Breaking. Review `GeminiClientAdapter`
   against the 2.x API and re-verify the v0.9.2 adapter-owned timeout/abort
   classification against 2.x internals. Note: 1.52 already changed the SDK's
   fetch-rejection wrapper (typed `AbortError` in some paths vs the old plain
   `Error`) — the state-based classification is unaffected, but re-check item 5
   assumptions while here.

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
   before building anything.

6. **Request-side image cancellation** (item 3 of
   `docs/ISSUE-cancelled-generation-status.md`). Add `AbortSignal` support to
   the ImageService API and have `GenaiElectronImageAdapter` send genai-electron's
   `DELETE /v1/images/generations/:id` (available since genai-electron 0.6.0).

7. **Minor cleanup in `GenaiElectronImageAdapter.handleError`**: the
   `SERVER_BUSY` / `SERVER_NOT_RUNNING` / `BACKEND_ERROR` / `IO_ERROR` branches
   set `(error as any).type` *after* `getCommonMappedErrorDetails` has already
   run — dead assignments; the enhanced error's type comes from the mapping.
   Make those branches set the local `errorType` (as the `GENERATION_CANCELLED`
   branch added in v0.9.2 does) or drop the dead writes. Behavior change is
   user-visible (`type` on failures), so add/adjust tests.

## Pickup point

Start with item 1 if a release is wanted; otherwise item 2 (`@google/genai` 2.x)
is the largest chunk. For items 2–4: branch per upgrade, bump floor + lockfile,
`npm run build` (tsc catches type breaks), full unit suite (adapters are mocked,
so unit tests alone don't prove wire behavior), then a targeted e2e smoke
(`npm run test:e2e` — real API calls, costs money, use sparingly per CLAUDE.md).
