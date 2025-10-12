// TemplateExamples component - Demonstrate template rendering with genai-lite

import { useState } from 'react';
import { renderTemplate, getPresets } from '../api/client';
import type { Preset } from '../types';
import { exampleTemplates, getCategories, type ExampleTemplate } from '../data/exampleTemplates';

interface TemplateExamplesProps {
  presets: Preset[];
  selectedPresetId?: string;
  onSelectPreset: (presetId: string) => void;
}

export function TemplateExamples({ presets, selectedPresetId, onSelectPreset }: TemplateExamplesProps) {
  const [selectedTemplate, setSelectedTemplate] = useState<ExampleTemplate>(exampleTemplates[0]);
  const [variables, setVariables] = useState<Record<string, any>>(selectedTemplate.defaultVariables);
  const [renderedResult, setRenderedResult] = useState<any>(null);
  const [isRendering, setIsRendering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  const categories = getCategories();
  const filteredTemplates = selectedCategory === 'all'
    ? exampleTemplates
    : exampleTemplates.filter(t => t.category === selectedCategory);

  const handleTemplateChange = (templateId: string) => {
    const template = exampleTemplates.find(t => t.id === templateId);
    if (template) {
      setSelectedTemplate(template);
      setVariables(template.defaultVariables);
      setRenderedResult(null);
      setError(null);
    }
  };

  const handleVariableChange = (key: string, value: string) => {
    // Try to parse as boolean or number
    let parsedValue: any = value;
    if (value === 'true') parsedValue = true;
    else if (value === 'false') parsedValue = false;
    else if (!isNaN(Number(value)) && value !== '') parsedValue = Number(value);

    setVariables(prev => ({ ...prev, [key]: parsedValue }));
  };

  const handleRender = async () => {
    if (!selectedPresetId) {
      setError('Please select a preset first');
      return;
    }

    setIsRendering(true);
    setError(null);

    try {
      const response = await renderTemplate({
        template: selectedTemplate.template,
        variables,
        presetId: selectedPresetId
      });

      if (response.success && response.result) {
        setRenderedResult(response.result);
      } else {
        setError(response.error?.message || 'Failed to render template');
      }
    } catch (err) {
      setError(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIsRendering(false);
    }
  };

  return (
    <div className="template-examples">
      <h3>Template Examples</h3>
      <p className="section-description">
        Demonstrate genai-lite's template engine with variable substitution, conditional logic, and model-aware prompts.
      </p>

      {/* Preset Selector */}
      <div className="preset-selector-section">
        <label htmlFor="preset-select">Select Preset:</label>
        <select
          id="preset-select"
          value={selectedPresetId || ''}
          onChange={(e) => onSelectPreset(e.target.value)}
          className="preset-select"
        >
          <option value="">Choose a preset...</option>
          {presets.map(preset => (
            <option key={preset.id} value={preset.id}>
              {preset.displayName}
            </option>
          ))}
        </select>
      </div>

      {/* Category Filter */}
      <div className="category-filter">
        <label htmlFor="category-select">Category:</label>
        <select
          id="category-select"
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value)}
          className="category-select"
        >
          <option value="all">All Templates ({exampleTemplates.length})</option>
          {categories.map(cat => (
            <option key={cat} value={cat}>
              {cat.charAt(0).toUpperCase() + cat.slice(1)} ({exampleTemplates.filter(t => t.category === cat).length})
            </option>
          ))}
        </select>
      </div>

      {/* Template Selector */}
      <div className="template-selector">
        <label htmlFor="template-select">Template:</label>
        <select
          id="template-select"
          value={selectedTemplate.id}
          onChange={(e) => handleTemplateChange(e.target.value)}
          className="template-select"
        >
          {filteredTemplates.map(template => (
            <option key={template.id} value={template.id}>
              {template.name}
            </option>
          ))}
        </select>
        <p className="template-description">{selectedTemplate.description}</p>
        <div className="template-tags">
          {selectedTemplate.tags.map(tag => (
            <span key={tag} className="template-tag">{tag}</span>
          ))}
        </div>
      </div>

      {/* Template Display */}
      <div className="template-display">
        <label>Template:</label>
        <pre className="template-code">{selectedTemplate.template}</pre>
      </div>

      {/* Variables Input */}
      <div className="variables-section">
        <label>Variables:</label>
        {Object.entries(variables).map(([key, value]) => (
          <div key={key} className="variable-input">
            <span className="variable-key">{key}:</span>
            <input
              type="text"
              value={String(value)}
              onChange={(e) => handleVariableChange(key, e.target.value)}
              className="variable-value"
            />
          </div>
        ))}
      </div>

      {/* Render Button */}
      <button
        onClick={handleRender}
        disabled={isRendering || !selectedPresetId}
        className="render-button"
      >
        {isRendering ? 'Rendering...' : 'Render Template'}
      </button>

      {/* Error */}
      {error && (
        <div className="template-error">
          <strong>Error:</strong> {error}
        </div>
      )}

      {/* Rendered Result */}
      {renderedResult && (
        <div className="rendered-result">
          <h4>Rendered Result:</h4>

          <div className="result-section">
            <strong>Messages:</strong>
            {renderedResult.messages.map((msg: any, idx: number) => (
              <div key={idx} className="rendered-message">
                <span className="message-role-label">{msg.role}:</span>
                <span className="message-content-preview">{msg.content}</span>
              </div>
            ))}
          </div>

          {renderedResult.modelContext && (
            <div className="result-section">
              <strong>Model Context:</strong>
              <pre className="model-context">{JSON.stringify(renderedResult.modelContext, null, 2)}</pre>
            </div>
          )}

          {renderedResult.settings && (
            <div className="result-section">
              <strong>Settings (from template):</strong>
              <pre className="template-settings">{JSON.stringify(renderedResult.settings, null, 2)}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
