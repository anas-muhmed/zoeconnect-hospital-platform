module.exports = {
  testEnvironment: 'jsdom',
  rootDir: 'src',
  testMatch: ['**/__tests__/**/*.spec.{ts,tsx}'],
  transform: { '^.+\\.tsx?$': 'ts-jest' },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'json'],
  setupFiles: ['./jest.setup.ts'],
};
