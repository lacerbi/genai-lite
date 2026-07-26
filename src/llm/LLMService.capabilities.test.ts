import { LLMService } from "./LLMService";
import { LlamaCppClientAdapter } from "./clients/LlamaCppClientAdapter";
import type { ApiKeyProvider } from "../types";
import type {
  LLMFailureResponse,
  LLMRequestCapabilityPreflight,
  StructuredOutputSettings,
} from "./types";

describe("LLMService capability preflight", () => {
  let mockApiKeyProvider: jest.MockedFunction<ApiKeyProvider>;
  let service: LLMService;

  const structuredOutput: StructuredOutputSettings = {
    name: "prompt_response",
    schema: {
      type: "object",
      properties: {
        answer: { type: "string" },
      },
      required: ["answer"],
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockApiKeyProvider = jest.fn(async (providerId: string) => `mock-key-for-${providerId}`);
    service = new LLMService(mockApiKeyProvider, { logLevel: "silent" });
  });

  it("reports gemini:gemma-3-27b-it structured output as unsupported", async () => {
    const result = await service.validateRequestCapabilities({
      providerId: "gemini",
      modelId: "gemma-3-27b-it",
      settings: { structuredOutput },
    });

    expect(result.object).toBe("error");
    expect(result.valid).toBe(false);
    expect((result as LLMFailureResponse).error).toMatchObject({
      type: "validation_error",
      code: "structured_output_not_supported",
    });
    expect(result.capabilities?.structuredOutput).toMatchObject({
      status: "unsupported",
      source: "registry",
      notes: "Gemma models do not support JSON mode via Google's API",
    });
    expect(mockApiKeyProvider).not.toHaveBeenCalled();
  });

  it("reports gemini:gemma-4-31b-it structured output as unsupported", async () => {
    const result = await service.validateRequestCapabilities({
      providerId: "gemini",
      modelId: "gemma-4-31b-it",
      settings: { structuredOutput },
    });

    expect(result.object).toBe("error");
    expect(result.valid).toBe(false);
    expect((result as LLMFailureResponse).error).toMatchObject({
      type: "validation_error",
      code: "structured_output_not_supported",
    });
    expect(result.capabilities?.structuredOutput.status).toBe("unsupported");
    expect(mockApiKeyProvider).not.toHaveBeenCalled();
  });

  it("reports gemini:gemini-2.5-flash structured output as supported and valid", async () => {
    const result = await service.validateRequestCapabilities({
      providerId: "gemini",
      modelId: "gemini-2.5-flash",
      settings: { structuredOutput },
    });

    expect(result).toMatchObject({
      object: "capability.validation",
      valid: true,
      provider: "gemini",
      model: "gemini-2.5-flash",
      capabilities: {
        structuredOutput: {
          status: "supported",
          source: "registry",
          strictMode: true,
        },
      },
    });
    expect(mockApiKeyProvider).not.toHaveBeenCalled();
  });

  it("reports known models without structuredOutput metadata as unknown without failing preflight", async () => {
    // o4-mini is registered but carries no structuredOutput metadata, so the
    // capability stays unknown and preflight lets the request through.
    const capabilities = await service.getModelCapabilities("openai", "o4-mini");

    expect(capabilities).toMatchObject({
      object: "model.capabilities",
      provider: "openai",
      model: "o4-mini",
      structuredOutput: {
        status: "unknown",
        source: "registry",
      },
    });

    const result = await service.validateRequestCapabilities({
      providerId: "openai",
      modelId: "o4-mini",
      settings: { structuredOutput },
    });

    expect(result).toMatchObject({
      object: "capability.validation",
      valid: true,
      capabilities: {
        structuredOutput: {
          status: "unknown",
          source: "registry",
        },
      },
    });
    expect(mockApiKeyProvider).not.toHaveBeenCalled();
  });

  it("reports anthropic:claude-sonnet-4-5-20250929 structured output as supported and valid", async () => {
    const result = await service.validateRequestCapabilities({
      providerId: "anthropic",
      modelId: "claude-sonnet-4-5-20250929",
      settings: { structuredOutput },
    });

    expect(result).toMatchObject({
      object: "capability.validation",
      valid: true,
      provider: "anthropic",
      model: "claude-sonnet-4-5-20250929",
      capabilities: {
        structuredOutput: {
          status: "supported",
          source: "registry",
          strictMode: true,
        },
      },
    });
    expect(mockApiKeyProvider).not.toHaveBeenCalled();
  });

  it("reports pre-4.5 Anthropic models as unsupported and fails preflight", async () => {
    // Structured outputs went GA for Claude 4.5 and later only, so these models
    // are explicitly unsupported rather than unknown - the request is rejected
    // before an API call is spent.
    const capabilities = await service.getModelCapabilities(
      "anthropic",
      "claude-3-5-sonnet-20241022"
    );

    expect(capabilities).toMatchObject({
      object: "model.capabilities",
      provider: "anthropic",
      model: "claude-3-5-sonnet-20241022",
      structuredOutput: {
        status: "unsupported",
        source: "registry",
      },
    });

    const result = await service.validateRequestCapabilities({
      providerId: "anthropic",
      modelId: "claude-3-5-sonnet-20241022",
      settings: { structuredOutput },
    });

    expect(result).toMatchObject({
      object: "error",
      valid: false,
      error: {
        code: "structured_output_not_supported",
        type: "validation_error",
      },
      capabilities: {
        structuredOutput: {
          status: "unsupported",
          source: "registry",
        },
      },
    });
    expect(mockApiKeyProvider).not.toHaveBeenCalled();
  });

  it("reports unknown models as unknown using fallback metadata", async () => {
    const capabilities = await service.getModelCapabilities("openai", "future-model");

    expect(capabilities).toMatchObject({
      object: "model.capabilities",
      provider: "openai",
      model: "future-model",
      structuredOutput: {
        status: "unknown",
        source: "fallback",
      },
    });
    expect(mockApiKeyProvider).not.toHaveBeenCalled();
  });

  it("does not call provider adapters during preflight", async () => {
    const getModelCapabilitiesSpy = jest.spyOn(
      LlamaCppClientAdapter.prototype,
      "getModelCapabilities"
    );

    const localService = new LLMService(mockApiKeyProvider, { logLevel: "silent" });
    const result = await localService.validateRequestCapabilities({
      providerId: "llamacpp",
      modelId: "llamacpp",
      settings: { structuredOutput },
    });

    expect(result.object).toBe("capability.validation");
    expect(getModelCapabilitiesSpy).not.toHaveBeenCalled();
    expect(mockApiKeyProvider).not.toHaveBeenCalled();

    getModelCapabilitiesSpy.mockRestore();
  });

  it("matches sendMessage structured-output diagnostics where possible", async () => {
    const preflightRequest: LLMRequestCapabilityPreflight = {
      providerId: "gemini",
      modelId: "gemma-4-31b-it",
      settings: { structuredOutput },
    };

    const preflight = await service.validateRequestCapabilities(preflightRequest);
    const sendResult = await service.sendMessage({
      ...preflightRequest,
      providerId: "gemini",
      modelId: "gemma-4-31b-it",
      messages: [{ role: "user", content: "Return JSON." }],
    });

    expect(preflight.object).toBe("error");
    expect(sendResult.object).toBe("error");
    expect((preflight as LLMFailureResponse).error).toMatchObject(
      (sendResult as LLMFailureResponse).error
    );
    expect(mockApiKeyProvider).not.toHaveBeenCalled();
  });

  it("supports the narrow structured-output helper", async () => {
    const support = await service.supportsStructuredOutput("gemini", "gemini-2.5-flash");

    expect(support).toMatchObject({
      status: "supported",
      source: "registry",
      strictMode: true,
    });
    expect(mockApiKeyProvider).not.toHaveBeenCalled();
  });
});
