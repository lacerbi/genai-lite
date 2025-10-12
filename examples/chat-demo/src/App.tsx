import { useState, useEffect } from 'react';

interface HealthResponse {
  status: string;
  message: string;
  timestamp: string;
}

function App() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/health')
      .then((res) => res.json())
      .then((data) => {
        setHealth(data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  return (
    <div className="app">
      <header>
        <h1>genai-lite Chat Demo</h1>
        <p>Interactive demonstration of genai-lite library features</p>
      </header>

      <main>
        <div className="status-card">
          <h2>Backend Status</h2>
          {loading && <p>Connecting to backend...</p>}
          {error && (
            <div className="error">
              <p>❌ Error: {error}</p>
              <p>Make sure the backend server is running on port 3000</p>
            </div>
          )}
          {health && (
            <div className="success">
              <p>✅ {health.message}</p>
              <p className="timestamp">Last checked: {new Date(health.timestamp).toLocaleString()}</p>
            </div>
          )}
        </div>

        <div className="info-card">
          <h3>🚀 Phase 1 Complete!</h3>
          <p>Frontend and backend are communicating successfully.</p>
          <p><strong>Next Steps:</strong></p>
          <ul>
            <li>Phase 2: Implement Backend API (LLM providers, models, chat)</li>
            <li>Phase 3: Build Frontend UI (chat interface, components)</li>
            <li>Phase 4: Add Advanced Features (templates, reasoning)</li>
            <li>Phase 5: Polish & Documentation</li>
          </ul>
        </div>
      </main>
    </div>
  );
}

export default App;
