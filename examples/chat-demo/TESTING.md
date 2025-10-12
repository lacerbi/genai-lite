# Testing Guide for Chat Demo

## Phase 1 Testing

### Test 1: Backend Health Check

**Expected:** Backend starts and responds to health check

```bash
cd examples/chat-demo
npm run dev:backend
```

Open http://localhost:3000/api/health - should see:
```json
{
  "status": "ok",
  "message": "genai-lite chat demo backend is running",
  "timestamp": "2025-10-12T..."
}
```

### Test 2: Frontend Development Server

**Expected:** Frontend starts and displays properly

```bash
cd examples/chat-demo
npm run dev:frontend
```

Open http://localhost:5173 - should see:
- "genai-lite Chat Demo" header
- Backend status section
- Phase 1 completion message

### Test 3: Full Integration

**Expected:** Both servers running, frontend fetches from backend

```bash
cd examples/chat-demo
npm run dev
```

Open http://localhost:5173 - should see:
- ✅ Success message with backend status
- Timestamp of last health check

### Test 4: Error Handling

**Expected:** Frontend shows error when backend is down

1. Stop backend (Ctrl+C)
2. Start only frontend: `npm run dev:frontend`
3. Visit http://localhost:5173
4. Should see: "❌ Error: Failed to fetch" or similar

## Phase 2 Testing

### Test 5: Get Providers

**Expected:** Returns list of all AI providers with availability status

```bash
curl http://localhost:3000/api/providers
```

Should return JSON with providers array, each containing:
- id (string)
- name (string)
- available (boolean) - true if API key is set

### Test 6: Get Models for Provider

**Expected:** Returns list of models for a specific provider

```bash
curl http://localhost:3000/api/models/openai
curl http://localhost:3000/api/models/anthropic
curl http://localhost:3000/api/models/gemini
curl http://localhost:3000/api/models/llamacpp
```

Should return JSON with models array, each containing model details (id, name, pricing, etc.)

### Test 7: Send Chat Message

**Expected:** Sends message to LLM and returns response

```bash
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "providerId": "openai",
    "modelId": "gpt-4.1-mini",
    "messages": [
      {"role": "user", "content": "Say hello!"}
    ]
  }'
```

**Note:** Requires valid API key in .env file

Should return JSON with:
- success: true
- response object containing content, usage stats, etc.

### Test 8: Use Test Script

Run the automated test script:

```bash
./server/test-api.sh
```

This tests all Phase 2 endpoints automatically (requires jq installed)

## Phase 3 Testing

### Test 9: Chat Interface Loading

**Expected:** Frontend displays chat interface with all components

```bash
cd examples/chat-demo
npm run dev
```

Open http://localhost:5173 - should see:
- Header with "genai-lite Chat Demo" and "Clear Chat" button
- Provider and model selector dropdowns
- Settings toggle button
- Empty message area with "No messages yet" text
- Message input field at the bottom

### Test 10: Provider and Model Selection

**Expected:** Can select providers and models from dropdowns

1. Open http://localhost:5173
2. Click the Provider dropdown
3. Should see available providers (marked with availability status)
4. Select a provider (e.g., OpenAI)
5. Model dropdown should populate with models for that provider
6. Select a model (e.g., gpt-4.1-mini)

**Note:** Requires at least one API key in `.env` file

### Test 11: Settings Panel

**Expected:** Settings panel expands and controls work

1. Click "⚙️ Settings" button
2. Panel should expand showing:
   - Temperature slider (0-2)
   - Max Tokens input field
   - Top P slider (0-1)
   - Enable Reasoning checkbox (with effort selector)
   - Enable Thinking Extraction checkbox
   - Reset to Defaults button
3. Adjust settings and verify values update
4. Click Reset to Defaults and verify values reset

### Test 12: Send Message (Full Flow)

**Expected:** Can send message and receive response

**Prerequisites:** `.env` file with at least one valid API key

1. Open http://localhost:5173
2. Select provider and model
3. Type a message in the input field (e.g., "Hello!")
4. Click Send or press Enter
5. Should see:
   - User message appears in blue on the right
   - Loading indicator appears
   - Assistant response appears in gray on the left
   - Message timestamps
6. Try sending another message to test conversation continuity

### Test 13: Reasoning Feature

**Expected:** Reasoning output displays in collapsible section

1. Select a model that supports reasoning (e.g., Claude 4, Gemini 2.5 Pro, o4-mini)
2. Open Settings panel
3. Enable "Reasoning" and select effort level
4. Send a complex query (e.g., "Solve this step by step: What is 15% of 240?")
5. Should see:
   - Assistant response
   - Collapsible "Reasoning / Thinking" section
   - Click to expand and see reasoning content

### Test 14: Thinking Extraction

**Expected:** Thinking tags are extracted and displayed

1. Open Settings panel
2. Enable "Thinking Extraction"
3. Send a message that might produce thinking (any complex query)
4. If model uses `<thinking>` tags, they should be extracted and shown separately

### Test 15: Error Handling

**Expected:** Errors display user-friendly messages

1. Try sending a message without selecting provider/model
   - Should show error: "Please select a provider and model first"
2. Stop the backend server (Ctrl+C in backend terminal)
3. Try sending a message
   - Should show error about failed connection
4. Select a provider without API key
   - Should see "(API key missing)" in dropdown
   - Attempting to use it should fail gracefully

### Test 16: Clear Chat

**Expected:** Clear button removes all messages

1. Send a few messages
2. Click "Clear Chat" button
3. All messages should disappear
4. Should see "No messages yet" message again

### Test 17: Responsive Design

**Expected:** UI works on mobile screen sizes

1. Open browser DevTools (F12)
2. Toggle device toolbar (responsive mode)
3. Select mobile device (e.g., iPhone)
4. Verify:
   - Layout adjusts for narrow screen
   - Components stack vertically
   - Text remains readable
   - Buttons are tap-friendly

## Test Results Log

### Phase 1 & 2 Testing (2025-10-12)
- [ ] Backend health check
- [ ] Frontend dev server
- [ ] Full integration test
- [ ] Error handling test

### Phase 3 Testing (2025-10-12)
- [ ] Chat interface loading
- [ ] Provider and model selection
- [ ] Settings panel functionality
- [ ] Send message (full flow)
- [ ] Reasoning feature
- [ ] Thinking extraction
- [ ] Error handling
- [ ] Clear chat functionality
- [ ] Responsive design

