# Maintaining Token-Bound Certificates

Token-bound certificates are small, proof-backed constants and derivations.
They must never include an application/session heuristic safety margin.

## Required proof material

For every profile revision, pin and verify:

- tokenizer implementation and rank/config hash;
- ordinary-token domain and special/control-token exclusions;
- byte completeness of the target vocabulary;
- maximum decoded bytes per ordinary source token;
- decoder behavior for invalid bytes and terminal flush;
- UTF-8 re-encoding expansion;
- affine constants and overflow behavior.

Keep the tokenizer profile revision separate from the model-to-profile mapping
revision. If a rank module cannot be loaded/evaluated, has the wrong shape or
hash, or fails byte-completeness validation, the profile and its certificates
must become unavailable rather than throwing or silently using different data.
The built-in IDs remain permanently reserved even while unavailable.

After validation, copy rank primitives and clone/freeze `special_tokens` into a
canonical snapshot. Tokenizer construction must use that snapshot, not the
shared mutable module export, so later mutation cannot separate counts from the
hash and certificate identity that authorized them. Runtime construction or
encoding failure likewise returns unavailable count evidence; it never enables
a heuristic certificate path.

The parallel `ContentTokenProfile` registry is not a certificate registry.
Built-in exact content profiles may wrap the canonical certified profiles for
ordinary counting, but registered/recipe-loaded profiles are forced to
`quality: "model"`. Certificate functions validate the complete canonical
built-in profile shape and reject content profiles passed through runtime
casts. Do not add host callbacks, recipe self-tests, coverage claims, or runtime
package provenance to this trust boundary.

## Current derivations

The `cl100k_base` and `o200k_base` profiles are pinned to the bundled
`js-tiktoken@1.0.21` rank/config hashes. The registry derives byte completeness
and the maximum token byte length from those artifacts.

Keep each rank specifier as a separate literal lazy load and construct the
runtime through `js-tiktoken/lite`. The lite construction must remain count-
for-count equivalent to the full `getEncoding()` implementation across the
adversarial parity fixtures before hashes, revisions, or certificates may be
left unchanged.

The Unicode code-point certificate uses:

```text
codePoints * 4 UTF-8 bytes/code point * 1 target token/byte
```

The ordinary-source retokenization certificate uses:

```text
sourceTokens
  * maximum source decoded bytes/token
  * 3 worst-case replacement UTF-8 expansion
  * 1 target token/byte
```

This is intentionally conservative. Do not replace it with a same-profile
`n -> n` rule without a complete decoder/encoder round-trip proof covering
invalid bytes, terminal flush, cross-token composition, and special-token
exclusions.

## Proof bounds versus capacity sizing

`retokenizationUpperBound()` certifies a worst case; it is not a realistic
capacity estimator. The production derivation for 1,000 `o200k_base` source
tokens retokenized to `cl100k_base` is **384,000 target tokens**:

```text
1000 source tokens * 128 maximum decoded bytes/token * 3 replacement expansion
```

Keep that bound for enforcement-style proofs over the function's declared
source-token domain. For application sizing, treat shared profile identity and
empirical cross-route ratios as advisory estimates rather than certificates.
Do not feed a generation budget into a same-profile identity shortcut.

When the source contract is a Unicode code-point bound, use
`codePointBoundToTokenUpperBound()` instead. Its `codePoints * 4` derivation is
the appropriate certified conversion for code-point-bounded text.

## Verification

Tests must cover:

- ASCII and dense non-Latin scripts;
- combining sequences and variation selectors;
- astral characters and ZWJ emoji;
- controls and NUL;
- special-token literals treated as ordinary text;
- maximum Unicode scalars and documented lone-surrogate behavior;
- decoded ordinary source-token sequences;
- zero, negative, unsafe-integer, and overflow boundaries.

The numeric margin fixture must obtain its structural bound from the production
certificate API and prove that the application formula applies the heuristic
margin once. Certificate functions must not accept a margin parameter.

Also keep an explicit runtime-cast regression showing that a registered-looking
profile cannot enter certificate functions even when it copies rank,
byte-completeness, and maximum-byte fields.
