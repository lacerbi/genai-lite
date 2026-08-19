# Plan: Approximate Suffix Walk

Created: 2026-08-19
Status: COMPLETE
Target release: v0.19.0 (approved 2026-08-19)

## Live Task Checklist

- [x] Phase 1: Preserve and refactor the single-position core.
- [x] Phase 2: Add suffix grammar and frontier state.
- [x] Phase 3: Implement sync and async resolvers.
- [x] Phase 4: Lock traversal and accounting regressions.
- [x] Phase 5: Publish and pack the public API.
- [x] Phase 6: Document approximation and caller orchestration.
- [x] Phase 7: Validate, version, and archive records.

## Summary

Extend the v0.18.0 constrained-label utility with a bounded suffix-walk resolver for significant
shared-prefix mass. The library will continue to avoid dispatch: callers provide synchronous or
asynchronous fetchers, while genai-lite owns trie traversal, suffix grammar generation, evidence
normalization, fetch ordering, and mass accounting.

The result will state separately whether its probability evidence is usable (`status`), whether a
suffix fetch occurred (`resolution`), whether the walk completed (`termination`), and how many
follow-up callbacks completed (`fetchCount`). The public documentation will describe the result as
an approximation because a decoded assistant prefix may retokenize when the caller reissues it.

The authoritative requirements are in `ISSUE-suffix-walk-approximation.md`.

## Scope

- **In scope**:
  - Synchronous and asynchronous injected-fetcher suffix resolvers.
  - Normalized `TokenLogprob` evidence at every suffix position.
  - Exact decoded-prefix preservation, bounded highest-mass-first traversal, and mass conservation.
  - Suffix-fragment grammar generation, including required leading spaces inside fragments.
  - Raw-evidence recomputation for an `ambiguous_prefix` position-0 extraction.
  - Root exports, packed consumer verification, user documentation, and focused regression tests.
- **Out of scope**:
  - Dispatch, retries, provider selection, credentials, or provider/LLM transport-request
    construction inside the library.
  - Exact continuation claims, token IDs, provider continuation handles, or tokenizer-state APIs.
  - Reading logprobs from every position of one generated sequence.
  - Changes to `LLMService`, provider adapters, logprob transport, or the existing single-position
    public result.
  - New live or paid-provider E2E tests.
  - Provider-specific `topLogprobs` maxima.

## Prerequisites

- Use the approved minor target `v0.19.0` for version metadata and archival records.
- Preserve `v0.18.0` behavior and public names for `generateAnswerTokenGrammar` and
  `extractSingleTokenLabelProbs`.
- Keep the work on a feature/release branch rather than committing a version bump directly to
  `main`, following the repository release workflow.

## Phases

### Phase 1: Preserve and Refactor the Single-Position Core

**Goal**: Create reusable internal interpretation seams without changing any shipped
single-position behavior.

**Work**:
- Keep `src/llm/constrainedLabels.ts` as the single constrained-label implementation owner.
- Split complete-label validation from shared fragment safety checks.
- Refactor evidence preparation, trie interpretation, result materialization, and status selection
  into private pure helpers usable by both position 0 and suffix states.

**Steps**:
1. [x] Add or retain baseline tests for every current grammar, validation, evidence-normalization,
   status, mass-space, prototype-safe-key, and defensive-snapshot behavior before changing helper
   boundaries.
2. [x] Refactor validation into:
   - shared nonempty-string, Unicode/control-character, duplicate, and strict-prefix checks;
   - complete-label edge-whitespace rejection;
   - suffix-fragment validation that permits required leading whitespace while rejecting trailing
     and whitespace-only fragments.
3. [x] Refactor grammar alternative escaping into one private ordered-alternatives builder while keeping
   the exact existing answer grammar output unchanged.
4. [x] Refactor `prepareEvidence` so position-0 and suffix interpretation share duplicate-string
   log-sum-exp, sampled-token restoration, positive-drift handling, invalid-entry filtering,
   overfull-mass checks, and snapshots.
5. [x] Introduce a private exact-node evidence interpreter that can return:
   - per-label full-distribution attributed shares equivalent to local absolute probabilities;
   - residual conditional mass;
   - unresolved frontier states with exact decoded paths;
   - whether at least one positive-mass candidate advanced.
6. [x] Make `extractSingleTokenLabelProbs` call the refactored helpers and prove its public output is
   unchanged for all existing fixtures.

**Verification**:
- [x] Existing `src/llm/constrainedLabels.test.ts` fixtures pass unchanged.
- [x] Answer grammar output remains byte-for-byte identical.
- [x] Bare and optional-space position-0 folding remains unchanged.
- [x] Strict-prefix validation still runs before trie interpretation.
- [x] No new public symbol is introduced during the refactor alone.

### Phase 2: Add Suffix Grammar and Frontier State

**Goal**: Represent exact reissued text paths and generate the grammar/context required for each
caller-owned follow-up.

**Work**:
- Add `generateSuffixGrammar` and the new public suffix-walk types.
- Add a private frontier model that pairs decoded caller text with a trie node whose remaining
  terminal paths define exact suffix forms.
- Define deterministic ordering and safe state merging before any callback loop is added.

**Steps**:
1. [x] Add the public contracts from the issue to `src/llm/constrainedLabels.ts`:
   - `SuffixWalkFetchRequest`;
   - `SuffixTokenLogprobFetcher` and `AsyncSuffixTokenLogprobFetcher`;
   - `SuffixWalkLabelProbOptions`;
   - `LabelProbResolution` and `SuffixWalkTermination`;
   - `SuffixWalkLabelProbExtraction`, including `fetchCount`.
2. [x] Implement `generateSuffixGrammar(suffixes)` with exact output:
   - `root ::= suffix`;
   - an ordered `suffix ::= ...` alternatives rule;
   - no implicit optional space or trailing newline acceptance beyond the grammar's final line break;
   - literal preservation of required leading fragment whitespace;
   - rejection of trailing-whitespace and whitespace-only fragments.
3. [x] Model each private frontier state with at least:
   - the current trie node;
   - the cumulative exact decoded prefix supplied back to the caller;
   - incoming absolute mass;
   - a monotonic discovery sequence for stable equal-mass ordering.
4. [x] Derive exact remaining suffix forms by traversing from the current trie node to its terminals,
   without exposing trie internals. At the root this must include both bare and explicitly
   space-prefixed forms.
5. [x] Build each fetch request from copied `prefix`, `suffixes`, and `grammar` values; document
   `prefix` as cumulative decoded answer text to append as assistant prefill.
6. [x] Preserve bare and space-prefixed states separately because their reissued text differs.
7. [x] Merge frontier states only when both the exact decoded prefix and trie node are identical; sum
   their incoming mass and retain the earliest discovery sequence.
8. [x] Do not retain successful decompositions after processing. Identical states merge while queued,
   but a state discovered only after an identical state was processed may consume another callback.
9. [x] Validate `maxFetches` as a finite positive integer and default it to 8; define the budget as
   callback invocations across the whole resolver call.
10. [x] Add `fetchCount` to the public result contract and define it as completed callback invocations:
    zero on a single-position short circuit, inclusive of a callback whose evidence is rejected, and
    absent only when a thrown/rejected fetcher prevents any result from being returned.
11. [x] Add complete JSDoc for every new public function, callback type, interface, option, request field,
   result field, resolution value, and termination value, including the approximation and evidence
   preconditions where they apply.

**Verification**:
- [x] Suffix grammars escape quotes, backslashes, and Unicode identically to answer grammars.
- [x] Required leading spaces in suffix fragments remain literal rather than optional or rejected.
- [x] Trailing-whitespace, whitespace-only, duplicate, and strict-prefix suffix sets are rejected.
- [x] Fetch request suffixes and grammar correspond exactly to the current trie node.
- [x] An empty position-0 token leaves one root frontier whose request contains both form families.
- [x] Equal-mass ordering and identical-state merging are deterministic.
- [x] The default eight-fetch budget and `fetchCount` semantics are explicit.

### Phase 3: Implement Sync and Async Resolvers

**Goal**: Resolve significant shared-prefix mass through one shared traversal state machine with
thin synchronous and asynchronous callback drivers.

**Work**:
- Reconstruct position-0 frontier state without another provider call.
- Process the highest-mass frontier transactionally within a global fetch budget.
- Finalize all public mass fields and the three independent result axes.

**Steps**:
1. [x] Add a private initialization path that validates labels/options and branches on the supplied
   status. For `ambiguous_prefix`, require `rawTokenLogprob`, recompute the single-position result and
   frontier from that snapshot under the supplied labels/current options, and throw `TypeError` only
   when raw evidence is absent.
2. [x] For every non-`ambiguous_prefix` initial status—including `ok` with tolerated nonzero ambiguous
   mass—trust the typed input and return a defensive copy without requiring raw evidence, with:
   - `resolution: "single_position"`;
   - `termination: "not_started"`;
   - `fetchCount: 0`;
   - zero fetcher calls;
   - cloned probability records and nested raw alternatives.
3. [x] If ambiguous-input recomputation produces any non-`ambiguous_prefix` status under the current
   options, return the recomputed defensive result through the same zero-fetch single-position path.
4. [x] Implement one private mutable or functional walk state with pure transition helpers:
   - select the greatest incoming-mass frontier, breaking ties by discovery sequence;
   - create its defensive fetch request;
   - interpret returned evidence into a temporary local decomposition;
   - commit the decomposition only when the suffix evidence is usable.
5. [x] When suffix evidence is valid:
   - multiply every private full-distribution resolved, child-frontier, and residual share by the
     state's incoming absolute mass;
   - add resolved contributions to the label map;
   - add suffix residual contribution to accumulated residual mass;
   - enqueue or merge further frontier states;
   - dynamically reprioritize before the next fetch.
6. [x] Treat a fetch response as `fetch_rejected` only when shipped preparation rules leave no usable
   evidence, visible mass is materially overfull, or no positive-mass candidate advances the
   current suffix set. Ignore malformed individual entries when valid entries remain, matching
   position-0 behavior.
7. [x] On returned invalid evidence, discard the current fetch's tentative changes, stop the walk, and
   preserve the current plus queued incoming mass as ambiguous.
8. [x] On budget exhaustion, stop before a ninth/default-over-budget callback and preserve every queued
   state's mass as ambiguous.
9. [x] Let synchronous throws and asynchronous rejections escape unchanged; do not convert operational
   failures into extraction results.
10. [x] Finalize one `SuffixWalkLabelProbExtraction` by:
    - retaining recomputed position-0 resolved and residual mass;
    - adding suffix-resolved and suffix-residual contributions;
    - summing queued/frontier mass into final `ambiguousMass`;
    - renormalizing `conditionalLabelProbs` over attributed labels only;
    - reapplying the existing aggregate ambiguity-gap status policy;
    - retaining position-0 `rawTokenLogprob` only;
    - setting `resolution: "suffix_walk"` after the first callback attempt;
    - reporting completed callback invocations in `fetchCount`, including a returned rejected fetch;
    - setting `termination` to `complete`, `budget_exhausted`, or `fetch_rejected`, where complete
      means no visible frontier remains even if truncated mass remains residual.
11. [x] Implement `resolveLabelProbsWithSuffixWalk` and
    `resolveLabelProbsWithSuffixWalkAsync` as thin drivers over the same initialization,
    transition, and finalization helpers so their behavior cannot drift.

**Verification**:
- [x] Every processed frontier conserves its incoming mass transactionally.
- [x] Transition multiplication uses private full-space shares, never final conditional label
  probabilities.
- [x] Final attributed, ambiguous, and residual mass sum to one within the existing epsilon.
- [x] Initial residual mass is never multiplied a second time.
- [x] `status`, `resolution`, and `termination` remain orthogonal.
- [x] `fetchCount` equals callback invocations for every returned result and never exceeds
  `maxFetches`.
- [x] Sync and async resolvers produce equivalent results and request sequences.
- [x] Fetcher errors preserve object identity when propagated.

### Phase 4: Lock Traversal and Accounting Regressions

**Goal**: Pin every correctness property independently of providers and network behavior.

**Work**:
- Keep existing single-position tests focused.
- Add a separate suffix-walk suite for traversal breadth and sync/async parity.
- Prefer exact synthetic `TokenLogprob` fixtures over mocks of `LLMService`.

**Steps**:
1. [x] Add `src/llm/constrainedLabels.suffixWalk.test.ts` with shared evidence/result helpers.
2. [x] Add grammar/validation tests for ordinary fragments, escaping, Unicode, required leading spaces,
   duplicates, controls, strict prefixes, and invalid fetch budgets.
3. [x] Table-test zero-fetch defensive-copy behavior for every non-ambiguous initial status, including
   `ok` with tolerated nonzero ambiguous mass and inputs without raw evidence. Add mutation checks
   proving returned records and nested raw alternatives do not alias the supplied result. Include a
   stale or label/option-mismatched typed object and prove the fast path copies it without
   reconciliation or a fetch.
4. [x] Test ambiguous initialization with:
   - an input missing raw evidence, which throws `TypeError` before fetching;
   - public fields that disagree with recomputation, which are ignored;
   - different labels or ambiguity options, which are applied during recomputation;
   - recomputation to a non-ambiguous status, which returns through the zero-fetch path.
5. [x] Add a one-step accounting vector with initial resolved, ambiguous, and residual mass and exact
   expected final absolute/conditional/residual values.
6. [x] Add separate bare and space-prefixed initial paths that trigger distinct fetch prefixes and
   combine only after resolving to labels.
7. [x] Add a cumulative multi-fetch walk that checks each cumulative prefix, remaining suffix set, and
   generated grammar.
8. [x] Add an all-ambiguous position-0 fixture with no resolved label mass and an empty-token root fixture
   that generates both bare and space-prefixed suffix forms.
9. [x] Reuse duplicate decoded-token and sampled-token-absent fixtures at a suffix position to prove
   evidence parity with position 0.
10. [x] Add mixed valid/malformed suffix alternatives to prove invalid entries are filtered without
    discarding valid advancing evidence.
11. [x] Test exact-decoded-prefix frontier merging without merging bare and space-prefixed states.
12. [x] Add a delayed-convergence fixture proving a state discovered after an identical state was already
    processed may consume another callback and remains governed by the same global budget.
13. [x] Test highest-mass-first ordering, stable equal-mass ties, dynamic reprioritization, caller budget
    exhaustion, the default 8-fetch cap, and `fetchCount` for short-circuit, complete,
    budget-exhausted, and rejected-evidence results.
14. [x] Table-test returned undefined, absent/empty alternatives, all-invalid entries, materially
    overfull evidence, and no-advancing-candidate evidence.
15. [x] Test partial fetch-rejected termination after another frontier has resolved, proving committed
    mass remains and current/queued mass stays ambiguous.
16. [x] Test sync throw and async rejection identity.
17. [x] Test incomplete-but-usable results where `status` is `ok` while `termination` records budget or
    evidence failure.
18. [x] Apply reusable invariant assertions to complete, fetch-rejected, and budget-exhausted results,
    including prototype-like labels.

**Verification**:
- [x] New suffix-walk tests cover every acceptance criterion in the issue.
- [x] Existing single-position tests remain green without weakening assertions.
- [x] No test requires network access, credentials, or a running llama.cpp server.

### Phase 5: Publish and Pack the Public API

**Goal**: Make every resolver value and type available through supported package entry points and
verify actual installed-package behavior.

**Work**:
- Export from the package root only.
- Extend the existing packed consumer rather than creating a new package subpath or script.

**Steps**:
1. [x] Export `generateSuffixGrammar`, both resolver functions, and all new types beside the current
   constrained-label exports in `src/index.ts`.
2. [x] Keep `package.json` exports unchanged; no suffix-walk subpath is added.
3. [x] Extend the strict packed TypeScript consumer in
   `scripts/verify-packed-prepared-api.js` to import and instantiate every new type and function.
4. [x] Extend the packed CJS runtime check with:
   - suffix grammar output;
   - a synchronous resolver;
   - request-context assertions;
   - exact mass/provenance assertions.
5. [x] Extend the packed ESM runtime check with an asynchronous resolver using top-level `await` under
   the package's Node 20 floor, asserting the same public semantics.

**Verification**:
- [x] Root declarations expose every new value and type.
- [x] Strict Node16 TypeScript resolution compiles the installed tarball.
- [x] Packed CJS and ESM executions exercise resolver behavior, not only symbol presence.
- [x] No package subpath or dependency is added.

### Phase 6: Document Approximation and Caller Orchestration

**Goal**: Show callers how to reissue suffix requests honestly without implying that genai-lite
dispatches or reproduces the original token factorization.

**Work**:
- Keep the existing constrained-answer guide as the durable workflow owner.
- Update reference/navigation pages only where their current single-position wording becomes stale.
- Do not create a second suffix-walk guide or implementation journal.

**Steps**:
1. [x] Replace the deferred-only multi-token section in
   `genai-lite-docs/constrained-answer-labels.md` with:
    - the normal extract-then-resolve flow and current-options recomputation for ambiguous input;
    - the trusted typed pass-through boundary for non-ambiguous input, including that labels/options
      are not used to certify caller-supplied public fields;
   - asynchronous caller-owned fetcher pseudocode using `prefix`, `suffixes`, and `grammar`;
    - `maxFetches`, the default of 8, highest-mass-first behavior, and short-circuit semantics;
    - the `status` / `resolution` / `termination` axes in a compact table;
    - `fetchCount` cost accounting;
    - complete, budget-exhausted, fetch-rejected, and propagated-error handling;
    - sequential execution and the possibility of up to eight serialized follow-up round trips by
      default;
   - exact decoded bare/space-prefix behavior;
   - the position-0 meaning of `rawTokenLogprob`;
   - the full-distribution evidence precondition at every suffix position;
   - the decoded-text-state approximation, including possible retokenization, collapsed token
     identities/histories, and the absence of any numerical error bound.
2. [x] Extend `genai-lite-docs/typescript-reference.md` with every new function, interface, type alias,
   option default, return field, and callback contract.
3. [x] Update `genai-lite-docs/llm-service.md` to state that callers may use the resolver around repeated
   service calls but `LLMService` does not automate suffix walking.
4. [x] Update `genai-lite-docs/llamacpp-integration.md` with `generateSuffixGrammar`, assistant-prefill
   meaning, and a link to the main guide without duplicating the complete workflow.
5. [x] Update the README documentation description and `genai-lite-docs/index.md` navigation text so
   they no longer describe the feature as single-position-only.
6. [x] Update root, `src`, and `src/llm` summary files after final symbols and behavior are stable; leave
   client/service summaries unchanged unless their described integration points actually change.
7. [x] Leave `e2e-tests/providers.e2e.test.ts` unchanged: its existing llama.cpp case already covers
   grammar, transport, and position-0 extraction, while forcing tokenizer-dependent shared-prefix
   ambiguity would make a new live test model-specific and flaky.

**Verification**:
- [x] The guide never calls suffix products exact probabilities.
- [x] JSDoc covers every new public value/type and agrees with the user guide.
- [x] Fetcher examples append the exact decoded prefix and apply the supplied suffix grammar.
- [x] Documentation distinguishes returned malformed evidence from a thrown/rejected fetcher.
- [x] JSDoc and the guide distinguish trusted non-ambiguous pass-through from ambiguous raw-evidence
  recomputation.
- [x] Documentation defines `fetchCount`, the default eight-fetch latency cap, and sequential
  execution.
- [x] Documentation explains that low unresolved mass can coexist with `status: "ok"` and an
  incomplete `termination`.
- [x] No page implies built-in dispatch, retry, or provider support beyond current capabilities.

### Phase 7: Validate, Version, and Archive Records

**Goal**: Prove the complete public change and close its durable issue/plan records in one release
branch when the approved target is ready.

**Work**:
- Run focused checks before broad/package checks.
- Apply the approved minor version only after implementation and docs are complete.
- Archive the root issue and plan according to repository convention.

**Steps**:
1. [x] Run focused Jest suites for existing constrained labels and the new suffix-walk suite.
2. [x] Update only the three package/lock version fields from `0.18.0` to the approved `0.19.0`.
3. [x] Run preliminary release gates on the implemented, documented, versioned tree:
   - `npm test`, recording suite/test counts;
   - `npm audit --omit=dev --audit-level=high`;
   - `npm run build`;
   - `npm run test:packed-api`;
   - `npm pack --dry-run`, verifying `genai-lite@0.19.0` and constrained-label files;
   - the documented root-export smoke command against `dist`;
   - `git diff --check` and complete-diff inspection.
4. [x] Update `ISSUE-suffix-walk-approximation.md`:
    - tick every acceptance criterion;
    - add a dated resolution naming the release and approximation contract;
    - change `Status` to `RESOLVED`.
5. [x] Update `PLAN-suffix-walk-approximation.md`:
    - mark every checklist and verification item complete;
    - add the same dated release resolution;
    - change `Status` to `COMPLETE`.
6. [x] Move both records to `docs/archive/`, update references and root summaries, and include archival
    in the same release branch/PR rather than a follow-up.
7. [x] Rerun every blocking local release gate from step 3 after archival/reference changes so the
   recorded final results describe the exact release tree, not the pre-archive or `v0.18.0` tree.
8. [x] Verify the final worktree contains `0.19.0` in all three version fields, archived records only,
   correct root exports, and no unrelated files.

**Verification**:
- [x] Focused and full unit suites pass.
- [x] TypeScript build and packed TypeScript/CJS/ESM verification pass.
- [x] Production dependency audit reports no blocking vulnerabilities.
- [x] Package contents and root exports match the approved version.
- [x] Issue and plan are resolved and archived only after all implementation gates pass.
- [x] No paid or live-provider E2E suite is run without separate authorization.

## Testing Strategy

- **Regression layer**: Preserve all v0.18.0 grammar, validation, evidence, status, and mass fixtures
  before refactoring private helpers.
- **Pure traversal layer**: Exercise exact trie/frontier movement, request generation, merging,
  priority, budgets, transactional failure, and finalization with synthetic evidence.
- **Parity layer**: Drive the same fixtures through sync and async wrappers and compare results plus
  callback request order.
- **Invariant layer**: Reuse mass-conservation and conditional-renormalization assertions across
  complete and partial outcomes.
- **Packaging layer**: Compile every public type from the installed tarball and execute both module
  systems against real resolver calls.
- **E2E layer**: Reuse the existing llama.cpp grammar/logprobs integration baseline; do not add a
  tokenizer-dependent suffix-walk E2E.

## Risks and Mitigations

- **Decoded-text approximation mistaken for exactness**: Reissued text may retokenize, and duplicate
  or converged decoded strings can hide distinct original token histories.
  - Mitigation: required `resolution`/`termination`, prominent JSDoc, and guide language describing
    every suffix result as approximate with no numerical error bound.
- **Mass loss or double multiplication**: Nested branch products can accidentally drop or multiply
  initial mass twice.
  - Mitigation: transactional per-frontier decomposition, one shared finalizer, and invariant tests
    for every termination mode.
- **Bare/space path collapse**: Canonically equivalent label paths can require different caller
  prefills.
  - Mitigation: exact decoded prefix is part of frontier identity; only identical prefix/node states
    merge.
- **Sync/async drift**: Two hand-written traversal loops could diverge on ordering or failure.
  - Mitigation: one pure transition state machine with thin fetch drivers and parity tests.
- **High sequential tail latency**: Deep or branching labels can serialize many follow-up round
  trips.
  - Mitigation: finite default global budget of 8, positive-integer validation, highest-mass-first
    ordering, stable ties, visible `fetchCount`, and visible budget termination.
- **Partial invalid evidence corrupts committed work**: A malformed later response could erase earlier
  resolved mass or leak tentative deltas.
  - Mitigation: apply each fetch transactionally and preserve current/queued mass as ambiguous on
    returned invalid evidence.
- **Suffix-fragment validation rejects valid labels**: Internal-space labels can yield fragments with
  required leading spaces.
  - Mitigation: share literal-safety and prefix checks, permit required leading suffix whitespace,
    and reject trailing or whitespace-only suffix fragments.
- **Provider evidence semantics compound across calls**: Every suffix response inherits the existing
  full-distribution normalization precondition.
  - Mitigation: repeat the precondition in JSDoc and the guide; do not imply provider calibration.

## Rollback

The implementation is additive. Before release, rollback consists of removing the suffix resolver
types/functions, suffix grammar, new tests/exports/docs, and restoring the private helper layout while
retaining all v0.18.0 single-position behavior. No persisted data, configuration migration, adapter
wire shape, or service behavior changes.

After a published release, the resolver should not be silently redefined as exact or have its budget
semantics changed. A correction should preserve the public signatures where possible and use a new
minor release for any material result-contract change.

## Documentation

- **Existing durable owner**: `genai-lite-docs/constrained-answer-labels.md` will own the complete
  one-position-plus-optional-suffix workflow, approximation boundary, callback recipe, and result
  interpretation. A second guide would split one conceptual workflow and duplicate its probability
  caveats.
- **Existing references updated**: README, documentation hub, TypeScript reference, LLM service,
  llama.cpp integration, and hierarchical summaries.
- **No new user document or devlog**: The revised issue and this archived plan provide the durable
  design record; tests own executable edge cases.

## Decisions

- **Keep one implementation module** — all private trie/evidence helpers remain directly reusable
  and public exports stay cohesive. Rejected: split suffix walking into a second source module
  (requires internal exports or duplicated helpers and risks circular coupling).
- **Use one pure transition state machine** — sync and async APIs differ only at callback awaiting.
  Rejected: duplicate traversal implementations (simpler initially but likely to drift).
- **Trust typed pass-through results and recompute ambiguous input** — non-ambiguous inputs need no
  resolver-specific certification, while raw evidence fully determines ambiguous initialization.
  Rejected: validate and compare every public field (adds failure modes without authenticating a
  structurally typed object).
- **Keep `termination: "not_started"`** — it makes zero suffix calls explicit and keeps one uniform
  result shape. Rejected: infer it only from `resolution: "single_position"` (one fewer enum value but
  less direct tracing) or make `termination` optional (adds branching to every consumer).
- **Use a separate suffix-walk test file** — traversal breadth should not obscure the shipped
  single-position regression suite. Rejected: append every case to the existing test file (one fewer
  file but poor navigability).
- **Use stable discovery order for equal masses** — it is deterministic without privileging lexical
  label spelling. Rejected: lexical tie-breaking (deterministic but unrelated to evidence discovery).
- **Merge identical decoded-prefix/node states only while queued** — those states produce the same
  caller context and grammar before their first fetch. Rejected: merge canonical bare/space paths
  (reduces calls but changes reissued text), retain and replay successful decompositions after fetch
  (avoids uncommon repeated calls but adds cache lifecycle, replay, and budget invariants), or never
  merge queued converged states (wastes budget on identical pending calls).
- **Use a sequential default budget of 8** — dynamic reprioritization remains deterministic while the
  default caps added tail latency and `fetchCount` exposes actual cost. Rejected: default 16 (more
  resolution headroom but twice the serialized worst-case round trips) or bounded concurrency
  (lower latency for independent states but commits work before prior responses can reprioritize it).
- **Treat returned invalid evidence transactionally** — partial work from the same malformed fetch is
  discarded while earlier fetches remain committed. Rejected: keep valid-looking pieces from an
  invalid fetch (harder to reason about and can violate evidence parity).
- **Propagate operational fetcher errors** — caller retry and error policy remains authoritative.
  Rejected: convert throws/rejections into ambiguous mass (hides outages as model uncertainty).
- **Keep suffix evidence out of the result** — `rawTokenLogprob` remains the position-0 diagnostic
  snapshot and the public result stays bounded. Rejected: retain a full suffix transcript (larger API,
  memory, and redaction surface not requested).
- **Do not add a live suffix-walk E2E** — provider transport is already covered and forced shared-prefix
  tokenization would be model-dependent. Rejected: add a llama.cpp walk E2E (more realistic but flaky
  across arbitrary GGUF tokenizers and server builds).
- **Root export only** — the feature extends the existing constrained-label surface and does not
  justify another package entry. Rejected: a suffix-walk package subpath (additional packaging burden).
- **Use the approved v0.19.0 minor release** — the work adds public values, types, result fields, and
  documented capability. Rejected: patch release (understates a new public API).

## Open Questions

- None. The target release is approved as `v0.19.0`; v1 uses pre-fetch merging without post-fetch
  memoization, a sequential default budget of 8, and explicit `fetchCount` observability.

---

## Resolution

Status: COMPLETE — 2026-08-19, shipped in v0.19.0.

All seven phases were executed. Phases 1-3 landed together as one coherent rewrite of
`src/llm/constrainedLabels.ts`: the single-position core was refactored into shared private helpers
(form validation with a leading-whitespace policy, one ordered-alternatives grammar builder, one
evidence-preparation function returning a tagged outcome, and one node interpreter returning
resolved shares, frontier candidates, and residual), and the suffix-walk types, grammar, frontier
model, and the two thin resolver drivers were built on top of them. `extractSingleTokenLabelProbs`
and `generateAnswerTokenGrammar` keep byte-identical behavior; all 36 pre-existing fixtures passed
unchanged before anything new was exported.

Deviations from the plan as written, all minor:

- **Phase 1 verification "no new public symbol during the refactor alone"** was satisfied in
  substance rather than as a separate commit: the refactor introduced no public symbol, but it was
  not landed as an isolated step before Phases 2-3.
- **`prepareEvidence` and `snapshotTokenLogprob` gained optional chaining on individual
  alternatives.** A `null` entry in `topLogprobs` previously threw; it is now filtered like any
  other malformed entry. This is unreachable from well-typed input and is required by the
  suffix path's "filter malformed entries, propagate only operational errors" rule.
- **Frontier merge keys use both prefix and node id** even though a trie makes them equivalent
  (path and node are in bijection). The redundancy is deliberate and cheap.
- **Root summary updates** were folded into this archival step rather than Phase 6, because they
  reference the archived paths.

A three-way adversarial review pass (implementation correctness, test adequacy, docs/packaging) ran
after the first green build and produced no correctness findings — mass conservation, termination,
merge-key soundness, and byte-identical v0.18.0 grammar output were all independently confirmed, and
every accounting fixture was recomputed by hand. It did surface, and this release fixes:

- two ordering fixtures that passed under FIFO/lexical scheduling and so failed to pin the
  documented highest-mass-first and discovery-order-tie policies;
- small-mass assertions left at `toBeCloseTo`'s default +/-0.005 precision, which passed at zero;
- a bare/space fixture whose branches resolved to different labels, never exercising recombination;
- missing coverage for null `topLogprobs` entries, async validation rejections, walk-path
  non-aliasing, input immutability, internal-space labels, astral labels, and single-label sets;
- a `recordingFetcher` that degraded a response overrun into a misleading `fetch_rejected`;
- documentation errors: `rawTokenLogprob` described as unconditionally required, `resolution`
  described as "contributed" when it records that fetching occurred, an example referencing
  out-of-scope variables, `fetchCount` described as the number billed, and a stale
  "single-position" comment.

Two behaviors that were correct but undocumented are now documented: re-passing a walk result
restarts from position 0 (do not resume that way), and an empty decoded token becomes residual at a
suffix position while opening a root branch at position 0. `fetchCount` incrementing moved into the
shared step so the two drivers cannot drift.

Final gates on the release tree: 106 focused constrained-label tests, full unit suite at 54 suites /
1292 tests, `tsc` build clean, `npm run test:packed-api` passing (strict Node16 TS consumer, CJS and
ESM runtime resolver checks against the installed tarball), `npm audit --omit=dev
--audit-level=high` reporting 0 vulnerabilities, `npm pack --dry-run` producing
`genai-lite-0.19.0.tgz` (119 files, 203.4 kB) including `dist/llm/constrainedLabels.*`, and the
documented root-export smoke command resolving all five constrained-label functions from `dist`.
No live or paid provider E2E suite was run.
