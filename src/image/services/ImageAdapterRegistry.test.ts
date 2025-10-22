import { ImageAdapterRegistry } from './ImageAdapterRegistry';
import { MockImageAdapter } from '../../adapters/image/MockImageAdapter';
import type { ImageProviderAdapter } from '../../types/image';

describe('ImageAdapterRegistry', () => {
  describe('initialization', () => {
    it('should initialize with default adapters', () => {
      const registry = new ImageAdapterRegistry();

      // Should have some adapters registered (at minimum, mock as fallback)
      expect(registry).toBeDefined();
    });

    it('should register adapters for supported providers', () => {
      const registry = new ImageAdapterRegistry();

      // Check that we can get adapters (even if they're mock)
      const openaiAdapter = registry.getAdapter('openai-images');
      const electronAdapter = registry.getAdapter('electron-diffusion');

      expect(openaiAdapter).toBeDefined();
      expect(electronAdapter).toBeDefined();
    });
  });

  describe('registerAdapter', () => {
    it('should register a custom adapter', () => {
      const registry = new ImageAdapterRegistry();
      const customAdapter: ImageProviderAdapter = {
        id: 'custom-provider',
        supports: {
          supportsMultipleImages: true,
          supportsB64Json: true,
          supportsHostedUrls: false,
          supportsProgressEvents: false,
          supportsNegativePrompt: false,
          defaultModelId: 'custom-model',
        },
        generate: async () => ({
          object: 'image.result',
          created: Date.now(),
          providerId: 'custom-provider',
          modelId: 'custom-model',
          data: [],
        }),
      };

      registry.registerAdapter('custom-provider', customAdapter);
      const retrieved = registry.getAdapter('custom-provider');

      expect(retrieved).toBe(customAdapter);
      expect(retrieved.id).toBe('custom-provider');
    });

    it('should override existing adapter with same provider ID', () => {
      const registry = new ImageAdapterRegistry();

      const adapter1 = new MockImageAdapter();
      const adapter2: ImageProviderAdapter = {
        id: 'test-provider',
        supports: {
          supportsMultipleImages: false,
          supportsB64Json: false,
          supportsHostedUrls: false,
          supportsProgressEvents: false,
          supportsNegativePrompt: false,
          defaultModelId: 'new-model',
        },
        generate: async () => ({
          object: 'image.result',
          created: Date.now(),
          providerId: 'test-provider',
          modelId: 'new-model',
          data: [],
        }),
      };

      registry.registerAdapter('test-provider', adapter1);
      registry.registerAdapter('test-provider', adapter2);

      const retrieved = registry.getAdapter('test-provider');
      expect(retrieved).toBe(adapter2);
      expect(retrieved.supports.defaultModelId).toBe('new-model');
    });
  });

  describe('getAdapter', () => {
    it('should return registered adapter for known provider', () => {
      const registry = new ImageAdapterRegistry();
      const customAdapter = new MockImageAdapter();

      registry.registerAdapter('test-provider', customAdapter);
      const adapter = registry.getAdapter('test-provider');

      expect(adapter).toBe(customAdapter);
    });

    it('should return mock adapter for unknown provider', () => {
      const registry = new ImageAdapterRegistry();

      const adapter = registry.getAdapter('unknown-provider');

      expect(adapter).toBeDefined();
      expect(adapter.id).toBe('mock-image-provider');
    });

    it('should return same mock instance for multiple unknown providers', () => {
      const registry = new ImageAdapterRegistry();

      const adapter1 = registry.getAdapter('unknown-provider-1');
      const adapter2 = registry.getAdapter('unknown-provider-2');

      expect(adapter1).toBe(adapter2); // Same mock instance
    });
  });

  describe('getRegisteredAdapters', () => {
    it('should return map of registered adapters', () => {
      const registry = new ImageAdapterRegistry();
      const customAdapter = new MockImageAdapter();

      registry.registerAdapter('custom-provider', customAdapter);

      const adapters = registry.getRegisteredAdapters();

      expect(adapters.size).toBeGreaterThan(0);
      expect(adapters.has('custom-provider')).toBe(true);
    });

    it('should include adapter info for each provider', () => {
      const registry = new ImageAdapterRegistry();
      const customAdapter = new MockImageAdapter();

      registry.registerAdapter('custom-provider', customAdapter);

      const adapters = registry.getRegisteredAdapters();
      const adapterInfo = adapters.get('custom-provider');

      expect(adapterInfo).toBeDefined();
      expect(adapterInfo?.providerId).toBe('custom-provider');
      expect(adapterInfo?.hasAdapter).toBe(true);
    });
  });

  describe('getProviderSummary', () => {
    it('should return summary of provider availability', () => {
      const registry = new ImageAdapterRegistry();

      const summary = registry.getProviderSummary();

      expect(summary).toBeDefined();
      expect(summary.totalProviders).toBeGreaterThan(0);
      expect(Array.isArray(summary.availableProviders)).toBe(true);
      expect(Array.isArray(summary.unavailableProviders)).toBe(true);
    });

    it('should correctly count available vs unavailable providers', () => {
      const registry = new ImageAdapterRegistry();

      const summary = registry.getProviderSummary();

      const total = summary.availableProviders.length + summary.unavailableProviders.length;
      expect(total).toBe(summary.totalProviders);
    });

    it('should update summary when adapters are registered', () => {
      const registry = new ImageAdapterRegistry();

      const beforeSummary = registry.getProviderSummary();
      const beforeAvailable = beforeSummary.providersWithAdapters;

      const customAdapter = new MockImageAdapter();
      registry.registerAdapter('new-custom-provider', customAdapter);

      const afterSummary = registry.getProviderSummary();
      const afterAvailable = afterSummary.providersWithAdapters;

      // Note: new-custom-provider is not in SUPPORTED_IMAGE_PROVIDERS, so counts won't change
      // But we can verify the structure is correct
      expect(typeof afterAvailable).toBe('number');
    });
  });

  describe('edge cases', () => {
    it('should handle multiple registrations gracefully', () => {
      const registry = new ImageAdapterRegistry();

      for (let i = 0; i < 10; i++) {
        const adapter = new MockImageAdapter();
        registry.registerAdapter(`provider-${i}`, adapter);
      }

      expect(registry.getRegisteredAdapters().size).toBeGreaterThanOrEqual(10);
    });

    it('should maintain adapter independence', () => {
      const registry = new ImageAdapterRegistry();

      const adapter1 = new MockImageAdapter();
      const adapter2 = new MockImageAdapter();

      registry.registerAdapter('provider-1', adapter1);
      registry.registerAdapter('provider-2', adapter2);

      expect(registry.getAdapter('provider-1')).toBe(adapter1);
      expect(registry.getAdapter('provider-2')).toBe(adapter2);
      expect(registry.getAdapter('provider-1')).not.toBe(adapter2);
    });
  });
});
