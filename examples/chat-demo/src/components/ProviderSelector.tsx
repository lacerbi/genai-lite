// ProviderSelector component - Select AI provider and model

import type { Provider, Model } from '../types';

interface ProviderSelectorProps {
  providers: Provider[];
  selectedProviderId: string;
  onProviderChange: (providerId: string) => void;
  models: Model[];
  selectedModelId: string;
  onModelChange: (modelId: string) => void;
  disabled?: boolean;
}

export function ProviderSelector({
  providers,
  selectedProviderId,
  onProviderChange,
  models,
  selectedModelId,
  onModelChange,
  disabled = false,
}: ProviderSelectorProps) {
  return (
    <div className="provider-selector">
      <div className="selector-group">
        <label htmlFor="provider-select">Provider:</label>
        <select
          id="provider-select"
          value={selectedProviderId}
          onChange={(e) => onProviderChange(e.target.value)}
          disabled={disabled}
          className="provider-select"
        >
          <option value="">Select a provider...</option>
          {providers.map((provider) => (
            <option
              key={provider.id}
              value={provider.id}
              disabled={!provider.available}
            >
              {provider.name} {!provider.available ? '(API key missing)' : ''}
            </option>
          ))}
        </select>
      </div>

      <div className="selector-group">
        <label htmlFor="model-select">Model:</label>
        <select
          id="model-select"
          value={selectedModelId}
          onChange={(e) => onModelChange(e.target.value)}
          disabled={disabled || !selectedProviderId || models.length === 0}
          className="model-select"
        >
          <option value="">Select a model...</option>
          {models.map((model) => (
            <option key={model.id} value={model.id}>
              {model.name}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
