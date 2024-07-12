import AutoImport from 'unplugin-auto-import/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['**/*.e2e-spec.ts'],
    environment: 'node',
    globals: true,
    root: './',
    testTimeout: 20000,
    hookTimeout: 30000,
    cache: false,
    reporters: ['verbose'],
    isolate: false,
    maxConcurrency: 1,
    pool: 'forks',
    poolOptions: {
      forks: {
        isolate: false,
        singleFork: true,
        minForks: 1,
        maxForks: 1,
      },
    },
  },
  plugins: [
    // This is required to build the test files with SWC
    // swc.vite({
    //   // Explicitly set the module type to avoid inheriting this value from a `.swcrc` config file
    //   module: { type: 'nodenext' },
    // }),
    AutoImport({
      imports: ['vitest'],
    }),
  ],
});
