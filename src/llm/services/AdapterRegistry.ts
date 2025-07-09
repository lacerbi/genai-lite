import type { ApiProviderId } from "../types";
import type { ILLMClientAdapter } from "../clients/types";
import { MockClientAdapter } from "../clients/MockClientAdapter";
import { OpenAIClientAdapter } from "../clients/OpenAIClientAdapter";
import { AnthropicClientAdapter } from "../clients/AnthropicClientAdapter";
import { GeminiClientAdapter } from "../clients/GeminiClientAdapter";
import {
  SUPPORTED_PROVIDERS,
  ADAPTER_CONSTRUCTORS,
  ADAPTER_CONFIGS,
} from "../config";

/**
 * Information about a registered adapter
 */
export interface AdapterInfo {
  providerId: ApiProviderId;
  hasAdapter: boolean;
  adapterInfo: { name: string };
}

/**
 * Summary of provider availability
 */
export interface ProviderSummary {
  totalProviders: number;
  providersWithAdapters: number;
  availableProviders: string[];
  unavailableProviders: string[];
}

/**
 * Registry for managing LLM client adapters
 */
export class AdapterRegistry {
  private clientAdapters: Map<ApiProviderId, ILLMClientAdapter>;
  private mockClientAdapter: MockClientAdapter;

  constructor() {
    this.clientAdapters = new Map();
    this.mockClientAdapter = new MockClientAdapter();
    this.initializeAdapters();
  }

  /**
   * Initializes adapters for all supported providers
   */
  private initializeAdapters(): void {
    let registeredCount = 0;
    const successfullyRegisteredProviders: ApiProviderId[] = [];

    for (const provider of SUPPORTED_PROVIDERS) {
      const AdapterClass = ADAPTER_CONSTRUCTORS[provider.id];
      if (AdapterClass) {
        try {
          const adapterConfig = ADAPTER_CONFIGS[provider.id];
          const adapterInstance = new AdapterClass(adapterConfig);
          this.registerAdapter(provider.id, adapterInstance);
          registeredCount++;
          successfullyRegisteredProviders.push(provider.id);
        } catch (error) {
          console.error(
            `LLMService: Failed to instantiate adapter for provider '${provider.id}'. This provider will use the mock adapter. Error:`,
            error
          );
        }
      } else {
        console.warn(
          `LLMService: No adapter constructor found for supported provider '${provider.id}'. This provider will use the mock adapter as a fallback.`
        );
      }
    }

    if (registeredCount > 0) {
      console.log(
        `LLMService: Initialized with ${registeredCount} dynamically registered adapter(s) for: ${successfullyRegisteredProviders.join(
          ", "
        )}.`
      );
    } else {
      console.log(
        `LLMService: No real adapters were dynamically registered. All providers will use the mock adapter.`
      );
    }
  }

  /**
   * Registers a client adapter for a specific provider
   *
   * @param providerId - The provider ID
   * @param adapter - The client adapter implementation
   */
  registerAdapter(
    providerId: ApiProviderId,
    adapter: ILLMClientAdapter
  ): void {
    this.clientAdapters.set(providerId, adapter);
    console.log(`Registered client adapter for provider: ${providerId}`);
  }

  /**
   * Gets the appropriate client adapter for a provider
   *
   * @param providerId - The provider ID
   * @returns The client adapter to use
   */
  getAdapter(providerId: ApiProviderId): ILLMClientAdapter {
    // Check for registered real adapters first
    const registeredAdapter = this.clientAdapters.get(providerId);
    if (registeredAdapter) {
      console.log(`Using registered adapter for provider: ${providerId}`);
      return registeredAdapter;
    }

    // Fall back to mock adapter for unsupported providers
    console.log(`No real adapter found for ${providerId}, using mock adapter`);
    return this.mockClientAdapter;
  }

  /**
   * Gets information about registered adapters
   *
   * @returns Map of provider IDs to adapter info
   */
  getRegisteredAdapters(): Map<ApiProviderId, AdapterInfo> {
    const adapterInfo = new Map<ApiProviderId, AdapterInfo>();

    for (const [providerId, adapter] of this.clientAdapters.entries()) {
      adapterInfo.set(providerId, {
        providerId,
        hasAdapter: true,
        adapterInfo: adapter.getAdapterInfo?.() || { name: "Unknown Adapter" },
      });
    }

    return adapterInfo;
  }

  /**
   * Gets a summary of available providers and their adapter status
   *
   * @returns Summary of provider availability
   */
  getProviderSummary(): ProviderSummary {
    const availableProviders: string[] = [];
    const unavailableProviders: string[] = [];

    for (const provider of SUPPORTED_PROVIDERS) {
      if (this.clientAdapters.has(provider.id)) {
        availableProviders.push(provider.id);
      } else {
        unavailableProviders.push(provider.id);
      }
    }

    return {
      totalProviders: SUPPORTED_PROVIDERS.length,
      providersWithAdapters: availableProviders.length,
      availableProviders,
      unavailableProviders,
    };
  }
}