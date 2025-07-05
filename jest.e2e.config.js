const baseConfig = require('./jest.config.js');

module.exports = {
  ...baseConfig,
  testMatch: ['<rootDir>/e2e-tests/**/*.e2e.test.ts'],
  testPathIgnorePatterns: ['/node_modules/', '/dist/'], // Reset to not ignore itself
  testTimeout: 30000, // 30 seconds
};