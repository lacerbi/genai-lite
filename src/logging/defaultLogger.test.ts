import { createDefaultLogger, silentLogger } from './defaultLogger';
import type { LogLevel } from './types';

describe('createDefaultLogger', () => {
  let consoleLogSpy: jest.SpyInstance;
  let consoleWarnSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('level filtering', () => {
    it('should output all levels at debug level', () => {
      const logger = createDefaultLogger('debug');

      logger.debug('debug message');
      logger.info('info message');
      logger.warn('warn message');
      logger.error('error message');

      expect(consoleLogSpy).toHaveBeenCalledTimes(2); // debug + info
      expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    });

    it('should suppress debug at info level', () => {
      const logger = createDefaultLogger('info');

      logger.debug('debug message');
      logger.info('info message');
      logger.warn('warn message');
      logger.error('error message');

      expect(consoleLogSpy).toHaveBeenCalledTimes(1); // only info
      expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    });

    it('should suppress debug and info at warn level', () => {
      const logger = createDefaultLogger('warn');

      logger.debug('debug message');
      logger.info('info message');
      logger.warn('warn message');
      logger.error('error message');

      expect(consoleLogSpy).not.toHaveBeenCalled();
      expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    });

    it('should only output errors at error level', () => {
      const logger = createDefaultLogger('error');

      logger.debug('debug message');
      logger.info('info message');
      logger.warn('warn message');
      logger.error('error message');

      expect(consoleLogSpy).not.toHaveBeenCalled();
      expect(consoleWarnSpy).not.toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    });

    it('should output nothing at silent level', () => {
      const logger = createDefaultLogger('silent');

      logger.debug('debug message');
      logger.info('info message');
      logger.warn('warn message');
      logger.error('error message');

      expect(consoleLogSpy).not.toHaveBeenCalled();
      expect(consoleWarnSpy).not.toHaveBeenCalled();
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });
  });

  describe('message formatting', () => {
    it('should prefix messages with level tag', () => {
      const logger = createDefaultLogger('debug');

      logger.debug('test debug');
      logger.info('test info');
      logger.warn('test warn');
      logger.error('test error');

      expect(consoleLogSpy).toHaveBeenCalledWith('[genai-lite:debug] test debug');
      expect(consoleLogSpy).toHaveBeenCalledWith('[genai-lite:info] test info');
      expect(consoleWarnSpy).toHaveBeenCalledWith('[genai-lite:warn] test warn');
      expect(consoleErrorSpy).toHaveBeenCalledWith('[genai-lite:error] test error');
    });

    it('should pass additional arguments through', () => {
      const logger = createDefaultLogger('debug');
      const extraData = { key: 'value' };

      logger.debug('message', extraData);
      logger.info('message', 1, 2, 3);
      logger.warn('message', 'extra');
      logger.error('message', new Error('test'));

      expect(consoleLogSpy).toHaveBeenCalledWith('[genai-lite:debug] message', extraData);
      expect(consoleLogSpy).toHaveBeenCalledWith('[genai-lite:info] message', 1, 2, 3);
      expect(consoleWarnSpy).toHaveBeenCalledWith('[genai-lite:warn] message', 'extra');
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[genai-lite:error] message',
        expect.any(Error)
      );
    });
  });
});

describe('silentLogger', () => {
  it('should not output any messages', () => {
    const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

    silentLogger.debug('debug');
    silentLogger.info('info');
    silentLogger.warn('warn');
    silentLogger.error('error');

    expect(consoleLogSpy).not.toHaveBeenCalled();
    expect(consoleWarnSpy).not.toHaveBeenCalled();
    expect(consoleErrorSpy).not.toHaveBeenCalled();

    jest.restoreAllMocks();
  });

  it('should have all required Logger interface methods', () => {
    expect(typeof silentLogger.debug).toBe('function');
    expect(typeof silentLogger.info).toBe('function');
    expect(typeof silentLogger.warn).toBe('function');
    expect(typeof silentLogger.error).toBe('function');
  });
});

describe('DEFAULT_LOG_LEVEL', () => {
  // Note: Testing environment variable behavior requires modifying process.env
  // before the module loads, which is tricky in Jest. These tests verify
  // the exported value exists and is a valid log level.

  it('should export a valid log level', () => {
    // Import fresh to get the current default
    const { DEFAULT_LOG_LEVEL } = require('./defaultLogger');
    const validLevels: LogLevel[] = ['silent', 'error', 'warn', 'info', 'debug'];
    expect(validLevels).toContain(DEFAULT_LOG_LEVEL);
  });
});
