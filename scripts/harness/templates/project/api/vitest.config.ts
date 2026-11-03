import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['**/*.{spec,test}.ts', '**/*.{spec,test}.tsx', '**/*.integration.spec.ts']
  }
})
