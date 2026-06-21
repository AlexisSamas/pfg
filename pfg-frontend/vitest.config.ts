import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  cacheDir: './node_modules/.vite-test',
  plugins: [react()],
  test: {
    cache: false,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/main.tsx',
        'src/setupTests.ts',
        'src/**/*.test.{ts,tsx}',
        'src/vite-env.d.ts',
      ],
    },
    environment: 'jsdom',
    fileParallelism: false,
    maxWorkers: 1,
    minWorkers: 1,
    setupFiles: './src/setupTests.ts',
  },
})
