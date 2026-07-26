/**
 * Jest globalSetup for the E2E suites.
 *
 * Probes optional local services once, before Jest registers any tests, and
 * publishes the result on `process.env` so suites can gate with
 * `describe.skip` at *registration* time.
 *
 * Why not just check inside the test body? Because a runtime
 * `if (!available) return;` cannot skip a Jest test — an assertion-free
 * function is scored as **passed**. That produced green-but-empty results that
 * inflated the pass count and would mask a real regression (the same
 * silent-skip failure mode that let an Anthropic request-shape drift go
 * unnoticed). The availability decision therefore has to happen before the
 * tests exist.
 *
 * Uses 127.0.0.1 rather than localhost to avoid the ~2s per-request
 * IPv6-fallback stall on Windows, matching the llama.cpp adapter's own default.
 */

const LLAMACPP_BASE_URL = process.env.LLAMACPP_API_BASE_URL || 'http://127.0.0.1:8080';
const PROBE_TIMEOUT_MS = 2000;

module.exports = async function globalSetup() {
  // Honor an explicit override so the gated suites can be forced on or off
  // without a live server (useful for checking that they really do run, and for
  // CI environments that provision llama-server out of band).
  if (process.env.E2E_LLAMACPP_AVAILABLE === 'true' || process.env.E2E_LLAMACPP_AVAILABLE === 'false') {
    console.log(
      `[e2e] llama-server availability overridden via E2E_LLAMACPP_AVAILABLE=${process.env.E2E_LLAMACPP_AVAILABLE} (health probe skipped)`
    );
    return;
  }

  let available = false;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
    const response = await fetch(`${LLAMACPP_BASE_URL}/health`, {
      signal: controller.signal,
    });
    clearTimeout(timer);
    available = response.ok;
  } catch {
    available = false;
  }

  process.env.E2E_LLAMACPP_AVAILABLE = available ? 'true' : 'false';

  console.log(
    `[e2e] llama-server at ${LLAMACPP_BASE_URL}: ` +
      (available
        ? 'AVAILABLE (local suites will run)'
        : 'NOT AVAILABLE (local suites will be reported as skipped, not passed)')
  );
};
