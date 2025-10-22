import type { ImageProviderId } from '../../types/image';
import type { ImageProviderAdapter } from '../../types/image';
import { MockImageAdapter } from '../../adapters/image/MockImageAdapter';
import { SUPPORTED_IMAGE_PROVIDERS, IMAGE_ADAPTER_CONFIGS } from '../config';

/**
 * Information about a registered adapter
 */
export interface AdapterInfo {
  providerId: ImageProviderId;
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
 * Registry for managing image provider adapters
 */
export class ImageAdapterRegistry {
  private imageAdapters: Map<ImageProviderId, ImageProviderAdapter>;
  private mockImageAdapter: MockImageAdapter;

  constructor() {
    this.imageAdapters = new Map();
    this.mockImageAdapter = new MockImageAdapter();
    this.initializeAdapters();
  }

  /**
   * Initializes adapters for all supported providers
   * Note: In Phase 3, we're only setting up the registry structure.
   * Real adapters (OpenAI, Electron) will be added in Phases 4-5.
   */
  private initializeAdapters(): void {
    console.log('ImageAdapterRegistry: Initializing image adapters');

    // For Phase 3, we don't have real adapter implementations yet
    // They will be added in Phase 4 (OpenAI) and Phase 5 (Electron)
    // For now, all providers will use the mock adapter as fallback

    console.log(
      `ImageAdapterRegistry: Registry initialized. Real adapters will be added in Phases 4-5. ` +
      `Currently using mock adapter as fallback for all providers.`
    );
  }

  /**
   * Registers an image adapter for a specific provider
   *
   * @param providerId - The provider ID
   * @param adapter - The adapter implementation
   */
  registerAdapter(
    providerId: ImageProviderId,
    adapter: ImageProviderAdapter
  ): void {
    this.imageAdapters.set(providerId, adapter);
    console.log(`ImageAdapterRegistry: Registered adapter for provider: ${providerId}`);
  }

  /**
   * Gets the appropriate adapter for a provider
   *
   * @param providerId - The provider ID
   * @returns The adapter to use
   */
  getAdapter(providerId: ImageProviderId): ImageProviderAdapter {
    // Check for registered real adapters first
    const registeredAdapter = this.imageAdapters.get(providerId);
    if (registeredAdapter) {
      console.log(`ImageAdapterRegistry: Using registered adapter for provider: ${providerId}`);
      return registeredAdapter;
    }

    // Fall back to mock adapter for unsupported providers
    console.log(
      `ImageAdapterRegistry: No real adapter found for ${providerId}, using mock adapter`
    );
    return this.mockImageAdapter;
  }

  /**
   * Gets information about registered adapters
   *
   * @returns Map of provider IDs to adapter info
   */
  getRegisteredAdapters(): Map<ImageProviderId, AdapterInfo> {
    const adapterInfo = new Map<ImageProviderId, AdapterInfo>();

    for (const [providerId, adapter] of this.imageAdapters.entries()) {
      adapterInfo.set(providerId, {
        providerId,
        hasAdapter: true,
        adapterInfo: { name: adapter.id },
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

    for (const provider of SUPPORTED_IMAGE_PROVIDERS) {
      if (this.imageAdapters.has(provider.id)) {
        availableProviders.push(provider.id);
      } else {
        unavailableProviders.push(provider.id);
      }
    }

    return {
      totalProviders: SUPPORTED_IMAGE_PROVIDERS.length,
      providersWithAdapters: availableProviders.length,
      availableProviders,
      unavailableProviders,
    };
  }
}
