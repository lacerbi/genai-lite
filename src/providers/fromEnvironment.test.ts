import { fromEnvironment } from './fromEnvironment';

describe('fromEnvironment', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.resetModules(); // Clear cache
    process.env = { ...OLD_ENV }; // Make a copy
  });

  afterAll(() => {
    process.env = OLD_ENV; // Restore old environment
  });

  it('should retrieve an existing environment variable', async () => {
    process.env.OPENAI_API_KEY = 'test-openai-key';
    const key = await fromEnvironment('openai');
    expect(key).toBe('test-openai-key');
  });

  it('should convert provider ID to uppercase', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';
    const key = await fromEnvironment('anthropic');
    expect(key).toBe('test-anthropic-key');
  });

  it('should handle mixed case provider IDs', async () => {
    process.env.GEMINI_API_KEY = 'test-gemini-key';
    const key = await fromEnvironment('GeMiNi');
    expect(key).toBe('test-gemini-key');
  });

  it('should return null for a non-existent environment variable', async () => {
    const key = await fromEnvironment('nonexistent');
    expect(key).toBeNull();
  });

  it('should return null for empty provider ID', async () => {
    const key = await fromEnvironment('');
    expect(key).toBeNull();
  });

  it('should handle special characters in provider ID', async () => {
    process.env['PROVIDER-123_API_KEY'] = 'test-special-key';
    const key = await fromEnvironment('provider-123');
    expect(key).toBe('test-special-key');
  });

  it('should return null when environment variable exists but is empty', async () => {
    process.env.EMPTY_API_KEY = '';
    const key = await fromEnvironment('empty');
    expect(key).toBeNull(); // Empty string is falsy, so || null returns null
  });

  it('should return "not-needed" for llamacpp provider', async () => {
    const key = await fromEnvironment('llamacpp');
    expect(key).toBe('not-needed');
  });

  it('should return "not-needed" for mock provider', async () => {
    const key = await fromEnvironment('mock');
    expect(key).toBe('not-needed');
  });

  it('should return "not-needed" for llamacpp even if environment variable exists', async () => {
    process.env.LLAMACPP_API_KEY = 'should-not-be-used';
    const key = await fromEnvironment('llamacpp');
    expect(key).toBe('not-needed');
  });
});