// MessageInput component - Input field and send button for chat messages

import { useState, KeyboardEvent } from 'react';

interface MessageInputProps {
  onSendMessage: (content?: string) => void;
  disabled?: boolean;
  placeholder?: string;
  buttonLabel?: string;
  requireInput?: boolean;
}

export function MessageInput({ onSendMessage, disabled = false, placeholder = 'Type a message...', buttonLabel = 'Send', requireInput = true }: MessageInputProps) {
  const [input, setInput] = useState('');

  const handleSend = () => {
    if (!disabled) {
      if (requireInput && input.trim()) {
        onSendMessage(input.trim());
        setInput('');
      } else if (!requireInput) {
        onSendMessage();
      }
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Send on Enter (without Shift)
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="message-input">
      <textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        rows={3}
        className="message-textarea"
      />
      <button
        onClick={handleSend}
        disabled={disabled || (requireInput && !input.trim())}
        className="send-button"
      >
        {buttonLabel}
      </button>
    </div>
  );
}
