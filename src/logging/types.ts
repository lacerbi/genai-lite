/**
 * Log level type - ordered from most quiet to most verbose
 */
export type LogLevel = 'silent' | 'error' | 'warn' | 'info' | 'debug';

/**
 * Logger interface compatible with popular logging libraries
 * (pino, winston, bunyan, console all have these methods)
 */
export interface Logger {
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}

/**
 * Configuration for the logging system
 */
export interface LoggingConfig {
  /** Log level threshold - messages below this level are suppressed */
  level: LogLevel;
  /** Custom logger implementation (optional) */
  logger?: Logger;
}
