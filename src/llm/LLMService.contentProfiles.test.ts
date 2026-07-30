import { LLMService } from "./LLMService";
import { MockClientAdapter } from "./clients/MockClientAdapter";
import {
  computeContentTokenizerSemanticRevision,
  registerContentTokenProfileConfiguration,
} from "./tokenization";

describe("LLMService registered content-token profiles", () => {
  const semantic = {
    tokenizerImplementation: "service-test-tokenizer-v1",
    textPolicy: "ordinary-text-no-specials-v1" as const,
    artifacts: [{ role: "vocab", sha256: "e".repeat(64) }],
  };
  const revision = computeContentTokenizerSemanticRevision(semantic);

  beforeAll(() => {
    registerContentTokenProfileConfiguration({
      backends: [
        {
          id: "service-test-profile",
          tokenizerId: "test:service-tokenizer",
          revision,
          provenance: { semantic },
          countTextTokens: (text: string): number => text.length,
        },
      ],
      aliases: [
        {
          providerId: "mock",
          modelId: "registered-content-model",
          profileId: "service-test-profile",
        },
      ],
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("reports model-quality counting with mapping provenance", async () => {
    const service = new LLMService(
      async () => "mock-key",
      { logLevel: "silent" }
    );
    const result = await service.getModelCapabilities(
      "mock",
      "registered-content-model"
    );

    expect(result).toMatchObject({
      capabilities: {
        contentTokenCounting: "model",
        tokenProfileId: "service-test-profile",
        tokenProfileMappingRevision: expect.stringMatching(/^[a-f0-9]{64}$/),
      },
    });
  });

  it("fills only missing raw-content evidence from the registered profile", async () => {
    jest.spyOn(MockClientAdapter.prototype, "sendPrepared").mockResolvedValue({
      id: "service-content-profile",
      object: "chat.completion",
      created: 1,
      model: "registered-content-model",
      provider: "mock",
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: "answer" },
          finish_reason: "stop",
          answerAccounting: {
            providerOutput: {
              tokens: 9,
              method: "exact",
              source: "provider",
              reasoning: "unknown",
            },
          },
        },
      ],
    });
    const service = new LLMService(
      async () => "mock-key",
      { logLevel: "silent" }
    );
    const response = await service.sendMessage({
      providerId: "mock",
      modelId: "registered-content-model",
      messages: [{ role: "user", content: "question" }],
    });

    expect(response.object).toBe("chat.completion");
    if (response.object === "chat.completion") {
      expect(response.choices[0].answerAccounting).toEqual({
        rawContent: {
          tokens: 6,
          method: "model",
          source: "library",
          tokenizerId: "test:service-tokenizer",
          tokenProfileRevision: revision,
          reasoning: "unknown",
        },
        providerOutput: {
          tokens: 9,
          method: "exact",
          source: "provider",
          reasoning: "unknown",
        },
      });
      expect(response.choices[0].rawAnswerAccounting).toEqual(
        response.choices[0].answerAccounting?.rawContent
      );
    }
  });
});
