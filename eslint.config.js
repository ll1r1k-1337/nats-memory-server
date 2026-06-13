const js = require('@eslint/js');
const tseslint = require('typescript-eslint');
const jestPlugin = require('eslint-plugin-jest');
const stylistic = require('@stylistic/eslint-plugin');
const prettierRecommended = require('eslint-plugin-prettier/recommended');

module.exports = tseslint.config(
  {
    ignores: [
      'dist/',
      'coverage/',
      'src/scripts/**',
      'jest.config.ts',
      'example.js',
      'eslint.config.js',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: __dirname,
      },
    },
  },
  {
    // Preserve the project's long-standing stylistic choices; Prettier owns the
    // rest of formatting (configured via prettierRecommended below).
    plugins: { '@stylistic': stylistic },
    rules: {
      '@stylistic/quotes': ['error', 'backtick'],
      'arrow-body-style': 'off',
      'prefer-arrow-callback': 'off',
      // The codebase intentionally keeps a few async wrappers without an await
      // (uniform map shapes, future-proofing); this rule adds noise, not safety.
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    // The project-config loader dynamically require()s user config files
    // (.ts/.js/.json) and indexes a map by an arbitrary extension — patterns
    // that are inherently untyped and cannot be expressed without `any`.
    files: ['src/utils/get-project-config.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/ban-ts-comment': 'off',
    },
  },
  {
    files: ['**/*.spec.ts'],
    ...jestPlugin.configs['flat/recommended'],
  },
  {
    // Tests intentionally reach into internals and lean on jest mocks, so the
    // type-checked "unsafe"/any rules are noise here.
    files: ['**/*.spec.ts'],
    rules: {
      'jest/valid-title': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/unbound-method': 'off',
    },
  },
  prettierRecommended,
);
