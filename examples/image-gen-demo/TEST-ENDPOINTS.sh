#!/bin/bash
# Test script for image-gen-demo API endpoints
# Make sure the backend is running: npm run dev:backend

echo "Testing Image Generation Demo API Endpoints"
echo "==========================================="
echo ""

echo "1. Health Check"
echo "GET /api/health"
curl -s http://localhost:3001/api/health | python3 -m json.tool
echo ""
echo ""

echo "2. Image Providers"
echo "GET /api/image-providers"
curl -s http://localhost:3001/api/image-providers | python3 -m json.tool | head -30
echo "..."
echo ""
echo ""

echo "3. Models for OpenAI Images"
echo "GET /api/image-models/openai-images"
curl -s http://localhost:3001/api/image-models/openai-images | python3 -m json.tool | head -20
echo "..."
echo ""
echo ""

echo "4. Image Presets"
echo "GET /api/image-presets"
curl -s http://localhost:3001/api/image-presets | python3 -m json.tool | head -20
echo "..."
echo ""
echo ""

echo "5. Generate Image (without API key - should fail gracefully)"
echo "POST /api/generate"
curl -s -X POST http://localhost:3001/api/generate \
  -H "Content-Type: application/json" \
  -d '{
    "providerId": "openai-images",
    "modelId": "gpt-image-1-mini",
    "prompt": "A serene mountain lake at sunrise"
  }' | python3 -m json.tool
echo ""
echo ""

echo "==========================================="
echo "All endpoint tests complete!"
echo ""
echo "To test with an actual OpenAI API key:"
echo "1. Add your key to .env: OPENAI_API_KEY=sk-..."
echo "2. Restart the backend"
echo "3. Run the generate test again"
