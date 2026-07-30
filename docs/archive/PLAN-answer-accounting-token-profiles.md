# Plan: Answer Accounting and Token Profiles

Created: 2026-07-30
Status: COMPLETE — 2026-07-30 (v0.17.0)
Issue: [`ISSUE-answer-accounting-and-token-profiles.md`](ISSUE-answer-accounting-and-token-profiles.md)

## Implementation Tracking

### Release A: items 1, 2, 4, and 5

One release is the default; an A.1 follow-up is permitted only for the
explicit Gemini exclusion-proof contingency described in Phase 3.

- [x] Phase 1: Lock the issue contract and compatibility boundary
- [x] Phase 2: Add scope-keyed answer-accounting types and shared rules
- [x] Phase 3: Populate provider-output accounting in every built-in adapter
- [x] Phase 4: Preserve scoped accounting through service processing and streams
- [x] Phase 5: Accept empty-string message content
- [x] Phase 6: Add authoritative-revision preparation caching for llama.cpp
- [x] Phase 7: Document accounting scopes and proof-versus-sizing guidance
- [x] Phase 8: Verify, publish, and record Release A

### Release B: item 3

- [x] Phase 9: Add the generic content-profile registry
- [x] Phase 10: Add exact aliases and runtime mapping provenance
- [x] Phase 11: Preserve the certificate trust boundary
- [x] Phase 12: Add the optional local loader and self-verifying recipes
- [x] Phase 13: Integrate, document, verify, publish, and close

## Handoff / Pickup Point

Recorded: 2026-07-30
Branch: `answer-accounting-token-profiles`

**Current implementation state (supersedes the earlier pickup instructions
below):**

- Release B implementation, documentation, upstream recipe validation, and
  local llama.cpp parity checks are complete.
- Final gates pass: 47 Jest suites / 1,098 tests, TypeScript build,
  packed-consumer verification with and without the optional peer, production
  audit, package dry-run, runtime export smoke check, and Markdown link check.
- The Release B working tree is intentionally uncommitted and unreleased.
  Versioning, DCO-signed release commits, push/tag/publish, installed-version
  verification, issue closure, and archival require explicit publication
  approval. Those are the only unfinished Phase 13 steps.

**Earlier Release A handoff (historical):**

- Release A (items 1, 2, 4, and 5) is implemented, double-checked, and pushed.
  Its non-release gates pass: 43 Jest suites / 1,061 tests, TypeScript build,
  packed-consumer verification, production audit, package dry-run, and runtime
  export smoke test.
- Release A is intentionally not versioned or published. Phase 8 remains
  active only for the explicit release mutations and installed-version
  verification.
- No background process, external job, open pull request, or session-bound
  artifact is in flight. No tracked work remains only in the working tree.
- Resume implementation at **Phase 9**, the generic content-profile registry.
  Preserve the existing certified `TokenProfile` APIs and certificate boundary;
  Release B must remain tokenizer- and application-agnostic.
- Before Phase 12, revalidate the optional-peer version, Gemma immutable
  revisions, complete behavior-relevant manifests, hashes, license, and
  ordinary-text/no-specials transformation against current upstream sources.
- From a clean checkout: switch to this branch, read this plan and
  `ISSUE-answer-accounting-and-token-profiles.md`, then read the repository
  summary files required by `AGENTS.md` before starting Phase 9.

**Release execution (2026-07-30):**

- [x] Confirm branch, remote, tags, npm registry state, credentials, and the
  combined release version.
- [!] The earlier two-release publication sequence is superseded by the
  user-approved single-release amendment below.
- [x] Resolve and archive the issue and plan, then push the closure commit.

**Single-release amendment (2026-07-30):**

The user explicitly directed one combined release after both implementation
sets were complete. The release therefore contains all five issue items in one
minor version; the earlier Release A / Release B sequencing remains above as
historical implementation structure.

- [x] Commit the complete release-ready implementation with DCO sign-off.
- [x] Add and commit the separate combined-release version bump.
- [x] Run every blocking local release gate for `v0.17.0`.
- [x] Push, open the pull request, require green CI, and merge.
- [x] PR `#118` passed all checks and DCO verification and was merged as
  `7fb96fa56dd8ce1087e88533bfa9dd36b7fcf6c5`.
- [x] Repair the macOS cold-run network-dependent lazy-load test and the
  fresh-lockfile cache-key collision between parallel Node matrix jobs; the
  focused `LLMService` suite and full 47-suite/1,098-test run pass locally.
- [x] Tag the recorded merge commit and publish the GitHub `v0.17.0` release.
- [x] Verify the release; npm `genai-lite@0.17.0` was published by the user.

## Summary

Deliver the five issue items in two releases.

Release A:

- accepts structurally valid empty message content;
- adds truthful provider-output accounting without conflating it with concrete
  raw-content counts;
- adds opt-in llama.cpp preparation-state caching under an authoritative
  endpoint revision;
- documents that structural retokenization certificates are proofs, not
  capacity estimates.

Release B adds a tokenizer-agnostic content-profile system with three layers:

1. a core registry for arbitrary synchronous local tokenizer backends and exact
   provider/model aliases;
2. an optional local loader subpath with an optional pure-JS tokenizer peer;
3. self-verifying tokenizer recipes, beginning with Gemma 4 instruction-tuned
   models and extensible to selected additional families.

The design keeps three evidence classes separate:

- **hard evidence**: direct provider-output usage, exact active-server prepared
  counts, and live dispatch revalidation;
- **model evidence**: locally executed tokenizer counts whose implementation is
  not certified by genai-lite;
- **advisory policy**: identity shortcuts, empirical ratios, and application
  sizing estimates.

Missing or ambiguous evidence remains absent. No byte fallback enforces answer
usage, no response aggregate is assigned to one choice, no recipe self-test
mints a certificate, and no alias becomes a fuzzy family match.

## Confirmed Decisions

1. `providerOutput` is the correct enforcement space for a
   provider-installed output limit, including provider-counted hidden
   reasoning.
2. Concrete raw content and provider output are independent scopes and may
   coexist on one choice.
3. `rawAnswerAccounting` remains a deprecated raw-content-only compatibility
   alias. Provider usage never populates it.
4. Missing, scope-ambiguous, derived-only, aggregate-only, or impossible
   provider usage does not produce choice-level provider-output accounting.
5. Every complete response, streaming terminal, sound partial envelope, and
   separate public subcall carries the evidence available for that physical
   call. Hidden retries expose only their final public response and are not
   aggregated.
6. Gemini candidates-only usage is complete only when resolved model/request
   evidence proves provider-native thinking is excluded:
   - the model does not support provider-native thinking; or
   - the final wire request contains the provider-defined full-disable control
     and that exact model supports it.
   Omitted configuration, `includeThoughts: false`, and minimal-but-nonzero
   thinking are not exclusion proof.
7. Gemini candidates and thoughts are summed when both are known. A positive
   thoughts count overrides an exclusion hint, is included in the sum, and
   produces a contradiction diagnostic.
8. `retokenizationUpperBound()` remains unchanged. It receives no same-profile
   generation-budget `n -> n` shortcut.
9. Preparation caching is false by default and requires both
   `cachePreparationStateByEndpointRevision: true` and an authoritative
   revision provider.
10. Without the cache opt-in, current live llama.cpp state reads remain.
    Dispatch revalidation is always live and uncached.
11. The existing certified `TokenProfile`, resolution, and bounds APIs remain
    source-compatible.
12. A parallel `ContentTokenProfile` API resolves built-in exact and
    host/model-quality profiles without weakening the certified type.
13. Content-profile registration is process-global, transactional,
    startup-only, exact-match, and frozen on first content-profile read.
14. Host profiles are forced to `"model"` quality and are rejected by
    certificate code using canonical registry identity, not merely by types or
    documentation.
15. Stable profile identity is `{ id, tokenizerId, revision }`. Runtime content
    mapping revision is separate and incorporates registered aliases and
    backend provenance.
16. The loader is an explicit asynchronous initialization step. It returns a
    synchronous local backend; ordinary resolution and counting do no network,
    filesystem initialization, or subprocess work.
17. The loader is exported from `genai-lite/tokenizer-loader`. Its tokenizer
    runtime is the optional peer `@huggingface/tokenizers@^0.1.3`, loaded only
    when `loadContentTokenizerProfile()` is called.
18. Missing optional peer errors are late and actionable: they name the exact
    package/range and an install command. Core APIs, recipe imports, and type
    imports work without the peer installed.
19. Recipes bind only recipe-controlled semantics: loader kind, immutable
    artifact digests, and fixed text policy. The resolved runtime package
    version is stamped into loaded-backend provenance and therefore the runtime
    mapping revision.
20. Recipe self-tests are load-time regression evidence only. They do not
    elevate `"model"` quality or enter certificate paths.
21. Recipe coverage evidence is a documented claim surface, not an alias
    allowlist. An exact alias outside the recorded coverage is the caller's own
    equivalence assertion.
22. Release A ships independently. Release B cannot delay its value.
23. Peer-free recipe data is exported from
    `genai-lite/tokenizer-recipes`; importing that exact subpath never loads the
    optional runtime.
24. The ordinary-text/no-specials policy is part of loader-kind semantics.
    Release B ships the chosen loader only after proving a deterministic
    transformation that treats special-token-looking literals as ordinary
    text; otherwise the loader choice or contract is amended before release.
25. Bundled consumers must preserve the loader's runtime import and externalize
    `@huggingface/tokenizers`; externalizing the loader subpath itself is an
    acceptable simple configuration.
26. Exact aliases for local GGUF slugs are caller equivalence assertions. A
    mutable generic local model ID must not be aliased to one content profile
    unless its lifecycle guarantees that the tokenizer cannot change under that
    ID.

## Current External Facts to Pin

The implementation must re-check these sources at the relevant phase rather
than relying on memory:

- [Google Gemini thinking controls](https://ai.google.dev/gemini-api/docs/generate-content/thinking)
- [`@google/genai` `ThinkingConfig`](https://googleapis.github.io/js-genai/release_docs/interfaces/types.ThinkingConfig.html)
- [`@huggingface/tokenizers` package](https://www.npmjs.com/package/@huggingface/tokenizers)
- [Google Gemma 4 Apache-2.0 license](https://ai.google.dev/gemma/apache_2)
- [Gemma 4 E4B-it tokenizer](https://huggingface.co/google/gemma-4-E4B-it/blob/main/tokenizer.json)
- [Gemma 4 12B-it tokenizer](https://huggingface.co/google/gemma-4-12B-it/blob/main/tokenizer.json)
- [Gemma 4 26B-A4B-it tokenizer](https://huggingface.co/google/gemma-4-26B-A4B-it/blob/main/tokenizer.json)
- [Gemma 4 31B-it tokenizer](https://huggingface.co/google/gemma-4-31B-it/blob/main/tokenizer.json)

As checked on 2026-07-30:

- `@huggingface/tokenizers@0.1.3` is a zero-dependency pure JS/TS package,
  301,035 bytes unpacked, with CJS and ESM exports;
- its public API accepts `tokenizer.json` plus `tokenizer_config.json` and
  provides synchronous `encode()` after construction;
- `add_special_tokens: false` does not by itself disable recognition by the
  tokenizer's added-token splitters, so Phase 12 must prove a sanitized
  loader-kind transformation rather than treating that flag as sufficient;
- the peer does not export its `package.json` or runtime version through its
  public module, so provenance must resolve the installed entry and validate
  the nearest matching package manifest fail-closed;
- `@huggingface/transformers@4.2.0` is not the target because it pulls
  ONNX runtimes and image-processing dependencies;
- all four official Gemma 4 instruction-tuned `tokenizer.json` pages report
  SHA-256
  `cc8d3a0ce36466ccc1278bf987df5f71db1719b9ca6b4118264f45cb627bfe0f`;
- initial immutable revision candidates are:
  - E4B-it: `ee0ef6023621cff504d758262d4e04895a5af4a2`;
  - 12B-it: `707f0a3b8a3c7ad586ed01e27eafbad8a27dd0f7`;
  - 26B-A4B-it: `4d7ae4984b7db7de8f8457170b3f1a419ee76d52`;
  - 31B-it: `842da3794eaa0b77d5f08bae87a17459d91ff475`.

Matching current `tokenizer.json` hashes are strong preliminary evidence, not
the recipe-authoring conclusion. Phase 12 must pin every runtime input and
prove that relevant configuration and ordinary-text policy agree.

## Scope

### In scope

- The five issue items and both releases.
- Every built-in text adapter.
- Complete, streaming, retry, and partial evidence paths.
- Existing prepared-call and packed-consumer APIs.
- Generic multiple-backend content profile registration.
- Exact aliases for arbitrary provider/model tuples.
- Optional local artifact provisioning in a caller-supplied cache directory.
- First-party self-verifying recipes, starting with Gemma 4 IT.
- Publication and clean-install evidence for each release.

### Out of scope

- Application model catalogs, cache-root selection, startup UI, or alias
  policy.
- Implicit network access from registry resolution or counting.
- Fuzzy family detection in the content-profile registry.
- Bundling a 32 MB tokenizer artifact.
- Certifying host or recipe-loaded tokenizers.
- Changing retokenization certificate arithmetic.
- Empirical cross-tokenizer certificates or application sizing ratios.
- A separate tokenizer-loader npm package in Release B. The subpath may later
  become a compatibility re-export if isolation warrants another package.

## Public Contract Targets

Names may receive a final consistency pass before implementation, but semantic
changes require a plan amendment.

### Scope-keyed answer accounting

```typescript
interface LLMAnswerAccounting extends LLMRawAnswerAccounting {
  // Intentionally preserves the existing object vocabulary:
  // tokens, method, source, tokenizerId, tokenProfileRevision, reasoning.
}

interface LLMAnswerAccountingByScope {
  rawContent?: LLMAnswerAccounting;
  providerOutput?: LLMAnswerAccounting;
}

interface LLMChoice {
  answerAccounting?: LLMAnswerAccountingByScope;

  /** @deprecated Raw-content-only compatibility alias. */
  rawAnswerAccounting?: LLMRawAnswerAccounting;
}
```

Canonical keyed raw-content evidence wins if a custom adapter supplies
conflicting keyed and legacy values. Service processing mirrors the canonical
raw-content value to the deprecated field. Provider-output evidence never
appears there. The shared object remains structurally assignable to
`LLMRawAnswerAccounting`:

- `tokens: number`;
- `method: "exact" | "model" | "heuristic"`;
- `source: "provider" | "library"`;
- optional `tokenizerId` and `tokenProfileRevision`;
- `reasoning: "included_native" | "included_extracted" | "excluded" |
  "unknown"`.

No byte-derived value is valid answer accounting in either keyed scope or the
legacy field.

### Authoritative preparation cache

```typescript
interface LLMServiceOptions {
  providerEndpointRevisionProvider?: ProviderEndpointRevisionProvider;
  cachePreparationStateByEndpointRevision?: boolean;
}
```

Construction with caching enabled and no provider fails immediately. Revision
values must be live, stable for one state, and never reused for a different
model/build/template state.

### Generic content-profile registry

```typescript
interface ContentTokenProfileIdentity {
  id: string;
  tokenizerId: string;
  revision: string;
}

interface ContentTokenProfile extends ContentTokenProfileIdentity {
  quality: "exact" | "model";
  origin: "builtin" | "registered";
}

type ContentTokenProfileResolution =
  | {
      status: "available";
      provider: ApiProviderId;
      model: string;
      mappingRevision: string;
      profile: ContentTokenProfile;
    }
  | {
      status: "unavailable";
      provider: ApiProviderId;
      model: string;
      mappingRevision: string;
      reason: string;
    };

interface ContentTokenizerSemanticArtifact {
  role: string;
  sha256: string;
}

interface ContentTokenizerSemanticProvenance {
  tokenizerImplementation: string;
  textPolicy: "ordinary-text-no-specials-v1";
  artifacts: ContentTokenizerSemanticArtifact[];
}

interface ContentTokenizerRuntimeProvenance {
  packageName: string;
  packageVersion: string;
  loaderImplementationRevision: string;
}

interface ContentTokenizerBackendProvenance {
  semantic: ContentTokenizerSemanticProvenance;
  runtime?: ContentTokenizerRuntimeProvenance;
}

interface RegisteredContentTokenizerBackend {
  id: string;
  tokenizerId: string;
  /** Must equal the canonical digest of provenance.semantic. */
  revision: string;
  provenance: ContentTokenizerBackendProvenance;
  countTextTokens(text: string): number;
}

registerContentTokenProfileConfiguration({
  backends: RegisteredContentTokenizerBackend[],
  aliases: Array<{
    providerId: ApiProviderId;
    modelId: string;
    profileId: string;
  }>,
});

resolveContentTokenProfile(providerId, modelId): ContentTokenProfileResolution;
getContentTokenProfileById(profileId): ContentTokenProfile | undefined;
countContentTextTokens(text, profile): TokenCountResult;
getContentTokenProfileMappingRevision(): string;
```

The callback domain is concrete ordinary JavaScript string text:

- no BOS/EOS;
- no chat-template framing;
- no postprocessor-added special tokens;
- no special-token interpretation;
- special-looking literals encode as ordinary text.

Callbacks are synchronous, deterministic, and return nonnegative safe integer
counts. Throws and invalid returns produce unavailable evidence.

Semantic provenance is canonical, JSON-safe data rather than an arbitrary
metadata bag:

- `tokenizerImplementation` is a versioned semantic implementation key. Recipe
  loaders use their `loaderKind`; arbitrary backends provide their own
  implementation-and-revision key.
- artifact roles are nonempty, unique, and sorted before hashing; digests are
  lowercase 64-character SHA-256 values;
- the registry recomputes
  `sha256("genai-lite-content-token-profile-semantic-v1\0" + canonicalJson)`
  from `tokenizerImplementation`, `textPolicy`, and sorted artifact
  role/digest pairs, then rejects a declared `revision` that does not match;
- source URLs, repository revisions, self-tests, coverage claims, cache paths,
  callbacks, and runtime package details do not enter semantic identity;
- runtime provenance is separately validated and enters the dynamic mapping
  revision. Unknown fields, invalid strings, and noncanonical values fail
  registration.

### Optional loader and recipes

```typescript
type ContentTokenizerLoaderKind = "huggingface-tokenizer-json-v1";

interface ContentTokenizerRecipeArtifact {
  role: string;
  source: string;
  revision: string;
  sha256: string;
}

interface ContentTokenizerRecipeLoaderInput {
  artifacts: ContentTokenizerRecipeArtifact[];
}

interface ContentTokenizerRecipeSelfTest {
  name: string;
  text: string;
  expectedTokens: number;
}

interface ContentTokenizerCoverageEvidence {
  modelId: string;
  repository: string;
  revision: string;
  behaviorArtifacts: Array<{
    role: string;
    path: string;
    sha256: string;
  }>;
}

interface ContentTokenizerRecipe {
  id: string;
  tokenizerId: string;
  semanticRevision: string;
  loaderKind: ContentTokenizerLoaderKind;
  loaderInput: ContentTokenizerRecipeLoaderInput;
  textPolicy: "ordinary-text-no-specials-v1";
  selfTest: ContentTokenizerRecipeSelfTest[];
  coverageRequiredRoles: string[];
  coverageEvidence: ContentTokenizerCoverageEvidence[];
}

interface LoadContentTokenizerProfileOptions {
  cacheDir: string;
  allowDownload: boolean;
  signal?: AbortSignal;
}

loadContentTokenizerProfile(
  recipe: ContentTokenizerRecipe,
  options: LoadContentTokenizerProfileOptions
): Promise<RegisteredContentTokenizerBackend>;
```

`semanticRevision` is the validated canonical semantic-provenance digest:
`loaderKind` becomes `tokenizerImplementation`, loader-input role/digest pairs
become semantic artifacts, and the fixed text policy completes the input.
Self-tests, coverage requirements, and coverage evidence are excluded because
they are regression and applicability evidence, not tokenizer semantics. The
loader returns
`backend.revision === recipe.semanticRevision`. The resolved optional-peer
version and loader implementation revision are excluded from semantic identity
but included in backend runtime provenance and the runtime mapping revision.

Each recipe has exactly one deterministic loader-input manifest. Each coverage
entry independently lists every behavior-relevant artifact path/digest for one
verified model repository revision. A family member shares the recipe identity
only when its complete semantic manifest agrees with the loader input; a common
`tokenizer.json` hash alone is insufficient. Generic validation can enforce the
recipe's declared unique `coverageRequiredRoles`, but it cannot discover what a
repository considers behavior-relevant. First-party recipe authoring therefore
audits and tests its own expected path/role set explicitly.

## Provider-Output Accounting Matrix

Every promoted provider count uses `source: "provider"` and `method: "exact"`
in the provider's own output-budget space.

| Provider | Direct evidence | Reasoning | Promotion rule |
| --- | --- | --- | --- |
| OpenAI | `completion_tokens` | `included_native` | Promote only a direct field attributable to one physical choice. Determine cardinality from the raw response before selecting choice zero. |
| Anthropic | `output_tokens` | `included_native` | Promote direct output usage; provider output budgeting includes current-turn native thinking. |
| Gemini | `candidatesTokenCount`, optionally `thoughtsTokenCount` | `excluded` or `included_native` | Candidates alone only with resolved model/wire proof of full exclusion. Otherwise require both components. Positive thoughts override exclusion. |
| Mistral | `completionTokens` / `completion_tokens` | `unknown` | Promote the direct output field for one physical choice without claiming reasoning visibility. |
| OpenRouter | `completion_tokens` | `included_native` | Promote direct output usage except an impossible/cached zero with nonempty content or reasoning. Use raw physical choice cardinality. |
| llama.cpp | `completion_tokens` | `included_native` | Promote direct predicted-output usage before reasoning parsing on complete and terminal-stream paths. |
| Mock | none | existing raw-content classification | Keep its heuristic as raw-content evidence; do not invent provider-output usage. |

Shared rules:

- accept only nonnegative safe integers;
- retain a plausible explicit zero;
- reject zero with known nonempty generated content or reasoning;
- never substitute `total_tokens`;
- never assign response-aggregate usage when multiple physical choices exist;
- use all raw choices/candidates or observed stream indices for cardinality;
- keep normalized response `usage` behavior independent from scoped choice
  accounting.

## Release A

### Phase 1: Lock the Issue Contract and Compatibility Boundary

**Goal:** Ensure the issue describes the generic library contract now agreed.

**Work:**

1. Keep item 1 as structural empty-content validation.
2. Replace item 2's legacy-field wording with independent accounting scopes.
3. Replace item 3's model-specific registry design with the three generic
   layers while retaining Gemma 4 IT as the first recipe.
4. Record that recipe self-tests do not create certificates.
5. Record authoritative cache opt-in and live fallback.
6. Record the two-release sequence.
7. Confirm no consumer application or application-specific path, catalog,
   alias, fingerprint, or release pin appears in either record.

**Verification:**

- [x] The issue has no provider-output-to-legacy-field instruction.
- [x] The issue has no same-profile generation-budget certificate claim.
- [x] Registry and loader language is tokenizer- and application-agnostic.
- [x] Release A is independently releasable.

### Phase 2: Add Scope-Keyed Types and Shared Rules

**Files:**

- `src/llm/types.ts`
- `src/llm/clients/types.ts`
- `src/shared/adapters/usageUtils.ts` or a focused sibling
- `src/index.ts`
- colocated tests

**Steps:**

1. Add common evidence and keyed-scope types.
2. Add `answerAccounting` to `LLMChoice`, stream-observed evidence, and partial
   state.
3. Retain `LLMRawAnswerAccounting` and source assignability without renaming
   `tokens`, widening `method`/`source`, changing tokenizer provenance names, or
   changing the existing reasoning literals.
4. Implement a pure provider-output constructor.
5. Accept direct provider fields or an explicit exact component sum only.
6. Validate safe integer, unique-choice attribution, zero plausibility,
   generated evidence, and reasoning scope.
7. Accept resolved-model/prepared-request exclusion proof as an explicit input;
   never infer it from missing thoughts metadata.
8. Let positive observed reasoning usage override an exclusion hint and return a
   diagnostic with the exact included sum.
9. Keep normalized usage helpers presence-aware and behaviorally unchanged.
10. Reject byte-derived answer accounting in both keyed scopes and the legacy
    compatibility field.

**Verification:**

- [x] Public source and packed declarations compile.
- [x] A legacy-only custom adapter remains source-compatible.
- [x] Existing object literals compile unchanged and keyed entries use the same
      object vocabulary.
- [x] Missing, invalid, zero, impossible-zero, direct, summed, contradictory,
      and multiple-choice cases are covered.
- [x] No aggregate or total becomes choice accounting.

### Phase 3: Populate Every Built-In Adapter

**Files:**

- all files under `src/llm/clients/` that produce text responses
- their colocated tests
- `src/llm/clients/accountingEvidence.test.ts`
- `src/llm/config.ts` for verified Gemini disabling capability

**Steps:**

1. Read raw provider usage before or alongside normalization.
2. Attach provider-output evidence only under the matrix rules.
3. Reuse the complete mapper for synthetic streaming terminal responses.
4. Preserve raw normalized usage immediately during streaming, but promote
   choice accounting only when terminal/single-choice attribution is sound.
5. Emit terminal adapter evidence before any public event from the same chunk.
6. Preserve sound evidence in adapter-produced partial failures.
7. Build Gemini accounting from the merged accumulator because candidates and
   thoughts can arrive separately.
8. Revalidate current Gemini model capabilities against official controls:
   - `thinkingBudget: 0` is full disable only for verified compatible Gemini
     2.5 Flash/Flash-Lite models;
   - Gemini 2.5 Pro and current Gemini 3 models do not receive candidates-only
     exclusion treatment;
   - stale `canDisable` metadata or `reasoning.enabled: false` without a real
     wire disable is not evidence.
9. Preserve a positive Gemini thoughts count even when the request claimed
   exclusion and emit the diagnostic.
10. Keep Mock evidence raw-content-only.

**Verification:**

- [x] Every provider has complete and terminal-stream coverage.
- [x] llama.cpp exposes direct completion counts.
- [x] Gemini covers no-thinking models, verified wire disable, omitted/default
      thinking, cannot-disable models, component sums, missing components, and
      contradictory positive thoughts.
- [x] OpenRouter cached zero with output remains absent.
- [x] Multiple choices never receive copied aggregate usage.
- [x] Usage-before-abort survives without premature choice promotion.

**Sequencing seam:** The default Release A target includes verified
Gemini candidates-only promotion when the resolved model and final wire request
prove thinking is fully disabled. If that refinement becomes Release A's sole
schedule blocker, the conservative baseline may ship first with Gemini
`providerOutput` absent unless both candidates and thoughts are known, followed
by the exclusion-proof refinement in an A.1 release. This does not weaken or
change the public contract; the full item-2 Gemini acceptance remains unticked
until the refinement ships.

### Phase 4: Preserve Both Scopes Through LLMService

**Files:**

- `src/llm/LLMService.ts`
- prepared, streaming, retry, partial, and capabilities tests

**Steps:**

1. Canonicalize keyed and legacy raw evidence at the adapter boundary.
2. Merge accounting per scope instead of replacing the container.
3. Never let provider output overwrite raw content or vice versa.
4. Count missing raw content from a resolved profile without disturbing
   provider output.
5. Change only raw-content reasoning metadata when extracting thinking tags.
6. Preserve scoped observed evidence through complete/stream partial synthesis.
7. Do not merge output usage across hidden retry attempts.
8. Confirm that separate public subcalls naturally receive separate envelopes.

**Verification:**

- [x] Adapter raw-content evidence survives service processing.
- [x] Provider output survives profile and heuristic processing.
- [x] Both scopes coexist.
- [x] Legacy compatibility mirrors only raw content.
- [x] Complete, stream terminal, retry, and partial behavior agree.

### Phase 5: Accept Empty-String Message Content

**Files:**

- `src/llm/services/RequestValidator.ts`
- validator tests
- prepared-call tests

**Steps:**

1. Replace truthiness validation with runtime object and string checks.
2. Accept `content: ""`.
3. Preserve rejection for missing, null, non-string, or invalid role/content.
4. Verify prepare and inspect for empty system/user content, including
   llama.cpp exact prepared counting.
5. Keep provider-specific dispatch errors at adapter/dispatch time.

**Verification:**

- [x] Empty-string system, user, and assistant content passes structural
      validation.
- [x] Missing, null, non-object, and non-string messages/content still produce
      deterministic validation failures instead of throwing.
- [x] Empty or unsupported role values still fail the existing role check.
- [x] Empty-content prepare and inspect succeeds, including an exact llama.cpp
      fixture.

### Phase 6: Add Authoritative-Revision Preparation Caching

**Files:**

- `src/llm/types.ts`
- `src/llm/LLMService.ts`
- `src/llm/clients/types.ts`
- `src/llm/services/ModelResolver.ts`
- `src/llm/clients/LlamaCppClientAdapter.ts`
- model-resolver, prepared, retry, and stream tests

**Steps:**

1. Add and validate the opt-in option without changing the existing
   `ProviderEndpointRevision = string | number` contract or `Object.is`
   comparison semantics.
2. Keep false-by-default live behavior: `ModelResolver` obtains the initial
   props/models snapshot, the adapter counts the prompt, and the adapter
   re-reads props/models afterward exactly as today.
3. Add typed preparation context carrying endpoint revision, cache authority,
   and the opaque provider-state snapshot.
4. In opt-in mode, read the live revision before model resolution. Resolve one
   props/models snapshot and make both `ModelResolver` capability overlay and
   adapter preparation consume that exact object.
5. Keep `countChatCompletionInputTokens` live for every call. Replace only the
   opt-in path's post-count props/models proof with the authoritative ending
   revision read; do not use a cached snapshot as its own validity proof.
6. Read the revision again after all preparation work and reject preparation
   as stale if it is missing, changes type/value, or differs by `Object.is`.
7. Publish a cache entry only after a successful preparation with matching
   before/after revisions and a binding-bearing snapshot.
8. Key settled and in-flight entries by adapter object identity, provider ID,
   exact selected model, and revision; never key by model family.
9. Coalesce same-key snapshot reads while leaving each prompt count and ending
   revision read independent.
10. When a new revision is observed, evict older revisions for that
    adapter/provider/model. Add a small fixed LRU ceiling for distinct endpoint
    and model keys so arbitrary model IDs cannot grow the cache without bound.
11. Never cache failures, unavailable states, binding-less snapshots, or
    revisions that become stale. Remove rejected in-flight entries.
12. Clear affected settled/in-flight entries when adapter identity or provider
    configuration changes and whenever live adapter or endpoint revalidation
    rejects a prepared call as stale.
13. Keep complete and streaming dispatch revalidation live and uncached.

**Verification:**

- [x] Cache-without-authority fails fast.
- [x] Default and callback-without-cache paths remain live.
- [x] Stable revision reuses state.
- [x] Changed and mid-prepare revisions refetch/reject correctly.
- [x] Concurrent reads coalesce.
- [x] Failures do not poison the cache.
- [x] Older revisions and LRU overflow are evicted deterministically.
- [x] `ModelResolver` and adapter preparation receive the same cached snapshot.
- [x] The default path retains both its initial and post-count live reads.
- [x] Dispatch revalidation remains live on retries and streams.

### Phase 7: Document Scopes and Proof-versus-Sizing

**Files:**

- `genai-lite-docs/prepared-calls-and-accounting.md`
- `genai-lite-docs/typescript-reference.md`
- `genai-lite-docs/llm-service.md`
- `docs/dev/token-bound-certificates.md`
- README and relevant summaries

**Work:**

- Define `rawContent` and `providerOutput`.
- Explain provider-native hidden reasoning and ambiguous absence.
- Document physical-call and retry semantics.
- Document the cache authority assertion and fallback.
- State that `retokenizationUpperBound()` is proof-oriented and unsuitable for
  ordinary capacity sizing.
- Document profile identity and application estimates as advisory.
- Document `codePointBoundToTokenUpperBound()` for code-point-bounded text.

**Verification:**

- [x] User docs distinguish `rawContent` from `providerOutput` and state that
      byte-derived values never enforce answer usage.
- [x] Provider reasoning inclusion, absence, physical-call, and hidden-retry
      semantics match the implemented contract.
- [x] Cache documentation states the authority assertion, false-by-default
      behavior, and live dispatch revalidation.
- [x] Certificate documentation preserves the 384,000-token example and
      clearly separates proof bounds from sizing estimates.
- [x] Code-point-bounded text points to
      `codePointBoundToTokenUpperBound()` rather than retokenization ratios.

### Phase 8: Verify and Publish Release A

**Focused checks:**

```powershell
npm.cmd test -- RequestValidator.test.ts
npm.cmd test -- accountingEvidence.test.ts
npm.cmd test -- GeminiClientAdapter.test.ts LlamaCppClientAdapter.test.ts
npm.cmd test -- LLMService.prepared.test.ts LLMService.streaming.test.ts
```

**Full checks:**

```powershell
npm.cmd run build
npm.cmd test
npm.cmd run test:packed-api
npm.cmd audit --omit=dev --audit-level=high
npm.cmd pack --dry-run
node -e "const lib = require('./dist'); console.log('Exports:', Object.keys(lib));"
```

**Implementation verification (2026-07-30):**

- [x] Focused accounting, adapter-stream, empty-content, and cache suites pass.
- [x] TypeScript build and packed-consumer declaration check pass.
- [x] Full Jest suite passes: 43 suites, 1,061 tests.
- [x] Production dependency audit reports zero vulnerabilities.
- [x] Package dry-run and CommonJS export smoke test pass.
- [ ] Versioning, DCO-signed commit, publication, and installed-version
      verification await an explicit release request; no release mutation was
      performed as part of implementation.

**Release gate:**

1. Update package and lockfile versions.
2. Create a DCO-signed conventional commit.
3. At explicit publication approval, push, tag, publish, and create any matching
   GitHub release.
4. Verify the exact npm version from a clean consumer.
5. Record Release A in the issue without resolving item 3 or archiving records.
6. If the Phase 3 Gemini seam was invoked, record the deferred criterion
   explicitly, leave Phase 3 and item 2 incomplete, and repeat the focused/full
   release gates for A.1 before marking the Release A track complete.

## Release B

### Phase 9: Add the Generic Content-Profile Registry

- [x] Core registry, canonical provenance, content counting, and public exports
  compile; focused registry tests pass.

**Files:**

- `src/llm/tokenization/profiles.ts`
- `src/llm/tokenization/counting.ts`
- a focused internal registry module
- tokenization barrels and `src/index.ts`
- tokenization tests

**Steps:**

1. Preserve certified types/functions unchanged.
2. Add `ContentTokenProfile` and resolution types with stable identity,
   `"exact" | "model"` quality, and origin.
3. Expose built-in js-tiktoken profiles through the content registry while
   retaining their certified objects and existing certified revisions.
4. Implement an internal registry class and one process-global production
   singleton.
5. Keep callbacks and trust metadata private to the registry.
6. Validate an entire multi-backend/multi-alias configuration before one atomic
   commit.
7. Force host quality to `"model"` and reject certificate fields.
8. Add one exported canonical semantic-revision helper and use it in
   registration. Validate IDs, canonical JSON-safe semantic/runtime provenance,
   declared-versus-computed revision equality, callback synchronicity, and safe
   integer results.
9. Catch callback errors and return unavailable evidence.
10. Freeze only on the first content-profile resolution, lookup, count, or
    runtime mapping-revision read. Module import and certified bound calls do
    not freeze it.
11. Reject registration after freeze.
12. Use isolated registry instances or a non-exported reset for tests.
13. Add a content-counting overload/API without widening certificate inputs.
14. Test at least two unrelated host backends simultaneously so no family
    special case can shape the registry.

**Verification:**

- [x] Built-in exact behavior and revisions remain unchanged.
- [x] Multiple arbitrary model-quality backends coexist.
- [x] Two different declared semantic provenances cannot reuse one registered
      profile revision, and equivalent reordered artifact inputs canonicalize
      identically.
- [x] Failed batch registration commits nothing.
- [x] Import does not freeze; first content read does.
- [x] Invalid callbacks remain unavailable.
- [x] Existing packed consumers remain source-compatible.

### Phase 10: Add Exact Aliases and Runtime Mapping Provenance

**Steps:**

1. Match exact case-sensitive `(providerId, modelId)` tuples only.
2. Do not normalize GGUF slugs or infer model families.
3. Validate every target before commit.
4. Reject built-in and registered alias conflicts.
5. Compute runtime mapping revision with canonical SHA-256 over:
   - a versioned `genai-lite-content-token-mapping-v1` domain separator;
   - static built-in mapping schema revision;
   - sorted host profile identity, quality, and already-validated canonical
     semantic provenance;
   - validated runtime package name/version and loader implementation revision
     when present;
   - sorted exact aliases.
6. Exclude cache paths, callback serialization, object identity, and
   registration order.
7. Return mapping revision from content resolutions and the explicit getter.
8. Keep profile revision and mapping revision distinct.
9. Document that callers must register their full intended alias set before the
   first read; late additions require a new process.
10. Document local GGUF aliases as explicit caller equivalence assertions:
    - use an exact, lifecycle-stable local model slug;
    - do not alias a generic ID that can select different tokenizers during the
      process lifetime;
    - empirically compare representative ordinary text against the active
      server's tokenize endpoint with aligned no-BOS/no-special policy;
    - continue to prefer active-server prepared counts as hard evidence.

**Verification:**

- [x] Exact aliases may intentionally share one profile.
- [x] Different profiles and aliases remain distinct.
- [x] Near matches and case changes remain unavailable.
- [x] Registration order does not affect revision.
- [x] Any semantic provenance, resolved runtime version, or alias change affects
      mapping revision.
- [x] Mapping changes do not mutate profile semantic revision.
- [x] Paths, callback source text, object identity, and registration order do
      not affect either revision.
- [x] The local-GGUF example uses an exact stable slug, treats out-of-coverage
      equivalence as caller authority, and warns against mutable generic IDs.

### Phase 11: Preserve the Certificate Trust Boundary

**Files:**

- `src/llm/tokenization/bounds.ts`
- tokenization tests
- `docs/dev/token-bound-certificates.md`

**Steps:**

1. Keep certificate signatures restricted to existing `TokenProfile`.
2. Validate certificate profiles against canonical built-in registry identity.
3. Reject content/model profiles passed through casts.
4. Add forged-profile tests for copied rank hash, byte completeness, and
   maximum-byte fields.
5. Preserve arithmetic, overflow handling, certificate IDs, invalid-byte
   replacement reasoning, and the 384,000-token example.
6. Preserve the lack of a same-profile generation-budget shortcut.

**Verification:**

- [x] Existing certified profile and bound fixtures remain byte-for-byte stable.
- [x] Registered/model-quality content profiles are rejected at compile-time
      where possible and at runtime when passed through casts.
- [x] Forged profiles with copied rank hashes, byte-completeness flags, or
      maximum-byte values cannot enter a certificate path.
- [x] Overflow, invalid-byte replacement, certificate ID, and 384,000-token
      regression tests pass unchanged.
- [x] No same-profile generation-budget identity shortcut exists.

### Phase 12: Add Optional Loader and Self-Verifying Recipes

- [x] Revalidated `@huggingface/tokenizers@0.1.3`, Apache-2.0 licensing,
  official Gemma 4 IT repository heads, and complete file manifests on
  2026-07-30; artifact-role equivalence and self-test counts remain.
- [x] Generic loader/cache and peer-free recipe modules compile; 54 focused
  registry, certificate, loader, cache, sanitizer, and recipe tests pass.
- [x] The real Gemma 4 recipe passes offline hash and self-test verification
  against the immutable 32 MB artifact with runtime version `0.1.3`.
- [x] All six Gemma recipe counts match the active llama.cpp 12B tokenizer
  with aligned `add_special: false` / `parse_special: false` options.

**Files:**

- `package.json` and lockfile
- package `exports`
- `src/llm/tokenization/loader/` or equivalent
- `src/llm/tokenization/recipes/`
- `scripts/verify-packed-prepared-api.js` or a focused packed-loader script
- loader, cache, recipe, and integration tests

**Optional peer packaging:**

1. Add peer dependency `@huggingface/tokenizers: "^0.1.3"`.
2. Mark it optional with `peerDependenciesMeta`.
3. Add the selected resolution to development dependencies/lockfile for tests.
4. Export `genai-lite/tokenizer-loader` without importing it from the root
   barrel.
5. Export peer-free recipe values and types from
   `genai-lite/tokenizer-recipes`; that subpath must not import the loader
   subpath or optional peer.
6. Keep peer-owned types out of all public declarations so core, loader
   declarations, and recipes can be imported without the peer.
7. Dynamically import the peer only inside
   `loadContentTokenizerProfile()`.
8. Resolve the peer entry from the installed package graph before importing it.
   If and only if that direct resolution reports the requested optional package
   missing, throw a typed actionable error naming:
   - `@huggingface/tokenizers`;
   - supported range `^0.1.3`;
   - `npm install @huggingface/tokenizers@^0.1.3`.
9. Do not classify dependency failures or module-evaluation errors thrown after
   successful peer resolution as “peer missing”; preserve their cause.

**Generic loader:**

1. Make ordinary-text special-token handling the first hard implementation
   gate. `add_special_tokens: false` suppresses postprocessor insertion but does
   not disable the peer's added-token splitters.
2. Prove a deterministic in-memory sanitization of every recognition-relevant
   `tokenizer.json`/configuration field so a real Gemma special literal matches
   a reference tokenizer with `parse_special: false`. Bind that transformation
   to `huggingface-tokenizer-json-v1` and its semantic provenance. If it cannot
   be proved, stop and amend the peer or loader-kind contract before exposing
   the loader/recipe API. Any later behavior-changing sanitization edit must
   introduce a new semantic `loaderKind`; a runtime-only
   `loaderImplementationRevision` bump is not a substitute.
3. Validate recipes before filesystem or network work.
4. Accept a caller-selected cache directory and explicit download permission.
5. Address immutable artifact blobs by SHA-256.
6. Recompute SHA-256 for every blob before every parse/use, including warm-cache
   hits. A correctly named but corrupt blob is never trusted.
7. Quarantine a corrupt cached blob with a recoverable unique name. If downloads
   are allowed, fetch and verify a replacement; in reuse-only mode, fail with an
   integrity error that identifies the expected digest and quarantine result.
8. Download to a temporary file, verify the expected hash, and atomically
   publish it.
9. Coalesce/lock concurrent same-digest loads without exposing partial files or
   racing quarantine/replacement.
10. Refuse unpinned sources, hash mismatch, abort, or missing offline artifacts.
11. Initialize `Tokenizer` from the one verified role-tagged loader-input
    manifest, applying the proven no-special-recognition transformation.
12. Resolve the actual peer version fail-closed:
    - resolve the installed module entry from the loader module's package graph;
    - realpath it and walk ancestor directories to the nearest `package.json`
      whose `name` is exactly `@huggingface/tokenizers`;
    - read and validate its version against `^0.1.3`;
    - reject absent, malformed, indeterminate, or out-of-range versions.
13. Run every recipe self-test before returning a backend.
14. Return `backend.revision === recipe.semanticRevision` and stamp the resolved
    peer package/version plus a versioned loader implementation revision into
    `provenance.runtime`.
15. Close the returned synchronous callback over the initialized tokenizer.
16. Perform no filesystem, network, dynamic import, or subprocess work from
    ordinary counts.

**Recipe framework:**

1. Require exactly one deterministic loader-input manifest with unique
   role-tagged artifacts and canonicalize/validate its semantic revision.
2. Exclude self-tests and coverage evidence from semantic identity; changing
   either does not change the content profile revision.
3. Require the self-test categories:
   - ASCII and whitespace boundaries;
   - dense multilingual scripts;
   - composed and decomposed combining marks;
   - emoji and ZWJ sequences;
   - control characters including NUL;
   - literals resembling tokenizer special tokens.
4. Require nonnegative safe integer expected counts.
5. Keep self-tests out of certificate APIs and label them regression checks.
6. Require each coverage entry to name one immutable repository revision and
   role/path/digest for every behavior-relevant artifact.
7. Validate entries against the recipe's declared unique required roles. For
   each first-party recipe, maintain a recipe-specific authoring test that
   explicitly defines and audits the expected repository path/role set; do not
   claim generic code can infer repository completeness.
8. Preserve coverage evidence as documentation/provenance only.
9. Document that aliases outside coverage evidence are caller assertions.
10. Allow future loader kinds and recipes without changing the core registry.

**First Gemma 4 IT recipe:**

1. Pin immutable official revisions for E4B-it, 12B-it, 26B-A4B-it, and 31B-it.
2. Record a complete per-variant coverage manifest containing every
   behavior-relevant runtime input, not only `tokenizer.json`.
3. Select exactly one canonical loader-input manifest and prove each claimed
   variant's complete semantic manifest and fixed text policy equivalent to it.
4. Author expected self-test counts against the pinned reference tokenizer.
5. Cross-check the recipe counts against a reference implementation and
   llama.cpp `/tokenize` using aligned no-BOS/no-special options during recipe
   authoring.
6. Include a real Gemma special-token literal in the reference cross-check to
   prove ordinary-text `parse_special: false` behavior.
7. Use one semantic recipe/profile only if all four variants' complete evidence
   agrees.
8. If complete evidence differs, author separate recipes/profiles.
9. If evidence is incomplete, omit that coverage claim rather than guessing.
10. Do not ship tokenizer artifact bytes in the npm package.

**Service integration:**

1. Report loaded host profile capability as
   `contentTokenCounting: "model"`.
2. Use resolved profiles for missing `answerAccounting.rawContent`.
3. Propagate tokenizer ID and semantic profile revision.
4. Keep provider-output evidence independent.
5. Keep active llama.cpp prepared-count binding revision distinct.

**Verification:**

- [x] Root and exact `genai-lite/tokenizer-recipes` CJS/ESM imports work without
      the peer.
- [x] Isolated packed CJS `require("genai-lite/tokenizer-loader")` and ESM
      `import("genai-lite/tokenizer-loader")` succeed without the peer; only a
      subsequent loader call gives the exact late actionable error.
- [x] The same packed CJS and ESM consumers load a warm local fixture when the
      optional peer is installed and its version is resolved through hoisting.
- [x] Indeterminate/out-of-range runtime versions and unrelated module
      evaluation failures fail closed without being mislabeled as missing peer.
- [x] Hash mismatch, incomplete cache, download denial, abort, and concurrent
      load cases fail safely.
- [x] Warm-cache offline load rehashes every blob and succeeds only when intact.
- [x] A corrupt correctly named warm-cache blob is quarantined and fails
      offline; download-enabled mode replaces it only after successful rehash.
- [x] Self-test mismatch fails closed.
- [x] Adding or changing a self-test, coverage requirement, or coverage claim
      leaves semantic profile identity unchanged.
- [x] Resolved runtime version affects mapping provenance, not semantic profile
      identity.
- [x] Two unrelated synthetic recipes prove genericity.
- [x] Gemma recipe coverage is evidence-backed for all claimed variants.
- [x] No tokenizer artifact, ONNX runtime, native binding, or Transformers
      runtime is bundled or installed by genai-lite itself.

### Phase 13: Integrate, Document, Verify, Publish, and Close

- [x] Fixed two pre-existing broken portable-doc links discovered by the
  Phase 13 internal-link gate.
- [x] TypeScript build and package-content dry run pass; the package has no
  bundled tokenizer artifact or heavyweight tokenizer runtime.
- [x] Full Jest suite passes: 47 suites, 1,098 tests.
- [x] Packed CJS/ESM consumers pass with and without the optional peer,
  including loader failure discrimination and warm-cache success.
- [x] The production-dependency high-severity audit reports zero
  vulnerabilities, and the built root exports pass the runtime smoke check.
- [x] Final double-check removed host-locale dependence from canonical
  revisions, typed mid-body download aborts, tightened immutable revision-path
  validation, and added regression coverage for each edge.

**Documentation:**

- [x] Update prepared-calls/accounting docs with startup ordering:
  async load, synchronous register, then first read/freeze.
- [x] Document the generic registry and exact alias semantics.
- [x] Document certified versus exact content versus model-quality profiles.
- [x] Document semantic profile revision, resolved runtime provenance, and runtime
  mapping revision.
- [x] Document optional-peer installation and late failure.
- [x] Document bundler configuration: externalize `@huggingface/tokenizers` and
  preserve the loader's runtime import. Note that externalizing
  `genai-lite/tokenizer-loader` is a simple safe option for Vite/esbuild-style
  application bundles.
- [x] Document explicit download permission, caller-selected cache, pinned hash,
  offline reuse, and lack of network during counting.
- [x] Document recipe self-tests as regression evidence only.
- [x] Document coverage evidence and out-of-coverage aliases as caller authority.
- [x] Include a worked local-GGUF example: exact lifecycle-stable slug, explicit
  out-of-coverage alias assertion, consumer-side parity check against the local
  tokenize endpoint, and a warning not to alias a mutable generic local ID.
- [x] Add recipe-authoring guidance for future selected tokenizer families.
- [x] Update README, TypeScript reference, prompting utilities, provider
  development guide, certificate guide, and relevant summary files.

**Verification:**

- [x] Every new public type, subpath, option, error, and startup-order
      requirement appears in the TypeScript and task-oriented documentation.
- [x] Bundler guidance names the optional peer exactly and explains that the
      dynamic runtime import must remain external.
- [x] The local-GGUF example distinguishes recipe coverage from caller alias
      authority and keeps active-server counts as the hard-evidence path.
- [x] Documentation consistently labels recipe self-tests and local tokenizer
      counts as model evidence, never certificates.
- [x] Root, loader, and recipe subpath examples are checked against the packed
      package with and without the optional peer.
- [x] All internal links and copied portable-doc links resolve.

**Focused checks:**

```powershell
npm.cmd test -- tokenization.test.ts
npm.cmd test -- tokenizerLoader.test.ts
npm.cmd test -- accountingEvidence.test.ts LLMService.capabilities.test.ts
npm.cmd test -- LLMService.prepared.test.ts
```

**Full checks:**

```powershell
npm.cmd run build
npm.cmd test
npm.cmd run test:packed-api
npm.cmd audit --omit=dev --audit-level=high
npm.cmd pack --dry-run
node -e "const lib = require('./dist'); console.log('Exports:', Object.keys(lib));"
```

**Closure steps:**

1. Audit every issue criterion against tests and docs.
2. Confirm the packed core remains free of tokenizer artifacts and heavyweight
   runtimes.
3. Confirm clean consumers with and without the optional peer.
4. Version and create a release-ready DCO-signed commit.
5. At explicit publication approval, push, tag, publish, and create any matching
   GitHub release.
6. Verify the exact registry version from a clean install.
7. Record both release versions and completion date in the issue.
8. Mark the issue `RESOLVED` and this plan `COMPLETE`.
9. Tick tracking and acceptance checkboxes.
10. Move both records to `docs/archive/` and update references.
11. Commit and push the closure/archive change with DCO sign-off.

**Closure tracking:**

- [x] Issue criteria, package contents, and clean consumers are audited.
- [x] Versioning, release commits, GitHub/npm publication, final status
      changes, and archival are complete for v0.17.0.

## Cross-Cutting Testing Strategy

### Accounting

- Direct field present, absent, partial, zero, and impossible zero.
- Provider component sum, missing component, and contradictory exclusion.
- One choice versus aggregate/multiple choices.
- Complete, terminal stream, usage-before-abort, and adapter partial.
- Legacy-only, keyed-only, and conflicting custom adapters.
- Raw-content and provider-output coexistence.
- Thinking extraction changes raw-content provenance only.

### Revision cache

- Construction validation.
- Stable, changed, and mid-prepare revisions.
- Concurrent same-key preparation.
- Failed state reads.
- Shared `ModelResolver`/adapter snapshot identity.
- Default initial and post-count live reads.
- Older-revision and fixed-LRU eviction.
- Adapter/stale-revalidation invalidation.
- Authority enabled and disabled.
- Callback configured without cache.
- Live dispatch validation on complete retries and streams.

### Registry and loader

- Built-in exact profiles and rank hashes.
- Multiple unrelated host backends and recipes.
- Transactional validation and callback failures.
- Exact aliases and collision handling.
- Freeze-on-first-read.
- Stable canonical mapping digest.
- Separate semantic profile and runtime mapping revisions.
- Exact loader and recipe subpaths with the optional peer absent/present under
  packed CJS and ESM.
- Missing-peer discrimination from unrelated module failures and fail-closed
  runtime-version discovery.
- Cold download, rehashed warm offline cache, corrupt-blob quarantine/recovery,
  hash mismatch, abort, and concurrency.
- Ordinary treatment of real special-token-looking literals against a
  `parse_special: false` reference.
- Required self-test corpus and failure.
- Coverage evidence versus unrestricted exact aliases.
- Programmatic certificate exclusion and forged-profile resistance.
- Packed consumer and first real Gemma recipe.

## Risks and Mitigations

- **Legacy semantic regression:** mirror only canonical raw-content evidence.
- **Shallow merge erases a scope:** centralize per-key merge behavior.
- **Aggregate usage becomes a choice count:** require unique physical
  attribution.
- **False zero enforcement:** reject zero with known generated output.
- **Gemini undercounts thoughts:** require real exclusion proof or both
  components; positive thoughts always win.
- **Cache becomes stale:** explicit authority, bracketed revision reads, live
  dispatch validation, revision eviction, and a fixed LRU ceiling.
- **Registry contaminates tests:** isolated instances or non-public reset.
- **Host code overclaims exactness:** force `"model"` and reject canonically in
  bounds.
- **Alias changes evade fingerprints:** hash canonical aliases and runtime
  provenance.
- **Optional peer breaks core import:** no root import, no peer types in public
  declarations, and packed missing-peer tests.
- **Application bundler flattens the optional runtime:** document
  `@huggingface/tokenizers` as external and require preservation of the loader's
  runtime import; externalizing the loader subpath is the simple fallback.
- **Runtime drift changes counts:** required self-tests plus resolved-version
  provenance.
- **Selected runtime still recognizes special literals:** make a sanitized,
  reference-parity transformation the loader-kind release gate; amend the peer
  or loader contract if it cannot be proven.
- **Recipe overfits one family:** multiple synthetic backends/recipes and an
  open loader-kind schema.
- **Coverage evidence becomes enforcement:** documentation only; exact aliases
  remain caller-controlled.
- **Mutable local alias silently changes tokenizer:** use exact
  lifecycle-stable GGUF slugs, treat equivalence as caller authority, and
  validate against the active server before registration.
- **Artifact drift or supply-chain substitution:** immutable revision,
  SHA-256 verification on downloads and warm reads, corrupt-blob quarantine,
  atomic cache, and fail-closed behavior.
- **Package bloat:** use the zero-dependency optional peer and never bundle
  tokenizer artifacts or heavyweight inference runtimes.
- **Release A waits for recipes:** independent release gates and publication.

## Rollback and Checkpoints

- Keep every phase buildable and use coherent DCO-signed commits.
- Release A changes are additive; adapter population can be reverted
  independently while the container remains.
- Cache behavior can be disabled by leaving the opt-in false.
- Live no-authority state reads remain the safe fallback.
- Registry omission leaves content counting unavailable rather than guessed.
- Optional loader/recipes can be removed without changing core registry
  contracts.
- Host profiles never gain certificate access.
- Do not resolve/archive the issue until both releases pass publication gates.

## Open Questions

No architectural or product decision blocks implementation.

The exact public names shown above are the implementation target. A consistency
rename is allowed before Phase 9 code lands, but semantic changes require an
explicit plan amendment.

The Gemma revision candidates and optional-peer version must be revalidated at
Phase 12 start. A changed upstream fact updates recipe provenance; it does not
change the three-layer architecture.

---

**Please review. Edit directly if needed, then confirm to proceed.**
