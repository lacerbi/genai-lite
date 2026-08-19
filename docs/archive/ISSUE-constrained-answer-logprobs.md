# Constrained answer labels: GBNF generation and label-probability extraction

Created: 2026-08-19
Revised: 2026-08-19
Status: RESOLVED — 2026-08-19 (v0.18.0)
Package: genai-lite (v0.17.3 at filing)
Target release: v0.18.0
Related tracker: `../../ISSUE-next-steps.md`, item 12 (packaging, referenced only for placement)

## Observation

genai-lite already carries both halves of a constrained classification call, but not the
step that joins them.

**Transport is complete.** `LLMSettings.logprobs` and `LLMSettings.topLogprobs` are
validated and forwarded by the OpenAI, OpenRouter and llama.cpp adapters;
`mapOpenAIChatLogprobs` (`src/shared/adapters/logprobsUtils.ts`) normalizes the wire shape
into `TokenLogprob[]`; `LLMChoice.logprobs` delivers it. Streaming accumulates raw entries
and re-attaches them through each adapter's synthetic completion, so the same field arrives
on the terminal response, although no unit test currently asserts that end of the streaming
path. `LLMSettings.llamacpp.grammar` forwards a raw GBNF string and is mutually exclusive
with active native structured output.

**The interpretation step is missing.** A common classification-shaped call fixes a small
set of answer labels, constrains generation to those labels, reads one position, and recovers
the model's probability mass over the labels rather than only the sampled choice. Consumers
currently receive token-text alternatives and must implement label matching themselves.

The library's e2e suite already issues this request shape for two assistant-prefill tests:
`maxTokens: 1`, `temperature: 0`, reasoning disabled, `logprobs: true`,
`topLogprobs: 2`, and a hand-written yes/no grammar. The tests only assert that the sampled
logprob token matches the normalized generated content. They do not interpret the requested
distribution.

The missing extraction is worth owning centrally because it must handle:

- **Leading-space tokenization.** Tokens such as `yes` and ` yes` must credit the same label.
- **Multi-character tokens.** One tokenizer token may complete a label or only identify a
  branch of labels sharing a prefix.
- **Duplicate decoded token strings.** Distinct alternatives may decode to the same string;
  their probability mass must be combined in log space.
- **Sampled-token evidence.** The sampled token/logprob must be included when it is absent
  from `topLogprobs`, without double-counting it when already present.
- **Prefix ambiguity.** A token such as ` answer` cannot be attributed between
  `answer_one` and `answer_two` from one position alone.
- **Residual mass.** Off-label visible alternatives and unreturned top-k mass are evidence
  about answer quality and must remain visible.
- **Unsafe object keys.** Labels such as `__proto__` and `constructor` must not corrupt
  accumulators.

## Review corrections

The original reference implementation attached to this issue was reviewed independently.
The following corrections are part of the request, not optional implementation polish.

### Strict-prefix label sets are invalid

Reject any label set in which one complete label is a strict prefix of another, such as
`["a", "ab"]` or `["no", "nobody"]`. Shared non-terminal prefixes such as
`["answer_one", "answer_two"]` remain valid.

Without explicit termination-token probability, strict-prefix sets fail in two different
ways:

- A single-position extractor sees the terminal for `a` first and silently assigns all
  `a` token mass to label `a`, leaving `ab` with none.
- A trie walker credits the same `a` mass to terminal label `a` and then recurses into
  `ab`, double-counting the branch and potentially producing total mass above one.

The origin codebase rejected these sets before extraction. In genai-lite, which has no
upstream label compiler, this validation belongs at the public utility boundary.

### Multi-position suffix walking is deferred

The original request included synchronous and asynchronous suffix walkers. They are no
longer requested in this issue.

Reissuing a request from decoded prefix text may retokenize that text differently from the
original generated token path. Multiplying the first-position mass by probabilities from
that fresh request therefore cannot be described as the exact probability of the original
continuation without token-state evidence or an opaque continuation handle.

A future suffix-walk API may be added when its callback can preserve or explicitly model
the required continuation state. Until then, this issue deliberately ships only the sound
single-position interpretation.

### Trailing newline is removed from generated grammar

The generated initial grammar must not permit an optional trailing newline. A tokenizer can
emit `yes\n` as one token; that token satisfies a grammar containing `"\\n"?` but does not
match the label trie and silently loses its mass. Omitting the newline makes llama.cpp mask
that combined token and prefer the exact answer-label token.

## Request

1. **Single-position label-probability extraction.** Add
   `extractSingleTokenLabelProbs(labels, tokenLogprob, options?)`. It must return:
   - an explicit status;
   - absolute probability mass attributed to each label;
   - probability normalized conditionally over attributed labels;
   - residual mass not attributed to labels or ambiguous branches;
   - shared-prefix mass that remains ambiguous;
   - a defensive snapshot of the raw sampled token and alternatives.
2. **Answer-label GBNF generation.** Add `generateAnswerTokenGrammar(labels)`, producing
   a two-production grammar with an optional single leading ASCII space and no trailing
   newline in the accepted output.
3. **Public, hardened OpenAI-shape mapping.** Export `mapOpenAIChatLogprobs` from the root
   package only after replacing its public `any` boundary with validated `unknown` input or
   an explicit raw interface. Malformed entries must not leak invalid `TokenLogprob` values.
4. **Synthetic logprobs in `MockClientAdapter`.** Every successful mock response requested with
   `settings.logprobs === true` must emit deterministic normalized token evidence, honor
   `topLogprobs`, and make complete and terminal-stream paths testable without provider calls.
   Support must not depend on prompt markers or fixture-specific content.
5. **Logprobs capability status.** Add an optional logprobs-support field to
   `ModelCapabilities`, using the existing `supported | unsupported | unknown` vocabulary
   and provenance pattern. Positive support must come from explicit metadata, never from
   the absence of an `unsupportedParameters` exclusion.
6. **Settings consistency.** `topLogprobs` must not be silently ignored when effective
   `logprobs` is not enabled; request validation must return a clear settings error after
   preset, request, provider and model defaults have been merged. Template metadata is only
   one input to that final decision and must not be rejected in isolation when another settings
   source can enable logprobs.

Provider-specific `topLogprobs` maxima are explicitly deferred. The current 0-20 limit is
duplicated in global and template validation, and moving to provider-specific maxima requires
context-aware validation plus explicit provider/model metadata. That is a separate change.

The final-settings validation is an intentional compatibility break for `v0.18.0`: callers that
currently send `topLogprobs` without effective `logprobs: true` will receive a clear validation
error instead of having the setting silently ignored. All current consumers are owned together,
so this issue does not stage the change through a warning-only release.

## Result contract

The exact exported names may follow project naming conventions, but the public semantics must
be equivalent to the following shape:

```ts
export type SingleTokenLabelProbStatus =
  | "ok"
  | "ambiguous_prefix"
  | "missing_alternatives"
  | "no_matching_tokens"
  | "invalid_evidence";

export interface SingleTokenLabelProbExtraction {
  status: SingleTokenLabelProbStatus;
  absoluteLabelProbs: Record<string, number>;
  conditionalLabelProbs: Record<string, number>;
  residualMass: number;
  ambiguousMass: number;
  rawTokenLogprob?: TokenLogprob;
}
```

### Probability semantics

The extractor requires provider values to be natural logarithms of probabilities normalized over
the provider's complete effective candidate distribution after its constraints and sampling
transforms, but before `topLogprobs` truncation. It cannot detect a provider that renormalizes only
the returned top-N alternatives. For such evidence, `absoluteLabelProbs` and `residualMass` would
not have the semantics promised here and the extractor must not be presented as sound.

OpenAI documents per-token log probabilities with top-N truncation, and llama.cpp's OpenAI-shaped
server response takes the logarithm of its candidate probabilities. OpenRouter advertises the
same OpenAI-compatible shape but can route across upstream providers, so its absolute-mass
semantics must remain documented as route/model dependent unless independently verified.

- `absoluteLabelProbs[label]` is the absolute visible probability mass soundly attributable
  to that label within the complete effective provider distribution described above.
- `conditionalLabelProbs` normalizes only the soundly attributed label mass. It is all zero
  when no label has attributable mass.
- `ambiguousMass` is visible mass landing on a prefix shared by multiple labels.
- `residualMass` is the remaining mass, including visible off-label alternatives and mass
  omitted by top-k truncation.
- Subject to provider floating-point error, attributed absolute mass plus ambiguous mass plus
  residual mass must not exceed one.

The previous `labelProbs`/`probResidual` pairing mixed conditional and absolute probability
spaces. The split fields make that relationship explicit.

### Status semantics

- `ok`: the position provides usable label evidence. A negligible ambiguous branch may still
  be reported in `ambiguousMass` rather than distributed.
- `ambiguous_prefix`: shared-prefix mass is too large to treat the single-position read as
  usable. No uniform fallback distribution is invented.
- `missing_alternatives`: the sampled token exists but the requested top alternatives are
  absent, so a label distribution cannot be recovered reliably. Both label vectors and
  `ambiguousMass` are zero; `residualMass` is one; raw sampled evidence remains available.
- `no_matching_tokens`: alternatives exist but none intersect the label language.
- `invalid_evidence`: individually shaped entries collectively describe impossible probability
  mass. Both label vectors and `ambiguousMass` are zero; `residualMass` is one; raw evidence
  remains available for diagnosis.

The existing five-nat pruning gap may remain the default threshold for deciding whether
ambiguous mass changes `status` from `ok` to `ambiguous_prefix`. Compare the aggregate
`log(ambiguousMass)` against the best aggregate resolved-label logprob, so many individually
small branches cannot evade the threshold. The threshold is a documented heuristic, not a
correctness boundary. Ambiguous mass must be reported either way and must not be silently
normalized into labels.

## Label validation and GBNF contract

A shared validator must run before grammar generation and extraction.

Reject label sets that are:

- empty;
- duplicated by exact, case-sensitive comparison;
- composed of empty or whitespace-only labels;
- framed with leading or trailing whitespace;
- strict-prefix related;
- composed of strings containing control characters, line separators, or unpaired UTF-16
  surrogates that the generator does not safely support.

Valid Unicode labels are preserved exactly; no normalization is applied. Grammar alternatives
preserve caller order. Literal escaping must correctly handle at least `"` and `\\` after
validation.

For `generateAnswerTokenGrammar(["yes", "no"])`, the exact output is:

```gbnf
root ::= " "? answer
answer ::= "yes" | "no"
```

The function name is retained from the original request for continuity, although the grammar
constrains answer-label character sequences rather than guaranteeing one tokenizer token.

## Extraction invariants

- Use `Map` or null-prototype objects internally.
- Preserve duplicate raw alternatives in `rawTokenLogprob`.
- Aggregate duplicate decoded token strings with log-sum-exp for matching.
- If the sampled token text is absent from `topLogprobs`, add its probability to the matching
  view. If the text is already present, do not count the sampled evidence again.
- Treat negative infinity as zero mass. Clamp finite positive log probabilities no greater than
  a documented `1e-6` tolerance to zero; reject or safely exclude larger positive values,
  `NaN`, positive infinity, and non-string token text.
- Sum the complete merged visible alternative distribution before attribution. If it exceeds
  one only within a documented floating-point tolerance, scale the visible alternatives back
  to one proportionally. If it exceeds one beyond that tolerance, return `invalid_evidence`
  instead of clamping a residual while leaving overfull label mass.
- Combine bare and single-space-prefixed forms under the same label.
- A token prefix with exactly one reachable label may be attributed to that label. Keep an
  adjacent implementation comment stating that this is sound only while strict-prefix label sets
  are rejected.
- A token prefix with several reachable labels contributes to `ambiguousMass`, not directly
  to any label.
- Returned records must contain every supplied label with a numeric value, including zero.
- The utility performs no provider calls and no retrying.

## Public placement

Place the constrained-label implementation under a focused LLM module, exported from
`src/index.ts`. Do not add a package subpath in this issue: the root barrel is required for
consumers using classic `moduleResolution: node` and is sufficient for this surface.

Keep `mapOpenAIChatLogprobs` in the shared adapter utility module and re-export it from the
root after hardening. Do not move provider-wire normalization into the constrained-label
module.

## Mock and streaming coverage

Synthetic mock logprobs test settings -> preparation -> service -> normalized response ->
extraction. They do not test `mapOpenAIChatLogprobs`, because the mock constructs normalized
choices directly. The mapper therefore needs independent unit coverage.

The mock emits this evidence for every successful response whose effective settings enable
logprobs. Requests that do not enable logprobs retain the current response shape.

Real adapters already accumulate streaming logprobs and attach them to the terminal synthetic
completion. Add explicit terminal-response assertions for OpenAI, OpenRouter and llama.cpp.
Do not add a new logprob-delta stream event in this issue.

Leave the two existing llama.cpp assistant-prefill E2E tests on their hand-written grammar: their
purpose is prefill echo normalization, not constrained-label behavior. Add a separate local
llama.cpp E2E test that uses `generateAnswerTokenGrammar` and asserts an interpretable extraction
result. Live-server and paid/cloud E2E execution are not required for the default verification
run.

## Non-request

This issue deliberately does not ask for:

- synchronous or asynchronous suffix walking;
- token-state or token-id continuation APIs;
- aggregation of several samples into a posterior;
- multi-sample orchestration, adaptive stopping, or best-of-N;
- automatic request dispatch from extraction utilities;
- provider-specific `topLogprobs` maxima;
- a streaming logprob-delta event;
- export of `applyStrictSchemaConstraints`;
- a new package subpath.

## Required test coverage

### Validation and grammar

- Empty, duplicate, empty-string, whitespace-framed and strict-prefix labels are rejected.
- Shared non-terminal prefixes remain valid.
- Unsupported controls and invalid surrogates are rejected; valid Unicode is preserved.
- Quotes and backslashes are escaped correctly.
- Grammar alternatives preserve input order.
- Generated grammar permits optional leading ASCII space and no trailing newline.

### Single-position extraction

- Bare and space-prefixed alternatives combine under one label.
- Multi-character tokens that have one reachable label are attributed to that label.
- Duplicate decoded strings combine with log-sum-exp.
- The sampled token is included when absent from alternatives and not double-counted when
  already present.
- Visible off-label and unreturned mass remain residual.
- Negligible shared-prefix mass remains explicit while the result stays usable.
- Significant shared-prefix mass returns `ambiguous_prefix` without a fabricated uniform
  distribution.
- Missing top alternatives, no matching tokens, and overfull evidence produce distinct statuses
  with zero label vectors and full residual where no reliable distribution exists.
- Labels such as `__proto__` and `constructor` are safe.
- Tiny positive logprob drift is clamped; materially positive or otherwise malformed numeric
  evidence cannot produce `NaN` output.
- Fixtures distinguish full-distribution logprobs from top-N-renormalized evidence and document
  that only the former satisfies the absolute/residual contract.

### Integration

- `mapOpenAIChatLogprobs` handles absent, empty, valid and malformed OpenAI-shaped payloads.
- Mock complete and terminal-stream responses honor `logprobs` and `topLogprobs`.
- `LLMService` preserves synthetic logprobs through prepared complete and stream calls.
- OpenAI, OpenRouter and llama.cpp streaming tests assert logprobs on the terminal response.
- A dedicated llama.cpp E2E test covers generated grammar plus extraction without changing the
  existing assistant-prefill normalization tests.
- `ModelCapabilities` reports explicit supported, unsupported and unknown logprobs states
  without network or credential access.
- `topLogprobs` without effective `logprobs` fails validation instead of being omitted.
- Root imports and packed-package type checking cover the new public values and types.

## Acceptance criteria

- [x] Invalid label sets, including strict-prefix pairs, are rejected before extraction or
  grammar generation.
- [x] Strict-prefix single-position mis-attribution and trie-style double-counting are both
  covered by regression tests.
- [x] `generateAnswerTokenGrammar` emits valid escaped GBNF with optional leading space and
  no accepted trailing newline.
- [x] One position's `TokenLogprob` can be interpreted as explicit absolute label mass,
  conditional label probabilities, ambiguous mass and residual mass.
- [x] Absolute and residual mass are documented as requiring full-distribution logprobs before
  top-N truncation; OpenRouter's route-dependent semantics are not overstated.
- [x] Extraction returns a required status and never fabricates a uniform fallback vector.
- [x] Bare and space-prefixed alternatives combine under the same label.
- [x] Duplicate decoded token strings combine in log space.
- [x] Sampled-token evidence is included exactly once.
- [x] Unsafe label keys and malformed numeric evidence cannot corrupt results.
- [x] Tiny positive logprob drift is clamped to zero while materially positive values are
  rejected or excluded.
- [x] Collectively overfull probability evidence cannot produce label plus ambiguous mass above
  one; material overage returns `invalid_evidence`.
- [x] Constrained-label utilities are reachable from the package root.
- [x] `mapOpenAIChatLogprobs` has a hardened public input boundary, direct tests, and a root
  export.
- [x] `MockClientAdapter` emits deterministic synthetic logprobs for complete and terminal
  streaming integration tests.
- [x] OpenAI, OpenRouter and llama.cpp terminal streaming responses have explicit logprob
  regression coverage.
- [x] `ModelCapabilities` carries an explicit logprobs-support status; provider-specific
  maxima remain deferred.
- [x] `topLogprobs` without effective `logprobs` returns a validation error.
- [x] The intentional `v0.18.0` validation break is recorded in compatibility documentation and
  the archived resolution.
- [x] No suffix-walk API is shipped under an exact-probability claim.
- [x] User documentation and TypeScript reference cover the new contract and limitations.
- [x] The focused tests, full unit suite, TypeScript build and packed public-API verification
  pass.

## Resolution

Resolved: 2026-08-19
Release: v0.18.0

Implemented validated constrained-label grammar generation and single-position probability
extraction, hardened and exported the OpenAI-shape mapper, added deterministic mock and terminal
stream evidence, exposed explicit logprobs capability metadata, and validated the final merged
`logprobs`/`topLogprobs` relationship. The public contract separates absolute, conditional,
ambiguous, and residual mass and documents the full-distribution evidence precondition.

Compatibility change: `topLogprobs` without effective `logprobs: true` now returns an
`INVALID_SETTINGS` validation error after preset, request, provider-default, and model-default
settings are merged. Provider-specific maxima and suffix-walk orchestration remain deferred.

Verification completed with 12 focused suites (375 tests), the final full 53-suite test run
(1,222 tests), TypeScript build, packed strict-TypeScript/CJS/ESM consumers, package dry run,
root export smoke, production dependency audit, and independent review.
