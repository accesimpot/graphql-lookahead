import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['**/*.spec.ts'],
    globalSetup: 'vitest.setup.ts',
    coverage: {
      enabled: true,
      provider: 'istanbul',
      include: ['src/**'],
      exclude: ['src/test/**'],
    },
  },
})
