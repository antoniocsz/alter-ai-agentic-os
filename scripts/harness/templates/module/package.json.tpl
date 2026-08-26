{
  "name": "@saas/{{NAME}}",
  "version": "0.1.0",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {{DEPS}},
  "devDependencies": {
    "typescript": "^6.0.0"
  }
}
