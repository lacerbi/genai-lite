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

  return providers.map(provider => ({
    ...provider,
    available: checkApiKeyAvailable(provider.id)
  }));
}

/**
 * Check if an API key is available for a provider
 */
function checkApiKeyAvailable(providerId: string): boolean {
  // llama.cpp doesn't need an API key
  if (providerId === 'llamacpp') {
    return true;
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
