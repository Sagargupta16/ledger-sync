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
    // of this same suite, so without this the local run reports 147 files /
    // 1741 tests against CI's 116 / 1383 -- inflated counts that make a real
    // regression impossible to spot by number.
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.claude/**',
      '**/*.tmp.test.{ts,tsx}',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'src/test/', '**/*.d.ts'],
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
})
