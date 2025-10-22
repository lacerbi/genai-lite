import type { ApiKeyProvider } from "../types";

/**
 * Provider-specific environment variable aliases.
 * Allows providers to accept alternative env var names for convenience.
 *
 * Example: 'openai-images' accepts both OPENAI_IMAGES_API_KEY and OPENAI_API_KEY
 */
const PROVIDER_ENV_VAR_ALIASES: Record<string, string[]> = {
  'openai-images': ['OPENAI'],  // Accepts standard OPENAI_API_KEY
};

/**
 * Creates an ApiKeyProvider that sources keys from system environment variables.
 * It looks for variables in the format: PROVIDERID_API_KEY (e.g., OPENAI_IMAGES_API_KEY).
 * This is a secure and standard practice for server-side applications.
 * Note: Provider IDs are converted to uppercase.
 *
 * Special handling:
 * - llamacpp: Returns 'not-needed' (local server, no authentication)
 * - mock: Returns 'not-needed' (test provider, no authentication)
 * - genai-electron-images: Returns 'not-needed' (local server, no authentication)
 *
 * Provider Aliases:
 * - openai-images: Also accepts OPENAI_API_KEY (standard OpenAI env var)
 */
export const fromEnvironment: ApiKeyProvider = async (providerId: string) => {
  // Providers that don't require API keys (local/test providers)
  if (providerId === 'llamacpp' || providerId === 'mock' || providerId === 'genai-electron-images') {
    return 'not-needed';
  }

  // Try standard env var first: PROVIDERID_API_KEY
  const standardEnvVar = `${providerId.toUpperCase().replace(/-/g, '_')}_API_KEY`;
  if (process.env[standardEnvVar]) {
    return process.env[standardEnvVar];
  }

  // Try aliases
  const aliases = PROVIDER_ENV_VAR_ALIASES[providerId] || [];
  for (const alias of aliases) {
    const aliasEnvVar = `${alias.toUpperCase()}_API_KEY`;
    if (process.env[aliasEnvVar]) {
      return process.env[aliasEnvVar];
    }
  }

  return null;
};