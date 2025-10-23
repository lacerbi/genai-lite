import React, { useState, useEffect } from 'react';
import { fetchProviders, fetchModels, getGenaiElectronHealth } from '../api/client';
import { HealthIndicator } from './HealthIndicator';
import type { Provider, Model, ProviderSelectorProps, HealthStatus } from '../types';

export function ProviderSelector({
  selectedProviderId,
  selectedModelId,
  onProviderChange,
  onModelChange
}: ProviderSelectorProps) {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [models, setModels] = useState<Model[]>([]);
  const [loading, setLoading] = useState(true);
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);

  // Load providers on mount
  useEffect(() => {
    loadProviders();
  }, []);

  // Load models when provider changes
  useEffect(() => {
    if (selectedProviderId) {
      loadModels(selectedProviderId);
    }
  }, [selectedProviderId]);

  // Check health when genai-electron provider is selected
  useEffect(() => {
    if (selectedProviderId === 'genai-electron-images') {
      checkHealth();
    }
  }, [selectedProviderId]);

  const loadProviders = async () => {
    try {
      const data = await fetchProviders();
      setProviders(data);

      // Auto-select first available provider if none selected
      if (!selectedProviderId && data.length > 0) {
        const firstAvailable = data.find(p => p.available) || data[0];
        onProviderChange(firstAvailable.id);
      }
    } catch (error) {
      console.error('Failed to load providers:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadModels = async (providerId: string) => {
    try {
      const data = await fetchModels(providerId);
      setModels(data);

      // Auto-select first model or default model if none selected
      if (!selectedModelId && data.length > 0) {
        const provider = providers.find(p => p.id === providerId);
        const defaultModelId = provider?.capabilities?.defaultModelId;
        const defaultModel = data.find(m => m.id === defaultModelId) || data[0];
        onModelChange(defaultModel.id);
      }
    } catch (error) {
      console.error('Failed to load models:', error);
    }
  };

  const checkHealth = async () => {
    setHealthLoading(true);
    try {
      const healthData = await getGenaiElectronHealth();
      setHealth(healthData);
    } catch (error) {
      setHealth({
        status: 'error',
        busy: false,
        error: error instanceof Error ? error.message : 'Failed to check health'
      });
    } finally {
      setHealthLoading(false);
    }
  };

  const handleProviderChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const providerId = e.target.value;
    onProviderChange(providerId);
    // Reset model selection when provider changes
    onModelChange('');
  };

  const currentProvider = providers.find(p => p.id === selectedProviderId);
  const isAvailable = currentProvider?.available ?? false;

  if (loading) {
    return <div className="provider-selector">Loading providers...</div>;
  }

  return (
    <div className="provider-selector">
      <div className="provider-row">
        <div className="provider-field">
          <label htmlFor="provider">Provider</label>
          <select
            id="provider"
            value={selectedProviderId}
            onChange={handleProviderChange}
          >
            {providers.length === 0 && <option value="">No providers available</option>}
            {providers.map(provider => (
              <option key={provider.id} value={provider.id}>
                {provider.displayName}
                {!provider.available && ' (Unavailable)'}
              </option>
            ))}
          </select>
        </div>

        <div className="provider-field">
          <label htmlFor="model">Model</label>
          <select
            id="model"
            value={selectedModelId}
            onChange={(e) => onModelChange(e.target.value)}
            disabled={models.length === 0}
          >
            {models.length === 0 && <option value="">No models available</option>}
            {models.map(model => (
              <option key={model.id} value={model.id}>
                {model.displayName}
              </option>
            ))}
          </select>
        </div>

        <div className="provider-status">
          <div className={`status-indicator ${isAvailable ? 'available' : 'unavailable'}`} />
          <span>{isAvailable ? 'Available' : 'Unavailable'}</span>
        </div>
      </div>

      {selectedProviderId === 'genai-electron-images' && (
        <HealthIndicator
          health={health}
          isLoading={healthLoading}
          onTest={checkHealth}
        />
      )}
    </div>
  );
}
