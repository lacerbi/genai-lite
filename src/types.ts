export type ApiKeyProvider = (providerId: string) => Promise<string | null>;

/**
 * Defines how custom presets interact with the default presets.
 * 'replace': Use only the custom presets provided. The default set is ignored.
 * 'extend': Use the default presets, and add/override them with the custom presets. This is the default behavior.
 */
export type PresetMode = 'replace' | 'extend';