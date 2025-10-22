# Image Generation Demo

An interactive web application demonstrating the image generation capabilities of the genai-lite library. This demo showcases how to generate AI images using both cloud providers (OpenAI Images) and local diffusion models (genai-electron).

## Features

- 🎨 **Multi-Provider Support** - Switch between OpenAI Images and genai-electron diffusion
- ⚙️ **Comprehensive Settings** - Universal settings (width, height, quality) and provider-specific options
- 🔄 **Batch Generation** - Generate multiple images (1-4) in a single request
- 📊 **Progress Monitoring** - Real-time progress updates for local diffusion generation
- 🖼️ **Gallery View** - Responsive grid display of generated images
- 💾 **Image Management** - Download individual images and view metadata
- 🎯 **Preset System** - 12 built-in presets for common use cases

## Prerequisites

### Required
- Node.js 18+ and npm
- At least one of the following:
  - **OpenAI API key** for cloud-based image generation
  - **genai-electron** running locally for diffusion models

### Optional
- genai-electron diffusion server (for local Stable Diffusion image generation)

## Quick Start

### 1. Installation

```bash
cd examples/image-gen-demo
npm install
```

### 2. Configuration

Copy the example environment file and add your API keys:

```bash
cp .env.example .env
# Edit .env and add your OPENAI_API_KEY
```

**For OpenAI Images:**
```bash
OPENAI_API_KEY=sk-your-key-here
```

**For genai-electron (optional):**
```bash
# Start genai-electron diffusion server on port 8081
GENAI_ELECTRON_IMAGE_BASE_URL=http://localhost:8081
```

### 3. Run the Demo

```bash
npm run dev
```

This starts:
- **Frontend**: http://localhost:5174
- **Backend API**: http://localhost:3001

## Usage

1. **Select Provider & Model**
   - Choose between OpenAI Images or genai-electron
   - Select a specific model (e.g., gpt-image-1-mini, dall-e-3)

2. **Enter Your Prompt**
   - Describe the image you want to generate
   - Example: "A serene mountain lake at sunrise, photorealistic"

3. **Configure Settings** (Optional)
   - Adjust universal settings (width, height, quality)
   - Configure provider-specific options:
     - **OpenAI**: Quality, style, output format
     - **Diffusion**: Negative prompt, steps, CFG scale, sampler, seed

4. **Generate**
   - Click "Generate Image"
   - For diffusion models, watch real-time progress
   - View generated images in the gallery

5. **Manage Images**
   - Download individual images
   - View metadata (seed, dimensions, generation time)
   - Clear gallery when needed

## API Endpoints

The backend provides the following endpoints:

- `GET /api/health` - Health check
- `GET /api/image-providers` - List available providers
- `GET /api/image-models/:providerId` - Get models for a provider
- `GET /api/image-presets` - List configured presets
- `POST /api/generate` - Generate image(s)

## Project Structure

```
examples/image-gen-demo/
├── server/                 # Backend (Express)
│   ├── index.ts           # Server entry point
│   ├── services/
│   │   └── image.ts       # ImageService initialization
│   └── routes/
│       ├── providers.ts   # Provider endpoints
│       ├── models.ts      # Model endpoints
│       ├── presets.ts     # Preset endpoints
│       └── image.ts       # Image generation endpoint
└── src/                   # Frontend (React)
    ├── index.html
    ├── main.tsx
    └── App.tsx
```

## Development

### Run Backend Only
```bash
npm run dev:backend
```

### Run Frontend Only
```bash
npm run dev:frontend
```

### Build for Production
```bash
npm run build
npm run preview
```

## Troubleshooting

### OpenAI Images Not Available
- Verify your API key is set in `.env`
- Check key format starts with `sk-`
- Ensure you have credits in your OpenAI account

### genai-electron Not Available
- Start genai-electron diffusion server on port 8081
- Verify the server is running: `curl http://localhost:8081/health`
- Check `GENAI_ELECTRON_IMAGE_BASE_URL` in `.env`

### Port Already in Use
- Change `PORT` in `.env` for backend (default: 3001)
- Change `server.port` in `vite.config.ts` for frontend (default: 5174)

## Learn More

- [genai-lite Documentation](../../README.md)
- [Image Generation API](../../README.md#image-generation)
- [OpenAI Images API](https://platform.openai.com/docs/api-reference/images)

## License

This demo is part of the genai-lite project and is licensed under the MIT License.
