// MessageInput component - Input field and send button for chat messages

import { KeyboardEvent } from 'react';

interface MessageInputProps {
  value: string;
  onChange: (value: string) => void;
  onSendMessage: (content?: string) => void;
  disabled?: boolean;
  placeholder?: string;
  buttonLabel?: string;
  requireInput?: boolean;
}

export function MessageInput({ value, onChange, onSendMessage, disabled = false, placeholder = 'Type a message...', buttonLabel = 'Send', requireInput = true }: MessageInputProps) {
  const handleSend = () => {
    if (!disabled) {
      if (requireInput && value.trim()) {
        onSendMessage(value.trim());
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
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        rows={3}
        className="message-textarea"
      />
      <button
        onClick={handleSend}
        disabled={disabled || (requireInput && !value.trim())}
        className="send-button"
      >
        {buttonLabel}
      </button>
    </div>
  );
}
