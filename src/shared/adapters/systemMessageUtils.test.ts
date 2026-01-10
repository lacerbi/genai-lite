import {
  collectSystemContent,
  prependSystemToFirstUserMessage,
  processMessagesForSystemSupport,
  formatSystemContentForPrepend,
  DEFAULT_SYSTEM_MESSAGE_FORMAT_OPTIONS,
  type GenericMessage,
} from "./systemMessageUtils";

describe("systemMessageUtils", () => {
  describe("collectSystemContent", () => {
    it("should return combined content with only request.systemMessage", () => {
      const result = collectSystemContent("You are helpful", [], true);

      expect(result.combinedSystemContent).toBe("You are helpful");
      expect(result.useNativeSystemMessage).toBe(true);
    });

    it("should return combined content with only inline system messages", () => {
      const result = collectSystemContent(
        undefined,
        ["Be concise", "Be accurate"],
        true
      );

      expect(result.combinedSystemContent).toBe("Be concise\n\nBe accurate");
      expect(result.useNativeSystemMessage).toBe(true);
    });

    it("should combine request.systemMessage and inline messages", () => {
      const result = collectSystemContent(
        "You are helpful",
        ["Be concise"],
        true
      );

      expect(result.combinedSystemContent).toBe("You are helpful\n\nBe concise");
      expect(result.useNativeSystemMessage).toBe(true);
    });

    it("should return undefined when no system content provided", () => {
      const result = collectSystemContent(undefined, [], true);

      expect(result.combinedSystemContent).toBeUndefined();
      expect(result.useNativeSystemMessage).toBe(true);
    });

    it("should set useNativeSystemMessage to false when not supported", () => {
      const result = collectSystemContent("You are helpful", [], false);

      expect(result.combinedSystemContent).toBe("You are helpful");
      expect(result.useNativeSystemMessage).toBe(false);
    });

    it("should handle empty strings in inline messages", () => {
      const result = collectSystemContent("Base", ["", "Additional"], true);

      // Empty strings are included (could be filtered if needed)
      expect(result.combinedSystemContent).toBe("Base\n\n\n\nAdditional");
    });
  });

  describe("formatSystemContentForPrepend", () => {
    it("should format with XML tags by default", () => {
      const result = formatSystemContentForPrepend("Be helpful", "Hello");

      expect(result).toBe("<system>\nBe helpful\n</system>\n\nHello");
    });

    it("should use custom tag name for XML format", () => {
      const result = formatSystemContentForPrepend("Be helpful", "Hello", {
        format: "xml",
        tagName: "instructions",
      });

      expect(result).toBe("<instructions>\nBe helpful\n</instructions>\n\nHello");
    });

    it("should format with separator", () => {
      const result = formatSystemContentForPrepend("Be helpful", "Hello", {
        format: "separator",
      });

      expect(result).toBe("Be helpful\n\n---\n\nHello");
    });

    it("should use custom separator string", () => {
      const result = formatSystemContentForPrepend("Be helpful", "Hello", {
        format: "separator",
        separator: "===",
      });

      expect(result).toBe("Be helpful\n\n===\n\nHello");
    });

    it("should format plain (just newlines)", () => {
      const result = formatSystemContentForPrepend("Be helpful", "Hello", {
        format: "plain",
      });

      expect(result).toBe("Be helpful\n\nHello");
    });

    it("should handle multiline system content with XML", () => {
      const result = formatSystemContentForPrepend(
        "Line 1\nLine 2\nLine 3",
        "Hello",
        { format: "xml" }
      );

      expect(result).toBe("<system>\nLine 1\nLine 2\nLine 3\n</system>\n\nHello");
    });

    it("should handle multiline system content with separator", () => {
      const result = formatSystemContentForPrepend(
        "Line 1\nLine 2",
        "Hello",
        { format: "separator" }
      );

      expect(result).toBe("Line 1\nLine 2\n\n---\n\nHello");
    });
  });

  describe("DEFAULT_SYSTEM_MESSAGE_FORMAT_OPTIONS", () => {
    it("should have xml as default format", () => {
      expect(DEFAULT_SYSTEM_MESSAGE_FORMAT_OPTIONS.format).toBe("xml");
    });

    it("should have 'system' as default tag name", () => {
      expect(DEFAULT_SYSTEM_MESSAGE_FORMAT_OPTIONS.tagName).toBe("system");
    });

    it("should have '---' as default separator", () => {
      expect(DEFAULT_SYSTEM_MESSAGE_FORMAT_OPTIONS.separator).toBe("---");
    });
  });

  describe("prependSystemToFirstUserMessage", () => {
    it("should prepend to the first user message with XML format by default", () => {
      const messages: GenericMessage[] = [
        { role: "user", content: "Hello" },
        { role: "assistant", content: "Hi!" },
      ];

      const index = prependSystemToFirstUserMessage(messages, "Be helpful");

      expect(index).toBe(0);
      expect(messages[0].content).toBe("<system>\nBe helpful\n</system>\n\nHello");
      expect(messages[1].content).toBe("Hi!"); // Unchanged
    });

    it("should prepend with plain format when specified", () => {
      const messages: GenericMessage[] = [
        { role: "user", content: "Hello" },
      ];

      prependSystemToFirstUserMessage(messages, "Be helpful", { format: "plain" });

      expect(messages[0].content).toBe("Be helpful\n\nHello");
    });

    it("should prepend with separator format when specified", () => {
      const messages: GenericMessage[] = [
        { role: "user", content: "Hello" },
      ];

      prependSystemToFirstUserMessage(messages, "Be helpful", { format: "separator" });

      expect(messages[0].content).toBe("Be helpful\n\n---\n\nHello");
    });

    it("should prepend with custom XML tag name", () => {
      const messages: GenericMessage[] = [
        { role: "user", content: "Hello" },
      ];

      prependSystemToFirstUserMessage(messages, "Be helpful", {
        format: "xml",
        tagName: "context",
      });

      expect(messages[0].content).toBe("<context>\nBe helpful\n</context>\n\nHello");
    });

    it("should find user message even if not first", () => {
      const messages: GenericMessage[] = [
        { role: "assistant", content: "Previous response" },
        { role: "user", content: "Hello" },
      ];

      const index = prependSystemToFirstUserMessage(messages, "Be helpful", {
        format: "plain",
      });

      expect(index).toBe(1);
      expect(messages[0].content).toBe("Previous response"); // Unchanged
      expect(messages[1].content).toBe("Be helpful\n\nHello");
    });

    it("should return -1 when no user messages exist", () => {
      const messages: GenericMessage[] = [
        { role: "assistant", content: "Hi!" },
      ];

      const index = prependSystemToFirstUserMessage(messages, "Be helpful");

      expect(index).toBe(-1);
      expect(messages[0].content).toBe("Hi!"); // Unchanged
    });

    it("should return -1 for empty messages array", () => {
      const messages: GenericMessage[] = [];

      const index = prependSystemToFirstUserMessage(messages, "Be helpful");

      expect(index).toBe(-1);
    });

    it("should handle multiline system content with default XML format", () => {
      const messages: GenericMessage[] = [{ role: "user", content: "Hello" }];

      prependSystemToFirstUserMessage(messages, "Line 1\nLine 2\nLine 3");

      expect(messages[0].content).toBe(
        "<system>\nLine 1\nLine 2\nLine 3\n</system>\n\nHello"
      );
    });
  });

  describe("processMessagesForSystemSupport", () => {
    it("should separate system messages from other messages", () => {
      const messages: GenericMessage[] = [
        { role: "system", content: "Be helpful" },
        { role: "user", content: "Hello" },
        { role: "assistant", content: "Hi!" },
      ];

      const result = processMessagesForSystemSupport(messages, undefined, true);

      expect(result.nonSystemMessages).toHaveLength(2);
      expect(result.nonSystemMessages[0].role).toBe("user");
      expect(result.nonSystemMessages[1].role).toBe("assistant");
      expect(result.systemContent.combinedSystemContent).toBe("Be helpful");
      expect(result.systemContent.useNativeSystemMessage).toBe(true);
    });

    it("should combine request.systemMessage with inline system messages", () => {
      const messages: GenericMessage[] = [
        { role: "system", content: "Additional instruction" },
        { role: "user", content: "Hello" },
      ];

      const result = processMessagesForSystemSupport(
        messages,
        "Base instruction",
        true
      );

      expect(result.nonSystemMessages).toHaveLength(1);
      expect(result.systemContent.combinedSystemContent).toBe(
        "Base instruction\n\nAdditional instruction"
      );
    });

    it("should handle no system messages", () => {
      const messages: GenericMessage[] = [
        { role: "user", content: "Hello" },
        { role: "assistant", content: "Hi!" },
      ];

      const result = processMessagesForSystemSupport(messages, undefined, true);

      expect(result.nonSystemMessages).toHaveLength(2);
      expect(result.systemContent.combinedSystemContent).toBeUndefined();
    });

    it("should handle multiple system messages", () => {
      const messages: GenericMessage[] = [
        { role: "system", content: "First instruction" },
        { role: "user", content: "Hello" },
        { role: "system", content: "Second instruction" },
        { role: "user", content: "Another question" },
      ];

      const result = processMessagesForSystemSupport(messages, undefined, true);

      expect(result.nonSystemMessages).toHaveLength(2);
      expect(result.nonSystemMessages[0].content).toBe("Hello");
      expect(result.nonSystemMessages[1].content).toBe("Another question");
      expect(result.systemContent.combinedSystemContent).toBe(
        "First instruction\n\nSecond instruction"
      );
    });

    it("should set useNativeSystemMessage based on supportsSystemMessage", () => {
      const messages: GenericMessage[] = [{ role: "user", content: "Hello" }];

      const supportedResult = processMessagesForSystemSupport(
        messages,
        "Be helpful",
        true
      );
      const unsupportedResult = processMessagesForSystemSupport(
        messages,
        "Be helpful",
        false
      );

      expect(supportedResult.systemContent.useNativeSystemMessage).toBe(true);
      expect(unsupportedResult.systemContent.useNativeSystemMessage).toBe(false);
    });

    it("should handle empty messages array", () => {
      const messages: GenericMessage[] = [];

      const result = processMessagesForSystemSupport(
        messages,
        "Be helpful",
        false
      );

      expect(result.nonSystemMessages).toHaveLength(0);
      expect(result.systemContent.combinedSystemContent).toBe("Be helpful");
      expect(result.systemContent.useNativeSystemMessage).toBe(false);
    });
  });
});
