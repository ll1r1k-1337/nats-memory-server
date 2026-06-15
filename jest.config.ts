import { type JestConfigWithTsJest } from 'ts-jest';

const config: JestConfigWithTsJest = {
  preset: `ts-jest`,
  rootDir: `.`,
  testEnvironment: `node`,
  moduleFileExtensions: [`ts`, `tsx`, `js`, `jsx`, `json`, `node`],
  // Match spec files by regex rather than a glob. A `testMatch` glob like
  // `<rootDir>/**/*.spec.ts` silently matches nothing when the project lives
  // under a dot-directory (e.g. a git worktree at `.../.claude/worktrees/...`),
  // because `**` will not traverse a `.`-prefixed path segment. A regex over the
  // absolute path has no such restriction.
  testRegex: `\\.spec\\.ts$`,
  testPathIgnorePatterns: [`/node_modules/`],
  passWithNoTests: true,
};

export default config;
