import type { Logger } from "../../logging/types";
import { createDefaultLogger } from "../../logging/defaultLogger";

/**
 * Information about a registered adapter
 */
export interface AdapterInfo<TProviderId extends string> {
  providerId: TProviderId;
  hasAdapter: boolean;
  adapterInfo?: { name: string };
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
 * Minimal provider information interface
 */
export interface MinimalProviderInfo<TProviderId extends string> {
  id: TProviderId;
  [key: string]: any; // Allow additional properties
}

/**
 * Configuration for adapter initialization
 */
export interface AdapterRegistryConfig<TAdapter, TProviderId extends string> {
  /** List of supported providers */
  supportedProviders: readonly MinimalProviderInfo<TProviderId>[];
  /** Map of provider IDs to adapter constructors */
  adapterConstructors?: Partial<Record<string, new (config?: any) => TAdapter>>;
  /** Map of provider IDs to adapter configurations */
  adapterConfigs?: Record<string, any>;
  /** Fallback adapter to use when no specific adapter is registered */
  fallbackAdapter: TAdapter;
  /** Optional custom adapters to register at initialization */
  customAdapters?: Record<string, TAdapter>;
}

/**
 * Generic registry for managing service adapters across different providers.
 * Handles adapter initialization, registration, and retrieval.
 *
 * @template TAdapter - The adapter interface type
 * @template TProviderId - The provider ID type (string union)
 */
export class AdapterRegistry<TAdapter, TProviderId extends string> {
  private adapters: Map<TProviderId, TAdapter>;
  private fallbackAdapter: TAdapter;
  private supportedProviders: readonly MinimalProviderInfo<TProviderId>[];
  private logger: Logger;

  /**
   * Creates a new AdapterRegistry
   *
   * @param config - Configuration for the registry
   * @param logger - Optional logger instance
   */
  constructor(config: AdapterRegistryConfig<TAdapter, TProviderId>, logger?: Logger) {
    this.adapters = new Map();
    this.fallbackAdapter = config.fallbackAdapter;
    this.supportedProviders = config.supportedProviders;
    this.logger = logger ?? createDefaultLogger();

    // Register custom adapters first if provided
    if (config.customAdapters) {
      for (const [providerId, adapter] of Object.entries(config.customAdapters)) {
        this.registerAdapter(providerId as TProviderId, adapter);
      }
    }

    // Initialize adapters from constructors
    if (config.adapterConstructors) {
      this.initializeAdapters(
        config.adapterConstructors,
        config.adapterConfigs || {}
      );
    }
  }

  /**
   * Initializes adapters for all supported providers using constructors
   */
  private initializeAdapters(
    adapterConstructors: Partial<Record<string, new (config?: any) => TAdapter>>,
    adapterConfigs: Record<string, any>
  ): void {
    let registeredCount = 0;
    const successfullyRegisteredProviders: string[] = [];

    for (const provider of this.supportedProviders) {
      const providerId = provider.id as TProviderId;

      // Skip if adapter is already registered (from custom adapters)
      if (this.adapters.has(providerId)) {
        this.logger.debug(
          `AdapterRegistry: Skipping constructor initialization for '${provider.id}' ` +
          `(custom adapter already registered)`
        );
        continue;
      }

      const AdapterClass = adapterConstructors[provider.id];
      if (AdapterClass) {
        try {
          const adapterConfig = adapterConfigs[provider.id];
          const adapterInstance = new AdapterClass(adapterConfig);
          this.registerAdapter(providerId, adapterInstance);
          registeredCount++;
          successfullyRegisteredProviders.push(provider.id);
        } catch (error) {
          this.logger.error(
            `AdapterRegistry: Failed to instantiate adapter for provider '${provider.id}'. ` +
            `This provider will use the fallback adapter. Error:`,
            error
          );
        }
      } else {
        this.logger.warn(
          `AdapterRegistry: No adapter constructor found for supported provider '${provider.id}'. ` +
          `This provider will use the fallback adapter.`
        );
      }
    }

    if (registeredCount > 0) {
      this.logger.debug(
        `AdapterRegistry: Initialized with ${registeredCount} dynamically registered adapter(s) ` +
        `for: ${successfullyRegisteredProviders.join(', ')}.`
      );
    } else {
      this.logger.debug(
        `AdapterRegistry: No real adapters were dynamically registered. ` +
        `All providers will use the fallback adapter.`
      );
    }
  }

  /**
   * Registers an adapter for a specific provider
   *
   * @param providerId - The provider ID
   * @param adapter - The adapter implementation
   */
  registerAdapter(providerId: TProviderId, adapter: TAdapter): void {
    this.adapters.set(providerId, adapter);
    this.logger.debug(`AdapterRegistry: Registered adapter for provider: ${providerId}`);
  }

  /**
   * Gets the appropriate adapter for a provider
   *
   * @param providerId - The provider ID
   * @returns The adapter to use
   */
  getAdapter(providerId: TProviderId): TAdapter {
    // Check for registered real adapters first
    const registeredAdapter = this.adapters.get(providerId);
    if (registeredAdapter) {
      this.logger.debug(`AdapterRegistry: Using registered adapter for provider: ${providerId}`);
      return registeredAdapter;
    }

    // Fall back to fallback adapter for unsupported providers
    this.logger.debug(
      `AdapterRegistry: No real adapter found for ${providerId}, using fallback adapter`
    );
    return this.fallbackAdapter;
  }

  /**
   * Gets information about registered adapters
   *
   * @returns Map of provider IDs to adapter info
   */
  getRegisteredAdapters(): Map<TProviderId, AdapterInfo<TProviderId>> {
    const adapterInfo = new Map<TProviderId, AdapterInfo<TProviderId>>();

    for (const [providerId, adapter] of this.adapters.entries()) {
      // Try to get adapter info if the adapter has a getAdapterInfo method
      const adapterInfoData = (adapter as any).getAdapterInfo?.() ||
                             { name: (adapter as any).id || 'Unknown Adapter' };

      adapterInfo.set(providerId, {
        providerId,
        hasAdapter: true,
        adapterInfo: adapterInfoData,
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

    for (const provider of this.supportedProviders) {
      if (this.adapters.has(provider.id as TProviderId)) {
        availableProviders.push(provider.id);
      } else {
        unavailableProviders.push(provider.id);
      }
    }

    return {
      totalProviders: this.supportedProviders.length,
      providersWithAdapters: availableProviders.length,
      availableProviders,
      unavailableProviders,
    };
  }
}
