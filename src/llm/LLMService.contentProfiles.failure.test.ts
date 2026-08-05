import type { LLMResponse } from "./types";

const O200K_RANK_MODULE = "js-tiktoken/ranks/o200k_base";

afterEach(() => {
  jest.resetModules();
  jest.dontMock(O200K_RANK_MODULE);
  jest.restoreAllMocks();
});

describe("LLMService built-in content-tokenizer failure", () => {
  it("degrades capability and response accounting when rank loading fails", async () => {
    jest.doMock(O200K_RANK_MODULE, () => {
      throw new Error("simulated bundled rank failure");
    });

    await jest.isolateModulesAsync(async () => {
      const { LLMService } = require("./LLMService") as
        typeof import("./LLMService");
      const { OpenAIClientAdapter } = require(
        "./clients/OpenAIClientAdapter"
      ) as typeof import("./clients/OpenAIClientAdapter");
      const providerResponse: LLMResponse = {
        id: "rank-failure-response",
        object: "chat.completion",
        created: 1,
        model: "gpt-5.1",
        provider: "openai",
        choices: [{
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
        }],
      };
      jest.spyOn(OpenAIClientAdapter.prototype, "sendPrepared")
        .mockResolvedValue(providerResponse);
      const service = new LLMService(
        async () => "sk-test-key-12345678901234567890",
        { logLevel: "silent" }
      );

      await expect(
        service.getModelCapabilities("openai", "gpt-5.1")
      ).resolves.toMatchObject({
        capabilities: { contentTokenCounting: "unavailable" },
      });

      const response = await service.sendMessage({
        providerId: "openai",
        modelId: "gpt-5.1",
        messages: [{ role: "user", content: "question" }],
      });
      expect(response.object).toBe("chat.completion");
      if (response.object === "chat.completion") {
        expect(response.choices[0].answerAccounting).toEqual({
          providerOutput: {
            tokens: 9,
            method: "exact",
            source: "provider",
            reasoning: "unknown",
          },
        });
        expect(response.choices[0].rawAnswerAccounting).toBeUndefined();
      }
    });
  });
});
