export default {
  transform: {},
  extensionsToTreatAsEsm: [".js"],
  testEnvironment: "node",
  testMatch: ["**/tests/**/*.test.js"],
  globalSetup: "./tests/helpers/setup.js",
  globalTeardown: "./tests/helpers/teardown.js",
  testTimeout: 30000,
  moduleNameMapper: {},
  transformIgnorePatterns: ["/node_modules/"],
};
