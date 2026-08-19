# Plan: Constrained Answer Logprobs

Created: 2026-08-19
Status: COMPLETE — 2026-08-19 (v0.18.0)
Approved: 2026-08-19

## Live Task Checklist

- [x] Phase 1: Lock regression baselines.
- [x] Phase 2: Implement constrained-label core.
- [x] Phase 3: Harden the public wire mapper.
- [x] Phase 4: Add capability and settings semantics.
- [x] Phase 5: Add mock and service integration.
- [x] Phase 6: Export and verify the public surface.
- [x] Phase 7: Update documentation and live examples.
- [x] Phase 8: Validate and close the issue.

## Summary

Implement a sound, single-position constrained-label probability utility on top of the
existing normalized `TokenLogprob` transport. The work adds validated GBNF generation,
explicit absolute/conditional/ambiguous/residual probability semantics, hardened public
OpenAI-shape mapping, mock and terminal-stream integration coverage, and honest static
logprobs capability metadata without adding suffix-walk orchestration or provider-specific
`topLogprobs` maxima.

The target release is `v0.18.0`. It intentionally changes `topLogprobs` without effective
`logprobs: true` from silent omission to a validation error; all current consumers are owned
together, so no warning-only transition is planned.

The authoritative requirements are in `docs/archive/ISSUE-constrained-answer-logprobs.md`.

## Scope

- **In scope**:
  - Shared answer-label validation, including strict-prefix rejection.
  - `generateAnswerTokenGrammar(labels)` with optional leading ASCII space and no accepted
    trailing newline.
  - `extractSingleTokenLabelProbs(labels, tokenLogprob, options?)` with discriminated status,
    absolute and conditional label probabilities, residual mass, ambiguous mass, and raw
    token evidence.
  - Duplicate decoded-token aggregation, sampled-token inclusion, and unsafe-key hardening.
  - Public hardening and root export of `mapOpenAIChatLogprobs`.
  - Deterministic mock logprobs and complete/prepared/terminal-stream integration tests.
  - Explicit `ModelCapabilities` logprobs status from positive metadata.
  - Validation that `topLogprobs` requires effective `logprobs: true`.
  - An explicit full-distribution evidence precondition for absolute/residual mass semantics.
  - Root and packed-package public API verification.
  - User documentation, TypeScript reference, and summary-file updates.
- **Out of scope**:
  - Synchronous or asynchronous suffix walkers.
  - Token-state, token-id, or opaque continuation APIs.
  - Provider-specific `topLogprobs` maxima or removal of the current global 0-20 cap.
  - Streaming logprob-delta events.
  - Repeated-sample aggregation, posterior inference, best-of-N, or automatic dispatch.
  - A new package subpath.
  - `applyStrictSchemaConstraints` export.
  - Mandatory paid/cloud E2E execution.

## Prerequisites

- Use the current strict TypeScript/CommonJS build and existing Jest configuration.
- Preserve the prepared-call architecture: the new utilities interpret normalized responses
  and do not alter provider request identity.
- Keep all provider-specific wire parsing in `src/shared/adapters/logprobsUtils.ts`.

## Phases

### Phase 1: Lock Regression Baselines

**Goal**: Prove the existing transport behavior before adding interpretation logic.

**Work**:
- Add direct tests for the current valid OpenAI-shaped mapper behavior.
- Add terminal streaming assertions for OpenAI, OpenRouter, and llama.cpp adapters.
- Preserve the existing contract that logprobs appear on the terminal response rather than
  as a new stream event.

**Steps**:
1. Create `src/shared/adapters/logprobsUtils.test.ts` with absent, empty, and valid payload
   baselines. Malformed-payload expectations land with the hardening behavior in Phase 3.
2. Extend `src/llm/clients/OpenAIClientAdapter.test.ts` so a streaming chunk carrying raw
   logprobs appears on the final synthetic completion.
3. Add equivalent terminal-response coverage in
   `src/llm/clients/OpenRouterClientAdapter.test.ts`.
4. Extend `src/llm/clients/LlamaCppClientAdapter.test.ts` and the prepared streaming path in
   `src/llm/clients/LlamaCppPrefillPrepared.test.ts`.

**Verification**:
- [x] Mapper tests pass against valid current behavior.
- [x] Each OpenAI-shaped adapter proves terminal streaming logprob preservation.
- [x] No `LLMStreamEvent` variant is added.

### Phase 2: Implement Constrained-Label Core

**Goal**: Add the sound public grammar and single-position extraction contract.

**Work**:
- Add one focused module, `src/llm/constrainedLabels.ts`, with public functions and types plus
  private validation, trie, log-sum-exp, and probability helpers.
- Add colocated coverage in `src/llm/constrainedLabels.test.ts`.
- Keep the module provider-agnostic apart from emitting the requested llama.cpp-compatible
  GBNF string.

**Steps**:
1. Define and export:
   - `SingleTokenLabelProbStatus`.
   - `SingleTokenLabelProbExtraction`.
   - `SingleTokenLabelProbOptions` with an optional non-negative
     `ambiguityLogprobGap`, defaulting to 5 nats.
   - `generateAnswerTokenGrammar`.
   - `extractSingleTokenLabelProbs`.
2. Implement shared label validation:
   - Require a nonempty array of nonempty strings.
   - Reject exact duplicates, whitespace-only labels, leading/trailing whitespace, controls,
     line separators, and unpaired UTF-16 surrogates.
   - Sort a copy for adjacent strict-prefix detection while preserving caller order for output.
   - Permit shared non-terminal prefixes such as `answer_one` / `answer_two`.
3. Implement grammar generation:
   - Escape backslash and double quote after validation.
   - Emit `root ::= " "? answer` and one ordered `answer` alternation.
   - End the grammar source with a newline, but do not include a `"\\n"?` production in the
     accepted language.
4. Implement evidence preparation:
   - Defensively snapshot the sampled token and alternatives.
   - Require nonempty `topLogprobs` for a recoverable distribution.
   - Aggregate duplicate decoded alternative strings with log-sum-exp.
   - Add the sampled token/logprob only when no alternative has the same exact token text.
   - Treat negative infinity as zero mass.
   - Clamp finite positive logprob drift up to `1e-6` to zero; safely exclude larger positive
     values and otherwise malformed token/logprob entries.
5. Implement trie attribution over both bare and one-space-prefixed label forms:
   - Attribute exact terminals directly.
   - Attribute a prefix with one reachable label to that label, with an adjacent code comment
     preserving its dependency on strict-prefix rejection.
   - Accumulate a prefix with several reachable labels into ambiguous mass.
   - Accumulate with `Map`; materialize public records with `Object.fromEntries` so unsafe keys
     remain ordinary own properties.
6. Compute output spaces:
   - `absoluteLabelProbs` from soundly attributed label mass.
   - `conditionalLabelProbs` by normalizing only positive attributed label mass.
   - `ambiguousMass` from shared-prefix branches.
   - `residualMass = max(0, 1 - attributedMass - ambiguousMass)`.
7. Assign status deterministically:
   - `missing_alternatives` when alternatives are absent or empty.
   - `no_matching_tokens` when no label or ambiguous branch intersects the evidence.
   - `ambiguous_prefix` when ambiguous evidence is not at least the configured logprob gap
     below the best resolved label, or when no label is resolved.
   - `invalid_evidence` when merged visible probability exceeds one beyond the documented
     floating-point tolerance.
   - `ok` otherwise, while still reporting negligible ambiguous mass.
8. Define mass-failure behavior explicitly:
   - Missing alternatives, no matching tokens, and invalid evidence return zero label vectors,
     zero ambiguous mass, full residual mass, and preserved raw evidence.
   - Compute total merged visible mass before attribution.
   - If visible mass exceeds one only within a documented `1e-6` probability-sum epsilon,
     scale all visible alternatives proportionally back to one before attribution.
   - If visible mass exceeds one beyond epsilon, do not expose partial attributed mass.
   - Compare aggregate `log(ambiguousMass)` with the best aggregate label logprob for the
     five-nat status threshold.
9. Add focused tests for every validation rule, grammar escaping/order, Unicode preservation,
   strict-prefix regressions, leading-space merging, single-completion prefixes, duplicate
   strings, sampled-token inclusion, mass spaces, statuses, unsafe keys, malformed numbers,
   overfull evidence, tolerance scaling, full-distribution versus top-N-renormalized fixtures,
   and option validation.

**Verification**:
- [x] Strict-prefix sets fail before trie construction.
- [x] Grammar output matches the issue exactly and accepts no trailing newline.
- [x] Absolute, conditional, ambiguous, and residual masses have documented disjoint meanings.
- [x] Tests demonstrate why top-N-renormalized evidence cannot satisfy the absolute/residual
  precondition even though its visible mass may sum to one.
- [x] Duplicate and sampled-token evidence is counted exactly once.
- [x] Every supplied label appears in both probability records, including zero-valued labels.
- [x] No result field can become `NaN` or leave label plus ambiguous mass above one.

### Phase 3: Harden the Public Wire Mapper

**Goal**: Make `mapOpenAIChatLogprobs` safe to expose without changing valid adapter output.

**Work**:
- Change the mapper input from `any` to `unknown`.
- Validate shape at runtime and return only normalized valid entries.
- Keep malformed provider payloads from introducing invalid `TokenLogprob` values.

**Steps**:
1. Add small internal type guards for objects, token strings, and logprob numbers; permit negative
   infinity as zero-mass evidence, clamp finite values in `(0, 1e-6]` to zero, and reject `NaN`,
   positive infinity, and finite values above that tolerance.
2. Treat absent/non-array/empty `content` as `undefined`, preserving current behavior.
3. Filter malformed content entries and malformed alternatives independently.
4. Omit `topLogprobs` when no valid alternatives remain.
5. Return `undefined` when no valid content entries remain.
6. Expand mapper tests to pin partially malformed, fully malformed, negative-infinity,
   near-zero-positive, materially positive, mixed-validity, and defensive-copy behavior.

**Verification**:
- [x] Existing valid OpenAI/OpenRouter/llama.cpp fixtures map identically.
- [x] Tiny positive drift is clamped without admitting materially positive logprobs.
- [x] Invalid fields cannot escape through the public return type.
- [x] No adapter requires provider-specific mapper logic.

### Phase 4: Add Capability and Settings Semantics

**Goal**: Expose honest static logprobs support and eliminate silent `topLogprobs` omission.

**Work**:
- Mirror the existing structured-output metadata-to-capability pattern.
- Keep maxima and provider-aware range validation deferred.
- Preserve current unsupported-parameter stripping behavior.

**Steps**:
1. In `src/llm/types.ts`, add:
   - Registry metadata for explicit logprobs support/unsupported notes.
   - Optional metadata fields on `ProviderInfo` and `ModelInfo`.
   - `LogprobsSupport` with `status`, `source`, and optional notes.
   - Optional `ModelCapabilities.logprobs` for source compatibility with external object
     construction.
2. In `src/llm/config.ts`, set explicit provider metadata:
   - `unsupported` for Anthropic, Gemini, and Mistral.
   - `supported` for llama.cpp and mock transport.
   - Leave OpenAI and OpenRouter unknown at provider level because support is model-dependent;
     add model overrides only where the repository has verified metadata.
3. In `src/llm/LLMService.ts`, extend `buildModelCapabilities`:
   - Prefer explicit model metadata.
   - Fall back to explicit provider metadata with registry provenance.
   - Report `unknown` when neither exists.
   - Do not retrieve credentials or call adapters.
4. Add supported, unsupported, unknown, fallback-model, and no-network tests in
   `src/llm/LLMService.capabilities.test.ts`.
5. Keep `validateLLMSettings` responsible for field shape and the existing 0-20 range; do not
   make it decide a cross-source relationship before defaults are merged.
6. Add a final-settings validation method in `RequestValidator` and call it after
   `mergeSettingsForModel` in `LLMService.resolveAndValidateCapabilities`. Reject
   `topLogprobs` unless the fully merged settings contain `logprobs: true`.
7. Keep `SettingsManager.validateTemplateSettings` limited to shape/range validation. A valid
   `topLogprobs` in template metadata may be paired with `logprobs: true` from a preset or
   request and must therefore survive until final merged validation.
8. Add request, preset, provider/model-default, and template regression coverage for valid and
   invalid cross-source combinations.

**Verification**:
- [x] Capability results never infer support from an absent exclusion.
- [x] Capability queries remain credential-free and network-free.
- [x] OpenAI/OpenRouter unknown status is documented as model-dependent, not unsupported.
- [x] `topLogprobs` without final merged `logprobs: true` returns the appropriate request or
  preflight validation diagnostic.
- [x] Existing unsupported-provider filtering remains unchanged.

### Phase 5: Add Mock and Service Integration

**Goal**: Exercise settings, preparation, normalization, extraction, and terminal streaming
without real provider calls.

**Work**:
- Emit deterministic synthetic logprobs for every successful mock response that requests them.
- Keep mapper testing separate because the mock emits normalized `TokenLogprob` values.

**Steps**:
1. Define a simple mock token convention: treat the final mock response content as one sampled
   token and pair it with deterministic alternate token strings/probabilities.
2. Emit normalized `choice.logprobs` for every successful response when
   `settings.logprobs === true`; ordinary responses remain unchanged when it is false.
3. Honor `topLogprobs` by slicing the deterministic alternatives, including the 0 case.
4. Keep `choice.message.content`, sampled token text, finish reason, usage, raw content, and
   prepared-call evidence internally consistent.
5. Bump `MOCK_ADAPTER_REVISION` because deterministic provider-response behavior changes.
6. Extend `src/llm/clients/MockClientAdapter.test.ts` for disabled/enabled/top-k/stream cases.
7. Extend `src/llm/LLMService.test.ts` and prepared-call tests to prove:
   - complete response preservation;
   - prepared complete preservation;
   - terminal streaming preservation;
   - direct extraction of the synthetic terminal evidence.

**Verification**:
- [x] Mock logprobs are absent unless requested.
- [x] Mock alternatives honor the requested top-k.
- [x] Complete, prepared, and terminal-stream paths expose the same normalized evidence.
- [x] The public extractor interprets the mock fixture deterministically.

### Phase 6: Publish the Root API and Packed Contract

**Goal**: Make the new values and types available through supported consumer entry points.

**Work**:
- Export from the root barrel only.
- Extend the existing packed-consumer verification rather than creating a new packaging path.

**Steps**:
1. Export constrained-label functions and types from `src/index.ts`.
2. Re-export hardened `mapOpenAIChatLogprobs` from `src/index.ts`.
3. Update `scripts/verify-packed-prepared-api.js` to import and typecheck:
   - `generateAnswerTokenGrammar`.
   - `extractSingleTokenLabelProbs`.
   - extraction result/status/options types.
   - `mapOpenAIChatLogprobs`.
   - the new logprobs capability type.
4. Add explicit temporary CJS and ESM runtime scripts that require/import the packed root and
   assert generated grammar plus one extraction result. Do not place runtime assertions only in
   the typechecked-but-unexecuted TypeScript consumer.
5. Leave `package.json` exports unchanged.

**Verification**:
- [x] Strict TypeScript consumers can import every new root symbol.
- [x] CommonJS and Node16 consumer checks continue to pass.
- [x] No new package subpath or optional dependency is introduced.

### Phase 7: Update Documentation and Live Examples

**Goal**: Document the classification workflow, probability spaces, support boundaries, and
soundness limits in the portable user documentation.

**Work**:
- Create one dedicated guide because this feature uniquely joins request grammar, returned
  logprobs, probability interpretation, statuses, and the no-suffix-walk limitation.
- Keep existing provider and API reference pages concise and cross-linked.

**Steps**:
1. Add `genai-lite-docs/constrained-answer-labels.md` owning:
   - the one-position classification workflow;
   - grammar generation;
   - recommended request shape;
   - absolute vs conditional probability examples;
   - ambiguous and residual mass interpretation;
   - statuses and caller branching;
   - label validation;
   - suffix-walk/retokenization limitation;
   - the requirement that logprobs be normalized over the complete effective provider
     distribution before top-N truncation;
   - the inability to detect top-N-renormalized evidence;
   - per-provider notes: documented OpenAI semantics, llama.cpp source behavior, and
     route/model-dependent OpenRouter confidence;
   - provider capability caveats;
   - the intentional `v0.18.0` validation break for orphaned `topLogprobs`.
2. Link the guide from `genai-lite-docs/index.md` and the README documentation section.
3. Extend `genai-lite-docs/llm-service.md` logprobs section with the helper and terminal-stream
   behavior.
4. Extend `genai-lite-docs/llamacpp-integration.md` to use the grammar generator and explain
   the no-trailing-newline rule.
5. Update `genai-lite-docs/typescript-reference.md` with all new types, functions, capability
   fields, and the already-missing `ModelCapabilitiesResult.capabilities` member.
6. Update `genai-lite-docs/providers-and-models.md` with supported/unsupported/unknown
   capability semantics.
7. Leave the two existing assistant-prefill normalization E2E tests unchanged and add a separate
   llama.cpp E2E test using `generateAnswerTokenGrammar` plus
   `extractSingleTokenLabelProbs`; do not require the suite in default verification.
8. Update relevant `.summary_short.md` and `.summary_long.md` files under `src/` and `src/llm/`.

**Verification**:
- [x] Documentation examples compile conceptually against the root API.
- [x] Probability fields are never presented as belonging to the same normalization space.
- [x] Absolute/residual fields state their full-distribution evidence precondition and
  OpenRouter route dependence.
- [x] The guide states that suffix follow-ups are deferred for retokenization soundness.
- [x] Provider support is not overstated for OpenAI/OpenRouter models.

### Phase 8: Validate and Close the Issue

**Goal**: Prove the complete change, then apply repository issue-resolution conventions.

**Work**:
- Run focused checks before broad checks.
- Record and ship the approved `v0.18.0` compatibility change.
- Resolve/archive only after all required verification passes.

**Steps**:
1. Update `package.json` and `package-lock.json` from `0.17.3` to `0.18.0`.
2. Run focused Jest suites for constrained labels, mapper, config/settings, capabilities,
   mock, LLMService, and the three adapters.
3. Run `npm test`.
4. Run `npm run build`.
5. Run `npm run test:packed-api`.
6. Run `npm pack --dry-run` and the documented export smoke command against `dist`.
7. Run `git diff --check` and inspect the complete diff for unrelated changes.
8. Update `docs/archive/ISSUE-constrained-answer-logprobs.md`:
   - check every acceptance criterion;
   - add a dated `## Resolution` section for `v0.18.0` that calls out the intentional
     `topLogprobs` validation break;
   - change status to `RESOLVED`.
9. Update `docs/archive/PLAN-constrained-answer-logprobs.md`:
   - mark every phase verification item complete;
   - add the same dated `v0.18.0` release and compatibility note in `## Resolution`;
   - change status to `COMPLETE`.
10. Move the issue and plan to `docs/archive/` and update references according to repository
   convention. Do not mark `../../ISSUE-next-steps.md` item 12 resolved: this issue references it only
   for file placement.
11. Update root `.summary_short.md` and `.summary_long.md` after the archive paths are final.

**Verification**:
- [x] Focused and full unit tests pass.
- [x] TypeScript build passes.
- [x] Packed consumer verification passes.
- [x] Package contents and root exports are correct.
- [x] Package and lockfile versions are `0.18.0`, with the validation break documented.
- [x] Issue and plan are archived only after completion.

## Testing Strategy

- **Pure-unit layer**: Label validation, grammar generation, trie attribution, mass
  calculations, status selection, mapper validation.
- **Adapter layer**: Complete and terminal-stream mapping for OpenAI, OpenRouter, llama.cpp,
  plus normalized mock fixtures.
- **Service layer**: Settings merge/validation, capability queries, prepared complete and
  stream preservation, public extraction.
- **Packaging layer**: Build declarations, packed installation, strict consumer typecheck,
  runtime root-import smoke.
- **E2E layer**: Add a dedicated free local llama.cpp constrained-label test without coupling the
  existing assistant-prefill normalization tests; do not require a live server or paid providers
  for completion.

## Risks and Mitigations

- **Mixed probability spaces**: Absolute and conditional fields could be confused.
  - Mitigation: distinct names, dedicated documentation, and tests showing their different
    sums when residual mass exists.
- **Provider evidence basis**: A provider may renormalize only returned top-N alternatives,
  making absolute and residual mass labels unsound without any detectable overfull total.
  - Mitigation: require full effective-distribution normalization as a public precondition,
    document current provider evidence, keep OpenRouter route/model confidence explicit, and
    include contrasting fixtures for full-distribution and renormalized top-N inputs.
- **Floating-point drift**: Log-sum-exp and exponentiation can produce tiny mass errors.
  - Mitigation: stable log-sum-exp, finite checks, non-negative clamping, and approximate tests.
- **Ambiguity heuristic misuse**: Five nats is a policy threshold, not mathematical proof.
  - Mitigation: expose it as an option, always report ambiguous mass, and document status
    semantics.
- **Capability overstatement**: Adapter transport support does not prove model support.
  - Mitigation: explicit metadata only; unknown by default for model-dependent providers.
- **Mapper hardening regression**: Overly strict guards could drop legitimate provider data.
  - Mitigation: baseline current valid fixtures first, clamp positive drift through `1e-6`, and
    filter only materially invalid entries.
- **Mock drift**: Synthetic evidence on requested logprobs could alter prepared-call identity or
  unrelated tests.
  - Mitigation: gate solely on `settings.logprobs === true`, bump mock adapter revision, and test
    unchanged ordinary requests where logprobs are disabled.
- **Scope creep into suffix orchestration**: Follow-up requests are tempting once trie helpers
  exist.
  - Mitigation: do not export or implement walkers; keep the issue's deferred-soundness note.

## Rollback

Most of the feature is additive, but final validation intentionally turns orphaned `topLogprobs`
from silent omission into an error in `v0.18.0`. If rollback is required before release, restore
the prior omission behavior, remove the new constrained-label module and root exports, revert
mapper hardening and explicit capability metadata, restore mock revision/fixtures, and remove the
associated tests/docs. No persisted data or migration is involved.

## Documentation

- **New durable artifact**: `genai-lite-docs/constrained-answer-labels.md` answers the unique
  cross-cutting question, "How do I constrain a one-position answer and interpret its label
  probabilities soundly?" Existing provider and LLM reference pages separately own transport
  and settings and would not provide a coherent workflow without substantial duplication.
- **Existing artifacts updated**: README, documentation hub, LLM service, llama.cpp integration,
  providers/models, TypeScript reference, e2e example, and hierarchical summary files.
- **No implementation journal/devlog**: The revised issue and archived plan provide the durable
  decision record.

## Decisions

- **Single-position extraction only** — decoded-prefix follow-up requests can retokenize and
  cannot claim exact continuation probability. Rejected: sync/async suffix walkers (convenient,
  but unsound without token-state evidence).
- **Reject strict-prefix labels** — termination probability is unavailable, causing silent
  single-position mis-attribution and trie double-counting. Rejected: EOS-aware traversal
  (requires a wider evidence contract).
- **Expose absolute and conditional probabilities separately** — callers need both recognized
  absolute mass and normalized label ranking. Rejected: one `labelProbs` field plus residual
  (mixes probability spaces implicitly).
- **Report ambiguous mass without distributing it** — uniform splitting is a small documented
  approximation but unnecessary once ambiguous mass is public. Rejected: assigning negligible
  branch mass uniformly (simple, but invents per-label evidence).
- **Fail closed on materially overfull evidence** — a small floating-point excess is scaled back
  proportionally, while larger excess returns `invalid_evidence` with no partial attribution.
  Rejected: clamping only residual mass (can leave public label plus ambiguous mass above one).
- **Use a required status enum** — unusable or incomplete evidence must be difficult to ignore.
  Rejected: optional `needsFallback` (easy for consumers to overlook).
- **Retain `generateAnswerTokenGrammar` naming** — it matches the filed issue and intended
  one-position use, while documentation states that labels are character sequences and may not
  be one tokenizer token. Rejected: rename to `generateAnswerLabelGrammar` (more literal, but
  adds churn without changing behavior).
- **Implement one focused source module** — the utility is cohesive and modest in size.
  Rejected: an initial multi-file `constrainedLabels/` package (more structure than the first
  version needs).
- **Root export only** — classic module resolution can always see the root, and the surface does
  not justify another package entry. Rejected: `genai-lite/logprobs` subpath (additional package
  maintenance and incomplete compatibility).
- **Harden the mapper before export** — public `any` would expose unchecked provider data.
  Rejected: exporting the current implementation unchanged (minimal work but unsound public API).
- **Explicit capability metadata with unknown default** — absence from negative filtering is not
  proof of model support. Rejected: infer support from `unsupportedParameters` absence.
- **Defer provider maxima** — the existing limit is duplicated and provider-aware validation is a
  separate cross-cutting change. Rejected: advertise llama.cpp-specific maxima without making
  request validation consistent.
- **Validate the `topLogprobs` relationship after final settings merge** — presets, request
  settings, and provider/model defaults jointly determine whether logprobs are effective.
  Rejected: deciding inside shape-only or template-only validation (runs before all sources are
  available).
- **Ship the orphaned-`topLogprobs` error in `v0.18.0`** — all current consumers are owned and the
  existing silent omission hides a configuration mistake. Rejected: warning-only in `v0.18.0`
  followed by an error in a later release (extra migration stage without an external consumer).
- **Require full-distribution logprob evidence** — absolute and residual masses are meaningful
  only when provider probabilities are normalized before top-N truncation. Rejected: silently
  treating a renormalized top-N list as absolute evidence (produces false zero residual mass).
- **Clamp only tiny positive logprob drift** — finite values through `1e-6` become zero while
  larger positives remain invalid. Rejected: rejecting every value above zero (drops plausible
  floating-point drift) or accepting all positives (permits impossible mass).
- **Compare aggregate ambiguous mass** — the five-nat heuristic compares
  `log(ambiguousMass)` with the best aggregate label logprob so many small ambiguous branches
  cannot evade the threshold. Rejected: compare only the single largest branch hit (preserves
  origin behavior but understates cumulative ambiguity).
- **Keep prefill E2E tests single-purpose** — add a dedicated constrained-label E2E instead of
  replacing their hand-written grammar. Rejected: reusing the prefill tests (couples unrelated
  regressions).
- **Keep logprobs terminal-only in streams** — the issue concerns interpretation of final
  evidence. Rejected: a new logprob-delta event (wider adapter and partial-error contract).
- **Emit deterministic mock evidence whenever requested** — capability metadata can honestly say
  the mock supports logprobs, while requests without logprobs remain unchanged. Rejected: a
  marker-only fixture (surprising because support would depend on prompt content).
- **Add a dedicated user guide** — constrained classification combines grammar, evidence,
  probability semantics, status handling, and limitations. Rejected: scattering the workflow
  across existing reference pages (harder to follow and maintain).

## Open Questions

- None. The target version is approved as `v0.18.0`; the validation break and provider-evidence
  precondition are explicit decisions rather than unresolved assumptions.

## Resolution

Completed: 2026-08-19
Release: v0.18.0

All eight phases are complete. The implementation ships the root constrained-label API,
hardened wire mapper, explicit capability and status semantics, final merged-settings validation,
deterministic mock/service/stream coverage, packed consumer checks, and portable documentation.

Compatibility change: orphaned `topLogprobs` now fails with `INVALID_SETTINGS` after all settings
sources merge. Provider-specific maxima and exact multi-token suffix continuation remain deferred.

Final verification: 12 focused suites (375 tests), 53 full suites (1,222 tests), TypeScript build,
packed strict-TypeScript/CJS/ESM consumers, package dry run, root export smoke, production
dependency audit, and two independent strong review tracks with all findings addressed.
