import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { providersRouter } from './routes/providers.js';
import { modelsRouter } from './routes/models.js';
import { presetsRouter } from './routes/presets.js';
import { imageRouter } from './routes/image.js';
import { healthRouter } from './routes/health.js';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'genai-lite image generation demo backend is running',
    timestamp: new Date().toISOString(),
  });
});

// API Routes
app.use('/api/image-providers', providersRouter);
app.use('/api/image-models', modelsRouter);
app.use('/api/image-presets', presetsRouter);
app.use('/api/health', healthRouter);
app.use('/api', imageRouter);

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Backend server running on http://localhost:${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/api/health`);
  console.log(`🎨 Image API endpoints:`);
  console.log(`   GET  /api/image-providers - List all image providers`);
  console.log(`   GET  /api/image-models/:providerId - List models for a provider`);
  console.log(`   GET  /api/image-presets - List all configured presets`);
  console.log(`   POST /api/generate - Generate image(s) from prompt`);
});
