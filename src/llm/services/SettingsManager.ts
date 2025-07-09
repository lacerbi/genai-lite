import type { ApiProviderId, LLMSettings, ModelInfo, ProviderInfo } from "../types";
import { getDefaultSettingsForModel } from "../config";

/**
 * Manages LLM settings including merging with defaults and filtering unsupported parameters
 */
export class SettingsManager {
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
    requestSettings?: Partial<LLMSettings>
  ): Required<LLMSettings> {
    // Get model-specific defaults
    const modelDefaults = getDefaultSettingsForModel(modelId, providerId);

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
      user: requestSettings?.user ?? modelDefaults.user,
      supportsSystemMessage:
        requestSettings?.supportsSystemMessage ??
        modelDefaults.supportsSystemMessage,
      geminiSafetySettings:
        requestSettings?.geminiSafetySettings ??
        modelDefaults.geminiSafetySettings,
      reasoning: {
        ...modelDefaults.reasoning,
        ...requestSettings?.reasoning,
      },
    };

    // Log the final settings for debugging
    console.log(`Merged settings for ${providerId}/${modelId}:`, {
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
      console.log(
        `LLMService: Potential parameters to exclude for provider '${providerInfo.id}', model '${modelInfo.id}':`,
        Array.from(paramsToExclude)
      );
    }

    paramsToExclude.forEach((param) => {
      // Check if the parameter key actually exists in filteredSettings before trying to delete
      if (param in filteredSettings) {
        console.log(
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
        console.log(
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
      console.log(
        `LLMService: Removing reasoning settings for non-reasoning model ${modelInfo.id}`
      );
      delete (filteredSettings as Partial<LLMSettings>).reasoning;
    }

    return filteredSettings;
  }
}