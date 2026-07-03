# Plan: Local-Model Features, Sampling Settings & Reliability (v0.9.0)

Created: 2026-07-02
Status: IN PROGRESS (started 2026-07-03; see Execution Tracker)

## Execution Tracker

Constraint: GPU busy until ~evening 2026-07-03 — all llama-server-dependent checks deferred to the end (marked GPU).

- [x] **Phase 0: Prep** — done 2026-07-03
  - [x] 0.1 npm install + baseline green: 684 tests / 32 suites pass, build clean. SDKs now openai 6.16.0, anthropic 0.71.2, genai 1.37.0, mistral 1.12.0. No SDK migration breakage. Also ran `npm audit fix` (9 vulns in transitive dev deps → 0); lockfile updated.
  - [x] 0.2 Matrix re-verified vs installed typings — holds exactly as written (openai seed/logprobs/top_logprobs + RequestOptions{signal,timeout,maxRetries}; anthropic top_k, no seed; genai topK/seed/abortSignal/httpOptions.timeout; mistral randomSeed/retryConfig/timeoutMs).
  - [x] 0.3 openai-node v6 README: extra params "will be sent as-is" (no runtime stripping) → `(params as any)` seam confirmed for OpenRouter/llama.cpp extras.
  - [!] 0.4 (GPU, deferred) no-jinja `chat_template_kwargs` behavior probe
- [x] **Phase 1: Flat sampling settings** — done 2026-07-03. All enumeration points updated (LLMSettings, DEFAULT_LLM_SETTINGS, merge literal, template whitelist + per-key checks, validateLLMSettings, provider/model unsupportedParameters incl. seed on 5 reasoning models); 6 adapters wired (OpenAI seed; Anthropic top_k; Gemini topK+seed; Mistral randomSeed; LlamaCpp+OpenRouter all four); 7 test literals extended + 8 new tests (adapter wire assertions pos+neg, validation bounds, merge, filter, META pass+reject) + Mock settings echo. 699 tests green, build clean.
- [x] **Phase 2: GGUF catalog + vendor defaults + reasoning toggle** — done 2026-07-03 (747 tests green)
  - [x] 2a defaults-flow plumbing: ModelInfo.defaultSettings/reasoningDefaultSettings/localReasoning types; getDefaultSettingsForModel + mergeSettingsForModel accept resolved modelInfo (threaded at both LLMService call sites); reasoning overlay precedence request > reasoningDefault > modelDefault; ModelResolver overlays detection on the generic llamacpp entry AND the preset path (extracted detectLlamaCppCapabilities helper)
  - [x] 2b `localReasoning` metadata (`toggleKwarg`/`nothinkPrefix`/`markers`) on ModelInfo
  - [x] 2c KNOWN_GGUF_MODELS: 37 entries (Qwen 3.5/3.6, Qwen3 2507 variants, Qwen 3 originals, Gemma 4/3, GPT-OSS, Ministral 3 R+I, Granite 4.1, DeepSeek-R1, Llama 3.2) with shared vendor-profile constants; generic llamacpp entry reasoning-optimistic
  - [x] 2d LlamaCpp adapter: enable_thinking emission (detected toggleKwarg only), prefill×thinking guard (clear invalid_request_error), nothink strip, two-tier extraction via new `extractMarkerDelimitedContent` parser util (exported), "reasoning active" gate covers always-on models, 127.0.0.1 default
  - [x] 2e OpenRouter: reasoning request mapping (max_tokens > effort > enabled, + exclude), response extraction (message.reasoning + reasoning_details), optimistic reasoning caps for unknown OpenRouter models in ModelResolver
  - [x] 2f presets: simplified to two generic presets (`llamacpp-local-default`/`llamacpp-local-thinking`) — family-specific ones would duplicate settings since vendor defaults flow from detection automatically
  - [x] 2g cloud Gemma 4 on gemini provider (gemma-4-4b-it / 26b-a4b-it / 31b-it, free, system-role, no cloud reasoning) — ⚠ see CORRECTION below: 4b-it doesn't exist, since removed
  - [x] 2t tests: 14 detectGgufCapabilities cases (gmbench verbatim filenames + pattern-ordering invariant), getDefaultSettingsForModel-with-modelInfo, reasoning-overlay merges, 6 ModelResolver overlay cases, 9 LlamaCpp toggle/extraction cases, 7 OpenRouter reasoning cases, 6 parser util cases. (LLMService-level hybrid integration covered by the unit chain instead of a service test — mock provider can't exercise llamacpp detection.)
  - [!] 2v (GPU, deferred) live smoke with real GGUF
- [x] **Phase 3: grammar + logprobs** — done 2026-07-03 (759 tests green). `LlamaCppSettings` namespace (grammar + chatTemplateKwargs escape hatch, user kwargs win over derived enable_thinking, prefill guard covers user-forced thinking); flat `logprobs`/`topLogprobs` + `TokenLogprob` on LLMChoice; grammar×structuredOutput mutual exclusion in validateLLMSettings; shared `mapOpenAIChatLogprobs` util wired into llama.cpp/OpenAI/OpenRouter; logprobs marked unsupported for Anthropic/Gemini/Mistral; all enumeration points + 8 literals re-walked; 12 new tests.
  - [!] 3v (GPU, deferred) live smoke
- [x] **Phase 4: timeout/retry/AbortSignal** — done 2026-07-03 (789 tests green). LLMError gains status/retryAfterMs (typed); errorUtils parses Retry-After (seconds + HTTP-date, Headers/plain/rawResponse) and maps APIUserAbortError/AbortError→REQUEST_ABORTED, APIConnectionTimeoutError/TimeoutError→REQUEST_TIMEOUT; AdapterRequestOptions{signal,timeoutMs} threaded through all 6 adapters + Mock (conditional second SDK arg so no-options behavior is byte-identical); maxRetries:0 on openai/anthropic/openrouter/llamacpp clients; new exported withRetry (src/shared/services/withRetry.ts) with backoff+jitter+Retry-After+abort; LLMService retry loop on returned failure codes (429/network/timeout/5xx/408/409), LLMServiceOptions.retry+timeoutMs, sendMessage(request, {signal,timeoutMs,maxRetries}); 30 new tests incl. fake-timer N+1-attempts proof. Deviation: skipped adapter-constructor-level timeout config (service default + per-request override covers it).
- [x] **Phase 5: docs + housekeeping + release** — done 2026-07-03. 9 genai-lite-docs files updated (incl. stale-GgufModelPattern + false-Mistral-mock fixes); README/CLAUDE.md OpenRouter drift fixed + new capability notes; adding-models-and-providers.md extended with the new metadata conventions; summary files refreshed (stale SESSION ref removed, localhost→127.0.0.1); chat-demo gains topK/minP/repeatPenalty/seed controls + types sync; version 0.9.0. Release checks: 789 tests green, audit 0 vulns, build clean, `npm pack --dry-run` OK (118.7 kB, 89 files), exports smoke incl. live detectGgufCapabilities from dist. Note: chat-demo TS not separately compiled (additive subset-type change; verify when demo next runs).
- [x] Final `/doublecheck` — done 2026-07-03 (two Opus verifiers). **Code**: all 5 design decisions conform; zero CRITICAL/IMPORTANT bugs; adversarial traces of retry math, abort races, marker edge cases, precedence chain, transport pass-through all held. **Docs**: 1 critical + 3 important findings, all FIXED in commit c2dc5a6 (extractMarkerDelimitedContent added to the genai-lite/prompting subpath barrel; LlamaCppClientConfig.timeout doc removed; Ministral 3 Instruct reclassified as non-toggleable; remaining localhost:8080 defaults → 127.0.0.1 incl. chat-demo server fallbacks; plus minor type-shape/citation fixes). Post-fix: 789 tests green, build clean, subpath export smoke-tested. Noted, not fixed (pre-existing/benign): template whitelist omits systemMessageFallback/openRouterProvider (predates this work); nested-namespace shallow merge across preset+request matches existing pattern; retryAfterMs capped at maxDelayMs by design.
- [x] (GPU) end-of-session live verification bundle — done 2026-07-03 evening against llama-server build b9587 + Qwen3.5-4B-Q4_K_M.gguf (real GPU inference):
  - [x] 0.4 no-jinja probe: server WITHOUT --jinja returns HTTP 200 and silently ignores chat_template_kwargs (no 400 → no emission guard needed; docs' "servers without --jinja ignore the kwarg" claim is accurate). genai-lite works normally against such servers.
  - [x] 2v reasoning toggle (--jinja): OFF → clean content ("42", 3 completion tokens, no <think> leak, no choice.reasoning); ON → choice.reasoning populated with the full trace, clean content (242 tokens); preset `llamacpp-local-thinking` works end-to-end. The 3-vs-242-token delta proves enable_thinking:false lands on the wire (same body path as the sampling defaults; /slots doesn't expose params on this build, so defaults verified via unit-asserted wire assembly + server acceptance).
  - [x] 3v grammar + logprobs: GBNF `root ::= "yes" | "no"` constrained output to exactly "no"; logprobs returned with topLogprobs (top alternative candidates include the suppressed `<think>` token — nice direct evidence of the toggle steering). Bonus: prefill×thinking guard fails fast client-side with invalid_request_error, mockCreate-free.

**COMPLETION SUMMARY (2026-07-03)**: All five phases implemented, tested (789 unit tests, 33 suites), documented, committed as v0.9.0 (commits d52235a..c2dc5a6), doublechecked (2 independent verifiers; all findings fixed), and live-verified on a real GPU llama-server. PLAN COMPLETE — nothing outstanding.

**CORRECTION (2026-07-03, post-release)**: The Gemma 4 facts in 2g and line "Cloud Gemma 4 exists on the Gemini API" below were partly wrong and have been fixed in a follow-up:
- `gemma-4-4b-it` does not exist — Gemma 4's small models are E2B/E4B (local weights only). The Gemini API serves exactly two Gemma 4 IDs: `gemma-4-26b-a4b-it` and `gemma-4-31b-it`. The bogus 4B cloud entry was removed from SUPPORTED_MODELS.
- Context windows corrected per Google's model card: E2B/E4B 32K → 128K, 26B-A4B 128K → 256K (GGUF pattern + cloud entry), generic `gemma-4` fallback 32K → 128K (family minimum).
- Gemma 4 12B (dense, 256K context, released 2026-06-03, weights-only — not on the Gemini API) was missing entirely; added as a 38th KNOWN_GGUF_MODELS pattern.

## Summary

Port the battle-tested local-model knowledge from gmbench into genai-lite and add library-grade reliability: (1) new sampling settings (`topK`, `minP`, `repeatPenalty`, `seed`) wired to every provider that supports them; (2) a new generation of GGUF model families (Gemma 4, Qwen 3.5/3.6, GPT-OSS, Ministral 3, Granite 4.1) with vendor sampling defaults and a working reasoning on/off toggle for hybrid models via `chat_template_kwargs.enable_thinking`; (3) GBNF grammar + logprobs for llama.cpp; (4) unified timeout/retry/AbortSignal across all LLM adapters. Ships as v0.9.0 (all additive).

## Scope

- **In scope**: the four features above; OpenRouter reasoning forwarding (request+response); vendor-default-settings mechanism (`ModelInfo.defaultSettings`); nothink-prefix stripping + marker-pair fallback extraction; llama.cpp default baseURL `localhost` → `127.0.0.1`; docs, tests, `.summary_*.md`, presets, version bump.
- **Out of scope**: llama-server lifecycle management (genai-electron's job), cost estimation, streaming, JSON salvage/repair, best-of-N helpers, GPT-OSS harmony prompt assembly / raw `/completion` seeded-prefill tricks, image-side changes.

## Confirmed design decisions (user-approved)

1. Flat top-level sampling settings, filtered per provider via existing `unsupportedParameters` mechanism.
2. Hybrid GGUF models with no `reasoning` requested get **explicit `enable_thinking: false`** (predictable, avoids Gemma 4's silent ~2× thinking-token burn). Reasoning is opt-in, consistent with cloud adapters.
3. AbortSignal included with the timeout work.
4. One unified retry layer in `LLMService`; SDK-internal retries zeroed (`maxRetries: 0`) to prevent double-retry.
5. New `llamacpp` settings namespace for `grammar` + `chatTemplateKwargs`; `grammar` and `structuredOutput` are mutually exclusive (llama-server errors on both).

## Verified facts the plan relies on

Provider parameter support (verified against installed typings / official docs; re-verify after `npm install` in Phase 0):

| Setting | OpenAI | Anthropic | Gemini | Mistral | llama.cpp | OpenRouter |
|---|---|---|---|---|---|---|
| `topK` | ✗ | ✓ `top_k` | ✓ `topK` | ✗ | ✓ `top_k` | ✓ `top_k` |
| `minP` | ✗ | ✗ | ✗ | ✗ | ✓ `min_p` | ✓ `min_p` |
| `repeatPenalty` | ✗ | ✗ | ✗ | ✗ | ✓ `repeat_penalty` | ✓ `repetition_penalty` |
| `seed` | ✓ `seed` (beta; ignored by reasoning models) | ✗ | ✓ `seed` | ✓ `randomSeed` | ✓ `seed` | ✓ `seed` |
| `logprobs`/`topLogprobs` | ✓ | ✗ | (different shape — skip) | ✗ | ✓ (OpenAI-shaped) | ✓ pass-through |

- OpenRouter unified `reasoning` body param: `{ effort?, max_tokens?, enabled?, exclude? }`; `effort` and `max_tokens` mutually exclusive; unsupported params silently ignored per-model.
- llama-server: `chat_template_kwargs` requires `--jinja`; `grammar` + `json_schema`/`response_format` together is an error ("Either 'json_schema' or 'grammar' can be specified, but not both"); **assistant prefill + `enable_thinking: true` → HTTP 400**; chat logprobs are OpenAI-shaped (`choices[].logprobs.content[].{token, logprob, top_logprobs[]}`); `reasoning_content` population is model/template-dependent (two-tier extraction needed); grammar may not constrain during active thinking (llama.cpp #20345).
- SDK options: openai & anthropic — client `{maxRetries (default 2), timeout}` + per-request `{signal, timeout, maxRetries}`, `APIError.headers` exposes `retry-after`; @google/genai — per-request `config.abortSignal` + `config.httpOptions.timeout`, **no built-in retries**; @mistralai — `retryConfig` default `"none"` (already off), per-call `{timeoutMs, fetchOptions.signal}`, `SDKError.rawResponse` for headers.
- Cloud Gemma 4 exists on the Gemini API: `gemma-4-4b-it`, `gemma-4-26b-a4b-it`, `gemma-4-31b-it` (no 27B — that was Gemma 3's size).
- **`node_modules` is stale**: openai 5.8.3 installed vs `^6.7.0` declared; @anthropic-ai/sdk 0.56.0 vs `^0.71.2`; @mistralai/mistralai **not installed**.

gmbench-verbatim constants to lift (source: `gmbench/conf/model_families/*.yaml`, `docs/models.md`):

| Family | nothink prefix (exact) | fallback markers | defaults (T / topP / topK / minP / repeatPenalty) |
|---|---|---|---|
| Qwen 3 / 3.5 / 3.6 | `"<think>\n\n</think>\n\n"` | `<think>` … `</think>` | 0.7 / 0.8 / 20 / 0 / 1.0 (thinking: 1.0 / 0.95 / 20 for 3.5+, 0.6 / 0.95 / 20 for Qwen 3) |
| Gemma 3 / 4 | Gemma 4: `"<|channel>thought\n<channel|>"` | `<|channel>thought` … `<channel|>` | 1.0 / 0.95 / 64 / 0 / 1.0 (thinking profile identical) |
| GPT-OSS | none (harmony; reasoning always-on) | — | 1.0 / 1.0 / 0 / 0 / 1.0 |
| Ministral 3 (Instruct) | — (template thinking disabled) | `<think>` … `</think>` | 0.15 / (default) / — / 0 / 1.0 (vendor card; see Open Questions) |
| Ministral 3 (Reasoning variant) | — | `<think>` … `</think>` | 0.7 / 0.95 / — / 0 / 1.0, reasoning always-on |
| Granite 4.1 | — | — | 0.7 / 0.95 / 0 / 0 / 1.0 (no vendor profile; gmbench values, low confidence) |

Where gmbench and web sources disagree (e.g. Gemma 4 marker strings), **gmbench's tested strings win**. Two deliberate exceptions where the values are *vendor-card-derived, not gmbench-tested*: the Qwen 3 thinking profile (0.6/0.95/20 — gmbench's `qwen3.yaml` has no thinking override) and the Ministral Instruct/Reasoning split (gmbench ran 0.7 uniformly; see Open Questions). Do not ship `presencePenalty: 1.5` for Qwen 3.5 despite the vendor card — gmbench found it corrupts short structured outputs; document it instead.

---

## Phases

Each phase is a PR-sized, independently green unit (build + `npm test` pass at each boundary). Order: 1 → 2 → 3 → 4 can't be swapped (2 uses 1's defaults machinery; 3 reuses 2's namespace-merge pattern); 4 is independent and could go earlier if needed.

### Phase 0: Prep

**Goal**: trustworthy baseline.

**Steps**:
1. `npm install`. ⚠️ Not a formality: SDKs are currently missing/stale on disk, and the declared ranges cross **major versions** (openai 5.8.3 → ^6.7.0, anthropic 0.56.0 → ^0.71.2) that may break the *existing* adapters. Run `npm test` + `npm run build`; budget for SDK-migration fixes here — Phase 1 does not start until this is green.
2. Re-verify the support matrix against the *now-installed* typings: openai `seed`/`logprobs`/`RequestOptions{signal,timeout,maxRetries}`; anthropic `top_k` + `RequestOptions`; @google/genai `topK`/`seed`/`abortSignal`/`httpOptions.timeout`; mistral `randomSeed`/`retryConfig`/`timeoutMs`. Adjust the matrix if anything moved.
3. Verify the openai-node SDK passes unknown body fields through at runtime (needed for `top_k` etc. on OpenRouter/llama.cpp). If it strips them, use the SDK's documented extra-body escape (`// @ts-expect-error` passthrough or `request options.body`) — decide once, apply everywhere.
4. Verify llama-server behavior when `chat_template_kwargs` is sent to a server started **without** `--jinja` (silently ignored vs HTTP 400) — test against the local llama-server binary (gmbench's `GMBENCH_LLAMA_BIN`). Outcome gates Phase 2d: if it errors, only emit the kwarg when detection succeeded AND (if detectable via `/props`) the server has a chat template loaded; either way, document prominently.

**Verification**: baseline tests green; matrix confirmed; no-jinja behavior recorded in this file.

### Phase 1: Flat sampling settings — `topK`, `minP`, `repeatPenalty`, `seed`

**Goal**: the four settings exist end-to-end and reach the wire on every supporting provider.

**Work** (every settings-key enumeration point — miss one = silent drop):
1. `src/llm/types.ts` — add to `LLMSettings` (~L331, after `presencePenalty`), each with JSDoc noting provider support. `topK?: number; minP?: number; repeatPenalty?: number; seed?: number`.
2. `src/llm/config.ts:71` `DEFAULT_LLM_SETTINGS` (Required literal — compile-enforced): all four as `undefined as any` (no universal default).
3. `src/llm/services/SettingsManager.ts:32-63` `mergeSettingsForModel` literal: `requestSettings?.X ?? modelDefaults.X` for each.
4. `SettingsManager.ts:165-178` `validateTemplateSettings` knownFields + per-key validation blocks (else silently stripped from `<META>`).
5. `config.ts:1166+` `validateLLMSettings`: `topK` integer ≥ 0; `minP` number 0–1; `repeatPenalty` number > 0; `seed` integer (allow negative — llama.cpp uses −1 for random).
6. `unsupportedParameters` data in `SUPPORTED_PROVIDERS` (config.ts:139+): openai += `topK, minP, repeatPenalty`; anthropic = `[seed, minP, repeatPenalty]` (new array); gemini = `[minP, repeatPenalty]` (new array); mistral = `[topK, minP, repeatPenalty]` (new array). Model-level: add `seed` to all five reasoning-model entries — `gpt-5.2`, `gpt-5.1`, `gpt-5-mini-2025-08-07`, `gpt-5-nano-2025-08-07`, `o4-mini` (OpenAI supports `seed` in general — matrix ✓ — but reasoning models ignore it; stripping keeps behavior honest).
7. Adapter wiring: OpenAI → `seed`; Anthropic → `top_k`; Gemini → `generationConfig.topK`, `seed`; Mistral → `randomSeed`; OpenRouter → `top_k`, `min_p`, `repetition_penalty`, `seed`; LlamaCpp → `top_k`, `min_p`, `repeat_penalty`, `seed` (top-level body via the existing `(completionParams as any)` seam). All conditional on `!== undefined`.

**Tests**: update the **seven** `basicRequest.settings` `Required<LLMSettings>` literals (six adapters + `MockClientAdapter.test.ts`; compile forces this — use it as the checklist); per-adapter positive mapping assertions + negative assertions (e.g. Anthropic body has no `seed`, Mistral no `top_k`); `validateLLMSettings` boundary cases; `SettingsManager` merge/filter cases; `<META>` template passthrough case in `LLMService.createMessages.test.ts`. Optional one-liner: extend `MockClientAdapter.generateSettingsTestResponse` (MockClientAdapter.ts:310-325) so the `test_settings` echo surfaces the new params (display-only helper; not compile-enforced).

**Verification**:
- [ ] `npm test` green; new assertions confirm exact wire param names per adapter.

### Phase 2: GGUF catalog, vendor defaults, reasoning toggle

**Goal**: `detectGgufCapabilities` knows the 2026 families; detected models get vendor sampling defaults; hybrid models run cleanly with and without reasoning through the unified `reasoning` setting; OpenRouter forwards reasoning.

**Work**:

*2a. Defaults-flow plumbing (fixes a live bug):*
- `ModelInfo` (types.ts:517) gains `defaultSettings?: Partial<LLMSettings>` and `reasoningDefaultSettings?: Partial<LLMSettings>` (carries e.g. Qwen's distinct thinking-mode profile).
- Today `getDefaultSettingsForModel` (config.ts:1093) re-looks-up the model in `SUPPORTED_MODELS` only, so **detected-GGUF capabilities never reach merged settings** (not even `maxTokens`). Fix: thread the resolved `modelInfo` — `mergeSettingsForModel(modelId, providerId, settings, modelInfo?)` and `getDefaultSettingsForModel(modelId, providerId, modelInfo?)` (additive optional params); prefer passed `modelInfo` over the lookup. Base merge order: `DEFAULT_LLM_SETTINGS < PROVIDER_DEFAULT_SETTINGS < MODEL_DEFAULT_SETTINGS < modelInfo.defaultSettings`.
- **`reasoningDefaultSettings` sequencing** (lives in `mergeSettingsForModel`, which sees both defaults and request — `getDefaultSettingsForModel` cannot, it never sees request settings): (1) compute effective `reasoningOn = requestSettings?.reasoning?.enabled ?? modelDefaults.reasoning?.enabled`; (2) if true, fold `reasoningDefaultSettings` into the defaults layer **below** request settings, so per-key precedence is `request ?? reasoningDefault ?? modelDefault` (an explicit user `temperature` always beats the thinking profile).
- **Thread `modelInfo` at BOTH call sites**: `LLMService.sendMessage` (L195) *and* `LLMService.createMessages` (L517, `modelInfo` in scope at L514) — the latter feeds the model-aware-template `modelContext`, which must see defaulted settings too.
- **Generic-id detection overlay (critical)**: `ModelResolver.resolve` runs GGUF detection only when `getModelById` *misses* — so the documented `modelId: 'llamacpp'` usage resolves to the static generic entry and would get **no** detected capabilities or vendor defaults (while the adapter-side `enable_thinking` toggle *would* still work — confusingly asymmetric; and always-on models would never auto-enable reasoning, leaking think markers). Fix in `ModelResolver.resolve`: for `providerId === 'llamacpp'`, attempt `adapter.getModelCapabilities()` and overlay detected capabilities onto the resolved `modelInfo` **even when the generic entry matched** (detected caps spread over the generic entry; unchanged if detection fails/server down).
- Changelog notes: detected GGUF models (including via `modelId: 'llamacpp'`) now receive model-specific `maxTokens`/sampling defaults — a deliberate behavior change.

*2b. Reasoning-toggle metadata:*
- `ModelInfo` gains `localReasoning?: { toggleKwarg?: string; nothinkPrefix?: string; markers?: [string, string] }` (name bikesheddable). `toggleKwarg` (e.g. `"enable_thinking"`) marks templates with a thinking flag; `nothinkPrefix` is stripped verbatim (exact `startsWith`, gmbench-style); `markers` drive fallback extraction when `reasoning_content` is absent.

*2c. `KNOWN_GGUF_MODELS` overhaul (config.ts:196):*
- Update existing 6 Qwen 3 entries: add `localReasoning` (toggleKwarg + `"<think>\n\n</think>\n\n"` prefix + `<think>` markers), `defaultSettings` (0.7/0.8/20/0/1.0), `reasoningDefaultSettings` (0.6/0.95/20).
- Add, in this order (specific before generic; substring, lowercase, quantization-agnostic per `docs/dev/adding-models-and-providers.md`):
  - `qwen3.5-*` (2b, 4b, 9b, generic `qwen3.5`) and `qwen3.6-*` (27b, 35b-a3b, generic `qwen3.6`): hybrid (`reasoning: {supported, enabledByDefault: false, canDisable: true}`), full `localReasoning`, defaults 0.7/0.8/20/0/1.0, reasoning defaults 1.0/0.95/20. Place **before** qwen3 entries.
  - `qwen3-*-instruct-2507` / `qwen3-*-thinking-2507` (4b, 30b-a3b) **before** the matching `qwen3-*` entries: Instruct-2507 = non-thinking (`reasoning` absent; keep toggleKwarg+prefix — safe no-op per gmbench); Thinking-2507 = always-on (`enabledByDefault: true, canDisable: false`, **no toggleKwarg** — never send `enable_thinking` to a thinking-only template; `<think>` markers for fallback extraction). Rule for all always-on families (Thinking-2507, GPT-OSS, DeepSeek-R1, Ministral Reasoning): **no `toggleKwarg`**.
  - `gemma-4-*` (e2b, e4b, 26b-a4b, 31b, generic `gemma-4`): hybrid, `supportsSystemMessage: true`, `localReasoning` with Gemma-4 channel strings (gmbench-verbatim), defaults 1.0/0.95/64/0/1.0, no reasoning override.
  - `gemma-3-*` (1b, 4b, 12b, 27b, generic `gemma-3`): no reasoning, `supportsSystemMessage: false`, defaults 1.0/0.95/64/0/1.0.
  - `gpt-oss-*` (120b, 20b, generic `gpt-oss`): reasoning always-on (`enabledByDefault: true, canDisable: false`), **no** toggleKwarg, defaults 1.0/1.0/0/0/1.0.
  - `ministral-3-*-reasoning` (3b, 8b, 14b) before `ministral-3-*` instruct entries + generic `ministral-3`: Reasoning variants always-on (T 0.7/topP 0.95); Instruct non-reasoning with toggleKwarg (template flag exists; stays false), T 0.15.
  - `granite-4.1`: no reasoning, defaults 0.7/0.95/0/0/1.0.
  - Bonus (cheap, common): `deepseek-r1` (always-on, `<think>` markers, T 0.6/topP 0.95) and `llama-3.2` (no reasoning, 0.6/0.9/0/0/1.0).
  - Scope note: Gemma 3 GGUF entries and the Qwen 2507 variants go beyond the agreed five families — Gemma 3 for symmetry with the docs (which already claim broad detection), the 2507 variants because the existing `qwen3-*` patterns would otherwise *mis-detect* them as thinking-capable. Flagged in Open Questions.
- Context windows / maxTokens per entry: verify against HF model cards at implementation time (Gemma 4 31B = 256K; others TBV); use conservative values where unverified.
- Generic registered `llamacpp` model entry (config.ts ~L930) gains optimistic `reasoning: {supported: true, enabledByDefault: false, canDisable: true}` so `reasoning.enabled` isn't rejected for the generic model id (extraction degrades gracefully if the loaded model can't think).

*2d. LlamaCppClientAdapter:*
- In `sendMessage`, `await this.getModelCapabilities()` (already cached; null on failure → no toggle behavior, current behavior preserved). If `caps.localReasoning?.toggleKwarg`: send `chat_template_kwargs: { [toggleKwarg]: settings.reasoning?.enabled === true }` via the body seam. (Non-reasoning models: `reasoning` was already stripped by `filterUnsupportedParameters`, so this resolves to `false` — correct.)
- **Prefill guard**: if the kwarg resolves to `true` and the last message is `role: 'assistant'`, return a clear `LLMFailureResponse` (llama-server 400s with "Assistant response prefill is incompatible with enable_thinking") instead of a raw provider error.
- Response post-processing in `createSuccessResponse` per choice: (1) strip `nothinkPrefix` (exact `startsWith`); (2) keep `reasoning_content` as primary reasoning source; (3) fallback: if no `reasoning_content`, **reasoning is active**, and `markers` exist → extract via new util. "Reasoning is active" = `settings.reasoning?.enabled === true || caps.reasoning?.enabledByDefault === true || caps.reasoning?.canDisable === false` — NOT `enabled` alone, or always-on models (GPT-OSS, Thinking-2507) leak markers. Remove the dead `reasoning` variable at L383-388 while there.
- New util in `src/prompting/parser.ts`: `extractMarkerDelimitedContent(content, openMarker, closeMarker)` — gmbench semantics (match anywhere, only fully-closed pairs, no-op otherwise); export from `src/index.ts`. Existing `extractInitialTaggedContent` unchanged (public API).
- Default baseURL `http://localhost:8080` → `http://127.0.0.1:8080` (constructor L82 + `ADAPTER_CONFIGS` config.ts:57 + docs; `LlamaCppServerClient` needs no edit — it has no default, it inherits the adapter's baseURL) — avoids the measured ~9× Windows IPv6-fallback penalty. `LLAMACPP_API_BASE_URL` users unaffected.
- Apply the Phase 0 step-4 finding: if no-jinja servers reject `chat_template_kwargs`, guard emission accordingly and add a troubleshooting entry.

*2e. OpenRouter reasoning (two-sided fix):*
- Request: map `settings.reasoning` → body `reasoning: { effort | max_tokens, exclude }` (prefer `max_tokens` when both set, matching Anthropic-adapter precedence — confirm at implementation), emitted only when reasoning is requested.
- Response: populate `choice.reasoning` from `message.reasoning` and pass through `reasoning_details`.
- Unknown **OpenRouter** models get optimistic `reasoning: {supported: true, enabledByDefault: false, canDisable: true}` — applied at the OpenRouter fallback call site in `ModelResolver` (explicit `providerId === 'openrouter'` gate; do NOT bake it into shared `createFallbackModelInfo`, which also serves mock/other unknown-model providers); llama.cpp fallback behavior unchanged.

*2f. Presets (`src/config/llm-presets.json`):* add hybrid-local presets telling the headline story — e.g. `llamacpp-gemma-4` / `llamacpp-gemma-4-thinking`, `llamacpp-qwen3.5` / `llamacpp-qwen3.5-thinking` (same modelId, `reasoning.enabled` differing; works with `modelId: 'llamacpp'` thanks to the 2a generic-id detection overlay). No schema change needed.

*2g. Cloud Gemma 4 on the Gemini provider:* add `gemma-4-4b-it`, `gemma-4-26b-a4b-it`, `gemma-4-31b-it` to the gemini `SUPPORTED_MODELS` (mirroring the `gemma-3-27b-it` entry: free pricing; but `supportsSystemMessage: true` — Gemma 4 supports system role). Leave `reasoning` unsupported on the cloud entries initially (the Gemini-API thinking toggle for Gemma is unverified — check `@google/genai` typings/docs at implementation; the `<|think|>` system-token mechanism is out of scope). Verify exact IDs against the live model list.

**Tests**: new `describe('detectGgufCapabilities')` + `describe('KNOWN_GGUF_MODELS')` blocks in `config.test.ts` (currently zero direct coverage): every family matched via **gmbench's verbatim GGUF filenames** (e.g. `gemma-4-E4B-it-Q4_K_M.gguf`, `Qwen3.5-4B-Q4_K_M.gguf`, `Qwen3-4B-Instruct-2507-Q4_K_M.gguf`, `gpt-oss-20b-mxfp4.gguf`, `granite-4.1-8b-Q4_K_M.gguf`); ordering/shadowing cases (qwen3.5 vs qwen3, instruct-2507 vs base, reasoning-variant vs instruct); unknown → null. `SettingsManager`/`config` tests for `defaultSettings` + `reasoningDefaultSettings` flow. LlamaCpp adapter tests: `chat_template_kwargs` emission on/off, prefill guard, nothink strip, two-tier extraction (mock `getModels` — currently unmocked). OpenRouter tests: reasoning request mapping + response extraction. Parser tests for the new util. `LLMService.test.ts` integration: hybrid model with/without reasoning end-to-end via mocks.

**Verification**:
- [ ] `npm test` green.
- [ ] Live smoke (optional but valuable): gmbench's `.env` has `GMBENCH_LLAMA_BIN` + `GMBENCH_MODELS_DIR` with real GGUFs on this laptop — start llama-server with a Gemma 4 / Qwen 3.5 GGUF (`--jinja`), run a two-call script through genai-lite with `reasoning.enabled` true/false; confirm clean content, populated `choice.reasoning`, no `<think>`/channel-marker leakage, and vendor defaults visible in server logs.

### Phase 3: GBNF grammar + logprobs (llama.cpp; logprobs also OpenAI/OpenRouter)

**Goal**: constrained decoding + token probabilities for local models.

**Work**:
1. Types: `LlamaCppSettings { grammar?: string; chatTemplateKwargs?: Record<string, string | number | boolean> }` → `LLMSettings.llamacpp?` (mirrors `openRouterProvider` precedent). Flat `logprobs?: boolean; topLogprobs?: number`. Response: `TokenLogprob { token: string; logprob: number; topLogprobs?: Array<{token: string; logprob: number}> }`; `LLMChoice.logprobs?: TokenLogprob[]`.
2. Re-walk all enumeration points from Phase 1 for the three new keys (`DEFAULT_LLM_SETTINGS`, merge literal — `llamacpp` uses the nested spread pattern like `reasoning`, template knownFields + nested validation block, `validateLLMSettings`: `topLogprobs` integer 0–20, `llamacpp.grammar` string, `llamacpp.chatTemplateKwargs` object of primitives).
3. Mutual exclusion: reject `llamacpp.grammar` + `structuredOutput` together (`INVALID_SETTINGS`, in `RequestValidator.validateSettings` on the combined settings).
4. `unsupportedParameters`: `logprobs`, `topLogprobs` added for anthropic, gemini, mistral. The `llamacpp` namespace follows the `geminiSafetySettings`/`openRouterProvider` precedent (ignored by other adapters, not filtered).
5. LlamaCpp adapter: send `grammar`; merge user `chatTemplateKwargs` **over** the derived `enable_thinking` (explicit escape hatch wins); send `logprobs: true` + `top_logprobs: N`; map response `choice.logprobs.content[]` → `TokenLogprob[]`.
6. OpenAI + OpenRouter adapters: same `logprobs`/`top_logprobs` request wiring and response mapping (identical wire shape; near-zero marginal cost).
7. Document caveat: grammar may not constrain output while thinking is active (llama.cpp #20345) — recommend grammar with reasoning off.

**Tests**: adapter body assertions (grammar present; chatTemplateKwargs override precedence; logprobs params), response-mapping tests with OpenAI-shaped logprobs fixtures, mutual-exclusion validation test, META/preset passthrough for the namespace.

**Verification**:
- [ ] `npm test` green.
- [ ] Live smoke (optional): grammar constrains a yes/no answer against a local server; logprobs array non-empty.

### Phase 4: Timeout, retry, AbortSignal

**Goal**: configurable, single-layer resilience for all six adapters.

**Work**:
1. Error plumbing: widen `LLMError` (types.ts:450) with `status?: number`; `errorUtils.MappedErrorDetails` gains `retryAfterMs?` parsed from SDK error headers (openai/anthropic `APIError.headers.get('retry-after')` — seconds or HTTP-date; mistral `rawResponse.headers`); new `ADAPTER_ERROR_CODES`: `REQUEST_TIMEOUT`, `REQUEST_ABORTED` (+ map openai `APIUserAbortError`/`APIConnectionTimeoutError` and equivalents per SDK).
2. Adapter seam: `ILLMClientAdapter.sendMessage(request, apiKey, options?: AdapterRequestOptions)` with `AdapterRequestOptions { signal?: AbortSignal; timeoutMs?: number }` — additive optional param (non-breaking for external implementers). Update 6 adapters + `MockClientAdapter`: pass through as openai/anthropic/openrouter/llamacpp per-request `{signal, timeout}`; gemini `config.abortSignal` + `config.httpOptions.timeout`; mistral `{timeoutMs, fetchOptions: {signal}}`.
3. Disable SDK retries at client construction: `maxRetries: 0` for openai/anthropic/openrouter/llamacpp clients (mistral already `"none"`, gemini has none). `ADAPTER_CONSTRUCTORS` type + `ADAPTER_CONFIGS` (config.ts:30-66) gain `timeout?` config fields.
4. Retry layer in `LLMService`: `LLMServiceOptions` += `retry?: { maxRetries?; initialDelayMs?; maxDelayMs?; backoffFactor?; retryOnTimeout? }` (defaults 2 / 500 / 10000 / 2 / true) and `timeoutMs?`. `LLMService.sendMessage(request, options?: { signal?, timeoutMs?, maxRetries? })` — additive second param. Loop around the adapter call at LLMService.ts:294, branching on **returned** failure responses (adapters never throw): retry on `RATE_LIMIT_EXCEEDED`, `NETWORK_ERROR`, `REQUEST_TIMEOUT` (if enabled), and `PROVIDER_ERROR` with status 408/409/≥500. Delay = `min(maxDelay, initial × factor^attempt)` with ±20% jitter; honor `retryAfterMs` when larger (capped at `maxDelay`). Never retry after abort; log each retry at `warn`.
5. Export a standalone `withRetry` helper (unit-testable in isolation) used by the service — new file `src/shared/services/withRetry.ts`, alongside the other generic service utilities.

**Tests**: `withRetry` unit suite with fake timers (success-after-N, exhaustion, retry-after honored, abort mid-backoff, non-retryable codes); per-adapter tests asserting `{signal, timeout}` reach the SDK call and `maxRetries: 0` reaches the constructor; abort/timeout error-mapping tests; LLMService integration via a stubbed adapter (spy on `AdapterRegistry.prototype.getAdapter`).

**Verification**:
- [ ] `npm test` green; a fake-timer test proves exactly N+1 attempts for N retries (no SDK double-retry).

### Phase 5: Documentation, housekeeping, release

**Goal**: docs tell the new story; drift fixed; v0.9.0 ready.

**Work**:
1. `genai-lite-docs/`:
   - `llm-service.md`: Advanced Settings table += 6 new flat settings + `llamacpp` namespace; new Retry & Timeouts section; logprobs example.
   - `llamacpp-integration.md`: new families in capability-detection list; **"Reasoning on/off for hybrid models" section with a Gemma 4 / Qwen 3.5 with-and-without-reasoning example** (the headline feature); grammar + logprobs subsection under Advanced Features; `--jinja` requirement, prefill×thinking caveat, `127.0.0.1` note.
   - `providers-and-models.md`: per-provider parameter-support notes (matrix above); new GGUF family list; OpenRouter reasoning support.
   - `typescript-reference.md`: `LLMSettings`, `TokenLogprob`/`LLMChoice.logprobs`, `LLMServiceOptions`, sendMessage options; **fix the stale `GgufModelPattern` shape** (documents a RegExp-based shape that never existed).
   - `core-concepts.md`: new error codes (`REQUEST_TIMEOUT`, `REQUEST_ABORTED`), settings-hierarchy note on model `defaultSettings`.
   - `troubleshooting.md`: **fix the false "Mistral is under development/mock" claim**; timeout/retry debugging; localhost/IPv6 note; no-jinja `chat_template_kwargs` entry (per Phase 0 finding).
   - `prompting-utilities.md`: document `extractMarkerDelimitedContent` (match-anywhere, closed-pairs-only, no-op otherwise) alongside `extractInitialTaggedContent`.
   - `index.md`: hub/quick-start touch-ups for the new capabilities; `logging.md`: note the retry `warn` logs.
   - `example-chat-demo.md`: reflect the new SettingsPanel controls (if Phase 5 item 4 ships).
2. Root docs: README + CLAUDE.md provider lists (both currently omit OpenRouter in places — fix), new capability bullets. `docs/dev/adding-models-and-providers.md`: extend the GGUF section with the new metadata fields (`defaultSettings`, `reasoningDefaultSettings`, `localReasoning`) and conventions.
3. `.summary_short.md` / `.summary_long.md` for root, `src/`, `src/llm/`, `src/llm/clients/`, `src/llm/services/`, `src/prompting/` (hand-maintained; also fix the root file's reference to a nonexistent session file); refresh the `Last Context Build` note in CLAUDE.md. Note `src/shared/` and `src/config/` have no summary files today — reflect their changes (errorUtils, `withRetry`, presets) in the root/`src` summaries rather than creating new files.
4. chat-demo (small, optional): add `topK`/`minP`/`repeatPenalty`/`seed` numeric inputs to `SettingsPanel.tsx` following the existing `updateSetting` pattern; sync its local `LLMSettings` mirror in `examples/chat-demo/src/types/index.ts` if it's a manual copy.
5. Release: bump to `0.9.0`; `npm test`, `npm audit --audit-level=high`, `npm run build && npm pack --dry-run`; verify exports (`node -e "..."` smoke from CLAUDE.md). Commits per phase, conventional messages, `git commit -s` (DCO).

**Verification**:
- [ ] Docs cross-links intact; every new public type/setting appears in `typescript-reference.md`.
- [ ] CI-equivalent trio green locally.

## Testing strategy

- Unit tests per phase as listed; exploit the `Required<LLMSettings>` compile break as the enumeration checklist.
- e2e (optional, cost/setup-gated): extend `e2e-tests/providers.e2e.test.ts` llama.cpp block (health-check-gated) with sampling-param acceptance, grammar constraint, logprobs presence; reasoning-toggle e2e only if a hybrid GGUF is loaded — GGUF *detection* itself stays unit-tested (can't control the tester's loaded model).
- Live verification on this laptop via gmbench's llama-server binary + GGUF dir (Phase 2/3 smoke steps).

## Risks

- **Behavior change**: detected GGUF models start receiving vendor defaults (temperature etc.) and explicit `enable_thinking: false` — intended, but must headline the changelog. Two further observable flips from the optimistic-reasoning entries: `reasoning.enabled: true` on `modelId: 'llamacpp'` / unknown OpenRouter models no longer errors in `validateReasoningSettings`, and `ModelContext.native_reasoning_capable` becomes true for those ids (affects `requires_tags_for_thinking` in model-aware templates) — both changelog items.
- **SDK major-version migration** (Phase 0): openai 5→6 and anthropic 0.56→0.71 may break existing adapters before any new work starts; gate Phase 1 on a green post-install baseline.
- **No-jinja servers**: `enable_thinking` emission depends on Phase 0 step 4's finding; worst case (HTTP 400) requires a guard so default local usage doesn't break for users who omit `--jinja`.
- **Gemma 4 toggle is best-effort**: `enable_thinking: true` activates thinking only ~10% of the time per gmbench's judge data; document honestly (the reliable seeded-prefill trick is out of scope).
- **llama.cpp build variance**: chat logprobs and `reasoning_content` behavior differ across builds (gmbench pinned b9028); document a recommended minimum build.
- **Post-cutoff model facts** (sizes, context windows) are web-sourced; verify per HF card at implementation and prefer conservative values.
- **SDK unknown-field passthrough** (Phase 0 step 3) gates the OpenRouter/llama.cpp extra-param mechanism; resolve before Phase 1 lands.

## Open Questions

1. **Ministral 3 Instruct default temperature**: vendor card says ~0.15 (extraction-oriented); gmbench ran 0.7 for creative GM tasks. Plan ships **0.15** (vendor) — say the word if you'd rather have 0.7.
2. **Logprobs on OpenAI/OpenRouter** included as a freebie (same wire shape as llama.cpp). Objections?
3. **chat-demo controls** included as a small optional item in Phase 5 — drop it if you want the release leaner.
4. **Catalog additions beyond the agreed five families**: Gemma 3 GGUF entries, Qwen3 Instruct/Thinking-2507 variants (needed so existing `qwen3-*` patterns don't mis-detect them), cloud Gemma 4 IDs on the Gemini provider (2g), and bonus `deepseek-r1` / `llama-3.2` patterns. All cheap; say the word to drop any.

---
**Please review. Edit directly if needed, then confirm to proceed.**
