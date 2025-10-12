#!/bin/bash
# Quick API test script for Phase 2 backend endpoints

BASE_URL="http://localhost:3000"

echo "🧪 Testing genai-lite Chat Demo Backend API"
echo "==========================================="
echo ""

# Test 1: Health check
echo "Test 1: Health Check (GET /api/health)"
curl -s "${BASE_URL}/api/health" | jq . || echo "❌ Failed"
echo ""

# Test 2: Get providers
echo "Test 2: Get Providers (GET /api/providers)"
curl -s "${BASE_URL}/api/providers" | jq . || echo "❌ Failed"
echo ""

# Test 3: Get models for a provider (OpenAI)
echo "Test 3: Get Models for OpenAI (GET /api/models/openai)"
curl -s "${BASE_URL}/api/models/openai" | jq . || echo "❌ Failed"
echo ""

# Test 4: Get models for anthropic
echo "Test 4: Get Models for Anthropic (GET /api/models/anthropic)"
curl -s "${BASE_URL}/api/models/anthropic" | jq . || echo "❌ Failed"
echo ""

echo "✅ Basic API tests complete!"
echo ""
echo "Note: To test POST /api/chat, you'll need:"
echo "  1. Valid API key in .env file"
echo "  2. Manual curl or test with frontend"
