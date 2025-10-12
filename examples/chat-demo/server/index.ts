import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { providersRouter } from './routes/providers.js';
import { modelsRouter } from './routes/models.js';
import { chatRouter } from './routes/chat.js';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'genai-lite chat demo backend is running',
    timestamp: new Date().toISOString(),
  });
});

// API Routes
app.use('/api/providers', providersRouter);
app.use('/api/models', modelsRouter);
app.use('/api/chat', chatRouter);

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Backend server running on http://localhost:${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/api/health`);
  console.log(`🤖 LLM API endpoints:`);
  console.log(`   GET  /api/providers - List all AI providers`);
  console.log(`   GET  /api/models/:providerId - List models for a provider`);
  console.log(`   POST /api/chat - Send chat message to an LLM`);
});
