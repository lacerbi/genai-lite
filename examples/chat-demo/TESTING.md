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

## Phase 2 Testing (Coming Soon)

Tests for:
- GET /api/providers
- GET /api/models/:providerId
- POST /api/chat

## Test Results Log

### 2025-10-12
- [ ] Backend health check
- [ ] Frontend dev server
- [ ] Full integration test
- [ ] Error handling test

