import type { ApiProviderId, LLMSettings, ModelInfo, ProviderInfo } from "../types";
import type { Logger } from "../../logging/types";
import { createDefaultLogger } from "../../logging/defaultLogger";
import { getDefaultSettingsForModel } from "../config";

/**
 * Manages LLM settings including merging with defaults and filtering unsupported parameters
 */
export class SettingsManager {
  private logger: Logger;

  constructor(logger?: Logger) {
    this.logger = logger ?? createDefaultLogger();
  }
  /**
   * Merges request settings with model-specific and global defaults
   *
   * @param modelId - The model ID to get defaults for
   * @param providerId - The provider ID to get defaults for
   * @param requestSettings - Settings from the request
   * @returns Complete settings object with all required fields
   */
  mergeSettingsForModel(
    modelId: string,
    providerId: ApiProviderId,
    requestSettings?: Partial<LLMSettings>,
    modelInfo?: ModelInfo
  ): Required<LLMSettings> {
    // Get model-specific defaults (threading the resolved ModelInfo lets detected
    // GGUF/unknown models contribute capabilities and vendor default settings)
    let modelDefaults = getDefaultSettingsForModel(modelId, providerId, modelInfo);

    // Apply the reasoning-mode default overlay when reasoning is effectively on for
    // this request (either explicitly requested or enabled by model default).
    // Per-key precedence: request > reasoningDefaultSettings > defaultSettings.
    const reasoningOn =
      requestSettings?.reasoning?.enabled ?? modelDefaults.reasoning?.enabled;
    if (reasoningOn === true && modelInfo?.reasoningDefaultSettings) {
      modelDefaults = {
        ...modelDefaults,
        ...modelInfo.reasoningDefaultSettings,
      };
    }

    // Merge with user-provided settings (user settings take precedence)
    const mergedSettings: Required<LLMSettings> = {
      temperature: requestSettings?.temperature ?? modelDefaults.temperature,
      maxTokens: requestSettings?.maxTokens ?? modelDefaults.maxTokens,
      topP: requestSettings?.topP ?? modelDefaults.topP,
      stopSequences:
        requestSettings?.stopSequences ?? modelDefaults.stopSequences,
      frequencyPenalty:
        requestSettings?.frequencyPenalty ?? modelDefaults.frequencyPenalty,
      presencePenalty:
        requestSettings?.presencePenalty ?? modelDefaults.presencePenalty,
      topK: requestSettings?.topK ?? modelDefaults.topK,
      minP: requestSettings?.minP ?? modelDefaults.minP,
      repeatPenalty:
        requestSettings?.repeatPenalty ?? modelDefaults.repeatPenalty,
      seed: requestSettings?.seed ?? modelDefaults.seed,
      user: requestSettings?.user ?? modelDefaults.user,
      supportsSystemMessage:
        requestSettings?.supportsSystemMessage ??
        modelDefaults.supportsSystemMessage,
      systemMessageFallback: {
        ...modelDefaults.systemMessageFallback,
        ...requestSettings?.systemMessageFallback,
      },
      geminiSafetySettings:
        requestSettings?.geminiSafetySettings ??
        modelDefaults.geminiSafetySettings,
      reasoning: {
        ...modelDefaults.reasoning,
        ...requestSettings?.reasoning,
      },
      thinkingTagFallback: {
        ...modelDefaults.thinkingTagFallback,
        ...requestSettings?.thinkingTagFallback,
      },
      openRouterProvider: requestSettings?.openRouterProvider ?? modelDefaults.openRouterProvider,
      structuredOutput: requestSettings?.structuredOutput ?? modelDefaults.structuredOutput,
      logprobs: requestSettings?.logprobs ?? modelDefaults.logprobs,
      topLogprobs: requestSettings?.topLogprobs ?? modelDefaults.topLogprobs,
      llamacpp:
        requestSettings?.llamacpp || modelDefaults.llamacpp
          ? {
              ...modelDefaults.llamacpp,
              ...requestSettings?.llamacpp,
            }
          : (undefined as any),
    };

    // Log the final settings for debugging
    this.logger.debug(`Merged settings for ${providerId}/${modelId}:`, {
      temperature: mergedSettings.temperature,
      maxTokens: mergedSettings.maxTokens,
      topP: mergedSettings.topP,
      hasStopSequences: mergedSettings.stopSequences.length > 0,
      frequencyPenalty: mergedSettings.frequencyPenalty,
      presencePenalty: mergedSettings.presencePenalty,
      hasUser: !!mergedSettings.user,
      geminiSafetySettingsCount: mergedSettings.geminiSafetySettings.length,
      reasoning: mergedSettings.reasoning,
    });

    return mergedSettings;
  }

  /**
   * Filters out unsupported parameters based on model and provider configuration
   *
   * @param settings - The settings to filter
   * @param modelInfo - Model information including unsupported parameters
   * @param providerInfo - Provider information including unsupported parameters
   * @returns Filtered settings object
   */
  filterUnsupportedParameters(
    settings: Required<LLMSettings>,
    modelInfo: ModelInfo,
    providerInfo: ProviderInfo
  ): LLMSettings {
    // Create a mutable copy
    const filteredSettings: LLMSettings = { ...settings };

    const paramsToExclude = new Set<keyof LLMSettings>();

    // Add provider-level exclusions
    if (providerInfo.unsupportedParameters) {
      providerInfo.unsupportedParameters.forEach((param: keyof LLMSettings) =>
        paramsToExclude.add(param)
      );
    }

    // Add model-level exclusions (these will be added to any provider-level ones)
    if (modelInfo.unsupportedParameters) {
      modelInfo.unsupportedParameters.forEach((param: keyof LLMSettings) =>
        paramsToExclude.add(param)
      );
    }

    if (paramsToExclude.size > 0) {
      this.logger.debug(
        `LLMService: Potential parameters to exclude for provider '${providerInfo.id}', model '${modelInfo.id}':`,
        Array.from(paramsToExclude)
      );
    }

    paramsToExclude.forEach((param) => {
      // Check if the parameter key actually exists in filteredSettings before trying to delete
      if (param in filteredSettings) {
        this.logger.debug(
          `LLMService: Removing excluded parameter '${String(
            param
          )}' for provider '${providerInfo.id}', model '${
            modelInfo.id
          }'. Value was:`,
          filteredSettings[param]
        );
        delete (filteredSettings as Partial<LLMSettings>)[param]; // Cast to allow deletion
      } else {
        // This case should ideally not happen if settings truly is Required<LLMSettings>
        this.logger.debug(
          `LLMService: Parameter '${String(
            param
          )}' marked for exclusion was not found in settings for provider '${
            providerInfo.id
          }', model '${modelInfo.id}'.`
        );
      }
    });

    // Handle reasoning settings for models that don't support it
    // This happens after validateReasoningSettings so we know it's safe to strip
    if (!modelInfo.reasoning?.supported && filteredSettings.reasoning) {
      this.logger.debug(
        `LLMService: Removing reasoning settings for non-reasoning model ${modelInfo.id}`
      );
      delete (filteredSettings as Partial<LLMSettings>).reasoning;
    }

    return filteredSettings;
  }

  /**
   * Validates settings extracted from templates, warning about invalid fields
   * and returning only valid settings
   *
   * @param settings - The settings to validate (e.g., from template metadata)
   * @returns Validated settings with invalid fields removed
   */
  validateTemplateSettings(settings: Partial<LLMSettings>): Partial<LLMSettings> {
    const validated: Partial<LLMSettings> = {};
    const knownFields: Array<keyof LLMSettings> = [
      'temperature',
      'maxTokens',
      'topP',
      'stopSequences',
      'frequencyPenalty',
      'presencePenalty',
      'topK',
      'minP',
      'repeatPenalty',
      'seed',
      'user',
      'supportsSystemMessage',
      'geminiSafetySettings',
      'reasoning',
      'thinkingTagFallback',
      'structuredOutput',
      'logprobs',
      'topLogprobs',
      'llamacpp'
    ];

    // Check each setting field
    for (const [key, value] of Object.entries(settings)) {
      // Check if it's a known field
      if (!knownFields.includes(key as keyof LLMSettings)) {
        this.logger.warn(`Unknown setting "${key}" in template metadata. Ignoring.`);
        continue;
      }

      // Type-specific validation
      if (key === 'temperature') {
        if (typeof value !== 'number' || value < 0 || value > 2) {
          this.logger.warn(`Invalid temperature value in template: ${value}. Must be a number between 0 and 2.`);
          continue;
        }
      }

      if (key === 'maxTokens') {
        if (typeof value !== 'number' || value <= 0) {
          this.logger.warn(`Invalid maxTokens value in template: ${value}. Must be a positive number.`);
          continue;
        }
      }

      if (key === 'topP') {
        if (typeof value !== 'number' || value < 0 || value > 1) {
          this.logger.warn(`Invalid topP value in template: ${value}. Must be a number between 0 and 1.`);
          continue;
        }
      }

      if (key === 'stopSequences') {
        if (!Array.isArray(value) || !value.every(v => typeof v === 'string')) {
          this.logger.warn(`Invalid stopSequences value in template. Must be an array of strings.`);
          continue;
        }
      }

      if ((key === 'frequencyPenalty' || key === 'presencePenalty')) {
        if (typeof value !== 'number' || value < -2 || value > 2) {
          this.logger.warn(`Invalid ${key} value in template: ${value}. Must be a number between -2 and 2.`);
          continue;
        }
      }

      if (key === 'topK') {
        if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
          this.logger.warn(`Invalid topK value in template: ${value}. Must be a non-negative integer.`);
          continue;
        }
      }

      if (key === 'minP') {
        if (typeof value !== 'number' || value < 0 || value > 1) {
          this.logger.warn(`Invalid minP value in template: ${value}. Must be a number between 0 and 1.`);
          continue;
        }
      }

      if (key === 'repeatPenalty') {
        if (typeof value !== 'number' || value <= 0) {
          this.logger.warn(`Invalid repeatPenalty value in template: ${value}. Must be a positive number.`);
          continue;
        }
      }

      if (key === 'seed') {
        if (typeof value !== 'number' || !Number.isInteger(value)) {
          this.logger.warn(`Invalid seed value in template: ${value}. Must be an integer.`);
          continue;
        }
      }

      if (key === 'logprobs' && typeof value !== 'boolean') {
        this.logger.warn(`Invalid logprobs value in template. Must be a boolean.`);
        continue;
      }

      if (key === 'topLogprobs') {
        if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 20) {
          this.logger.warn(`Invalid topLogprobs value in template: ${value}. Must be an integer between 0 and 20.`);
          continue;
        }
      }

      if (key === 'llamacpp' && typeof value === 'object' && value !== null) {
        const llamacppValidated: any = {};
        const v = value as any;

        if ('grammar' in v && typeof v.grammar !== 'string') {
          this.logger.warn(`Invalid llamacpp.grammar value in template. Must be a string.`);
        } else if ('grammar' in v) {
          llamacppValidated.grammar = v.grammar;
        }

        if ('chatTemplateKwargs' in v) {
          if (
            typeof v.chatTemplateKwargs !== 'object' ||
            v.chatTemplateKwargs === null ||
            Array.isArray(v.chatTemplateKwargs)
          ) {
            this.logger.warn(`Invalid llamacpp.chatTemplateKwargs value in template. Must be an object.`);
          } else {
            llamacppValidated.chatTemplateKwargs = v.chatTemplateKwargs;
          }
        }

        if (Object.keys(llamacppValidated).length > 0) {
          validated.llamacpp = llamacppValidated;
        }
        continue;
      }

      if (key === 'user' && typeof value !== 'string') {
        this.logger.warn(`Invalid user value in template. Must be a string.`);
        continue;
      }

      if (key === 'supportsSystemMessage' && typeof value !== 'boolean') {
        this.logger.warn(`Invalid supportsSystemMessage value in template. Must be a boolean.`);
        continue;
      }

      // Nested object validation
      if (key === 'reasoning' && typeof value === 'object' && value !== null) {
        const reasoningValidated: any = {};

        if ('enabled' in value && typeof value.enabled !== 'boolean') {
          this.logger.warn(`Invalid reasoning.enabled value in template. Must be a boolean.`);
        } else if ('enabled' in value) {
          reasoningValidated.enabled = value.enabled;
        }

        if ('effort' in value && !['low', 'medium', 'high'].includes(value.effort as string)) {
          this.logger.warn(`Invalid reasoning.effort value in template: ${value.effort}. Must be 'low', 'medium', or 'high'.`);
        } else if ('effort' in value) {
          reasoningValidated.effort = value.effort;
        }

        if ('maxTokens' in value && (typeof value.maxTokens !== 'number' || value.maxTokens <= 0)) {
          this.logger.warn(`Invalid reasoning.maxTokens value in template. Must be a positive number.`);
        } else if ('maxTokens' in value) {
          reasoningValidated.maxTokens = value.maxTokens;
        }

        if ('exclude' in value && typeof value.exclude !== 'boolean') {
          this.logger.warn(`Invalid reasoning.exclude value in template. Must be a boolean.`);
        } else if ('exclude' in value) {
          reasoningValidated.exclude = value.exclude;
        }

        if (Object.keys(reasoningValidated).length > 0) {
          validated.reasoning = reasoningValidated;
        }
        continue;
      }

      if (key === 'thinkingTagFallback' && typeof value === 'object' && value !== null) {
        const thinkingValidated: any = {};

        if ('enabled' in value && typeof value.enabled !== 'boolean') {
          this.logger.warn(`Invalid thinkingTagFallback.enabled value in template. Must be a boolean.`);
        } else if ('enabled' in value) {
          thinkingValidated.enabled = value.enabled;
        }

        if ('tagName' in value && typeof value.tagName !== 'string') {
          this.logger.warn(`Invalid thinkingTagFallback.tagName value in template. Must be a string.`);
        } else if ('tagName' in value) {
          thinkingValidated.tagName = value.tagName;
        }

        if ('enforce' in value && typeof value.enforce !== 'boolean') {
          this.logger.warn(`Invalid thinkingTagFallback.enforce value in template. Must be a boolean.`);
        } else if ('enforce' in value) {
          thinkingValidated.enforce = value.enforce;
        }

        if (Object.keys(thinkingValidated).length > 0) {
          validated.thinkingTagFallback = thinkingValidated;
        }
        continue;
      }

      if (key === 'structuredOutput' && typeof value === 'object' && value !== null) {
        const soValidated: any = {};

        if ('enabled' in value && typeof value.enabled !== 'boolean') {
          this.logger.warn(`Invalid structuredOutput.enabled value in template. Must be a boolean.`);
        } else if ('enabled' in value) {
          soValidated.enabled = value.enabled;
        }

        if ('name' in value && typeof value.name !== 'string') {
          this.logger.warn(`Invalid structuredOutput.name value in template. Must be a string.`);
        } else if ('name' in value) {
          soValidated.name = value.name;
        }

        if ('schema' in value && typeof value.schema !== 'object') {
          this.logger.warn(`Invalid structuredOutput.schema value in template. Must be an object.`);
        } else if ('schema' in value) {
          soValidated.schema = value.schema;
        }

        if ('strict' in value && typeof value.strict !== 'boolean') {
          this.logger.warn(`Invalid structuredOutput.strict value in template. Must be a boolean.`);
        } else if ('strict' in value) {
          soValidated.strict = value.strict;
        }

        if ('autoParse' in value && typeof value.autoParse !== 'boolean') {
          this.logger.warn(`Invalid structuredOutput.autoParse value in template. Must be a boolean.`);
        } else if ('autoParse' in value) {
          soValidated.autoParse = value.autoParse;
        }

        if (Object.keys(soValidated).length > 0) {
          validated.structuredOutput = soValidated;
        }
        continue;
      }

      // If we made it here, the field is valid
      (validated as any)[key] = value;
    }

    return validated;
  }
}