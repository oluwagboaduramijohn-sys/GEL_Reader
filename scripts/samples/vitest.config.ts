import { defineConfig } from 'vitest/config';

// Separate from the unit tests: needs the sample photos, which stay out of git.
export default defineConfig({
  test: {
    include: ['scripts/samples/*.samples.ts'],
    testTimeout: 300_000,
  },
});
