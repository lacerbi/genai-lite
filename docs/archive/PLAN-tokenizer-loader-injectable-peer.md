# Plan: Tokenizer Loader Injectable Peer

Created: 2026-08-05

Status: COMPLETE — 2026-08-05 (v0.17.2)

Approved: 2026-08-05

Issue: [ISSUE-tokenizer-loader-injectable-peer.md](ISSUE-tokenizer-loader-injectable-peer.md)

Target: genai-lite 0.17.2

## Summary

Make the optional content-tokenizer loader safe to inline into an Electron/Rollup
ESM main bundle by accepting a caller-injected `@huggingface/tokenizers` runtime,
while preserving the existing installed-peer path. Refactor built-in
js-tiktoken profiles to use statically visible lazy rank loads and the lite
runtime, then make every built-in load/count failure fail closed as unavailable
evidence rather than escaping into model selection or response processing.

The work also removes the second eager full-js-tiktoken evaluation path in the
legacy prompting utility. It verifies the exact consumer scenario with a real
packed Rollup build, but does not claim to remove js-tiktoken from npm's
installed dependency graph or to provide universal bundle-size guarantees.

## Complexity

Moderate and cross-cutting. The implementation changes a public options type,
optional-peer provenance, certificate-adjacent rank loading, the legacy token
counting wrapper, package verification, CI, and user/developer documentation.

## Confirmed Current State

- `genai-lite/tokenizer-loader` imports semantic-revision computation through
  `contentProfiles.ts`, which imports `profiles.ts`; `profiles.ts` eagerly
  evaluates the full `js-tiktoken` entry and `base64-js`.
- The root package has a second eager full-js-tiktoken value import in
  `src/prompting/content.ts`, independent of the loader chain.
- TypeScript's CommonJS output turns the loader's variable dynamic import into
  a computed `require`, and the two rank specifiers are also hidden behind a
  computed `require(moduleId)`.
- A simulated `o200k_base` rank-load failure escapes from
  `resolveTokenProfile("openai", "gpt-5.1")` today.
- `LLMService` already has the desired downstream degradation shape:
  unavailable content-profile resolution becomes
  `contentTokenCounting: "unavailable"`, and unavailable answer counting is
  omitted.
- The archived v0.17.0 plan deliberately accepted loader externalization as a
  bundler fallback. This plan supersedes only that limitation; it preserves the
  recipe, provenance, model-quality, and certificate trust boundaries.
- `js-tiktoken@1.0.21` remains an exact production dependency. Its installed
  package is approximately 21.4 MiB, and this plan does not change that fact.

## Public Contract Decision

Keep all existing calls source-compatible and add one optional grouped field:

```typescript
interface ContentTokenizerRuntimeModule {
  readonly Tokenizer: unknown;
}

interface ContentTokenizerPeer {
  readonly module: ContentTokenizerRuntimeModule;
  readonly packageVersion: string;
}

interface LoadContentTokenizerProfileOptions {
  cacheDir: string;
  allowDownload: boolean;
  signal?: AbortSignal;
  tokenizersPeer?: ContentTokenizerPeer;
}
```

The exact structural spelling may be tightened during implementation only if a
packed TypeScript consumer proves that `import * as tokenizersModule from
"@huggingface/tokenizers"` remains directly assignable without a cast. Public
declarations must not import peer-owned types.

Contract rules:

1. Omitting `tokenizersPeer` retains automatic installed-peer discovery,
   nearest-manifest version validation, late missing-peer errors, and current
   CJS/ESM behavior.
2. Supplying `tokenizersPeer` bypasses `createRequire(__filename)`, installed
   module resolution, and package-manifest discovery.
3. `packageVersion` on an injected peer is explicitly caller-asserted because a
   bundled namespace has no authoritative installed package path. It is still
   validated against `^0.1.3` and stamped into runtime provenance.
4. An unsupported or indeterminate asserted version produces
   `TOKENIZER_PEER_VERSION_UNSUPPORTED`; a malformed module or failing module
   constructor produces `TOKENIZER_LOAD_FAILED`.
5. Abort and recipe/options validation continue to happen before peer,
   filesystem, or network work.
6. Exact-key validation remains strict for the top-level options and injected
   peer object, including every combination of `signal` and `tokenizersPeer`.
7. Existing `LoadContentTokenizerProfileOptions` exports from
   `genai-lite/tokenizer-recipes` remain available. The new peer/module types
   and the options type are also re-exported from
   `genai-lite/tokenizer-loader` for discoverability.

## Behavioral Invariants

- Built-in profile IDs, rank hashes, tokenizer IDs, profile revisions, and
  `TOKEN_PROFILE_MAPPING_REVISION` do not change if parity tests pass.
- The exact/model/certificate trust distinction does not change. Injected
  recipe backends remain model-quality and cannot enter certificate APIs.
- Rank module load, module shape, hash, or byte-completeness failure makes the
  corresponding built-in profile unavailable and is cached as such.
- The js-tiktoken lite runtime is loaded only when a built-in tiktoken profile
  is resolved or counted, not when the package root, prompting utilities, or
  tokenizer-loader subpath is imported.
- Immediately after structural validation, rank data is copied into a canonical
  defensive snapshot: primitive fields are copied, `special_tokens` is cloned
  and frozen, and the outer object is frozen. Hashing, property derivation, and
  counting use that cached snapshot, never the rank module's shared mutable
  export.
- Tokenizer construction or encoding failure returns an unavailable
  `TokenCountResult`; it does not throw across the public evidence boundary.
- `resolveTokenProfile`, `resolveContentTokenProfile`, capability inspection,
  certified bounds, and response accounting remain non-throwing when a built-in
  tokenizer is unavailable.
- Exact/certified APIs never silently manufacture a heuristic estimate.
  `estimateTextTokens()` remains explicit, while legacy `countTokens()` keeps
  its documented numeric heuristic fallback.
- `cl100k_base` and `o200k_base` remain reserved built-in IDs even when their
  artifacts or runtime are unavailable.
- Ordinary synchronous counting performs no filesystem, network, dynamic
  import, or peer-resolution work after a recipe backend is returned.

## Scope

- **In scope**:
  - Injectable optional-peer module plus validated caller-asserted version.
  - A rank-free semantic-revision dependency boundary for the loader subpath.
  - Literal lazy cl100k/o200k rank loads and lazy `js-tiktoken/lite` use.
  - Root-import runtime laziness for the legacy prompting `countTokens` module.
  - Guarded rank/runtime/count failure paths and unconditional built-in ID
    reservation.
  - Unit, service, packed-consumer, and actual Rollup regression coverage.
  - CI, public documentation, certificate-maintenance notes, summaries, issue
    resolution, and v0.17.2 release metadata.
- **Out of scope**:
  - Removing, optionalizing, or changing the exact version of the
    `js-tiktoken` production dependency.
  - Guaranteeing that arbitrary bundlers omit all lazy modules or rank bytes
    from their output; the guaranteed outcomes are static analyzability,
    non-throwing execution, and measured module-evaluation behavior.
  - Adding dual ESM/CJS package output or changing the package export format.
  - Adding tokenizer families, aliases, recipes, or certificate profiles.
  - Changing structural certificate arithmetic or heuristic estimation.
  - Publishing to npm, pushing commits/tags, or creating a GitHub release
    without separate explicit authorization.

## Phases

### Phase 1: Freeze Acceptance Criteria and Separate Semantic Identity

**Goal**: Establish a rank-free loader dependency boundary and turn the four
issue asks into testable acceptance criteria before behavior changes.

**Files**:

- `ISSUE-tokenizer-loader-injectable-peer.md`
- `src/llm/tokenization/contentProfiles.ts`
- `src/llm/tokenization/contentProfileIdentity.ts` (new)
- `src/llm/tokenization/index.ts`
- `src/llm/tokenization/loader/index.ts`
- `src/llm/tokenization/recipes/gemma4.ts`
- `src/llm/tokenization/recipes/recipes.test.ts`
- `src/index.ts`

**Work**:

- [x] Add an acceptance checklist to the issue covering injected loading, import
  laziness, statically visible rank modules, graceful unavailability, packed
  types, and Rollup execution.
- [x] Extract semantic-provenance canonicalization and
  `computeContentTokenizerSemanticRevision()` into a small internal module that
  imports only Node crypto and tokenization types.
- [x] Import that helper directly from the loader and built-in recipe so neither the
  loader nor recipes subpath traverses `contentProfiles.ts -> profiles.ts`.
- [x] Preserve the current root export name and behavior. Existing internal imports
  may be redirected or compatibly re-exported; no public import changes.

**Steps**:

1. Move the semantic domain separator, canonicalization, stable ordering, and
   digest computation without changing the canonical JSON input.
2. Keep runtime-provenance and registry-state validation in
   `contentProfiles.ts`.
3. Update the tokenization barrel, loader, and built-in recipe imports to the
   rank-free module.
4. Run existing semantic-revision fixtures before continuing; every digest must
   remain byte-for-byte identical.

**Verification**:

- [x] Existing semantic revision and mapping revision fixtures are unchanged.
- [x] Importing the loader or recipes subpath has no dependency edge to
  `profiles.ts`.
- [x] Root and subpath public exports remain source-compatible.
- [x] The issue contains concrete, checkable acceptance criteria.

### Phase 2: Make Built-In Profiles Lazy, Static, and Fail-Closed

**Goal**: Remove computed rank loading and the eager full-js-tiktoken import
while retaining exact counts and certificate identities.

**Files**:

- `src/llm/tokenization/profiles.ts`
- `src/llm/tokenization/bounds.ts`
- `src/llm/tokenization/profiles.failure.test.ts` (new)
- `src/llm/tokenization/tokenization.test.ts`
- `src/llm/tokenization/contentProfiles.ts`
- `src/llm/tokenization/contentProfiles.test.ts`

**Work**:

- [x] Replace `loadRankData(moduleId)` with two functions containing literal
  synchronous requires for:
  - `js-tiktoken/ranks/cl100k_base`
  - `js-tiktoken/ranks/o200k_base`
- [x] Replace the full `js-tiktoken` value import with a type-only lite import and a
  literal lazy `require("js-tiktoken/lite")`.
- [x] Instantiate `Tiktoken` from the verified cached rank snapshot instead of
  calling `getEncoding()`, which embeds every rank family through the full
  entry.
- [x] Validate loaded rank/module shapes before property access. Catch require,
  evaluation, hash, byte-property, lite-runtime, constructor, and encode
  failures at the lowest boundary that can return unavailable evidence.
- [x] Copy verified rank fields into an immutable canonical snapshot before caching
  them, so later mutation of a shared rank-module export cannot change counts
  covered by the verified hash/certificate identity.
- [x] Cache successful profiles, verified rank snapshots, tokenizer instances, and
  terminal profile-unavailable results without conflating profile verification
  with an individual text-count failure.
- [x] Generalize failure reasons so a load/evaluation failure is not falsely
  described only as a hash mismatch; do not expose filesystem paths or raw
  bundler internals in the stable public reason.
- [x] Reserve built-in IDs by identity rather than by successful profile loading.
  Alias validation may still require an available built-in target, preserving
  the current transactional contract.
- [x] Add isolated failure, mutation, and lite-runtime regressions.

**Steps**:

1. Introduce one internal built-in-ID predicate/set shared by profile and
   registry validation.
2. Add literal rank thunks and a safe CommonJS/default-export unwrapping check.
3. Verify rank data, make and freeze its defensive snapshot, and cache that
   snapshot before publishing a frozen `TokenProfile`.
4. Add lazy lite-runtime construction from that exact cached object.
5. Guard resolution, count, and certificate revalidation callers so failures
   return their existing unavailable shapes.
6. Compare the new lite construction against `getEncoding()` on empty, ASCII,
   multilingual, combining-mark, emoji/ZWJ, control, special-literal, lone
   surrogate, and long-text fixtures.

**Verification**:

- [x] Both built-in hashes, revisions, maximum decoded byte values, and existing
  exact token counts are unchanged.
- [x] Each rank require has a literal statically analyzable specifier.
- [x] A mocked rank require/evaluation/shape/hash failure never throws from
  profile, content-profile, bound, or capability APIs.
- [x] A mocked lite constructor or encode failure returns unavailable count
  evidence.
- [x] Repeated reads after terminal rank failure remain non-throwing and do not
  retry module evaluation.
- [x] Mutating a rank module's exported object after first resolution cannot
  alter subsequent counts or the cached verified snapshot.
- [x] A registered backend cannot claim either built-in ID during rank failure.
- [x] No heuristic count appears in an exact/certificate failure result.

### Phase 3: Remove the Independent Eager Root Import

**Goal**: Make importing `genai-lite` and prompting utilities avoid evaluating
the full js-tiktoken entry while preserving the legacy numeric API.

**Files**:

- `src/prompting/content.ts`
- `src/prompting/content.test.ts`
- `src/prompting/index.ts`
- `src/index.ts`

**Work**:

- [x] Convert `Tiktoken`/`TiktokenModel` imports to type-only imports where needed.
- [x] Route mapped cl100k/o200k OpenAI models through the built-in profile layer
  without first loading the full js-tiktoken model-mapping entry.
- [x] Load the full `js-tiktoken` entry through one literal synchronous lazy require
  only for legacy models not covered by the verified profiles.
- [x] Preserve `countTokens()`'s empty-string behavior, supported legacy models,
  tokenizer caching, and catch-to-heuristic numeric fallback.

**Steps**:

1. Add an internal lazy accessor for the legacy js-tiktoken module.
2. Attempt the verified built-in model mapping first.
3. Fall back to the legacy module only when the built-in mapping is absent or
   exact counting is unavailable.
4. Extend content tests to distinguish exact mapped behavior, legacy exact
   behavior, and invalid-model heuristic fallback.

**Verification**:

- [x] Requiring the package root or prompting subpath does not add
  `js-tiktoken` to Node's module cache. Prompting, recipes, and loader subpaths
  also avoid `base64-js`; the root's unrelated Google SDK edge is recorded and
  must not be mistaken for the tiktoken chain.
- [x] Resolving/counting a mapped built-in loads only the relevant rank plus the
  lite runtime, not `js-tiktoken/dist/index.cjs` or unrelated ranks.
- [x] A legacy non-cl100k/o200k model still uses js-tiktoken exact counting.
- [x] Invalid models retain `Math.ceil(text.length / 4)` fallback behavior.

### Phase 4: Add the Injectable Peer Path

**Goal**: Allow a statically imported peer namespace to be supplied without any
loader-owned path or module resolution.

**Files**:

- `src/llm/tokenization/recipes/types.ts`
- `src/llm/tokenization/recipes/index.ts`
- `src/llm/tokenization/loader/index.ts`
- `src/llm/tokenization/loader/tokenizerLoader.test.ts`

**Work**:

- [x] Add genai-lite-owned structural peer/module types and the optional
  `tokenizersPeer` field without referencing optional-peer declarations.
- [x] Re-export loader-facing types from the loader subpath while retaining current
  recipe-subpath type exports.
- [x] Split peer handling into shared validation plus two resolution modes:
  installed discovery and caller injection.
- [x] Validate the injected peer before artifact provisioning and initialize the
  tokenizer through the same sanitize/self-test/backend path as the discovered
  peer.
- [x] Keep runtime provenance `{ packageName: "@huggingface/tokenizers",
  packageVersion, loaderImplementationRevision }`; document that only the
  injected version's source is caller assertion rather than manifest proof.

**Steps**:

1. Define the additive types with JSDoc describing trust and bundling use.
2. Replace enumerated optional-key combinations with strict validation that is
   maintainable for both optional fields and still rejects unknown keys.
3. Add `resolveInjectedPeer()` and retain `resolveInstalledPeer()` as the
   default.
4. Reuse version-range and module-shape validation in both paths.
5. Verify abort-before-work ordering for the injected path.

**Verification**:

- [x] Every pre-existing options object remains valid without modification.
- [x] A supported injected peer loads a warm recipe, passes self-tests, returns
  a synchronous backend, and stamps the asserted version.
- [x] Injection succeeds in an environment where the peer cannot be resolved
  from the loader package location.
- [x] Unsupported/indeterminate asserted versions and malformed modules map to
  the existing precise loader error codes.
- [x] The default missing/present/unsupported/evaluation-failure cases retain
  their current codes and actionable messages.
- [x] Abort, recipe validation, cache integrity, download, and concurrency
  guarantees remain unchanged.

### Phase 5: Verify Service Degradation and Packed Bundling

**Goal**: Reproduce the consumer's failure in automation and prove the fixed
package works without consumer-specific dynamic-require configuration.

**Files**:

- `src/llm/LLMService.contentProfiles.test.ts`
- `src/llm/LLMService.contentProfiles.failure.test.ts` (new)
- `scripts/verify-packed-prepared-api.js`
- `.github/workflows/ci.yml`
- `package.json` only if a clearer verification script name is needed

**Work**:

- [x] Add an isolated service regression where o200k rank loading fails before
  module import. Capability inspection must resolve with unavailable content
  counting, and response processing must omit library-generated raw-content
  accounting rather than reject.
- [x] Keep a peer-free TypeScript fixture and typecheck it before installing the
  optional peer. After installation, typecheck a separate injected-peer fixture
  that passes an actual `import * as tokenizersModule` namespace to
  `tokenizersPeer` without a cast; give each fixture an explicit tsconfig or
  invocation so the ordering cannot be obscured.
- [x] Before installing the optional peer in the isolated consumer, use separate
  CJS and ESM fixtures to prove that an injected structural test runtime can
  load the warm fixture and that ordinary missing-peer behavior remains
  late/actionable when injection is absent.
- [x] Add child-process `require.cache` assertions for root, prompting, recipes, and
  loader imports, then for one built-in resolution/count.
- [x] Install exactly pinned Rollup, node-resolve, CommonJS, and JSON plugin versions only
  in the verifier's temporary consumer; do not add them to root dependencies or
  `package-lock.json`.
- [x] Bundle an ESM entry with no `dynamicRequireTargets` that:
  1. imports the packed root, then resolves and counts through both
     `openai/gpt-5.1` (`o200k_base`) and `openai/gpt-4` (`cl100k_base`);
  2. statically imports `@huggingface/tokenizers`;
  3. imports the packed loader, injects that namespace/version, loads the warm
     fixture, and verifies ordinary special-literal counting and provenance.
- [x] Execute the generated ESM bundle under Node. Inspect Rollup's module graph for
  the loader-only entry to ensure the semantic-identity split excludes
  js-tiktoken and base64-js from that subpath graph.
- [x] Run `npm run test:packed-api` in the single Ubuntu package-validation CI job,
  avoiding the nine-platform unit-test matrix.

**Verification**:

- [x] The exact issue reproduction bundles and executes without
  `dynamicRequireTargets` or externalizing `genai-lite/tokenizer-loader`.
- [x] No generated `commonjsRequire` failure is reached for either rank.
- [x] The injected path never evaluates `createRequire(__filename)`.
- [x] Loader-only bundling contains no tiktoken/base64 dependency edge.
- [x] Packed CJS and ESM consumers pass with the peer missing, discovered, and
  structurally injected; the bundled ESM consumer additionally passes with the
  real statically imported peer namespace.
- [x] Packed public declarations typecheck without installing the optional peer,
  except in the fixture that intentionally imports it.
- [x] CI durably runs the packed/Rollup regression once per change.

### Phase 6: Documentation, Release Record, and Closure

**Goal**: Document the exact guarantee and close the issue according to the
repository convention once every gate passes.

**Files**:

- `README.md`
- `genai-lite-docs/prepared-calls-and-accounting.md`
- `genai-lite-docs/typescript-reference.md`
- `genai-lite-docs/llm-service.md`
- `genai-lite-docs/prompting-utilities.md`
- `docs/dev/token-bound-certificates.md`
- `.summary_short.md`, `.summary_long.md`
- `src/.summary_long.md`
- `src/llm/.summary_long.md`
- `src/llm/tokenization/.summary_short.md`
- `src/llm/tokenization/.summary_long.md`
- `src/prompting/.summary_short.md`
- `src/prompting/.summary_long.md`
- `package.json`, `package-lock.json`
- `ISSUE-tokenizer-loader-injectable-peer.md`
- `PLAN-tokenizer-loader-injectable-peer.md`
- `docs/archive/`

**Work**:

- [x] Keep `prepared-calls-and-accounting.md` as the authoritative consumer guide:
  document automatic and injected peer modes, supported-version validation,
  caller-asserted injected provenance, a statically imported example, and
  externalization as a fallback rather than a requirement.
- [x] Document the new types/import paths and precise error behavior in the
  TypeScript reference.
- [x] Keep the README example short: retain automatic installation, mention the
  injected bundler path, and link to the authoritative guide.
- [x] Clarify in LLM docs that tokenizer load/validation failures make content
  capability unavailable without crashing.
- [x] Update prompting docs only for the root/module-evaluation laziness and legacy
  fallback behavior actually verified.
- [x] Expand the certificate guide's fail-closed rule from hash mismatch to rank
  load/evaluation/shape/validation failure, including permanent built-in ID
  reservation. State that profile identities/revisions remain unchanged.
- [x] State explicitly that laziness does not remove the production dependency or
  promise arbitrary-bundler byte elimination.
- [x] Refresh only summaries whose owned behavior changed. Do not create a new user
  guide, troubleshooting duplicate, devlog, changelog, or completion report;
  the archived plan is the durable design record.
- [x] Update package and lockfile versions to 0.17.2 after all implementation gates
  pass.
- [x] Complete the issue acceptance checklist and add its `## Resolution` section
  with date/version. Complete this plan's verification tracking and add its own
  `## Resolution` section. Set the records to `Status: RESOLVED` and
  `Status: COMPLETE` respectively, with the date and v0.17.2, then move both to
  `docs/archive/` and update references to their archived paths.
- [x] Perform and record a manual local-link inspection for the changed Markdown;
  no repository-wide link checker is introduced by this work.

**Verification**:

- [x] Every new public type, option, resolution mode, provenance qualification,
  error path, and bundler guarantee appears in authoritative docs.
- [x] Documentation distinguishes runtime evaluation, Rollup analyzability,
  bundle reachability, and npm installed footprint.
- [x] A manual inspection confirms that changed Markdown links and archived
  issue/plan references resolve, and the result is recorded in the resolution.
- [x] Package and lockfile versions agree at 0.17.2.
- [x] Issue acceptance criteria are checked only after their corresponding
  automated/manual gates pass.
- [x] The plan is marked complete and has a resolution record before archival.
- [x] No publish, push, tag, release, or commit occurs without separate user
  authorization.

## Testing Strategy

### Focused implementation loop

```powershell
npm.cmd test -- tokenization.test.ts profiles.failure.test.ts contentProfiles.test.ts tokenizerLoader.test.ts content.test.ts LLMService.contentProfiles.test.ts
npm.cmd run build
npm.cmd run test:packed-api
```

### Final repository gates

```powershell
npm.cmd test
npm.cmd run build
npm.cmd run test:packed-api
npm.cmd audit --omit=dev --audit-level=high
npm.cmd audit --audit-level=high
npm.cmd pack --dry-run
node -e "const lib = require('./dist'); console.log('Exports:', Object.keys(lib));"
git diff --check
```

The production audit is blocking. The full-tree audit is informational under
the existing project policy; any dev-only advisory must still be reported.
Real-provider E2E tests are not required because no provider adapter or request
shape changes.

## Documentation Ownership

- `genai-lite-docs/prepared-calls-and-accounting.md` owns consumer setup,
  injected/default peer behavior, provenance, caching, and bundler guidance.
- `genai-lite-docs/typescript-reference.md` owns the exact public type surface.
- `genai-lite-docs/llm-service.md` owns capability degradation visible through
  `LLMService`.
- `genai-lite-docs/prompting-utilities.md` owns legacy `countTokens()` behavior.
- `docs/dev/token-bound-certificates.md` owns built-in rank/certificate
  maintenance and fail-closed invariants.
- The archived issue and this plan own problem history, implementation
  decisions, acceptance evidence, and why the v0.17.0 externalization constraint
  was superseded. No additional durable document is needed.

## Risks and Mitigations

- **Static literal requires increase bundle reachability**: verify actual Rollup
  execution and module graphs; promise analyzability/evaluation behavior rather
  than universal pruning.
- **Lite construction drifts from `getEncoding()`**: run adversarial parity
  fixtures and stop if any count differs; do not silently change profile
  revisions or certificates.
- **Caller asserts a false injected version**: document the assertion boundary,
  validate the supported range, preserve model-quality classification, and keep
  certificate APIs closed.
- **Graceful failure accidentally weakens ID integrity**: reserve built-in IDs
  independently of runtime availability and test the failure environment.
- **Strict options validation becomes fragile**: validate allowed/required keys
  compositionally and test every optional-key combination plus unknown fields.
- **Module caches hide failure tests**: use a dedicated isolated-module suite and
  child processes for packed cache/evaluation assertions.
- **The root already reaches base64-js through Google's auth SDK**: assert the
  absence of `js-tiktoken` at the root and the absence of `base64-js` only on
  focused prompting/recipes/loader imports; do not misattribute that SDK edge.
- **Transient Rollup verification drifts**: install exact tested versions in the
  temporary consumer and execute it in CI; update deliberately when necessary.
- **Packed verification adds CI time/network work**: run it once in the Ubuntu
  package-validation job, not in the OS/Node unit matrix.

## Rollback

- The injection field is additive; omitting it always retains the current
  installed-peer path.
- Internal identity/profile/prompting refactors can be reverted independently
  because no stored data or serialized prepared handle changes.
- If lite parity fails, retain existing exact profile implementation and land
  only injection/guarding after amending this plan and its bundle guarantees.
- If Rollup integration is unstable, do not replace it with a source-string
  assertion; keep the issue open and revisit the test harness.
- No rollback requires data migration. Publication rollback is outside this
  plan because publication is not authorized.

## Approval Decisions

Approval of this plan accepts these recommended choices:

1. Use `tokenizersPeer: { module, packageVersion }`, not an asynchronous resolver
   callback.
2. Treat an injected version as validated caller-asserted runtime provenance.
3. Include the independent `src/prompting/content.ts` eager import so root
   imports become runtime-lazy, while keeping js-tiktoken a production
   dependency.
4. Extract semantic identity into a rank-free internal module so loader-only
   bundles do not traverse tiktoken code.
5. Add an actual packed Rollup regression and run the existing packed verifier
   in the single package-validation CI job.
6. Target repository version 0.17.2, but do not publish, commit, push, or tag
   without separate authorization.

---

**Please review. Edit directly if needed, then confirm to proceed.**

## Resolution

Completed on 2026-08-05 for v0.17.2. All six phases were implemented: semantic
identity was separated from rank loading; built-in profiles became literal,
lazy, defensive, and fail-closed; prompting stopped eagerly evaluating the full
js-tiktoken runtime; the optional tokenizer peer became structurally
injectable; and the packed verifier now exercises declaration isolation,
module evaluation, real Rollup bundling, both rank families, and a statically
imported real peer namespace.

Final verification passed 49 Jest suites (1,134 tests), the TypeScript build,
the packed/Rollup consumer gate, package dry-run, compiled export smoke test,
production dependency audit, version checks, and whitespace checks. The
informational full-tree audit reports only the known dev-only
`brace-expansion` advisory. The required doublecheck found one malformed
injected-runtime error-boundary gap and four evidence/documentation gaps; all
were corrected and independently rechecked with no remaining findings. Release
operations and real-provider E2E calls remained out of scope.

A final manual inspection after archival confirmed that all changed local
Markdown paths, cross-file anchors, and the archived issue/plan references
resolve from their final locations.
