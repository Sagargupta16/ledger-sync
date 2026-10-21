import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    // Scratch files written while characterising third-party behaviour are named
    // *.tmp.test.tsx and gitignored. They deliberately assert what a library
    // currently does, including its bugs, so they must never gate the suite.
    //
    // `.claude` is excluded for a different reason: it holds local agent state,
    // including git worktrees checked out under it. A worktree is a second copy
    // of this same suite, so without this the local run counts every test twice
    // against CI -- inflated counts that make a real regression impossible to
    // spot by number.
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.claude/**',
      '**/*.tmp.test.{ts,tsx}',
    ],
  },
  resolve: {
    alias: {
      '@': resolve(import.meta.dirname, './src'),
    },
  },
})
