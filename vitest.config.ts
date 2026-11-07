import { defineConfig } from 'vitest/config';

// Kept separate from vite.config.ts so the production build and `tsc` never depend on the test runner.
export default defineConfig({
  test: { include: ['tests/**/*.test.ts'], environment: 'node' },
});
