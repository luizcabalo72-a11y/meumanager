export default {
  testEnvironment: 'jsdom',
  collectCoverageFrom: [
    '**/*.js',
    '!node_modules/**',
    '!functions/**',
    '!jest.config.js'
  ],
  testMatch: ['**/__tests__/**/*.test.js', '**/*.test.js'],
  transform: {},
  testPathIgnorePatterns: ['/node_modules/', '/functions/']
};
