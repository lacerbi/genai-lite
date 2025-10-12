// LlamaCppTools component - llama.cpp server utilities

import { useState } from 'react';
import { tokenizeText, checkLlamaCppHealth, generateEmbedding } from '../api/client';

export function LlamaCppTools() {
  const [activeTab, setActiveTab] = useState<'tokenize' | 'health' | 'embedding'>('tokenize');

  // Tokenization state
  const [tokenizeInput, setTokenizeInput] = useState('Hello, world! This is a test.');
  const [tokenizeResult, setTokenizeResult] = useState<{ tokens: number[]; count: number } | null>(null);
  const [tokenizeLoading, setTokenizeLoading] = useState(false);
  const [tokenizeError, setTokenizeError] = useState<string | null>(null);

  // Health check state
  const [healthResult, setHealthResult] = useState<any>(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [healthError, setHealthError] = useState<string | null>(null);

  // Embedding state
  const [embeddingInput, setEmbeddingInput] = useState('Search query example');
  const [embeddingResult, setEmbeddingResult] = useState<{ embedding: number[]; dimension: number } | null>(null);
  const [embeddingLoading, setEmbeddingLoading] = useState(false);
  const [embeddingError, setEmbeddingError] = useState<string | null>(null);

  const handleTokenize = async () => {
    setTokenizeLoading(true);
    setTokenizeError(null);

    try {
      const response = await tokenizeText({ content: tokenizeInput });
      if (response.success && response.tokens && response.tokenCount) {
        setTokenizeResult({
          tokens: response.tokens,
          count: response.tokenCount
        });
      } else {
        setTokenizeError(response.error?.message || 'Failed to tokenize');
      }
    } catch (err) {
      setTokenizeError(`Error: ${err instanceof Error ? err.message : 'llama.cpp server not available'}`);
    } finally {
      setTokenizeLoading(false);
    }
  };

  const handleHealthCheck = async () => {
    setHealthLoading(true);
    setHealthError(null);

    try {
      const response = await checkLlamaCppHealth();
      if (response.success && response.health) {
        setHealthResult(response.health);
      } else {
        setHealthError(response.error?.message || 'Failed to check health');
      }
    } catch (err) {
      setHealthError(`Error: ${err instanceof Error ? err.message : 'llama.cpp server not available'}`);
    } finally {
      setHealthLoading(false);
    }
  };

  const handleGenerateEmbedding = async () => {
    setEmbeddingLoading(true);
    setEmbeddingError(null);

    try {
      const response = await generateEmbedding({ content: embeddingInput });
      if (response.success && response.embedding && response.dimension) {
        setEmbeddingResult({
          embedding: response.embedding,
          dimension: response.dimension
        });
      } else {
        setEmbeddingError(response.error?.message || 'Failed to generate embedding');
      }
    } catch (err) {
      setEmbeddingError(`Error: ${err instanceof Error ? err.message : 'llama.cpp server not available'}`);
    } finally {
      setEmbeddingLoading(false);
    }
  };

  return (
    <div className="llamacpp-tools">
      <h3>llama.cpp Tools</h3>
      <p className="section-description">
        Utilities for local LLM inference with llama.cpp server. No API keys required!
      </p>

      {/* Tab Navigation */}
      <div className="tool-tabs">
        <button
          className={`tab-button ${activeTab === 'tokenize' ? 'active' : ''}`}
          onClick={() => setActiveTab('tokenize')}
        >
          Tokenization
        </button>
        <button
          className={`tab-button ${activeTab === 'health' ? 'active' : ''}`}
          onClick={() => setActiveTab('health')}
        >
          Health Check
        </button>
        <button
          className={`tab-button ${activeTab === 'embedding' ? 'active' : ''}`}
          onClick={() => setActiveTab('embedding')}
        >
          Embeddings
        </button>
      </div>

      {/* Tokenization Tab */}
      {activeTab === 'tokenize' && (
        <div className="tool-panel">
          <h4>Tokenization</h4>
          <p className="tool-description">Convert text to tokens using llama.cpp's tokenizer.</p>

          <textarea
            value={tokenizeInput}
            onChange={(e) => setTokenizeInput(e.target.value)}
            placeholder="Enter text to tokenize..."
            rows={4}
            className="tool-input"
          />

          <button
            onClick={handleTokenize}
            disabled={tokenizeLoading || !tokenizeInput}
            className="tool-button"
          >
            {tokenizeLoading ? 'Tokenizing...' : 'Tokenize'}
          </button>

          {tokenizeError && (
            <div className="tool-error">
              <strong>Error:</strong> {tokenizeError}
            </div>
          )}

          {tokenizeResult && (
            <div className="tool-result">
              <p><strong>Token Count:</strong> {tokenizeResult.count}</p>
              <details>
                <summary>Show Tokens (first 100)</summary>
                <pre className="token-list">{JSON.stringify(tokenizeResult.tokens.slice(0, 100), null, 2)}</pre>
                {tokenizeResult.tokens.length > 100 && <p>... and {tokenizeResult.tokens.length - 100} more</p>}
              </details>
            </div>
          )}
        </div>
      )}

      {/* Health Check Tab */}
      {activeTab === 'health' && (
        <div className="tool-panel">
          <h4>Health Check</h4>
          <p className="tool-description">Check llama.cpp server status and slot availability.</p>

          <button
            onClick={handleHealthCheck}
            disabled={healthLoading}
            className="tool-button"
          >
            {healthLoading ? 'Checking...' : 'Check Health'}
          </button>

          {healthError && (
            <div className="tool-error">
              <strong>Error:</strong> {healthError}
              <p className="error-hint">Make sure llama.cpp server is running on port 8080</p>
            </div>
          )}

          {healthResult && (
            <div className="tool-result">
              <p><strong>Status:</strong> {healthResult.status}</p>
              <p><strong>Idle Slots:</strong> {healthResult.slotsIdle}</p>
              <p><strong>Processing Slots:</strong> {healthResult.slotsProcessing}</p>
            </div>
          )}
        </div>
      )}

      {/* Embedding Tab */}
      {activeTab === 'embedding' && (
        <div className="tool-panel">
          <h4>Embeddings</h4>
          <p className="tool-description">Generate vector embeddings for semantic search.</p>

          <textarea
            value={embeddingInput}
            onChange={(e) => setEmbeddingInput(e.target.value)}
            placeholder="Enter text to generate embedding..."
            rows={3}
            className="tool-input"
          />

          <button
            onClick={handleGenerateEmbedding}
            disabled={embeddingLoading || !embeddingInput}
            className="tool-button"
          >
            {embeddingLoading ? 'Generating...' : 'Generate Embedding'}
          </button>

          {embeddingError && (
            <div className="tool-error">
              <strong>Error:</strong> {embeddingError}
            </div>
          )}

          {embeddingResult && (
            <div className="tool-result">
              <p><strong>Dimension:</strong> {embeddingResult.dimension}</p>
              <details>
                <summary>Show Embedding Vector (first 20 dimensions)</summary>
                <pre className="embedding-preview">
                  {JSON.stringify(embeddingResult.embedding.slice(0, 20).map(v => v.toFixed(4)), null, 2)}
                </pre>
                {embeddingResult.embedding.length > 20 && <p>... and {embeddingResult.embedding.length - 20} more dimensions</p>}
              </details>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
