# ISSUE: Answer accounting, token profiles, and prepare-path fixes

Created: 2026-07-30
Status: OPEN
Package: genai-lite (v0.16.0 at filing)

A review of the v0.15/v0.16 prepared-call, accounting, and tokenization APIs
surfaced five library-level items: one validation bug, two capability gaps, one
performance issue, and one documentation hazard. Items 1, 2, 4, and 5 form one
small compatible release. Item 3 is a larger additive registry and loader
release and does not block the first release.

Implementation note (2026-07-30): items 1, 2, 4, and 5 are implemented and
pass the repository's focused, full, packed-consumer, audit, and package
verification gates. They remain unreleased; item 3 remains open.

## 1. RequestValidator rejects legitimate empty-string message content (bug; trivial; high priority)

`src/llm/services/RequestValidator.ts:57` validates message structure with
`if (!message.role || !message.content)` — a falsy check, so `content: ''`
is reported as *missing* (`INVALID_MESSAGE`, "Message at index N must have
both 'role' and 'content' properties", `:62`).

Empty content is legitimate at prepare time. No-send accounting probes may use
`[{role: 'system', content: ''}, {role: 'user', content: ''}]` deliberately to
measure template-only framing against a ready local server. Generic validation
must not force such callers to substitute whitespace.

**Request:** type-check instead of truthiness-check (`typeof message.role !==
'string'` / `typeof message.content !== 'string'`); allow `''` through generic
prepare validation. Any provider that genuinely rejects empty content should
fail at dispatch/adapter level, not during preparation of a no-send call.

**Acceptance:** prepare + inspect of an empty-content system/user pair succeeds
(llamacpp included) and returns exact or certified prompt accounting; existing
tests asserting the missing-property error keep passing for genuinely missing
`role`/`content` properties.

## 2. Surface provider output usage without conflating accounting scopes (capability gap; high priority)

`rawAnswerAccounting` is currently populated only by `MockClientAdapter` and by
`LLMService` when a verified content profile exists. Other adapters often
receive provider-reported output usage, but raw content and provider output are
different measurement spaces: provider output may include hidden reasoning,
while a concrete `rawContent` count does not.

Without direct provider-output evidence, consumers enforcing provider-installed
output limits must either recount text in a potentially different tokenizer
space or decline enforcement. A byte fallback is a conservative prompt
reservation bound, not valid answer-use evidence.

**Request:**

- Add scope-keyed `answerAccounting` with independent `rawContent` and
  `providerOutput` entries.
- Retain `rawAnswerAccounting` as a deprecated compatibility alias for
  raw-content accounting only. Preserve its existing `tokens`, `method`,
  `source`, optional tokenizer provenance, and reasoning vocabulary so existing
  adapters remain source-compatible. Provider usage must never populate it.
- Populate `providerOutput` from direct provider fields on complete responses,
  streaming terminals, and sound partial envelopes for every physical call.
- Preserve explicit scope and reasoning inclusion. Never copy response totals
  to one choice, aggregate hidden retries, or manufacture zero.
- Keep missing, scope-ambiguous, derived-only, and impossible provider usage
  absent.
- Do not expose byte-derived values as answer accounting in either keyed scope
  or through the compatibility field.

For Gemini, candidates alone are complete only when resolved model/request
evidence proves provider-native thinking is excluded. Otherwise candidates and
thoughts are summed only when both are present. A positive thoughts count
overrides an exclusion hint and must not be discarded.

**Acceptance:** direct llama.cpp complete and streaming-terminal output counts
populate `answerAccounting.providerOutput`; raw-content and provider-output
evidence can coexist; every built-in adapter follows its documented direct-field
and reasoning-scope rule; multiple-choice aggregates, missing usage, and
ambiguous Gemini components remain absent rather than becoming false
choice-level evidence.

## 3. Generic content-tokenizer backends, recipes, and exact aliases (capability gap; larger design item)

`src/llm/tokenization/profiles.ts:119` (`mappedProfileId`) returns `undefined`
for every provider except `openai`, and the registry ships exactly two
js-tiktoken profiles (`cl100k_base`, `o200k_base`). `resolveTokenProfile`
(`:160`) therefore returns `unavailable` for every llamacpp / openrouter /
gemini / anthropic / mistral model, and the bounds layer revalidates any
supplied profile against the pinned registry (revision + rank hash), so a host
cannot register its own.

This prevents realistic local counting for most model families and forces
applications either to use the byte fallback or to build private tokenizer
infrastructure. The certified `TokenProfile` type cannot simply be widened:
its tiktoken proof fields and rank artifacts are the certificate boundary.

**Request:** add three tokenizer-agnostic layers.

1. **Core content-profile registry**
   - Preserve the existing certified `TokenProfile` API unchanged.
   - Add a parallel `ContentTokenProfile` API for built-in exact and
     host/model-quality profiles.
   - Accept multiple synchronous local counting backends and transactional
     exact `(providerId, modelId)` aliases.
   - Freeze the process-global production registry on first content-profile
     read.
   - Keep stable profile identity separate from the runtime mapping revision.
   - Force registered backends to `"model"` quality and reject them
     programmatically from certificate functions.

2. **Optional local loader**
   - Export it from `genai-lite/tokenizer-loader`; export peer-free recipe data
     from `genai-lite/tokenizer-recipes`.
   - Use `@huggingface/tokenizers@^0.1.3` as an optional peer and load it
     dynamically only when `loadContentTokenizerProfile()` is called.
   - If missing, fail at that call with the exact supported version range and
     an actionable install command; importing core APIs, types, or recipes must
     still succeed.
   - Explicitly provision immutable recipe artifacts, verify SHA-256 on
     downloads and every warm-cache read, cache atomically in a caller-supplied
     directory, initialize locally, and then return a synchronous backend.
   - Perform no implicit download during registry resolution or counting.
   - Treat ordinary-text handling of special-token-looking literals as a hard
     loader-kind requirement. Ship the selected loader only if a versioned,
     self-tested transformation matches reference `parse_special: false`
     behavior; otherwise amend the loader choice before release.

3. **Self-verifying recipes**
   - Recipes separate one role-tagged loader-input manifest from per-model
     coverage manifests containing every behavior-relevant artifact digest at
     an immutable revision.
   - Each first-party recipe declares and audits its required coverage
     path/role set; generic validation must not pretend it can infer repository
     completeness.
   - Recipes bind loader kind, the loader-input artifact hashes, and a fixed
     ordinary-text/no-specials policy.
   - `semanticRevision` binds recipe-controlled tokenization semantics. The
     registry validates it from canonical semantic provenance. Self-tests and
     coverage claims do not change that identity.
   - The loader resolves and validates the actual peer-runtime package version
     at load time, stamps it into structural backend provenance, and therefore
     into the runtime mapping revision. An indeterminate or unsupported version
     fails closed.
   - Every recipe carries expected counts for ASCII, dense multilingual text,
     combining marks, emoji/ZWJ sequences, control characters, and
     special-token-looking literals. A mismatch fails closed at load time.
   - Coverage evidence records which exact model repositories were verified,
     but does not restrict caller-supplied aliases. Aliasing a model outside
     that evidence is explicitly the caller's assertion.

The first real recipe targets Gemma 4 instruction-tuned tokenization. It checks
E4B-it, 12B-it, 26B-A4B-it, and 31B-it at immutable repository revisions. One
recipe covers them only if all pinned artifacts and relevant policy inputs
agree; otherwise they split into honest recipes/profiles. Later selected model
families use the same registry, loader, and recipe schema.

**Acceptance:** multiple unrelated host tokenizer backends can coexist without
family-specific registry logic; built-in exact profiles also resolve through
the content API; exact aliases, freeze behavior, callback failures, and mapping
revision provenance are deterministic; importing the loader without its peer
works and calling it produces the actionable late error; the Gemma 4 recipe
passes hash and self-test verification without bundling its tokenizer artifact;
registered profiles report `"model"` quality and cannot enter
`retokenizationUpperBound()` or other certificate paths.

## 4. Cache LlamaCpp utility calls in the prepare path (performance; small)

The current prepared path performs five llama.cpp utility requests in three
round-trip stages: `ModelResolver` first obtains a `getProps`/`getModels`
preparation snapshot, the adapter calls `countChatCompletionInputTokens`, and
the adapter then re-reads `getProps`/`getModels` to prove that the count belongs
to the same state. Only the input-token count is inherently per-call; the
capability/state snapshot is per-server-state.

Consequence: stepwise and sampling-heavy flows can issue many physical calls,
multiplying avoidable state round-trips while still requiring a fresh
server-side input-token count for each prompt.

**Request:** add an explicit
`cachePreparationStateByEndpointRevision: true` opt-in. It requires an
authoritative endpoint-revision provider whose value changes with
model/build/template state. Bracket preparation with before/after revision
reads, make `ModelResolver` and adapter preparation consume the same
revision-keyed snapshot, cache only a stable successful state, and retain
today's live snapshot and post-count state reads without the opt-in. Preserve
the existing `string | number` revision contract and equality semantics. Bound
the cache by evicting older revisions for an endpoint/model and invalidate it
with adapter/state invalidation. Dispatch revalidation always remains live. The
input-token count stays per-call.

**Acceptance:** repeated prepares against an unchanged server fetch
props/models once when the opt-in assertion is configured; a revision change
invalidates the cache; missing authority fails configuration; the default path
retains live reads; dispatch revalidation is never cached.

## 5. Document `retokenizationUpperBound` as unfit for capacity sizing (documentation)

The certified cross-profile bound multiplies
`sourceTokens × maximumDecodedBytesPerToken × 3` (U+FFFD expansion): measured,
`retokenizationUpperBound(1000, o200k→cl100k)` = **384,000 tokens**. This is
sound as a certificate and useless for sizing — a consumer that reserves
context with it can derive absurd requirements.

**Request:** a documentation note steering consumers to profile identity (or
their own estimates) for capacity *sizing*, reserving the certified bound for
enforcement-style proofs; note that `codePointBoundToTokenUpperBound`
(codePoints × 4) is the useful conversion for code-point-bounded text and
document it as such. A tighter certified tier (e.g. corpus-ratio certificates)
is optional future work, not requested here.
