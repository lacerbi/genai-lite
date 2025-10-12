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

## Phase 4 Testing

### Test 18: Advanced Features Panel

**Expected:** Advanced features panel expands and shows tabs

1. Open http://localhost:5173
2. Click "🎯 Advanced Features" button
3. Panel should expand showing:
   - Two tabs: "Templates" and "llama.cpp Tools"
   - Templates tab active by default
4. Click between tabs to verify switching works

### Test 19: Template Rendering - Basic

**Expected:** Can render templates with variable substitution

1. Open Advanced Features panel
2. Click "Templates" tab
3. Select a preset from the preset dropdown
4. Keep default "Basic Variable Substitution" template
5. Modify the "topic" variable (e.g., change to "Python")
6. Click "Render Template"
7. Should see:
   - Rendered messages with substituted variable
   - Model context information
   - Settings (if any in template)

### Test 20: Template Rendering - Conditional

**Expected:** Templates with conditional logic work

1. Select "Conditional Logic" template
2. Try changing "formal" variable between "true" and "false"
3. Modify the "question" variable
4. Click "Render Template"
5. Should see different system message based on "formal" value

### Test 21: Template Rendering - Model-Aware

**Expected:** Model-aware templates show settings from <META> blocks

1. Select "Model-Aware Template"
2. Select a preset with thinking/reasoning capabilities
3. Modify the "query" variable
4. Click "Render Template"
5. Should see:
   - System message adapting to model's thinking capability
   - Settings from <META> block (temperature: 0.8, maxTokens: 500)
   - Model context showing thinking_enabled flag

### Test 22: llama.cpp Tokenization

**Expected:** Can tokenize text using llama.cpp server

**Prerequisites:** llama.cpp server running on port 8080

1. Open Advanced Features panel
2. Click "llama.cpp Tools" tab
3. Click "Tokenization" sub-tab
4. Enter some text (e.g., "Hello, world! This is a test.")
5. Click "Tokenize"
6. Should see:
   - Token count
   - Expandable token array (first 100 tokens)

### Test 23: llama.cpp Health Check

**Expected:** Can check llama.cpp server health

**Prerequisites:** llama.cpp server running on port 8080

1. Go to llama.cpp Tools tab
2. Click "Health Check" sub-tab
3. Click "Check Health"
4. Should see:
   - Status (e.g., "ok")
   - Idle slots count
   - Processing slots count

### Test 24: llama.cpp Embeddings

**Expected:** Can generate embeddings

**Prerequisites:** llama.cpp server running with embedding support

1. Go to llama.cpp Tools tab
2. Click "Embeddings" sub-tab
3. Enter text (e.g., "Search query example")
4. Click "Generate Embedding"
5. Should see:
   - Dimension of the embedding vector
   - Expandable vector preview (first 20 dimensions)

### Test 25: Template Rendering Without Preset

**Expected:** Error message when no preset selected

1. Go to Templates tab
2. Clear preset selection (select "Choose a preset...")
3. Click "Render Template"
4. Should see error: "Please select a preset first"

### Test 26: llama.cpp Tools Without Server

**Expected:** Helpful error messages when server not available

1. Stop llama.cpp server (if running)
2. Go to llama.cpp Tools tab
3. Try any tool (Tokenization, Health Check, Embeddings)
4. Should see error message indicating llama.cpp server is not available
5. For health check, should see hint about starting server

### Phase 4 Testing (2025-10-12)
- [ ] Advanced features panel expansion
- [ ] Template rendering - basic
- [ ] Template rendering - conditional
- [ ] Template rendering - model-aware
- [ ] llama.cpp tokenization
- [ ] llama.cpp health check
- [ ] llama.cpp embeddings
- [ ] Template rendering error handling
- [ ] llama.cpp server unavailable handling

## Phase 5 Testing

### Test 27: Settings Persistence - Save

**Expected:** Settings are automatically saved to localStorage

1. Open http://localhost:5173
2. Select a provider and model (e.g., OpenAI, gpt-4.1-mini)
3. Open Settings panel
4. Change temperature to 0.9
5. Enable reasoning
6. Refresh the page (F5)
7. Should see:
   - Same provider and model selected
   - Temperature still at 0.9
   - Reasoning still enabled

### Test 28: Settings Persistence - Reset

**Expected:** Reset to Defaults clears persisted settings

1. With custom settings applied
2. Click "Reset to Defaults" in Settings panel
3. Should see:
   - Temperature back to 0.7
   - Max Tokens cleared
   - Top P back to 1
   - Reasoning disabled
4. Refresh page
5. Defaults should still be applied

### Test 29: Export Conversation as JSON

**Expected:** Conversation downloads as JSON file

1. Send a few messages in the chat
2. Click "💾 Export" button
3. Should see:
   - JSON file downloaded (chat-export-YYYY-MM-DD....json)
   - File contains: exportedAt, provider, model, settings, messages
   - Messages include content, role, timestamp
   - Settings match current configuration

### Test 30: Copy Conversation as Markdown

**Expected:** Conversation copies to clipboard in Markdown format

1. Send a few messages in the chat
2. Click "📋 Copy" button
3. Paste into a text editor (Ctrl+V)
4. Should see:
   - Messages formatted with ## headers
   - Timestamps in italic
   - Reasoning sections with ### headers
   - Separator lines (---) between messages

### Test 31: Copy Individual Message

**Expected:** Single message copies to clipboard

1. Send a message and get a response
2. Hover over any message
3. Click the 📋 button
4. Should see:
   - Button changes to ✓ briefly
   - Paste shows: "ROLE: content"
   - If message has reasoning, includes "REASONING: ..." section

### Test 32: Enhanced Error Messages - Network

**Expected:** Network errors show helpful message

1. Stop the backend server
2. Try to send a message
3. Should see error:
   - "Network error: Cannot connect to the backend server..."
   - Suggests running `npm run dev`

### Test 33: Enhanced Error Messages - API Key

**Expected:** Missing API key shows setup instructions

1. Select a provider without an API key
2. Try to send a message
3. Should see error:
   - "Missing or invalid API key for [provider]..."
   - Shows example: OPENAI_API_KEY=your-key-here
   - Instructs to restart server

### Test 34: Enhanced Error Messages - llama.cpp

**Expected:** llama.cpp errors show startup command

1. Select llamacpp provider (without server running)
2. Try to send a message
3. Should see error:
   - "llama.cpp server not running..."
   - Shows command: `llama-server -m /path/to/model.gguf --port 8080`

### Test 35: Loading Animation

**Expected:** Smooth loading indicator appears

1. Send a message
2. Should see:
   - Loading indicator in bottom-right with spinner
   - Spinner rotates smoothly
   - Indicator slides in from bottom
   - Send button disabled while loading
   - Input disabled while loading

### Test 36: Button Animations

**Expected:** Buttons have smooth hover and click effects

1. Hover over any button (Send, Copy, Export, Clear)
2. Should see:
   - Button lifts slightly (translateY)
   - Shadow appears
3. Click button
4. Should see:
   - Button presses down (returns to original position)
   - Shadow disappears

### Test 37: Template Categories and Filtering

**Expected:** 10 templates organized in 4 categories

1. Open Advanced Features → Templates tab
2. Click category dropdown
3. Should see:
   - All Templates (10)
   - General (3)
   - Code (3)
   - Creative (1)
   - Analysis (3)
4. Select "Code" category
5. Should see only code-related templates
6. Template tags displayed below description

### Test 38: Template Variable Editing

**Expected:** Variables support different types

1. Select "Problem Solver with Reasoning" template
2. Edit variables:
   - Change "hasConstraints" to false (boolean)
   - Modify "problem" text (string)
3. Should see:
   - Boolean parses correctly (true/false)
   - Numbers parse as numbers
   - Strings remain strings
4. Click "Render Template"
5. Should see changes reflected in rendered messages

### Test 39: Empty State Handling

**Expected:** Export/Copy disabled when no messages

1. Open fresh page
2. Check Export and Copy buttons
3. Should see:
   - Both buttons disabled (grayed out)
4. Send a message
5. Should see:
   - Buttons now enabled and clickable

### Test 40: Settings Panel Transitions

**Expected:** Smooth animations when expanding panels

1. Click "⚙️ Settings" to expand
2. Should see:
   - Panel slides open smoothly
   - Content fades in (animation: fadeIn 0.3s)
3. Click again to collapse
4. Panel closes smoothly
5. Repeat with "🎯 Advanced Features"
6. Same smooth transitions

### Phase 5 Testing (2025-10-12)
- [ ] Settings persistence - save
- [ ] Settings persistence - reset
- [ ] Export conversation as JSON
- [ ] Copy conversation as Markdown
- [ ] Copy individual message
- [ ] Enhanced error messages - network
- [ ] Enhanced error messages - API key
- [ ] Enhanced error messages - llama.cpp
- [ ] Loading animation
- [ ] Button animations
- [ ] Template categories and filtering
- [ ] Template variable editing
- [ ] Empty state handling
- [ ] Settings panel transitions

