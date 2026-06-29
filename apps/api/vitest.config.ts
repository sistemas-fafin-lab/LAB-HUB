import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    // Define as envs exigidas pelos módulos (requireEnv no load) antes de importá-los.
    setupFiles: ['test/setup.ts'],
  },
})
