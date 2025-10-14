# Remaining Tasks for Thinking Tag Fallback Refactor

## Status: ~85% Complete

### ✅ Completed
1. ✅ Updated type definitions in src/llm/types.ts
2. ✅ Updated LLMService.ts core logic (sendMessage and createMessages methods)
3. ✅ Updated src/index.ts public exports
4. ✅ Updated all unit tests - **424 tests passing**
5. ✅ Committed core implementation changes (commit: f980c9b)
6. ✅ Updated README.md, CLAUDE.md, docs/dev/2025-10-14_understanding-thinking.md
7. ✅ Created docs/MIGRATION_THINKING_TAGS.md migration guide
8. ✅ Committed documentation updates (commit: e270234)

### 🔄 Remaining Tasks

#### 1. Update chat-demo Example Application
**File:** `examples/chat-demo/src/data/exampleTemplates.ts`

Replace:
- `thinking_enabled` → `native_reasoning_active`
- `thinking_available` → `native_reasoning_capable`
- `!native_reasoning_active` → `requires_tags_for_thinking`
- `thinkingExtraction` → `thinkingTagFallback` (in META blocks)

**Command:**
```bash
sed -i \
  -e 's/thinking_enabled/native_reasoning_active/g' \
  -e 's/thinking_available/native_reasoning_capable/g' \
  -e 's/!native_reasoning_active/requires_tags_for_thinking/g' \
  -e 's/thinkingExtraction/thinkingTagFallback/g' \
  examples/chat-demo/src/data/exampleTemplates.ts
```

#### 2. Update chat-demo TypeScript Types
**File:** `examples/chat-demo/src/types/index.ts`

Check if this file imports or re-exports any types from genai-lite that need updating.

#### 3. Test chat-demo Application
```bash
cd examples/chat-demo
npm install  # In case dependencies need updating
npm run dev  # Start the demo and test manually
```

**Test checklist:**
- [ ] Template examples render correctly
- [ ] Model context variables work (native_reasoning_active, etc.)
- [ ] requires_tags_for_thinking conditional works
- [ ] Settings with thinkingTagFallback are accepted
- [ ] All example templates function as expected

#### 4. Final Documentation Polish

**README.md** - Remove/update the old `onMissing` property section around line 348-360:
- The section titled "**The `onMissing` Property:**" needs to be removed or rewritten for the new `enforce` boolean
- Update any remaining prose that references 'auto', 'ignore', 'warn', 'error' modes

**Suggested new section:**
```markdown
**The `enforce` Property:**

The `enforce` boolean controls whether thinking tags are required when native reasoning is not active:

- `enforce: true` - Error if tags missing AND native reasoning not active (smart enforcement)
- `enforce: false` (default) - Extract tags if present, never error

The enforcement is **always smart** - it automatically checks if native reasoning is active and only enforces when the model needs tags as a fallback.
```

#### 5. Update Summary Files (Low Priority)
After all changes are complete, update:
- `src/.summary_long.md`
- `src/llm/.summary_long.md`

These already have correct examples from the earlier commit, but should be reviewed.

#### 6. Final Commit and Testing

After completing the above:

```bash
# Commit chat-demo updates
git add examples/chat-demo
git commit -s -m "refactor: update chat-demo to use new thinking tag fallback interface"

# Run full test suite one more time
npm test

# Test the demo app manually
cd examples/chat-demo && npm run dev

# When all is done, create final summary commit
git add -A
git commit -s -m "docs: final polish for thinking tag fallback refactor

- Remove outdated onMissing documentation
- Update all example templates
- Verify all functionality working

Breaking change refactor complete."
```

## Summary of Changes

**Breaking Changes:**
- `LLMThinkingExtractionSettings` → `LLMThinkingTagFallbackSettings`
- `settings.thinkingExtraction` → `settings.thinkingTagFallback`
- `thinkingExtraction.tag` → `thinkingTagFallback.tagName`
- `thinkingExtraction.onMissing` → `thinkingTagFallback.enforce` (boolean)
- `ModelContext.thinking_enabled` → `ModelContext.native_reasoning_active`
- `ModelContext.thinking_available` → `ModelContext.native_reasoning_capable`
- Added: `ModelContext.requires_tags_for_thinking` (new semantic variable)

**Files Modified:** ~30 files
**Tests Passing:** 424/424 ✅

## Related Files
- **REFACTOR_PLAN.md** - Comprehensive design document and implementation plan
- **docs/MIGRATION_THINKING_TAGS.md** - Migration guide for users (copy of REFACTOR_PLAN.md)
- **docs/dev/2025-10-14_understanding-thinking.md** - Updated usage guide
