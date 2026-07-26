const baseConfig = require('./jest.config.js');

module.exports = {
  ...baseConfig,
  testMatch: ['<rootDir>/e2e-tests/**/*.e2e.test.ts'],
  testPathIgnorePatterns: ['/node_modules/', '/dist/'], // Reset to not ignore itself
  testTimeout: 30000, // 30 seconds
  // Probes llama-server once and publishes E2E_LLAMACPP_AVAILABLE so suites can
  // gate with describe.skip at registration time. See e2e-tests/globalSetup.js
  // for why a runtime check inside the test body is not good enough.
  globalSetup: '<rootDir>/e2e-tests/globalSetup.js',
};