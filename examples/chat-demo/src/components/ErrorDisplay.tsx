// ErrorDisplay component - Displays errors with expandable details

interface ErrorDisplayProps {
  userMessage: string;
  rawError?: any;
}

export function ErrorDisplay({ userMessage, rawError }: ErrorDisplayProps) {
  // Format raw error for display
  const formatRawError = () => {
    if (!rawError) return null;

    // If it's an error object with specific fields
    if (typeof rawError === 'object') {
      const errorDetails: any = {};

      // Extract common error fields
      if (rawError.code) errorDetails.code = rawError.code;
      if (rawError.message) errorDetails.message = rawError.message;
      if (rawError.type) errorDetails.type = rawError.type;
      if (rawError.partialResponse) errorDetails.partialResponse = rawError.partialResponse;

      // Include stack trace if available (for Error objects)
      if (rawError.stack) errorDetails.stack = rawError.stack;

      // If there are other fields, include them
      const otherFields = Object.keys(rawError).filter(
        key => !['code', 'message', 'type', 'partialResponse', 'stack'].includes(key)
      );
      otherFields.forEach(key => {
        errorDetails[key] = rawError[key];
      });

      return JSON.stringify(errorDetails, null, 2);
    }

    // For string or other types
    return String(rawError);
  };

  const rawErrorString = formatRawError();

  return (
    <div className="error-message">
      <div className="error-header">
        <strong>⚠️ Error:</strong> {userMessage}
      </div>
      {rawErrorString && (
        <details className="error-details">
          <summary>Show Details</summary>
          <div className="error-details-content">
            <pre>{rawErrorString}</pre>
          </div>
        </details>
      )}
    </div>
  );
}
