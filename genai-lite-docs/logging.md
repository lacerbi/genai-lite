# Logging

Configure logging behavior for debugging, monitoring, and production deployments.

## Contents

- [Overview](#overview)
- [Quick Start](#quick-start)
- [Log Levels](#log-levels)
- [Environment Configuration](#environment-configuration)
- [Service Configuration](#service-configuration)
- [Custom Logger Integration](#custom-logger-integration)
- [Silent Logger for Testing](#silent-logger-for-testing)
- [Built-in Default Logger](#built-in-default-logger)
- [Related Documentation](#related-documentation)

## Overview

genai-lite includes a configurable logging system that:
- Defaults to `warn` level (errors and warnings only)
- Can be configured via environment variable (`GENAI_LITE_LOG_LEVEL`)
- Can be overridden per-service instance
- Supports custom logger injection (pino, winston, bunyan, etc.)

## Quick Start

### Environment Variable (Simplest)

```bash
# Enable debug logging globally
export GENAI_LITE_LOG_LEVEL=debug
```

### Per-Service Configuration

```typescript
import { LLMService, fromEnvironment } from 'genai-lite';

const llmService = new LLMService(fromEnvironment, {
  logLevel: 'debug'  // Override environment variable
});
```

### Custom Logger (Production)

```typescript
import pino from 'pino';
import { LLMService, fromEnvironment } from 'genai-lite';

const pinoLogger = pino({ level: 'debug' });

const llmService = new LLMService(fromEnvironment, {
  logger: pinoLogger  // Use pino instead of console
});
```

## Log Levels

| Level | Description | Use Case |
|-------|-------------|----------|
| `silent` | No output | Testing, production (no logs) |
| `error` | Errors only | Production (minimal) |
| `warn` | Errors + warnings | **Default** - Production (recommended) |
| `info` | + informational | Development |
| `debug` | + debug details | Troubleshooting |

Levels are ordered: `silent` < `error` < `warn` < `info` < `debug`

## Environment Configuration

Set `GENAI_LITE_LOG_LEVEL` to configure the default log level for all services:

```bash
# In shell
export GENAI_LITE_LOG_LEVEL=debug

# In .env file (requires dotenv package)
GENAI_LITE_LOG_LEVEL=info
```

**Valid values**: `silent`, `error`, `warn`, `info`, `debug`

**Default**: `warn`

The environment variable is read once at module load time.

## Service Configuration

Both `LLMService` and `ImageService` support logging options:

```typescript
// LLMService
const llmService = new LLMService(fromEnvironment, {
  logLevel: 'info',           // Override env var
  logger: customLogger,       // Inject custom logger
  // ... other options
});

// ImageService
const imageService = new ImageService(fromEnvironment, {
  logLevel: 'debug',
  logger: customLogger,
  // ... other options
});
```

**Priority**: `logger` option > `logLevel` option > `GENAI_LITE_LOG_LEVEL` env var > default (`warn`)

## Custom Logger Integration

The `Logger` interface is compatible with popular logging libraries:

```typescript
interface Logger {
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}
```

### Using pino

```typescript
import pino from 'pino';
import { LLMService, fromEnvironment } from 'genai-lite';

const logger = pino({
  level: 'debug',
  transport: { target: 'pino-pretty' }
});

const llmService = new LLMService(fromEnvironment, { logger });
```

### Using winston

```typescript
import winston from 'winston';
import { LLMService, fromEnvironment } from 'genai-lite';

const logger = winston.createLogger({
  level: 'debug',
  format: winston.format.simple(),
  transports: [new winston.transports.Console()]
});

const llmService = new LLMService(fromEnvironment, { logger });
```

### Using console directly

```typescript
const llmService = new LLMService(fromEnvironment, {
  logger: console  // console has debug, info, warn, error methods
});
```

## Silent Logger for Testing

Suppress all logging output in tests:

```typescript
import { LLMService, silentLogger, fromEnvironment } from 'genai-lite';

describe('MyTests', () => {
  const llmService = new LLMService(fromEnvironment, {
    logger: silentLogger
  });

  // Tests run without any console output
});
```

## Built-in Default Logger

For programmatic control, create a default console logger:

```typescript
import { createDefaultLogger } from 'genai-lite';

// Create logger with specific level
const debugLogger = createDefaultLogger('debug');
const errorOnlyLogger = createDefaultLogger('error');

// Use default level from environment
const envLogger = createDefaultLogger();
```

The default logger outputs messages with prefixes like:
```
[genai-lite:debug] Merged settings for openai/gpt-4.1-mini
[genai-lite:info] Making OpenAI API call for model: gpt-4.1-mini
[genai-lite:warn] Unknown model, using default settings
[genai-lite:error] API request failed: rate limit exceeded
```

## Related Documentation

- **[Core Concepts](core-concepts.md)** - Service initialization patterns
- **[LLM Service](llm-service.md)** - LLMService options
- **[Image Service](image-service.md)** - ImageService options
- **[TypeScript Reference](typescript-reference.md)** - Logger, LogLevel, LoggingConfig types
- **[Troubleshooting](troubleshooting.md)** - Debugging with logs
