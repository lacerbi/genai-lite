import { AdapterRegistry, type AdapterRegistryConfig, type MinimalProviderInfo } from './AdapterRegistry';

// Test adapter interface
interface TestAdapter {
  id: string;
  getName(): string;
  getAdapterInfo?(): { name: string };
}

// Test provider ID type
type TestProviderId = 'provider1' | 'provider2' | 'provider3';

// Mock adapter classes
class Provider1Adapter implements TestAdapter {
  id = 'provider1';
  getName() { return 'Provider 1 Adapter'; }
  getAdapterInfo() { return { name: 'Provider 1 Adapter' }; }
}

class Provider2Adapter implements TestAdapter {
  id = 'provider2';
  getName() { return 'Provider 2 Adapter'; }
  getAdapterInfo() { return { name: 'Provider 2 Adapter' }; }
}

class FallbackAdapter implements TestAdapter {
  id = 'fallback';
  getName() { return 'Fallback Adapter'; }
}

const SUPPORTED_PROVIDERS: MinimalProviderInfo<TestProviderId>[] = [
  { id: 'provider1', displayName: 'Provider 1' },
  { id: 'provider2', displayName: 'Provider 2' },
  { id: 'provider3', displayName: 'Provider 3' },
];

describe('AdapterRegistry (Generic)', () => {
  describe('constructor and initialization', () => {
    it('should initialize with fallback adapter only', () => {
      const config: AdapterRegistryConfig<TestAdapter, TestProviderId> = {
        supportedProviders: SUPPORTED_PROVIDERS,
        fallbackAdapter: new FallbackAdapter(),
      };

      const registry = new AdapterRegistry(config);
      const summary = registry.getProviderSummary();

      expect(summary.totalProviders).toBe(3);
      expect(summary.providersWithAdapters).toBe(0);
      expect(summary.unavailableProviders).toEqual(['provider1', 'provider2', 'provider3']);
    });

    it('should initialize with adapter constructors', () => {
      const config: AdapterRegistryConfig<TestAdapter, TestProviderId> = {
        supportedProviders: SUPPORTED_PROVIDERS,
        fallbackAdapter: new FallbackAdapter(),
        adapterConstructors: {
          provider1: Provider1Adapter,
          provider2: Provider2Adapter,
        },
      };

      const registry = new AdapterRegistry(config);
      const summary = registry.getProviderSummary();

      expect(summary.totalProviders).toBe(3);
      expect(summary.providersWithAdapters).toBe(2);
      expect(summary.availableProviders).toEqual(['provider1', 'provider2']);
      expect(summary.unavailableProviders).toEqual(['provider3']);
    });

    it('should pass adapter configs to constructors', () => {
      class ConfigurableAdapter implements TestAdapter {
        id = 'configurable';
        constructor(public config: { value: number }) {}
        getName() { return `Adapter with value ${this.config.value}`; }
      }

      const config: AdapterRegistryConfig<TestAdapter, TestProviderId> = {
        supportedProviders: SUPPORTED_PROVIDERS,
        fallbackAdapter: new FallbackAdapter(),
        adapterConstructors: {
          provider1: ConfigurableAdapter,
        },
        adapterConfigs: {
          provider1: { value: 42 },
        },
      };

      const registry = new AdapterRegistry(config);
      const adapter = registry.getAdapter('provider1' as TestProviderId);

      expect((adapter as any).config.value).toBe(42);
    });

    it('should handle constructor errors gracefully', () => {
      class FailingAdapter implements TestAdapter {
        id = 'failing';
        constructor() {
          throw new Error('Initialization failed');
        }
        getName() { return 'Never called'; }
      }

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      const config: AdapterRegistryConfig<TestAdapter, TestProviderId> = {
        supportedProviders: SUPPORTED_PROVIDERS,
        fallbackAdapter: new FallbackAdapter(),
        adapterConstructors: {
          provider1: FailingAdapter,
        },
      };

      const registry = new AdapterRegistry(config);
      const summary = registry.getProviderSummary();

      expect(summary.providersWithAdapters).toBe(0);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Failed to instantiate adapter for provider 'provider1'"),
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });

    it('should register custom adapters before constructors', () => {
      const customAdapter = new Provider1Adapter();
      (customAdapter as any).customFlag = true;

      const config: AdapterRegistryConfig<TestAdapter, TestProviderId> = {
        supportedProviders: SUPPORTED_PROVIDERS,
        fallbackAdapter: new FallbackAdapter(),
        customAdapters: {
          provider1: customAdapter,
        },
        adapterConstructors: {
          provider1: Provider1Adapter, // Should not override custom adapter
        },
      };

      const registry = new AdapterRegistry(config);
      const adapter = registry.getAdapter('provider1' as TestProviderId);

      expect((adapter as any).customFlag).toBe(true);
    });
  });

  describe('registerAdapter', () => {
    it('should register a new adapter', () => {
      const config: AdapterRegistryConfig<TestAdapter, TestProviderId> = {
        supportedProviders: SUPPORTED_PROVIDERS,
        fallbackAdapter: new FallbackAdapter(),
      };

      const registry = new AdapterRegistry(config);
      const adapter = new Provider1Adapter();

      registry.registerAdapter('provider1', adapter);

      const retrieved = registry.getAdapter('provider1');
      expect(retrieved).toBe(adapter);
    });

    it('should override existing adapter when registering', () => {
      const config: AdapterRegistryConfig<TestAdapter, TestProviderId> = {
        supportedProviders: SUPPORTED_PROVIDERS,
        fallbackAdapter: new FallbackAdapter(),
        adapterConstructors: {
          provider1: Provider1Adapter,
        },
      };

      const registry = new AdapterRegistry(config);
      const newAdapter = new Provider2Adapter();

      registry.registerAdapter('provider1', newAdapter);

      const retrieved = registry.getAdapter('provider1');
      expect(retrieved).toBe(newAdapter);
    });
  });

  describe('getAdapter', () => {
    it('should return registered adapter for known provider', () => {
      const config: AdapterRegistryConfig<TestAdapter, TestProviderId> = {
        supportedProviders: SUPPORTED_PROVIDERS,
        fallbackAdapter: new FallbackAdapter(),
        adapterConstructors: {
          provider1: Provider1Adapter,
        },
      };

      const registry = new AdapterRegistry(config);
      const adapter = registry.getAdapter('provider1');

      expect(adapter.getName()).toBe('Provider 1 Adapter');
    });

    it('should return fallback adapter for unknown provider', () => {
      const config: AdapterRegistryConfig<TestAdapter, TestProviderId> = {
        supportedProviders: SUPPORTED_PROVIDERS,
        fallbackAdapter: new FallbackAdapter(),
      };

      const registry = new AdapterRegistry(config);
      const adapter = registry.getAdapter('provider1');

      expect(adapter.getName()).toBe('Fallback Adapter');
    });
  });

  describe('getRegisteredAdapters', () => {
    it('should return information about registered adapters', () => {
      const config: AdapterRegistryConfig<TestAdapter, TestProviderId> = {
        supportedProviders: SUPPORTED_PROVIDERS,
        fallbackAdapter: new FallbackAdapter(),
        adapterConstructors: {
          provider1: Provider1Adapter,
          provider2: Provider2Adapter,
        },
      };

      const registry = new AdapterRegistry(config);
      const adapters = registry.getRegisteredAdapters();

      expect(adapters.size).toBe(2);
      expect(adapters.get('provider1')).toEqual({
        providerId: 'provider1',
        hasAdapter: true,
        adapterInfo: { name: 'Provider 1 Adapter' },
      });
    });

    it('should handle adapters without getAdapterInfo method', () => {
      class SimpleAdapter implements TestAdapter {
        id = 'simple';
        getName() { return 'Simple Adapter'; }
      }

      const config: AdapterRegistryConfig<TestAdapter, TestProviderId> = {
        supportedProviders: SUPPORTED_PROVIDERS,
        fallbackAdapter: new FallbackAdapter(),
      };

      const registry = new AdapterRegistry(config);
      registry.registerAdapter('provider1', new SimpleAdapter());

      const adapters = registry.getRegisteredAdapters();
      expect(adapters.get('provider1')?.adapterInfo?.name).toBe('simple');
    });
  });

  describe('getProviderSummary', () => {
    it('should provide accurate summary of providers', () => {
      const config: AdapterRegistryConfig<TestAdapter, TestProviderId> = {
        supportedProviders: SUPPORTED_PROVIDERS,
        fallbackAdapter: new FallbackAdapter(),
        adapterConstructors: {
          provider1: Provider1Adapter,
        },
      };

      const registry = new AdapterRegistry(config);
      const summary = registry.getProviderSummary();

      expect(summary).toEqual({
        totalProviders: 3,
        providersWithAdapters: 1,
        availableProviders: ['provider1'],
        unavailableProviders: ['provider2', 'provider3'],
      });
    });

    it('should update summary after manual registration', () => {
      const config: AdapterRegistryConfig<TestAdapter, TestProviderId> = {
        supportedProviders: SUPPORTED_PROVIDERS,
        fallbackAdapter: new FallbackAdapter(),
      };

      const registry = new AdapterRegistry(config);
      let summary = registry.getProviderSummary();

      expect(summary.providersWithAdapters).toBe(0);

      registry.registerAdapter('provider1', new Provider1Adapter());
      registry.registerAdapter('provider2', new Provider2Adapter());

      summary = registry.getProviderSummary();
      expect(summary.providersWithAdapters).toBe(2);
      expect(summary.availableProviders).toEqual(['provider1', 'provider2']);
    });
  });

  describe('Type Safety', () => {
    it('should enforce provider ID types', () => {
      const config: AdapterRegistryConfig<TestAdapter, TestProviderId> = {
        supportedProviders: SUPPORTED_PROVIDERS,
        fallbackAdapter: new FallbackAdapter(),
      };

      const registry = new AdapterRegistry(config);

      // TypeScript should enforce that only valid provider IDs can be used
      const adapter = registry.getAdapter('provider1'); // Valid
      expect(adapter).toBeDefined();

      // This would be a TypeScript error:
      // const invalid = registry.getAdapter('invalid'); // Error
    });
  });
});
