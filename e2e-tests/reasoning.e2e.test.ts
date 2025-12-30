import { LLMService } from '../src/index';
import type { ApiKeyProvider } from '../src/types';
import type { LLMResponse } from '../src/llm/types';

// Test-specific API key provider that looks for E2E-prefixed env vars
const e2eKeyProvider: ApiKeyProvider = async (providerId: string) => {
  const envVarName = `E2E_${providerId.toUpperCase()}_API_KEY`;
  return process.env[envVarName] || null;
};

const llmService = new LLMService(e2eKeyProvider);

// Helper to check if we got reasoning output
function hasReasoningOutput(response: LLMResponse): boolean {
  if (response.object !== 'chat.completion') return false;
  return !!response.choices[0].reasoning;
}

// --- Gemini Reasoning Tests ---
const geminiApiKey = process.env.E2E_GEMINI_API_KEY;
(geminiApiKey ? describe : describe.skip)('Gemini Reasoning E2E', () => {
  
  // Test 1: Gemini 2.5 Flash with dynamic budget (-1)
  // This tests the model's ability to automatically determine reasoning budget
  it('should receive reasoning output from gemini-2.5-flash with dynamic budget', async () => {
    const response = await llmService.sendMessage({
      providerId: 'gemini',
      modelId: 'gemini-2.5-flash',
      messages: [{ 
        role: 'user', 
        content: 'What is the square root of 144? Think step by step.' 
      }],
      settings: { 
        temperature: 0,
        reasoning: {
          enabled: true,
          // Not specifying maxTokens or effort - should use dynamic budget (-1)
        }
      }
    });
    
    expect(response.object).toBe('chat.completion');
    if (response.object === 'chat.completion') {
      const content = response.choices[0].message.content;
      expect(content).toBeDefined();
      expect(content).toContain('12'); // Should contain the answer
      
      // Check if we got reasoning output
      const reasoning = response.choices[0].reasoning;
      console.log('Gemini 2.5 Flash reasoning output:', reasoning ? 'Present' : 'Not present');
      if (reasoning) {
        console.log('Reasoning length:', reasoning.length, 'characters');
      }
    }
  }, 30000); // Increased timeout for reasoning

  // Test 2: Gemini 2.5 Flash-Lite with effort level
  // This tests the effort-based reasoning configuration
  it('should receive reasoning output from gemini-2.5-flash-lite with effort level', async () => {
    const response = await llmService.sendMessage({
      providerId: 'gemini',
      modelId: 'gemini-2.5-flash-lite',
      messages: [{ 
        role: 'user', 
        content: 'Is 17 a prime number? Explain your reasoning.' 
      }],
      settings: { 
        temperature: 0,
        reasoning: {
          enabled: true,
          effort: 'low', // Testing effort-based configuration
          exclude: false // Explicitly request reasoning in output
        }
      }
    });
    
    expect(response.object).toBe('chat.completion');
    if (response.object === 'chat.completion') {
      const content = response.choices[0].message.content;
      expect(content).toBeDefined();
      expect(content.toLowerCase()).toContain('yes'); // 17 is prime
      
      // Check if we got reasoning output
      const reasoning = response.choices[0].reasoning;
      console.log('Gemini 2.5 Flash-Lite reasoning output:', reasoning ? 'Present' : 'Not present');
      if (reasoning) {
        console.log('Reasoning length:', reasoning.length, 'characters');
      }
    }
  }, 30000); // Increased timeout for reasoning

  // Optional: Test excluding reasoning from output (only if you want to verify this works)
  if (process.env.E2E_TEST_EXCLUDE_REASONING) {
    it('should NOT include reasoning when exclude is true', async () => {
      const response = await llmService.sendMessage({
        providerId: 'gemini',
        modelId: 'gemini-2.5-flash',
        messages: [{ 
          role: 'user', 
          content: 'What is 2 + 2?' 
        }],
        settings: { 
          temperature: 0,
          reasoning: {
            enabled: true,
            exclude: true // Should enable reasoning but not return it
          }
        }
      });
      
      expect(response.object).toBe('chat.completion');
      if (response.object === 'chat.completion') {
        const content = response.choices[0].message.content;
        expect(content).toContain('4');
        
        // Should NOT have reasoning in output
        const reasoning = response.choices[0].reasoning;
        expect(reasoning).toBeUndefined();
      }
    }, 30000);
  }
});