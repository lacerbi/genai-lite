// Mock the client adapters first
jest.mock('../clients/MockClientAdapter');
jest.mock('../clients/OpenAIClientAdapter', () => ({
  OpenAIClientAdapter: jest.fn().mockImplementation(() => ({
    sendMessage: jest.fn(),
    getAdapterInfo: () => ({ providerId: 'openai', name: 'OpenAI Adapter' })
  }))
}));
jest.mock('../clients/AnthropicClientAdapter', () => ({
  AnthropicClientAdapter: jest.fn().mockImplementation(() => ({
    sendMessage: jest.fn(),
    getAdapterInfo: () => ({ providerId: 'anthropic', name: 'Anthropic Adapter' })
  }))
}));
jest.mock('../clients/GeminiClientAdapter', () => ({
  GeminiClientAdapter: jest.fn().mockImplementation(() => ({
    sendMessage: jest.fn(),
    getAdapterInfo: () => ({ providerId: 'gemini', name: 'Gemini Adapter' })
  }))
}));

// Mock the config imports - must be before imports that use it
jest.mock('../config', () => {
  const { OpenAIClientAdapter } = require('../clients/OpenAIClientAdapter');
  const { AnthropicClientAdapter } = require('../clients/AnthropicClientAdapter');
  const { GeminiClientAdapter } = require('../clients/GeminiClientAdapter');
  
  return {
    SUPPORTED_PROVIDERS: [
      { id: 'openai', name: 'OpenAI' },
      { id: 'anthropic', name: 'Anthropic' },
      { id: 'gemini', name: 'Google Gemini' },
      { id: 'mistral', name: 'Mistral' }
    ],
    ADAPTER_CONSTRUCTORS: {
      openai: OpenAIClientAdapter,
      anthropic: AnthropicClientAdapter,
      gemini: GeminiClientAdapter,
      // mistral intentionally missing to test fallback
    },
    ADAPTER_CONFIGS: {
      openai: {},
      anthropic: {},
      gemini: {},
      mistral: {}
    }
  };
});

// Now import the modules
import { AdapterRegistry } from './AdapterRegistry';
import type { ILLMClientAdapter } from '../clients/types';
import { MockClientAdapter } from '../clients/MockClientAdapter';
import { OpenAIClientAdapter } from '../clients/OpenAIClientAdapter';
import { AnthropicClientAdapter } from '../clients/AnthropicClientAdapter';
import { GeminiClientAdapter } from '../clients/GeminiClientAdapter';

describe('AdapterRegistry', () => {
  let registry: AdapterRegistry;
  let consoleLogSpy: jest.SpyInstance;
  let consoleWarnSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  describe('initialization', () => {
    it('should initialize with adapters for providers with constructors', () => {
      registry = new AdapterRegistry();

      // Should have logged successful initialization
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Initialized with 3 dynamically registered adapter(s)')
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('openai, anthropic, gemini')
      );

      // Should warn about missing constructor for mistral
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining("No adapter constructor found for supported provider 'mistral'")
      );
    });

    it('should handle adapter initialization errors gracefully', () => {
      // Make OpenAIClientAdapter throw an error on construction
      (OpenAIClientAdapter as jest.Mock).mockImplementationOnce(() => {
        throw new Error('Initialization failed');
      });

      registry = new AdapterRegistry();

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining("Failed to instantiate adapter for provider 'openai'"),
        expect.any(Error)
      );
    });

    it('should log when no adapters are registered', () => {
      // Clear all module cache to ensure clean isolation
      jest.resetModules();
      
      // Mock the config module with no constructors before requiring AdapterRegistry
      jest.doMock('../config', () => ({
        SUPPORTED_PROVIDERS: [
          { id: 'openai', name: 'OpenAI' },
          { id: 'anthropic', name: 'Anthropic' },
          { id: 'gemini', name: 'Google Gemini' },
          { id: 'mistral', name: 'Mistral' }
        ],
        ADAPTER_CONSTRUCTORS: {}, // No constructors
        ADAPTER_CONFIGS: {
          openai: {},
          anthropic: {},
          gemini: {},
          mistral: {}
        }
      }));
      
      // Mock the client adapters to prevent import errors
      jest.doMock('../clients/MockClientAdapter', () => ({
        MockClientAdapter: jest.fn()
      }));
      jest.doMock('../clients/OpenAIClientAdapter', () => ({
        OpenAIClientAdapter: jest.fn()
      }));
      jest.doMock('../clients/AnthropicClientAdapter', () => ({
        AnthropicClientAdapter: jest.fn()
      }));
      jest.doMock('../clients/GeminiClientAdapter', () => ({
        GeminiClientAdapter: jest.fn()
      }));
      
      // Clear console spy calls before the test
      consoleLogSpy.mockClear();
      
      // Now require the AdapterRegistry with mocked dependencies
      const { AdapterRegistry: IsolatedAdapterRegistry } = require('./AdapterRegistry');
      const isolatedRegistry = new IsolatedAdapterRegistry();

      expect(consoleLogSpy).toHaveBeenCalledWith(
        'LLMService: No real adapters were dynamically registered. All providers will use the mock adapter.'
      );
      
      // Restore modules after test
      jest.resetModules();
    });
  });

  describe('getAdapter', () => {
    beforeEach(() => {
      registry = new AdapterRegistry();
    });

    it('should return registered adapter for supported provider', () => {
      const adapter = registry.getAdapter('openai' as any);

      expect(adapter).toBeDefined();
      expect(consoleLogSpy).toHaveBeenCalledWith(
        'Using registered adapter for provider: openai'
      );
    });

    it('should return mock adapter for provider without adapter', () => {
      const adapter = registry.getAdapter('mistral' as any);

      expect(adapter).toBeInstanceOf(MockClientAdapter);
      expect(consoleLogSpy).toHaveBeenCalledWith(
        'No real adapter found for mistral, using mock adapter'
      );
    });

    it('should return mock adapter for unknown provider', () => {
      const adapter = registry.getAdapter('unknown-provider' as any);

      expect(adapter).toBeInstanceOf(MockClientAdapter);
      expect(consoleLogSpy).toHaveBeenCalledWith(
        'No real adapter found for unknown-provider, using mock adapter'
      );
    });
  });

  describe('registerAdapter', () => {
    beforeEach(() => {
      registry = new AdapterRegistry();
    });

    it('should register new adapter', () => {
      const mockAdapter: ILLMClientAdapter = {
        sendMessage: jest.fn(),
        getAdapterInfo: () => ({ providerId: 'custom-provider', name: 'Custom Adapter' })
      };

      registry.registerAdapter('custom-provider' as any, mockAdapter);

      expect(consoleLogSpy).toHaveBeenCalledWith(
        'Registered client adapter for provider: custom-provider'
      );

      // Should be able to retrieve it
      const retrievedAdapter = registry.getAdapter('custom-provider' as any);
      expect(retrievedAdapter).toBe(mockAdapter);
    });

    it('should override existing adapter', () => {
      const newAdapter: ILLMClientAdapter = {
        sendMessage: jest.fn(),
        getAdapterInfo: () => ({ providerId: 'openai', name: 'New OpenAI Adapter' })
      };

      registry.registerAdapter('openai' as any, newAdapter);

      const retrievedAdapter = registry.getAdapter('openai' as any);
      expect(retrievedAdapter).toBe(newAdapter);
    });
  });

  describe('getRegisteredAdapters', () => {
    beforeEach(() => {
      registry = new AdapterRegistry();
    });

    it('should return info for all registered adapters', () => {
      const adapterInfo = registry.getRegisteredAdapters();

      expect(adapterInfo.size).toBe(3); // openai, anthropic, gemini
      
      expect(adapterInfo.get('openai' as any)).toEqual({
        providerId: 'openai',
        hasAdapter: true,
        adapterInfo: { providerId: 'openai', name: 'OpenAI Adapter' }
      });

      expect(adapterInfo.get('anthropic' as any)).toEqual({
        providerId: 'anthropic',
        hasAdapter: true,
        adapterInfo: { providerId: 'anthropic', name: 'Anthropic Adapter' }
      });

      expect(adapterInfo.get('gemini' as any)).toEqual({
        providerId: 'gemini',
        hasAdapter: true,
        adapterInfo: { providerId: 'gemini', name: 'Gemini Adapter' }
      });

      // mistral should not be in the map
      expect(adapterInfo.has('mistral' as any)).toBe(false);
    });

    it('should handle adapters without getAdapterInfo method', () => {
      const adapterWithoutInfo: ILLMClientAdapter = {
        sendMessage: jest.fn(),
        // No getAdapterInfo method
      };

      registry.registerAdapter('custom' as any, adapterWithoutInfo);
      const adapterInfo = registry.getRegisteredAdapters();

      expect(adapterInfo.get('custom' as any)).toEqual({
        providerId: 'custom',
        hasAdapter: true,
        adapterInfo: { name: 'Unknown Adapter' }
      });
    });
  });

  describe('getProviderSummary', () => {
    beforeEach(() => {
      registry = new AdapterRegistry();
    });

    it('should return correct summary of provider availability', () => {
      const summary = registry.getProviderSummary();

      expect(summary).toEqual({
        totalProviders: 4,
        providersWithAdapters: 3,
        availableProviders: ['openai', 'anthropic', 'gemini'],
        unavailableProviders: ['mistral']
      });
    });

    it('should update summary after registering new adapter', () => {
      const mockAdapter: ILLMClientAdapter = {
        sendMessage: jest.fn(),
      };

      registry.registerAdapter('mistral' as any, mockAdapter);
      const summary = registry.getProviderSummary();

      expect(summary).toEqual({
        totalProviders: 4,
        providersWithAdapters: 4,
        availableProviders: ['openai', 'anthropic', 'gemini', 'mistral'],
        unavailableProviders: []
      });
    });
  });
});