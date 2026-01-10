// AI Summary: Shared utilities for handling system messages across LLM adapters.
// Provides functions to collect, combine, and transform system content for models
// that don't support native system instructions.

/**
 * Format options for prepending system content when model doesn't support system messages.
 * - 'xml': Wrap in XML tags (default) - `<system>content</system>\n\n{user message}`
 * - 'separator': Use a custom separator string - `{content}{separator}{user message}`
 *   Default separator is `\n\n---\n\n`. Specify full separator including whitespace.
 * - 'plain': Just prepend with double newline - `{content}\n\n{user message}`
 */
export type SystemMessageFallbackFormat = 'xml' | 'separator' | 'plain';

/**
 * Options for formatting system content when prepending to user messages
 */
export interface SystemMessageFormatOptions {
  /**
   * Format to use when prepending system content to user message.
   * @default 'xml'
   */
  format?: SystemMessageFallbackFormat;

  /**
   * Tag name to use when format is 'xml'.
   * @default 'system'
   * @example tagName: 'instructions' produces `<instructions>content</instructions>`
   */
  tagName?: string;

  /**
   * Separator string to use when format is 'separator'.
   * Include any whitespace/newlines in the separator itself.
   * @default '\n\n---\n\n'
   * @example separator: '\n\n===\n\n' produces `content\n\n===\n\nuser message`
   */
  separator?: string;
}

/**
 * Result of collecting system content for fallback handling
 */
export interface SystemContentResult {
  /** Combined system content from all sources */
  combinedSystemContent: string | undefined;
  /** Whether to use native system message support */
  useNativeSystemMessage: boolean;
}

/**
 * Generic message interface for system message handling
 */
export interface GenericMessage {
  role: string;
  content: string;
}

/**
 * Default format options for system message fallback
 */
export const DEFAULT_SYSTEM_MESSAGE_FORMAT_OPTIONS: Required<SystemMessageFormatOptions> = {
  format: 'xml',
  tagName: 'system',
  separator: '\n\n---\n\n',
};

/**
 * Formats system content according to the specified format options.
 *
 * @param systemContent - The system content to format
 * @param userContent - The original user message content
 * @param options - Format options (defaults to XML with 'system' tag)
 * @returns The formatted combined content
 *
 * @example
 * ```typescript
 * // XML format (default)
 * formatSystemContentForPrepend('Be helpful', 'Hello', { format: 'xml' });
 * // Returns: '<system>\nBe helpful\n</system>\n\nHello'
 *
 * // Separator format (default separator is '\n\n---\n\n')
 * formatSystemContentForPrepend('Be helpful', 'Hello', { format: 'separator' });
 * // Returns: 'Be helpful\n\n---\n\nHello'
 *
 * // Custom separator (specify full separator including whitespace)
 * formatSystemContentForPrepend('Be helpful', 'Hello', { format: 'separator', separator: '\n\n===\n\n' });
 * // Returns: 'Be helpful\n\n===\n\nHello'
 *
 * // Plain format
 * formatSystemContentForPrepend('Be helpful', 'Hello', { format: 'plain' });
 * // Returns: 'Be helpful\n\nHello'
 * ```
 */
export function formatSystemContentForPrepend(
  systemContent: string,
  userContent: string,
  options?: SystemMessageFormatOptions
): string {
  const opts = { ...DEFAULT_SYSTEM_MESSAGE_FORMAT_OPTIONS, ...options };

  switch (opts.format) {
    case 'xml':
      return `<${opts.tagName}>\n${systemContent}\n</${opts.tagName}>\n\n${userContent}`;

    case 'separator':
      return `${systemContent}${opts.separator}${userContent}`;

    case 'plain':
    default:
      return `${systemContent}\n\n${userContent}`;
  }
}

/**
 * Collects system content from either the request-level systemMessage field
 * or inline system messages in the messages array.
 *
 * @param requestSystemMessage - The request.systemMessage field (if any)
 * @param inlineSystemMessages - Array of system message contents from the messages array
 * @param supportsSystemMessage - Whether the model supports native system messages
 * @returns Object with combined content and whether to use native support
 * @throws Error if both requestSystemMessage and inlineSystemMessages are provided
 *
 * @example
 * ```typescript
 * // Using request.systemMessage field
 * const result1 = collectSystemContent('You are helpful', [], true);
 * // result1.combinedSystemContent = 'You are helpful'
 *
 * // Using inline system messages
 * const result2 = collectSystemContent(undefined, ['Be concise', 'Be brief'], true);
 * // result2.combinedSystemContent = 'Be concise\n\nBe brief'
 *
 * // Using both throws an error
 * collectSystemContent('You are helpful', ['Be concise'], true);
 * // throws: "Cannot use both systemMessage field and system role messages..."
 * ```
 */
export function collectSystemContent(
  requestSystemMessage: string | undefined,
  inlineSystemMessages: string[],
  supportsSystemMessage: boolean
): SystemContentResult {
  // Throw error if both systemMessage field and inline system messages are provided
  if (requestSystemMessage && inlineSystemMessages.length > 0) {
    throw new Error(
      "Cannot use both systemMessage field and system role messages in the messages array. " +
        "Use one or the other."
    );
  }

  // Use whichever source is provided
  let combinedSystemContent: string | undefined;

  if (requestSystemMessage) {
    combinedSystemContent = requestSystemMessage;
  } else if (inlineSystemMessages.length > 0) {
    combinedSystemContent = inlineSystemMessages.join("\n\n");
  }

  return {
    combinedSystemContent,
    useNativeSystemMessage: supportsSystemMessage,
  };
}

/**
 * Prepends system content to the first user message in an array.
 *
 * This is used as a fallback for models that don't support native system
 * instructions. The system content is formatted according to the options
 * and prepended to the first user message.
 *
 * @param messages - Array of message objects with role and content
 * @param systemContent - System content to prepend
 * @param options - Format options (defaults to XML with 'system' tag)
 * @returns The index of the modified message, or -1 if no user message found
 *
 * @example
 * ```typescript
 * const messages = [
 *   { role: 'user', content: 'Hello' },
 *   { role: 'assistant', content: 'Hi!' }
 * ];
 *
 * // Default (XML format)
 * prependSystemToFirstUserMessage(messages, 'Be helpful');
 * // messages[0].content = '<system>\nBe helpful\n</system>\n\nHello'
 *
 * // Plain format
 * prependSystemToFirstUserMessage(messages, 'Be helpful', { format: 'plain' });
 * // messages[0].content = 'Be helpful\n\nHello'
 *
 * // Separator format (default separator is '\n\n---\n\n')
 * prependSystemToFirstUserMessage(messages, 'Be helpful', { format: 'separator' });
 * // messages[0].content = 'Be helpful\n\n---\n\nHello'
 * ```
 */
export function prependSystemToFirstUserMessage<T extends GenericMessage>(
  messages: T[],
  systemContent: string,
  options?: SystemMessageFormatOptions
): number {
  const firstUserIndex = messages.findIndex((m) => m.role === "user");

  if (firstUserIndex !== -1) {
    messages[firstUserIndex].content = formatSystemContentForPrepend(
      systemContent,
      messages[firstUserIndex].content,
      options
    );
    return firstUserIndex;
  }

  return -1;
}

/**
 * Filters system messages from an array and returns non-system messages
 * along with collected system content.
 *
 * This is a convenience function that combines message filtering with
 * system content collection in a single pass.
 *
 * @param messages - Array of messages to process
 * @param requestSystemMessage - Optional request-level system message
 * @param supportsSystemMessage - Whether the model supports native system messages
 * @returns Object with filtered messages and system content handling info
 *
 * @example
 * ```typescript
 * const messages = [
 *   { role: 'system', content: 'Be helpful' },
 *   { role: 'user', content: 'Hello' }
 * ];
 * const result = processMessagesForSystemSupport(messages, undefined, false);
 * // result.nonSystemMessages = [{ role: 'user', content: 'Hello' }]
 * // result.systemContent.combinedSystemContent = 'Be helpful'
 * ```
 */
export function processMessagesForSystemSupport<T extends GenericMessage>(
  messages: T[],
  requestSystemMessage: string | undefined,
  supportsSystemMessage: boolean
): {
  nonSystemMessages: T[];
  systemContent: SystemContentResult;
} {
  const nonSystemMessages: T[] = [];
  const inlineSystemMessages: string[] = [];

  for (const message of messages) {
    if (message.role === "system") {
      inlineSystemMessages.push(message.content);
    } else {
      nonSystemMessages.push(message);
    }
  }

  const systemContent = collectSystemContent(
    requestSystemMessage,
    inlineSystemMessages,
    supportsSystemMessage
  );

  return {
    nonSystemMessages,
    systemContent,
  };
}
