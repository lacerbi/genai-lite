/**
 * Tests for image presets configuration
 */

import rawImagePresets from './image-presets.json';
import type { ImagePreset } from '../types/image';
import { SUPPORTED_IMAGE_PROVIDERS } from '../image/config';

// Type assertion for JSON import
const imagePresets = rawImagePresets as ImagePreset[];

describe('Image Presets Configuration', () => {
  describe('Preset Loading', () => {
    it('should load all 13 image presets', () => {
      expect(imagePresets).toBeDefined();
      expect(Array.isArray(imagePresets)).toBe(true);
      expect(imagePresets.length).toBe(13);
    });

    it('should load 6 OpenAI presets', () => {
      const openaiPresets = imagePresets.filter(p => p.providerId === 'openai-images');
      expect(openaiPresets.length).toBe(6);
    });

    it('should load 7 genai-electron presets', () => {
      const electronPresets = imagePresets.filter(p => p.providerId === 'genai-electron-images');
      expect(electronPresets.length).toBe(7);
    });
  });

  describe('Preset Structure Validation', () => {
    it('should have all required fields for each preset', () => {
      imagePresets.forEach((preset) => {
        expect(preset.id).toBeDefined();
        expect(typeof preset.id).toBe('string');
        expect(preset.id.length).toBeGreaterThan(0);

        expect(preset.displayName).toBeDefined();
        expect(typeof preset.displayName).toBe('string');

        expect(preset.providerId).toBeDefined();
        expect(typeof preset.providerId).toBe('string');

        expect(preset.modelId).toBeDefined();
        expect(typeof preset.modelId).toBe('string');

        // Description is optional but should be string if present
        if (preset.description) {
          expect(typeof preset.description).toBe('string');
        }

        // Settings is optional but should be object if present
        if (preset.settings) {
          expect(typeof preset.settings).toBe('object');
        }
      });
    });

    it('should have unique preset IDs', () => {
      const ids = imagePresets.map(p => p.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });

    it('should have valid provider IDs', () => {
      const validProviderIds = SUPPORTED_IMAGE_PROVIDERS.map(p => p.id);
      imagePresets.forEach((preset) => {
        expect(validProviderIds).toContain(preset.providerId);
      });
    });
  });

  describe('OpenAI Presets', () => {
    it('should have gpt-image-1-mini-default preset', () => {
      const preset = imagePresets.find(p => p.id === 'openai-gpt-image-1-mini-default');
      expect(preset).toBeDefined();
      expect(preset?.modelId).toBe('gpt-image-1-mini');
      expect(preset?.settings?.width).toBe(1024);
      expect(preset?.settings?.height).toBe(1024);
      expect(preset?.settings?.quality).toBe('auto');
    });

    it('should have gpt-image-1-quality preset', () => {
      const preset = imagePresets.find(p => p.id === 'openai-gpt-image-1-quality');
      expect(preset).toBeDefined();
      expect(preset?.modelId).toBe('gpt-image-1');
      expect(preset?.settings?.quality).toBe('high');
    });

    it('should have dalle-3-hd preset', () => {
      const preset = imagePresets.find(p => p.id === 'openai-dalle-3-hd');
      expect(preset).toBeDefined();
      expect(preset?.modelId).toBe('dall-e-3');
      expect(preset?.settings?.quality).toBe('hd');
      expect(preset?.settings?.style).toBe('vivid');
    });

    it('should have dalle-3-natural preset', () => {
      const preset = imagePresets.find(p => p.id === 'openai-dalle-3-natural');
      expect(preset).toBeDefined();
      expect(preset?.modelId).toBe('dall-e-3');
      expect(preset?.settings?.style).toBe('natural');
    });

    it('should have dalle-2-default preset', () => {
      const preset = imagePresets.find(p => p.id === 'openai-dalle-2-default');
      expect(preset).toBeDefined();
      expect(preset?.modelId).toBe('dall-e-2');
      expect(preset?.settings?.width).toBe(1024);
      expect(preset?.settings?.height).toBe(1024);
    });

    it('should have dalle-2-fast preset', () => {
      const preset = imagePresets.find(p => p.id === 'openai-dalle-2-fast');
      expect(preset).toBeDefined();
      expect(preset?.modelId).toBe('dall-e-2');
      expect(preset?.settings?.width).toBe(512);
      expect(preset?.settings?.height).toBe(512);
    });
  });

  describe('genai-electron Presets', () => {
    it('should have sdxl-quality preset', () => {
      const preset = imagePresets.find(p => p.id === 'genai-electron-sdxl-quality');
      expect(preset).toBeDefined();
      expect(preset?.modelId).toBe('stable-diffusion');
      expect(preset?.settings?.width).toBe(1024);
      expect(preset?.settings?.height).toBe(1024);
      expect(preset?.settings?.diffusion?.steps).toBe(30);
      expect(preset?.settings?.diffusion?.cfgScale).toBe(7.5);
      expect(preset?.settings?.diffusion?.sampler).toBe('dpm++2m');
    });

    it('should have sdxl-balanced preset', () => {
      const preset = imagePresets.find(p => p.id === 'genai-electron-sdxl-balanced');
      expect(preset).toBeDefined();
      expect(preset?.modelId).toBe('stable-diffusion');
      expect(preset?.settings?.width).toBe(768);
      expect(preset?.settings?.height).toBe(768);
      expect(preset?.settings?.diffusion?.steps).toBe(20);
    });

    it('should have sdxl-fast preset', () => {
      const preset = imagePresets.find(p => p.id === 'genai-electron-sdxl-fast');
      expect(preset).toBeDefined();
      expect(preset?.modelId).toBe('stable-diffusion');
      expect(preset?.settings?.width).toBe(512);
      expect(preset?.settings?.height).toBe(512);
      expect(preset?.settings?.diffusion?.steps).toBe(15);
    });

    it('should have sdxl-portrait preset', () => {
      const preset = imagePresets.find(p => p.id === 'genai-electron-sdxl-portrait');
      expect(preset).toBeDefined();
      expect(preset?.modelId).toBe('stable-diffusion');
      expect(preset?.settings?.width).toBe(768);
      expect(preset?.settings?.height).toBe(1024);
    });

    it('should have sdxl-turbo preset with correct settings', () => {
      const preset = imagePresets.find(p => p.id === 'genai-electron-sdxl-turbo');
      expect(preset).toBeDefined();
      expect(preset?.modelId).toBe('stable-diffusion');
      expect(preset?.settings?.width).toBe(512);
      expect(preset?.settings?.height).toBe(512);
      expect(preset?.settings?.diffusion?.steps).toBe(4);
      expect(preset?.settings?.diffusion?.cfgScale).toBe(1.0);
      expect(preset?.settings?.diffusion?.sampler).toBe('euler_a');
    });

    it('should have sdxl-lightning preset with correct settings', () => {
      const preset = imagePresets.find(p => p.id === 'genai-electron-sdxl-lightning');
      expect(preset).toBeDefined();
      expect(preset?.modelId).toBe('stable-diffusion');
      expect(preset?.settings?.width).toBe(1024);
      expect(preset?.settings?.height).toBe(1024);
      expect(preset?.settings?.diffusion?.steps).toBe(8);
      expect(preset?.settings?.diffusion?.cfgScale).toBe(1.5);
      expect(preset?.settings?.diffusion?.sampler).toBe('euler_a');
    });

    it('should have sdxl-lightning-medium preset with correct settings', () => {
      const preset = imagePresets.find(p => p.id === 'genai-electron-sdxl-lightning-medium');
      expect(preset).toBeDefined();
      expect(preset?.modelId).toBe('stable-diffusion');
      expect(preset?.settings?.width).toBe(768);
      expect(preset?.settings?.height).toBe(768);
      expect(preset?.settings?.diffusion?.steps).toBe(8);
      expect(preset?.settings?.diffusion?.cfgScale).toBe(1.5);
      expect(preset?.settings?.diffusion?.sampler).toBe('euler_a');
    });
  });

  describe('Preset Settings Validation', () => {
    it('should have valid diffusion settings for genai-electron presets', () => {
      const electronPresets = imagePresets.filter(p => p.providerId === 'genai-electron-images');

      electronPresets.forEach((preset) => {
        expect(preset.settings?.diffusion).toBeDefined();

        const diffusion = preset.settings!.diffusion!;

        // Steps should be positive
        expect(diffusion.steps).toBeGreaterThan(0);
        expect(diffusion.steps).toBeLessThanOrEqual(50);

        // CFG scale should be reasonable
        expect(diffusion.cfgScale).toBeGreaterThanOrEqual(0);
        expect(diffusion.cfgScale).toBeLessThanOrEqual(20);

        // Dimensions should be reasonable (now at base settings level)
        expect(preset.settings!.width).toBeGreaterThanOrEqual(256);
        expect(preset.settings!.width).toBeLessThanOrEqual(2048);
        expect(preset.settings!.height).toBeGreaterThanOrEqual(256);
        expect(preset.settings!.height).toBeLessThanOrEqual(2048);

        // Sampler should be defined
        expect(diffusion.sampler).toBeDefined();
      });
    });

    it('should have valid OpenAI settings', () => {
      const openaiPresets = imagePresets.filter(p => p.providerId === 'openai-images');

      openaiPresets.forEach((preset) => {
        expect(preset.settings).toBeDefined();

        // Dimensions should be defined
        expect(preset.settings?.width).toBeDefined();
        expect(preset.settings?.height).toBeDefined();

        // Response format should be buffer
        expect(preset.settings?.responseFormat).toBe('buffer');
      });
    });
  });

  describe('Model ID References', () => {
    it('should reference valid OpenAI model IDs', () => {
      const openaiPresets = imagePresets.filter(p => p.providerId === 'openai-images');
      const validModelIds = ['gpt-image-1-mini', 'gpt-image-1', 'dall-e-3', 'dall-e-2'];

      openaiPresets.forEach((preset) => {
        expect(validModelIds).toContain(preset.modelId);
      });
    });

    it('should allow arbitrary model IDs for genai-electron (model-agnostic)', () => {
      // genai-electron is model-agnostic like llama.cpp
      // Any model ID is valid as users load their own models
      const electronPresets = imagePresets.filter(p => p.providerId === 'genai-electron-images');

      electronPresets.forEach((preset) => {
        // Just verify model ID is a non-empty string
        expect(typeof preset.modelId).toBe('string');
        expect(preset.modelId.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Preset Naming Conventions', () => {
    it('should follow consistent naming pattern: provider-model-variant', () => {
      imagePresets.forEach((preset) => {
        // ID should contain provider name
        const providerName = preset.providerId.split('-')[0]; // 'openai' or 'genai'
        expect(preset.id.toLowerCase()).toContain(providerName.toLowerCase());

        // ID should not have spaces
        expect(preset.id).not.toContain(' ');

        // Display name should be readable
        expect(preset.displayName.length).toBeGreaterThan(0);
      });
    });
  });
});
