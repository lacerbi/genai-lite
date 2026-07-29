import { LLMService } from "../src";
import type {
  LLMFailureResponse,
  PreparedCompleteCall,
  PreparedRequestInspection,
} from "../src/llm/types";
import type { ApiKeyProvider } from "../src/types";

const LLAMACPP_AVAILABLE =
  process.env.E2E_LLAMACPP_AVAILABLE === "true";

const keyProvider: ApiKeyProvider = async (providerId) =>
  providerId === "llamacpp" ? "not-needed" : null;

const service = new LLMService(keyProvider, {
  logLevel: "silent",
  retry: { maxRetries: 0 },
  timeoutMs: 30000,
});

(LLAMACPP_AVAILABLE ? describe : describe.skip)(
  "llama.cpp prepared counting E2E",
  () => {
    it("matches exact inspection count to terminal provider usage", async () => {
      const prepared = await service.prepareMessage(
        {
          providerId: "llamacpp",
          modelId: "llamacpp",
          messages: [{ role: "user", content: "Reply with exactly: OK" }],
          settings: {
            maxTokens: 16,
            temperature: 0,
            reasoning: { enabled: false },
          },
        },
        { mode: "complete" }
      );
      expect((prepared as LLMFailureResponse).object).not.toBe("error");

      const inspection = await service.inspectPrepared(
        prepared as PreparedCompleteCall
      );
      expect((inspection as LLMFailureResponse).object).not.toBe("error");
      const inspected = inspection as PreparedRequestInspection;
      expect(inspected.promptAccounting.status).toBe("available");

      const response = await service.sendPrepared(
        prepared as PreparedCompleteCall
      );
      expect(response.object).toBe("chat.completion");
      if (
        response.object === "chat.completion" &&
        inspected.promptAccounting.status === "available" &&
        inspected.promptAccounting.count
      ) {
        expect(response.usage?.prompt_tokens).toBe(
          inspected.promptAccounting.count.tokens
        );
      }
    });
  }
);
