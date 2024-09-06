import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['**/*.spec.ts'],
    globalSetup: 'vitest.setup.ts',

    coverage: {
      enabled: true,
      provider: 'istanbul',
      include: ['packages/graphql-lookahead/src/**'],

      thresholds: {
        statements: 95,
        branches: 88,
        functions: 100,
        lines: 100,
      },
    },
  },
})
