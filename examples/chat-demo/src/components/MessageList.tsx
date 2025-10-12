// MessageList component - Displays all messages in the conversation

import { useEffect, useRef, useState } from 'react';
import type { Message } from '../types';

interface MessageListProps {
  messages: Message[];
}

export function MessageList({ messages }: MessageListProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const formatTimestamp = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString();
  };

  const handleCopyMessage = async (index: number, message: Message) => {
    try {
      let text = `${message.role.toUpperCase()}: ${message.content}`;
      if (message.reasoning) {
        text += `\n\nREASONING: ${message.reasoning}`;
      }
      await navigator.clipboard.writeText(text);
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
    } catch (error) {
      console.error('Failed to copy message:', error);
    }
  };

  if (messages.length === 0) {
    return (
      <div className="message-list empty">
        <p className="empty-message">No messages yet. Start a conversation!</p>
      </div>
    );
  }

  return (
    <div className="message-list">
      {messages.map((message, index) => (
        <div key={index} className={`message message-${message.role}`}>
          <div className="message-header">
            <span className="message-role">{message.role}</span>
            <div className="message-header-actions">
              <span className="message-time">{formatTimestamp(message.timestamp)}</span>
              <button
                className="copy-message-button"
                onClick={() => handleCopyMessage(index, message)}
                title="Copy message"
              >
                {copiedIndex === index ? '✓' : '📋'}
              </button>
            </div>
          </div>
          {message.reasoning && (
            <details className="message-reasoning">
              <summary>Reasoning / Thinking</summary>
              <div className="reasoning-content">{message.reasoning}</div>
            </details>
          )}
          <div className="message-content">{message.content}</div>
        </div>
      ))}
      <div ref={messagesEndRef} />
    </div>
  );
}
