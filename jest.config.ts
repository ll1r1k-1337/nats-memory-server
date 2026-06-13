import { type JestConfigWithTsJest } from 'ts-jest';

const config: JestConfigWithTsJest = {
  preset: `ts-jest`,
  rootDir: `.`,
  testEnvironment: `node`,
  moduleFileExtensions: [`ts`, `tsx`, `js`, `jsx`, `json`, `node`],
  testMatch: [`<rootDir>/**/*.spec.ts`],
  passWithNoTests: true,
  collectCoverageFrom: [
    `src/**/*.ts`,
    `!src/**/*.spec.ts`,
    // Install-time entrypoints are thin wrappers exercised end-to-end by the
    // postinstall/prefetch steps rather than unit tests.
    `!src/scripts/*.ts`,
  ],
  coverageDirectory: `coverage`,
  // Conservative floors that sit just below current coverage: they catch
  // regressions without making unrelated changes fail CI. Raise over time.
  coverageThreshold: {
    global: {
      statements: 70,
      branches: 50,
      functions: 60,
      lines: 70,
    },
  },
};

export default config;
