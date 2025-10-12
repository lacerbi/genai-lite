import { LLMService, fromEnvironment } from 'genai-lite';
import type {
  LLMChatRequest,
  LLMResponse,
  LLMFailureResponse,
  ProviderInfo,
  ModelInfo,
  LLMSettings
} from 'genai-lite';

/**
 * Initialize the LLM service with environment variable API key provider
 */
export const llmService = new LLMService(fromEnvironment);

/**
 * Get all available providers with API key availability check
 */
export async function getProviders(): Promise<Array<ProviderInfo & { available: boolean }>> {
  const providers = await llmService.getProviders();

  // Check availability for each provider (some checks are async)
  const providersWithAvailability = await Promise.all(
    providers.map(async (provider) => ({
      ...provider,
      available: await checkApiKeyAvailable(provider.id)
    }))
  );

  return providersWithAvailability;
}

/**
 * Check if an API key is available for a provider
 * For llamacpp, check if the server is actually running
 */
async function checkApiKeyAvailable(providerId: string): Promise<boolean> {
  // For llama.cpp, check if the server is running
  if (providerId === 'llamacpp') {
    try {
      const baseURL = process.env.LLAMACPP_API_BASE_URL || 'http://localhost:8080';
      const response = await fetch(`${baseURL}/health`, {
        signal: AbortSignal.timeout(2000) // 2 second timeout
      });
      return response.ok;
    } catch (error) {
      // Server not running or not reachable
      return false;
    }
  }

  // Check for environment variable
  const envVar = `${providerId.toUpperCase()}_API_KEY`;
  return !!process.env[envVar];
}

/**
 * Get models for a specific provider
 */
export async function getModels(providerId: string): Promise<ModelInfo[]> {
  return await llmService.getModels(providerId);
}

/**
 * Send a chat message to an LLM provider
 */
export async function sendChatMessage(request: {
  providerId: string;
  modelId: string;
  messages: Array<{ role: string; content: string }>;
  settings?: LLMSettings;
}): Promise<LLMResponse | LLMFailureResponse> {
  const chatRequest: LLMChatRequest = {
    providerId: request.providerId,
    modelId: request.modelId,
    messages: request.messages.map(msg => ({
      role: msg.role as 'user' | 'assistant' | 'system',
      content: msg.content
    })),
    settings: request.settings
  };

  return await llmService.sendMessage(chatRequest);
}

/**
 * Get all configured presets
 */
export function getPresets() {
  return llmService.getPresets();
}
