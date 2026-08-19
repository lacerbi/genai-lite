# Suffix-walk resolution for shared-prefix labels, as a documented approximation

Created: 2026-08-19
Revised: 2026-08-19
Status: RESOLVED
Package: genai-lite (v0.18.0 at filing)
Target release: v0.19.0
Related: `docs/archive/ISSUE-constrained-answer-logprobs.md` (shipped in v0.18.0)

## Observation

v0.18.0 handles shared-prefix label sets correctly but leaves them unresolvable.

When a returned token lands on a trie branch reachable by several labels — ` answer` where
the set holds `answer_one` and `answer_two` — the extractor reports `ambiguous_prefix` and
accumulates the mass into `ambiguousMass` rather than inventing an attribution. That is the
right behavior, and it is a strict improvement on guessing.

But the status is a dead end. A caller holding `ambiguous_prefix` has two options: discard
the position, or resolve it by requesting the next position under a suffix grammar and
walking the trie. The library supports neither.

**Resolving it outside the library means rebuilding the library's trie.** `buildLabelTrie`,
`insertLabelForm`, `walkTrie`, `addLogprob` and `logSumExp` are all private to
`src/llm/constrainedLabels.ts`. A caller's reimplementation must reproduce
`insertLabelForm`'s bare-and-space-prefixed folding exactly, or the two code paths will
disagree about the same evidence — the primary path attributing ` yes` and `yes` to one
label while the fallback path does not, or vice versa. Two tries that must agree by
convention is the duplication this module exists to remove, and the caller's copy is the one
without the test suite.

`generateSuffixGrammar` is likewise absent, so a caller cannot even construct the follow-up
request without hand-writing GBNF that must match `escapeGbnfLiteral`'s rules.

### When this actually arises

Shared prefixes are mostly an authoring concern. Two labels sharing a leading substring is
visible by inspection, needs no tokenizer knowledge, and a well-designed static label set
simply avoids it.

The case that cannot be designed away is a **non-strict shared-prefix label set constructed at
runtime** — labels drawn from earlier model output, retrieved records, or user-supplied data, where
the strings are not known when the code is written. There, `ambiguous_prefix` dead-ends even though
the label set is valid. Strict-prefix pairs remain a separate malformed-input case: callers must
reject or transform them when validating runtime labels, and this issue deliberately keeps their
`TypeError` behavior.

### The prior decision this revisits

The original issue requested synchronous and asynchronous suffix walkers. They were deferred
on soundness grounds: reissuing a request from decoded prefix text may retokenize that text
differently from the original generated token path, so multiplying first-position mass by
probabilities from a fresh request cannot be described as the exact probability of the
original continuation.

That reasoning is accepted. It is correct, and it should not be reversed. This issue asks for
the walkers to ship **as an explicitly labelled approximation** rather than be withheld.

Three reasons.

**The sampled-path alternative does not solve aggregate ambiguity.** Reading later logprobs from
one uninterrupted constrained generation preserves the model's factorization for the one sampled
token path. It does not provide counterfactual continuations for every alternative whose decoded
mass was aggregated into a shared prefix at position 0. Exact aggregate label mass would require
branching token-state evidence or opaque continuation handles for those alternatives, not merely
more positions from one sample. Paying for longer output on every call therefore still does not
replace the fallback requested here.

**The path is already gated.** The walk is reachable only for `ambiguous_prefix`. When some label
mass is already resolved, the existing `ambiguityLogprobGap` policy suppresses negligible ambiguous
mass. When no label mass is resolved, any positive shared-prefix mass correctly remains ambiguous
and is eligible for walking. Ordinary unambiguous extraction still never enters this path.

**The module already ships an approximation of this class.** `ambiguityLogprobGap` is a
policy threshold rather than a proof, and it shipped — exposed as an option, with
`ambiguousMass` always reported so a caller can see what the threshold decided. A documented
approximation carrying a visible signal is established practice in this code. The suffix walk
is likewise explicit and cost-bounded, but it has no numerical error bound: retokenization and
decoded-text state collapse can make its continuation distribution differ arbitrarily from the
original hidden token path.

## Request

1. **Compose with the shipped single-position result.** Add synchronous and asynchronous
   resolvers rather than a second position-0 extractor:

   ```ts
   interface SuffixWalkFetchRequest {
     prefix: string;
     suffixes: readonly string[];
     grammar: string;
   }

   type SuffixTokenLogprobFetcher = (
     request: SuffixWalkFetchRequest
   ) => TokenLogprob | undefined;

   type AsyncSuffixTokenLogprobFetcher = (
     request: SuffixWalkFetchRequest
   ) => Promise<TokenLogprob | undefined>;

   interface SuffixWalkLabelProbOptions extends SingleTokenLabelProbOptions {
     maxFetches?: number;
   }

   type LabelProbResolution = "single_position" | "suffix_walk";

   type SuffixWalkTermination =
     | "not_started"
     | "complete"
     | "budget_exhausted"
     | "fetch_rejected";

   interface SuffixWalkLabelProbExtraction extends SingleTokenLabelProbExtraction {
     resolution: LabelProbResolution;
     termination: SuffixWalkTermination;
     fetchCount: number;
   }

   function resolveLabelProbsWithSuffixWalk(
     labels: readonly string[],
     initial: SingleTokenLabelProbExtraction,
     fetcher: SuffixTokenLogprobFetcher,
     options?: SuffixWalkLabelProbOptions
   ): SuffixWalkLabelProbExtraction;

   async function resolveLabelProbsWithSuffixWalkAsync(
     labels: readonly string[],
     initial: SingleTokenLabelProbExtraction,
     fetcher: AsyncSuffixTokenLogprobFetcher,
     options?: SuffixWalkLabelProbOptions
   ): Promise<SuffixWalkLabelProbExtraction>;
   ```

   The normal flow is `extractSingleTokenLabelProbs(...)` first. If the supplied result is not
   `ambiguous_prefix`, the resolver trusts that typed input and returns a defensive copy without raw
   evidence or a fetcher call, adding `resolution: "single_position"`,
   `termination: "not_started"`, and `fetchCount: 0`.

   The shipped result aggregates ambiguous mass and does not expose its private trie frontier. For an
   `ambiguous_prefix`, the resolver therefore requires `rawTokenLogprob`, re-runs the single-position
   interpretation from that snapshot with the supplied labels and current options, and uses the
   recomputed result rather than comparing it with caller-supplied public fields. It must not refetch
   position 0. If recomputation is no longer `ambiguous_prefix`—for example because the caller chose
   a different `ambiguityLogprobGap`—the resolver returns that recomputed single-position result with
   no suffix fetch. Otherwise it walks the reconstructed frontier. Missing raw evidence is the only
   caller-object validation error and throws `TypeError` before fetching.

2. **Keep one normalized evidence model.** Fetchers return `TokenLogprob`, not a text-keyed
   `Record<string, number>`. Duplicate decoded token strings, sampled-token inclusion, tiny
   positive drift, overfull evidence, and defensive snapshots must follow the same rules as
   `extractSingleTokenLabelProbs`. No lossy text-keyed flattening helper is introduced for the
   suffix path.

3. **Give the fetcher complete library-generated context.** Each request carries the exact
   decoded `prefix` to append, the still-reachable `suffixes`, and the corresponding `grammar`.
   The library owns trie filtering and grammar construction; the caller only translates this
   request into its provider call. The library itself never dispatches.

4. **Preserve exact decoded text paths until final attribution.** Bare and space-prefixed forms
   can reach the same canonical trie node but produce different reissued strings. They stay as
   separate frontier states and separate fetches, carrying their own incoming mass, until their
   resolved contributions are combined at the label level. Exact duplicate strings still combine
   in log space within one position. If different token sequences converge on the same exact
   decoded prefix and trie node while both are queued, incoming mass is combined before that state's
   first fetch because the reissued caller context and reachable suffix set are then identical. A
   state discovered only after an identical state was already processed is fetched again; v1 does
   not retain or replay successful decompositions. This deliberately models decoded-text state, not
   token identity: `TokenLogprob` carries no token IDs with which to preserve distinct hidden token
   histories.

   An empty decoded token at position 0 leaves the walk at the trie root. Its one frontier request
   uses `prefix: ""` and includes both bare and explicitly space-prefixed remaining forms in
   `suffixes` and `grammar`; it must not collapse the root to only one form family.

5. **Generate suffix grammars centrally.** Export `generateSuffixGrammar(suffixes)`, sharing the
   Unicode/control-character, duplicate, strict-prefix, and literal-escaping machinery with
   `generateAnswerTokenGrammar`. Suffixes are fragments rather than complete labels, so their
   validator must permit required leading whitespace: labels such as `"answer one"` and
   `"answer two"` can leave suffixes `" one"` and `" two"` after the prefix `"answer"`.
   The generated grammar adds no *optional* leading space; it preserves any space that is part of
   a supplied suffix exactly. Trailing-whitespace and whitespace-only suffix fragments are rejected,
   because they cannot arise from valid complete labels. The resolver supplies this grammar in
   every `SuffixWalkFetchRequest`.

6. **Document the approximation and expose provenance.** `status` continues to describe the
   probability outcome. `resolution` says whether suffix fetching occurred, and `termination`
   says whether the walk completed. JSDoc and the user guide must state that a reissued decoded
   prefix may tokenize differently from the original generated path and that duplicate or converged
   decoded strings can collapse distinct hidden token histories. Suffix-walk products are therefore
   decoded-text-state approximations, not the model's exact original continuation probabilities,
   and carry no numerical error bound.

7. **Bound fetch cost and guarantee progress.** `maxFetches` is a finite positive-integer global
   budget across all frontier paths, with a documented default of 8. Frontier states are processed
   sequentially and deterministically in descending incoming-mass order so a limited budget resolves
   the most consequential evidence first. Equal-mass states retain stable discovery order through a
   monotonic internal sequence number. A returned token must consume at least one remaining label
   character; evidence with no positive-mass advancing candidate terminates as `fetch_rejected`
   rather than looping.

   On budget exhaustion, the current state and every queued state retain their incoming mass as
   unresolved `ambiguousMass`; `termination` is `budget_exhausted`. `fetchCount` records completed
   callback invocations in the returned result, is zero on the single-position short circuit, counts
   a callback whose returned evidence is rejected, and never exceeds `maxFetches`. A fetcher that
   throws or rejects produces no result, so no `fetchCount` is returned for that failed invocation.
   Dynamic reprioritization occurs after each committed response, so the walk can serialize up to
   eight round trips by default. Bounded concurrency is deliberately out of scope for v1 because it
   would preselect work before prior responses can update frontier priorities.

8. **Separate malformed evidence from operational failure.** Suffix positions use the shipped
   evidence-preparation policy: malformed entries are filtered while valid entries remain, duplicate
   strings combine in log space, and the sampled token is restored exactly once. If a fetcher returns
   undefined, empty alternatives, no valid prepared entries, materially overfull evidence, or no
   positive-mass token that can advance the current suffix set, the current fetch is discarded
   transactionally and the walk stops with `termination: "fetch_rejected"`. Mass already resolved
   by earlier fetches remains attributed; the current and queued incoming mass remains ambiguous; no
   mass disappears. If the fetcher itself throws or rejects, that operational error propagates
   unchanged so caller-owned retry and error handling remain possible.

9. **Restate all mass fields after walking.** Recomputed position-0 resolved label and residual mass
   are retained.
   For an incoming frontier mass `m`, private full-distribution label, ambiguous, and residual shares
   from the suffix position are multiplied by `m`. The label shares are equivalent to local
   `absoluteLabelProbs`, not the public recognized-label-only `conditionalLabelProbs`; the latter is
   computed only once during final result materialization. Further ambiguous shares remain separate
   text-path frontier states. At completion or early termination:

   - `absoluteLabelProbs` contains initial plus suffix-resolved absolute label mass;
   - `conditionalLabelProbs` renormalizes over the final attributed label mass only;
   - `ambiguousMass` contains all still-unresolved frontier mass;
   - `residualMass` contains initial residual plus suffix-level unrecognized or truncated mass;
   - absolute label mass, ambiguous mass, and residual mass sum to one within the existing epsilon.

   The existing ambiguity-gap policy is applied to the final aggregate masses. A result can therefore
   have `status: "ok"` with visible low ambiguous mass while `termination` separately records an
   incomplete walk. `termination: "complete"` means no visible frontier remains; truncated or
   off-label suffix mass may still be present in `residualMass`. The inherited `rawTokenLogprob`
   remains the position-0 diagnostic snapshot; the result does not retain a suffix-evidence
   transcript.

10. **Keep strict-prefix rejection unchanged.** Strict-prefix sets stay a `TypeError`. Shared
    prefixes are what the walk serves; strict prefixes remain malformed input.

## Non-request

- **No dispatch from inside the library.** The fetcher stays injected. No provider/LLM transport
  request construction, retry, provider awareness, or SDK dependency is added; constructing the
  provider-agnostic `SuffixWalkFetchRequest` is the library's intended boundary.
- **No swallowed fetcher failures.** Operational exceptions and rejected promises remain caller
  errors; only returned evidence is interpreted as probability input.
- **No multi-position sequence extraction.** Later logprobs from one uninterrupted generation
  preserve only the sampled path; they do not resolve counterfactual continuations for aggregate
  ambiguous alternatives and are deliberately not requested here.
- **No token-id, token-state, or opaque continuation API.** Those could make the walk exact but would
  widen the evidence contract considerably. The injected fetcher can be upgraded later without
  changing the library into an orchestrator.
- **No text-keyed evidence API.** `Record<string, number>` would collapse duplicate decoded tokens
  and omit sampled-token evidence, repeating defects fixed in v0.18.0.
- **No change to the single-position contract.** `extractSingleTokenLabelProbs`, its validation and
  probability spaces, and its existing statuses remain as shipped. The resolver returns a separate
  extended result carrying `resolution`, `termination`, and `fetchCount`.
- **No concurrent frontier fetching.** Sequential processing preserves dynamic highest-mass-first
  reprioritization after every committed response. A future concurrency design would need a distinct
  scheduling contract.
- **No post-fetch decomposition cache.** Identical queued states merge before their first fetch, but
  v1 accepts an uncommon redundant callback when the same state converges only after processing.
- **No runtime certification of typed pass-through results.** Non-ambiguous public fields are trusted
  and copied; ambiguous public fields are replaced by recomputation from raw evidence.

## Acceptance criteria

- [x] A caller can pass an `ambiguous_prefix` result to a supported synchronous or asynchronous
  resolver without reconstructing a trie or refetching position 0.
- [x] Both fetcher variants receive `{ prefix, suffixes, grammar }`, return normalized
  `TokenLogprob` evidence, and never cause the library to dispatch on its own.
- [x] A non-ambiguous initial extraction performs zero fetches and returns
  `resolution: "single_position"`, `termination: "not_started"`, and `fetchCount: 0`.
- [x] A non-ambiguous result without raw evidence short-circuits with a defensive copy, while an
  `ambiguous_prefix` result requires raw evidence and otherwise throws `TypeError` before fetching.
- [x] The non-ambiguous fast path intentionally does not reconcile public fields with supplied labels
  or current options; JSDoc and the guide identify it as trusted typed pass-through rather than
  runtime certification.
- [x] Ambiguous input is recomputed from raw evidence under the supplied labels and current options;
  if recomputation is non-ambiguous, it returns as a zero-fetch single-position result.
- [x] `generateSuffixGrammar` is exported, shares base validation and literal escaping with
  `generateAnswerTokenGrammar`, omits the optional leading space, and preserves required leading
  spaces inside suffix fragments.
- [x] Bare and space-prefixed initial paths remain separate fetch prefixes and combine only at final
  label attribution; exact duplicate strings still combine in log space.
- [x] Sampled-token evidence absent from alternatives is included exactly once at every suffix
  position.
- [x] `resolution` distinguishes position-0 results from suffix-walk results, while `termination`
  distinguishes complete, budget-exhausted, and fetch-rejected walks without multiplying status
  values.
- [x] `fetchCount` reports callback cost for every returned result, including rejected evidence, and
  the default eight-fetch and caller-supplied budgets are enforced globally.
- [x] Highest-mass frontier states run sequentially with stable discovery-order ties and dynamic
  reprioritization, and no-progress evidence cannot loop.
- [x] Frontier states with the same exact decoded prefix and trie node merge before fetching, while
  bare and space-prefixed prefixes remain distinct.
- [x] An all-ambiguous initial result walks even when no label has position-0 mass, and an empty
  position-0 token produces one root request containing both bare and space-prefixed remaining forms.
- [x] Returned malformed evidence preserves resolved mass and leaves current plus queued frontier
  mass ambiguous; a thrown or rejected fetcher error propagates unchanged.
- [x] Mixed suffix evidence filters malformed individual entries while retaining valid advancing
  entries, matching position-0 preparation semantics.
- [x] After complete, partial, budget-exhausted, and fetch-rejected walks, absolute label,
  ambiguous, and residual mass sum to one within the existing epsilon and conditional probabilities
  renormalize over attributed labels only.
- [x] JSDoc and the user guide explain the decoded-prefix retokenization limitation and identify the
  result as a decoded-text-state approximation with no numerical error bound.
- [x] Every new public function, callback type, interface, option, and result field has JSDoc.
- [x] Strict-prefix label sets continue to throw.
- [x] Root exports and packed TypeScript/CJS/ESM consumer checks cover the new functions and types.
- [x] The focused tests, full unit suite, TypeScript build, and packed public-API verification pass.

## Resolution

Status: RESOLVED — 2026-08-19, shipped in v0.19.0.

`src/llm/constrainedLabels.ts` now owns the single-position extractor and a bounded suffix-walk
resolver behind one shared interpretation core. Public additions, all exported from the package
root: `generateSuffixGrammar`, `resolveLabelProbsWithSuffixWalk`,
`resolveLabelProbsWithSuffixWalkAsync`, `SuffixWalkFetchRequest`, `SuffixTokenLogprobFetcher`,
`AsyncSuffixTokenLogprobFetcher`, `SuffixWalkLabelProbOptions`, `SuffixWalkLabelProbExtraction`,
`LabelProbResolution`, and `SuffixWalkTermination`.

The shipped contract matches the request above:

- **Approximation, stated as such.** Suffix products are decoded-text-state estimates with no
  numerical error bound. Retokenization of a reissued decoded prefix and collapsed token identity
  are documented in JSDoc and in
  `genai-lite-docs/constrained-answer-labels.md#resolving-shared-prefixes-suffix-walk`.
- **No dispatch.** The library builds `{ prefix, suffixes, grammar }` and calls an injected
  caller-owned fetcher. No transport, retry, provider awareness, or SDK dependency was added.
- **Composition, not a second extractor.** Non-`ambiguous_prefix` input is trusted typed
  pass-through (deep copy, zero fetches, no field reconciliation). `ambiguous_prefix` input requires
  `rawTokenLogprob`, is recomputed from that snapshot under the supplied labels and current options,
  and short-circuits when recomputation is no longer ambiguous. Position 0 is never re-fetched.
- **One evidence model.** Suffix positions reuse the position-0 preparation rules: duplicate decoded
  strings combine in log space, an absent sampled token is restored exactly once, malformed entries
  are filtered while valid entries survive, and overfull evidence is rejected.
- **Exact decoded text paths.** Bare and space-prefixed branches stay distinct; only identical
  queued prefix/node states merge; a state that converges after processing is fetched again.
- **Bounded, ordered, transactional.** A global `maxFetches` budget defaults to 8, states run
  sequentially highest-mass-first with stable discovery-order ties and dynamic reprioritization,
  non-advancing evidence terminates as `fetch_rejected` rather than looping, and a rejected fetch is
  discarded whole while committed mass survives. Thrown or rejected fetcher errors propagate
  unchanged.
- **Restated mass.** Absolute, ambiguous, and residual mass sum to one within the existing epsilon
  after complete, budget-exhausted, and fetch-rejected walks; conditional probabilities renormalize
  over attributed labels only; the aggregate ambiguity-gap policy is reapplied at the end.
- **Unchanged elsewhere.** `extractSingleTokenLabelProbs` and `generateAnswerTokenGrammar` keep
  their v0.18.0 behavior and byte-identical grammar output. Strict-prefix label sets still throw.

Verification: 106 focused constrained-label tests (36 existing, 70 new in
`src/llm/constrainedLabels.suffixWalk.test.ts`, covering 98.73% of statements and 97.02% of branches
in `constrainedLabels.ts`; the four uncovered lines are unreachable defensive guards), the full unit
suite at 54 suites / 1292 tests, the
TypeScript build, `npm run test:packed-api` (strict Node16 TS consumer plus CJS and ESM runtime
checks of the resolvers against the installed tarball), `npm audit --omit=dev --audit-level=high`
with 0 vulnerabilities, and `npm pack --dry-run` producing `genai-lite-0.19.0.tgz`. No live or paid
provider E2E suite was run.
