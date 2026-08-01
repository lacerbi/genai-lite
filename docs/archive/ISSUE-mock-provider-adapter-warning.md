# AdapterRegistry warns about the intentionally adapter-less `mock` provider

Created: 2026-07-31
Status: COMPLETE
Resolved: 2026-08-01
Resolution release: v0.17.1
Package: genai-lite (v0.17.0 at filing)
Filed by: Palimpsest Engine

## Observation

Every real `LLMService` construction logs:

```
[genai-lite:warn] AdapterRegistry: No adapter constructor found for supported provider 'mock'. This provider will use the fallback adapter.
```

The provider list (`dist/llm/config.js`, entry `id: "mock"`) declares the mock seam as a
supported provider, and `AdapterRegistry` warns for every declared provider without an
adapter constructor — which `mock` never has in a production process by design. The
warning therefore fires in every downstream application log on every cloud-touching run
(first observed in Palimpsest's GUI running an OpenRouter Scribe with a local Clerk;
everything worked — the fallback adapter is only reachable if a request actually names
provider `mock`, which real runs never do).

## Request

Suppress the warning for providers that are declared adapter-less by design (the mock
seam), or demote it to debug level for that provider id. A warning that fires on every
healthy startup trains operators to ignore the level; the registry's warn should be
reserved for providers a user could plausibly expect to work.

## Non-request

No behavior change: the fallback routing itself is correct and the mock seam's
declaration in the provider list is presumably deliberate. This is log hygiene only.

## Acceptance criteria

- [x] Healthy `LLMService` construction does not warn about the intentionally
  adapter-less `mock` provider.
- [x] Unexpected missing adapter constructors continue to emit warnings.
- [x] The `mock` provider continues to route through the fallback adapter.
- [x] The full unit test suite passes.
- [x] The TypeScript build passes.

## Resolution

`AdapterRegistryConfig` now accepts `intentionalFallbackProviderIds`. Missing
constructors for those providers are reported at debug level, while other
missing constructors retain the existing warning. `LLMService` declares only
the `mock` provider as an intentional fallback provider, preserving its routing
behavior while removing the warning from healthy startup logs.

Regression coverage verifies both sides of the logging distinction and the
LLM service integration. Release publication remains part of the normal
release workflow.

Verification completed on 2026-08-01 with 47 Jest suites / 1,100 tests and a
strict TypeScript build.
