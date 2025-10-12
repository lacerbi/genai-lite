// MessageList component - Displays all messages in the conversation

import { useEffect, useRef } from 'react';
import type { Message } from '../types';

interface MessageListProps {
  messages: Message[];
}

export function MessageList({ messages }: MessageListProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const formatTimestamp = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString();
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
            <span className="message-time">{formatTimestamp(message.timestamp)}</span>
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
