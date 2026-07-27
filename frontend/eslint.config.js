import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import react from 'eslint-plugin-react'
import jsxA11y from 'eslint-plugin-jsx-a11y'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    plugins: {
      react,
      'jsx-a11y': jsxA11y,
    },
    languageOptions: {
      globals: globals.browser,
    },
    settings: {
      react: { version: 'detect' },
    },
    rules: {
      // React 17+ JSX transform -- no need to import React
      'react/react-in-jsx-scope': 'off',
      // Accessibility rules
      'jsx-a11y/alt-text': 'warn',
      'jsx-a11y/click-events-have-key-events': 'warn',
      'jsx-a11y/no-static-element-interactions': 'warn',
    },
  },
  /**
   * Type-aware tier. `tseslint.configs.recommended` is syntax-only and cannot
   * see `any` flowing through a value, which is how two shipped features stayed
   * broken (a null request body posted to a handler that required one) and how
   * the auth refresh interceptor came to read its whole payload off `any`.
   *
   * Scoped to `src/**` because the root-level configs (vite, vitest,
   * pwa-assets) are not in the app tsconfig project and would only report parse
   * errors. `projectService` resolves each file through the real tsconfig graph.
   *
   * The `no-unsafe-*` and `no-floating-promises` rules are at zero in
   * production code as of 2026-07-27 -- this tier keeps them there.
   */
  ...tseslint.configs.recommendedTypeChecked.map((config) => ({
    ...config,
    files: ['src/**/*.{ts,tsx}'],
  })),
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Redundant-but-correct assertions. The rule fires precisely BECAUSE the
      // type already matches, so every one of the 37 sites is cosmetic, and
      // `--fix` on them churns files other work is mid-edit. Left as warn so
      // they surface without gating CI.
      '@typescript-eslint/no-unnecessary-type-assertion': 'warn',
      // Fires on `async` test callbacks that await nothing, which is the normal
      // shape when a test awaits only inside a `waitFor`.
      '@typescript-eslint/require-await': 'warn',
    },
  },
  {
    files: ['src/pages/settings/**/*.{ts,tsx}'],
    rules: {
      'jsx-a11y/control-has-associated-label': [
        'error',
        {
          depth: 5,
          ignoreElements: ['input', 'select', 'textarea'],
        },
      ],
      'jsx-a11y/label-has-associated-control': [
        'error',
        {
          labelComponents: ['FieldLabel'],
          controlComponents: ['Toggle'],
          assert: 'either',
          depth: 5,
        },
      ],
    },
  },
])
