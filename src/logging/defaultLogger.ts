import type { Logger, LogLevel } from './types';

/**
 * Numeric values for log levels (higher = more verbose)
 */
const LOG_LEVEL_VALUES: Record<LogLevel, number> = {
  silent: 0,
  error: 1,
  warn: 2,
  info: 3,
  debug: 4,
};

/**
 * Valid log level strings for validation
 */
const VALID_LOG_LEVELS = new Set<string>(['silent', 'error', 'warn', 'info', 'debug']);

/**
 * Reads the default log level from environment variable.
 * Called once at module load time.
 *
 * @returns The log level from GENAI_LITE_LOG_LEVEL or 'warn' as default
 */
function getDefaultLogLevelFromEnv(): LogLevel {
  const envLevel = process.env.GENAI_LITE_LOG_LEVEL?.toLowerCase();
  if (envLevel && VALID_LOG_LEVELS.has(envLevel)) {
    return envLevel as LogLevel;
  }
  return 'warn'; // Sensible default: errors + warnings
}

/**
 * The default log level, read once at module initialization.
 * Can be overridden per-service via constructor options.
 */
export const DEFAULT_LOG_LEVEL: LogLevel = getDefaultLogLevelFromEnv();

/**
 * Creates a default console-based logger with level filtering.
 *
 * @param level - The minimum log level to output (defaults to env var or 'warn')
 * @returns A Logger instance that filters messages below the specified level
 *
 * @example
 * ```typescript
 * const logger = createDefaultLogger('debug');
 * logger.debug('This will be shown');
 * logger.info('This will be shown');
 *
 * const quietLogger = createDefaultLogger('error');
 * quietLogger.debug('This will be suppressed');
 * quietLogger.info('This will be suppressed');
 * quietLogger.error('This will be shown');
 * ```
 */
export function createDefaultLogger(level: LogLevel = DEFAULT_LOG_LEVEL): Logger {
  const threshold = LOG_LEVEL_VALUES[level];

  return {
    debug(message: string, ...args: unknown[]): void {
      if (threshold >= LOG_LEVEL_VALUES.debug) {
        console.log(`[genai-lite:debug] ${message}`, ...args);
      }
    },
    info(message: string, ...args: unknown[]): void {
      if (threshold >= LOG_LEVEL_VALUES.info) {
        console.log(`[genai-lite:info] ${message}`, ...args);
      }
    },
    warn(message: string, ...args: unknown[]): void {
      if (threshold >= LOG_LEVEL_VALUES.warn) {
        console.warn(`[genai-lite:warn] ${message}`, ...args);
      }
    },
    error(message: string, ...args: unknown[]): void {
      if (threshold >= LOG_LEVEL_VALUES.error) {
        console.error(`[genai-lite:error] ${message}`, ...args);
      }
    },
  };
}

/**
 * A silent logger that discards all output.
 * Useful for testing or when logging should be completely disabled.
 *
 * @example
 * ```typescript
 * const service = new LLMService(apiKeyProvider, { logger: silentLogger });
 * ```
 */
export const silentLogger: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};
