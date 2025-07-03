import type { ApiKeyProvider } from "../types";

/**
 * Creates an ApiKeyProvider that sources keys from system environment variables.
 * It looks for variables in the format: PROVIDERID_API_KEY (e.g., OPENAI_API_KEY).
 * This is a secure and standard practice for server-side applications.
 * Note: Provider IDs are converted to uppercase.
 */
export const fromEnvironment: ApiKeyProvider = async (providerId: string) => {
  const envVarName = `${providerId.toUpperCase()}_API_KEY`;
  return process.env[envVarName] || null;
};