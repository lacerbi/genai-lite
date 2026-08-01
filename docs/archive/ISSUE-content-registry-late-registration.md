# Content-token registry: no registration path after the first read

Created: 2026-07-31
Status: RESOLVED — 2026-08-01 (v0.17.1)
Package: genai-lite (v0.17.0)
Filed by: Palimpsest Engine

## Observation

`ContentTokenProfileRegistry` freezes on the first `resolve()` and rejects every later
`register()` ("registration is closed after the first content-profile read"). The freeze is
reached from inside `LLMService` itself — `getModelCapabilities` → `buildModelCapabilities` →
`resolveContentTokenProfile`, and again in `postProcessResponse` on every cloud response — so
any application that touches a cloud model before its local one has permanently lost the
ability to register a local content tokenizer for the process. In Palimpsest's GUI the cloud
Scribe is the default configuration, so the out-of-the-box order is exactly the losing one:
play a cloud game, switch to local Gemma, and the shipped Gemma recipe can no longer be
registered until the app restarts. Downstream can narrow the window (register eagerly at
startup when a local model is installed) but cannot close it: a model downloaded mid-session
after any cloud activity is unregistrable.

## Request

One of, in preference order:

1. Allow registration while the registered/aliased namespace is untouched by prior reads: a
   read that resolved `(llamacpp, X)` to *unavailable* has observed nothing a later
   registration of `(llamacpp, X)` contradicts, so rejecting it protects no invariant.
2. An explicit two-phase API: reads before `finalizeContentTokenProfiles()` (or similar) see
   builtins only and do not freeze; the application chooses the freeze point.
3. At minimum, a documented supported pattern for hosts whose provider mix is not known at
   startup.

## Non-request

The freeze-for-determinism goal is understood (a resolved profile must never change meaning
mid-process). Option 1 preserves it: only never-successfully-resolved keys become registrable.

## Acceptance Criteria

- [x] Any content-profile read may be followed by a nonconflicting backend or
  exact-alias registration; registration is no longer globally closed by
  `resolve`, lookup-by-ID, count, mapping-revision, capability, preparation, or
  response-processing activity.
- [x] A previously unavailable exact `(providerId, modelId)` key may become
  available after an append-only registration, including the cloud-first then
  local-model lifecycle reported here.
- [x] Successfully resolved profile identity and counting semantics remain
  immutable: existing backend IDs, registered aliases, and built-in aliases
  cannot be replaced or removed.
- [x] Registration remains synchronous and transactional, including under a
  tokenizer validation callback that attempts nested registration.
- [x] Mapping revisions identify point-in-time complete registry snapshots:
  successful additions change the revision, failed batches do not, and the same
  final state remains order-independent.
- [x] Previously obtained profiles remain countable after unrelated additions;
  capability/resolution snapshots may be re-queried to observe newly available
  profiles.
- [x] Complete and streaming terminal response processing may use a profile
  registered after preparation while preserving the immutable provider request
  and any provider-output accounting.
- [x] Public signatures, exact alias matching, model-only registered-profile
  quality, and the certified token-profile boundary remain unchanged.
- [x] README, user/developer references, source comments, and orientation
  summaries describe the append-only lifecycle and mapping-revision snapshot
  semantics consistently.

## Resolution

Resolved on 2026-08-01 for v0.17.1. The content-token
registry is now transactional and append-only after any number of reads:
nonconflicting backend IDs and exact aliases may be added at runtime, while all
successful mappings remain immutable. Mapping revisions identify complete
point-in-time registry snapshots and change only after a committed addition.

Registration now rejects reentrant calls from tokenizer validation callbacks,
preventing nested state swaps while preserving transactional failure behavior.
Capability queries re-resolve the live registry, and complete or streaming
terminal response processing can use a profile registered after preparation
without changing the prepared provider request or provider-output evidence.

Verification passed 47 Jest suites (1,110 tests), the TypeScript build,
compiled public-export and late-registration smoke tests, package dry-run, and
the production high-severity audit. The full-tree audit retains only the known
dev-only `brace-expansion` advisory. Package versioning, commit/push, tagging,
release creation, and npm publication remain separate release operations.
