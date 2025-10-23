import express from 'express';

export const healthRouter = express.Router();

/**
 * GET /api/health/genai-electron
 * Check if genai-electron diffusion server is running and available
 */
healthRouter.get('/genai-electron', async (req, res) => {
  const baseURL = process.env.GENAI_ELECTRON_IMAGE_BASE_URL || 'http://localhost:8081';

  try {
    // Call genai-electron's /health endpoint
    const response = await fetch(`${baseURL}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000) // 5 second timeout
    });

    if (!response.ok) {
      return res.json({
        status: 'error',
        busy: false,
        error: `Server returned status ${response.status}`
      });
    }

    const data = await response.json();

    // genai-electron health response format: { status: 'ok', busy: boolean }
    res.json({
      status: data.status || 'ok',
      busy: data.busy || false
    });
  } catch (error) {
    // Network error - server not reachable
    res.json({
      status: 'error',
      busy: false,
      error: error instanceof Error ? error.message : 'Server not reachable'
    });
  }
});
