import React, { useEffect, useState } from 'react';

interface HealthResponse {
  status: string;
  message: string;
  timestamp: string;
}

function App() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/health')
      .then(res => res.json())
      .then(data => setHealth(data))
      .catch(err => setError(err.message));
  }, []);

  return (
    <div style={{ padding: '20px', fontFamily: 'system-ui, sans-serif' }}>
      <h1>🎨 Image Generation Demo</h1>
      <p>Interactive demo showcasing genai-lite image generation capabilities</p>

      <div style={{ marginTop: '20px', padding: '15px', background: '#f5f5f5', borderRadius: '8px' }}>
        <h2>Backend Status</h2>
        {error && <p style={{ color: 'red' }}>❌ Error: {error}</p>}
        {health && (
          <div>
            <p>✅ Status: {health.status}</p>
            <p>📡 {health.message}</p>
            <p>🕐 {new Date(health.timestamp).toLocaleString()}</p>
          </div>
        )}
        {!health && !error && <p>⏳ Connecting to backend...</p>}
      </div>

      <div style={{ marginTop: '20px', color: '#666' }}>
        <p>Phase 1 Complete - Project setup successful!</p>
        <p>Phase 2 in progress - Backend API implementation</p>
      </div>
    </div>
  );
}

export default App;
