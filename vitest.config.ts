import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('.', import.meta.url)) } },
  test: {
    include: ['tests/unit/**/*.test.ts', 'tests/db/**/*.test.ts'],
    // DB tests spawn many psql sessions; generous timeouts for slow laptops.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
