import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    test: {
      environment: 'jsdom',
      include: ['src/**/*.test.ts'],
      testTimeout: 60_000,
      env,
    },
  }
})
