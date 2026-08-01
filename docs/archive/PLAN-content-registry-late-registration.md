# Plan: Content Registry Late Registration

Created: 2026-08-01
Status: COMPLETE — 2026-08-01 (v0.17.1)
Target release: v0.17.1
Issue: [`ISSUE-content-registry-late-registration.md`](ISSUE-content-registry-late-registration.md)

## Implementation Tracking

- [x] Phase 1: Lock the append-only lifecycle contract and regression matrix
- [x] Phase 2: Permit transactional late registration without replacement
- [x] Phase 3: Verify service timing and update public documentation
- [x] Phase 4: Run release gates and archive the completed records

## Summary

Replace the process-global registry's freeze-on-first-read lifecycle with
transactional, append-only registration. New backend IDs and previously
unclaimed exact aliases may be added after any content-profile read, while
existing backend identities, aliases, and built-in mappings remain impossible
to replace or remove. This directly supports applications that install a local
model/tokenizer after cloud activity without introducing a finalize API or
changing public type signatures.

This plan supersedes only the startup-only/freeze decision recorded for v0.17.0
in the archived answer-accounting plan. The archived record remains unchanged
as the historical contract for that release.

## Scope

- **In scope**:
  - Remove read-triggered closure from the production content-profile registry.
  - Preserve synchronous validation, exact case-sensitive aliases,
    transactional batches, stable semantic profile identity, and the
    certificate boundary.
  - Keep all registration append-only: duplicate backend IDs, duplicate exact
    aliases, and aliases that shadow built-in mappings remain errors.
  - Define mapping revisions as deterministic identifiers of the current
    complete registry snapshot; successful additions change the revision.
  - Cover cloud-first and unavailable-before-registration application flows.
  - Document runtime model-install registration and point-in-time capability
    results.
  - Resolve and archive the issue and plan for the planned v0.17.1 release.
- **Out of scope**:
  - Rebinding, replacing, or unregistering profiles or aliases.
  - An explicit `finalizeContentTokenProfiles()` API or per-key read locks.
  - Asynchronous registration, automatic recipe loading, family inference, or
    mutable/generic GGUF alias normalization.
  - Changes to certified `TokenProfile` or structural-bound APIs.
  - Changes to provider adapters, preparation-state cache keys, or transport.
  - Fixing unrelated pre-existing built-in-ID behavior when bundled rank data
    fails verification.
  - npm publishing, tagging, pushing, or other v0.17.1 release operations.

## Compatibility Contract

1. Registration remains process-global, synchronous, transactional, and exact.
2. A new backend ID or unclaimed exact `(providerId, modelId)` alias may be
   registered after `resolve`, lookup-by-ID, count, mapping-revision,
   capability, preparation, or send operations.
3. An unavailable resolution may become available after a successful append.
   Callers that cache unavailable resolutions or capability results must query
   again after registration.
4. Once a key resolves successfully, its profile identity and counting
   semantics cannot change. Existing collision checks continue to reject every
   replacement attempt, whether or not the key has been read.
5. Previously returned resolution and capability objects remain point-in-time
   values. A later resolution of an unchanged profile may carry a different
   global `mappingRevision` after unrelated additions.
6. `mappingRevision` remains the canonical SHA-256 digest of one complete
   registry state. The same final state has the same digest regardless of
   registration order; a failed registration changes neither state nor digest.
7. A profile obtained before unrelated additions remains valid for counting.
8. Response post-processing continues to resolve profiles live. Registration
   completed before terminal post-processing may therefore add missing
   model-quality raw-content evidence, but it never overwrites provider evidence
   or changes the immutable prepared provider request.
9. Hosts adding another model alias for an already registered tokenizer use an
   alias-only batch (`backends: []`) rather than re-registering the backend ID.
10. A nested registration attempt is rejected for the full duration of an outer
    registration transaction. If that error escapes the tokenizer probe, the
    outer batch also fails without mutation; if host code catches it and still
    returns a valid probe count, the mutation-free outer batch may commit.

## Phases

### Phase 1: Lock the Contract and Regression Matrix

**Goal**: Convert the issue's preferred option into explicit, testable
invariants before changing the registry.

**Work**:

- [x] Add acceptance criteria to
  `ISSUE-content-registry-late-registration.md` covering late reads,
  unavailable-to-available transitions, immutable successful mappings,
  revision snapshots, service behavior, and documentation. The criteria must
  explicitly approve the general append-only contract (not only the reported
  local key), because it safely permits every nonconflicting addition after
  reads.
- [x] Update `src/llm/tokenization/contentProfiles.test.ts` so the old freeze test
  becomes the primary additive-registration regression.
- [x] Specify that append-only collision rules make successful-read tracking
  unnecessary: registration cannot replace a successful mapping even before it
  has been read.

**Steps**:

1. In a fresh isolated registry scenario for each public read kind (`resolve`,
   `getById`, `count`, and `getMappingRevision`), perform that read before a
   nonconflicting registration and prove none closes registration. Do not run
   all four reads sequentially on one instance, which would only prove the first
   read is harmless.
2. Resolve an exact local key as unavailable, append its backend and alias, and
   prove a later resolution is available.
3. Resolve a built-in cloud key, append an unrelated local mapping, and prove
   the cloud profile identity stays unchanged.
4. Add an alias-only late registration targeting an existing backend to cover
   multiple downloaded models sharing one tokenizer recipe.
5. Assert that backend/alias replacement attempts still fail and that failed
   batches leave state and mapping revision unchanged.
6. Assert that successful additions change the global mapping revision and that
   an old registered profile remains countable afterward.

**Verification**:

- [x] The new tests fail under the v0.17.0 freeze behavior for the intended
      reason.
- [x] The matrix covers all four registry read entry points and both built-in
      and registered profiles using isolated pre-read scenarios.
- [x] Collision and transaction tests prove stable successful mappings rather
      than relying only on documentation.

### Phase 2: Permit Safe Append-Only Late Registration

**Goal**: Remove the global lifecycle blocker while retaining all determinism
that protects successful resolutions.

**Work**:

- [x] Modify `src/llm/tokenization/contentProfiles.ts` to remove `_frozen`,
  read-triggered `freeze()` calls, and the late-registration rejection.
- [x] Retain copied-map validation and the single state swap so batches remain
  atomic.
- [x] Retain duplicate backend, registered-alias, and built-in-alias rejection;
  do not add replacement or idempotent overwrite semantics.
- [x] Continue invalidating the cached mapping digest only after a successful
  commit so every read observes a coherent registry snapshot.
- [x] Add a private registration-in-progress guard covering the entire validation
  and commit transaction. The validation probe executes a host callback;
  rejecting nested registration prevents a reentrant callback from committing
  against stale copied maps and losing an otherwise successful append.
- [x] Update source JSDoc and public type comments to describe append-only runtime
  registration and current-state revision snapshots.

**Steps**:

1. Remove freeze state and all read-side mutations.
2. Wrap registration validation/commit in a reentrancy guard with `finally`
   cleanup so failures do not poison later valid registrations.
3. Keep revision computation and semantic provenance unchanged; the existing
   mapping digest domain continues to identify the same registry-state schema.
4. Add regressions in which a backend's empty-string validation callback
   attempts nested registration. Prove an uncaught nested rejection aborts the
   outer batch without changing state/revision and that a later ordinary
   registration succeeds; also prove a callback may catch the rejected nested
   attempt and allow its otherwise valid outer batch to commit.

**Verification**:

- [x] All Phase 1 registry tests pass.
- [x] Registration remains synchronous and batch-transactional.
- [x] Existing profile objects still count successfully after unrelated
      additions.
- [x] No public function signature, export, or trust classification changes.

### Phase 3: Verify Service Timing and Update Public Documentation

**Goal**: Prove the reported application lifecycle through `LLMService` and
make the temporal behavior clear to consumers.

**Work**:

- [x] Extend `src/llm/LLMService.contentProfiles.test.ts` (or add a dedicated
  isolated service test file) with the cloud-first reproduction for complete
  and streaming terminal responses.
- [x] Keep `LLMService.ts` unchanged unless the regression reveals an unexpected
  cache; current capability and terminal-response paths resolve the registry
  live.
- [x] Update the authoritative lifecycle documentation and examples:
  - `README.md`
  - `genai-lite-docs/prepared-calls-and-accounting.md`
  - `genai-lite-docs/llm-service.md`
  - `genai-lite-docs/prompting-utilities.md`
  - `genai-lite-docs/typescript-reference.md`
  - `docs/dev/adding-models-and-providers.md`
- [x] Refresh the known stale orientation files so they no longer teach the
  superseded startup/freeze contract:
  - `src/.summary_long.md`
  - `src/llm/.summary_long.md`
  - `src/llm/tokenization/.summary_short.md`
  - `src/llm/tokenization/.summary_long.md`
  Update other root summaries only if issue/plan archival makes their inventory
  inaccurate. Do not rewrite the archived v0.17.0 issue or plan.

**Steps**:

1. On one `LLMService` instance, resolve a built-in cloud capability and finish
   a mocked pre-registration response first, then prepare unique complete- and
   stream-mode calls for a mock/local-style model while its content profile is
   unavailable.
2. Register that model's backend and exact alias, then re-query capabilities and
   assert `contentTokenCounting: "model"`, the expected profile ID, and the new
   current-state mapping revision.
3. Inspect each prepared handle before registration and again afterward; assert
   deep equality of `request`, `promptAccounting`, `outputTokenLimit` when
   present, and `bindings`.
4. Dispatch the pre-registration complete handle with a mocked adapter response
   and prove live terminal processing fills only missing raw-content accounting
   with the registered tokenizer revision while preserving provider-output
   evidence.
5. Dispatch the pre-registration stream handle through a mocked terminal
   `complete` event and prove the same accounting behavior. This protects the
   shared `postProcessResponse()` path used by complete and streaming terminal
   handling without adding provider E2E coverage.
6. Document startup registration as an optimization, not a requirement; add a
   supported mid-session model-install pattern and an alias-only extension
   pattern for already registered backends.
7. Document that unavailable resolutions/capability results are snapshots that
   may become available, while successful profile identity is immutable.
8. Document that mapping revisions change after successful additions and should
   be used as registry-state snapshot identifiers, not process constants.

**Verification**:

- [x] The service regression reproduces the issue's cloud-first order without
      network access or a real tokenizer artifact.
- [x] Prepared provider request/accounting inspection remains unchanged across
      registration, while terminal raw-content evidence may be enriched.
- [x] Complete and stream terminal paths both use the newly registered profile
      without overwriting provider-output evidence.
- [x] Documentation consistently describes append-only registration, exact
      aliases, revision snapshots, duplicate rejection, and certificate
      separation.
- [x] Historical archived records remain unchanged.

### Phase 4: Full Verification and Issue Closure

**Goal**: Verify package integrity and leave durable issue/plan records for the
planned v0.17.1 release.

**Work**:

- [x] Run focused registry and service tests before the complete suite.
- [x] Run the standard build, package, and production-audit gates.
- [x] Run the mandatory final doublecheck and address all findings.
- [x] Complete issue and plan bookkeeping under the repository convention.

**Steps**:

1. Run focused Jest tests for content-profile registry and `LLMService`
   integration.
2. Run `npm test` and `npm run build`.
3. Verify compiled root exports with the documented `node -e` smoke command and
   run `npm pack --dry-run`.
4. Run the blocking `npm audit --omit=dev --audit-level=high`, then run the
   full-tree `npm audit --audit-level=high` for information and record known
   dev-only advisories as nonblocking.
5. Confirm no provider-adapter or paid E2E run is needed; this change is local
   registry/service orchestration with mocked transport.
6. Check every issue acceptance criterion, add a `## Resolution` section, and
   mark the issue `RESOLVED` for planned v0.17.1.
7. Mark this plan `COMPLETE`, move both files to `docs/archive/`, and update any
   live references to their archived paths.

**Verification**:

- [x] Focused and full unit tests pass (47 suites, 1,110 tests).
- [x] TypeScript build and compiled-export smoke test pass.
- [x] Package dry-run contains the expected exports and no unintended files.
- [x] Production dependency audit passes at high severity (0 vulnerabilities;
      full-tree audit retains the known dev-only `brace-expansion` advisory).
- [x] Issue and plan records satisfy status, date, release, checked-criteria,
      archive, and reference-update conventions.

## Documentation Ownership

- `genai-lite-docs/prepared-calls-and-accounting.md` remains the authoritative
  consumer contract for registry lifecycle, alias identity, trust levels, and
  mapping-revision semantics.
- `README.md` keeps only the short setup/runtime example and links to that
  authoritative contract.
- `genai-lite-docs/llm-service.md` owns capability-query snapshot behavior;
  `genai-lite-docs/prompting-utilities.md` owns task-oriented counting guidance;
  `genai-lite-docs/typescript-reference.md` mirrors the unchanged public shapes
  and their temporal semantics.
- `docs/dev/adding-models-and-providers.md` owns contributor guidance for recipe
  and alias lifecycle. No new standalone user document is needed.
- This plan is the durable design record that supersedes the v0.17.0
  freeze/startup-only decision. Archived v0.17.0 records remain historical.

## Risks and Mitigations

- **Consumers cache `unavailable` forever**: explicitly document capability and
  resolution results as snapshots and require a re-query after registration.
- **Consumers assume mapping revision is process-constant**: document it as a
  state digest and test revision changes after successful appends.
- **Late registration accidentally changes a successful mapping**: retain and
  test strict collision rejection; add no update/removal API.
- **Nested registration loses an append**: reject reentrant registration during
  backend validation and prove cleanup after failure.
- **Global singleton leaks between tests**: use unique identifiers and, where
  necessary, a dedicated Jest module/test file; do not add a production reset
  API.
- **Scope expands into prepared-call or cache redesign**: preserve live terminal
  content resolution and leave endpoint preparation caching untouched.

## Rollback

The implementation is localized to the registry lifecycle and documentation.
If verification finds an unresolvable compatibility problem, restore the
read-triggered freeze and its documented startup requirement; no stored data,
wire protocol, or provider request format requires migration.

## Open Questions

- None blocking. The work joins the already planned v0.17.1 fixes; package
  version bump, commit/push, tag, GitHub release, and npm publication remain
  separate release operations unless explicitly requested.

## Resolution

Completed on 2026-08-01 for v0.17.1. The implementation
replaced read-triggered global closure with a transactional append-only
registry, retained immutable successful mappings, added reentrancy protection,
and documented point-in-time capability and mapping-revision semantics.

All planned registry and service regressions pass, including cloud-first late
registration and post-preparation complete/stream accounting. Final
doublecheck found no implementation defects; its documentation findings were
resolved before archival. Verification passed 47 Jest suites (1,110 tests),
the TypeScript build, compiled public API smoke tests, package dry-run, and the
production high-severity audit. Release operations remain out of scope.
