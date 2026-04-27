import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@HOME': path.resolve(__dirname, './src/HOME'),
      '@DESIGN': path.resolve(__dirname, './src/DESIGN'),
      '@CONTRACT': path.resolve(__dirname, './src/CONTRACT'),
      '@IMPLEMENT': path.resolve(__dirname, './src/IMPLEMENT'),
      '@TOOL': path.resolve(__dirname, './src/TOOL'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      reportsDirectory: './coverage',
      thresholds: {
        global: {
          lines: 60,
          functions: 60,
          branches: 50,
          statements: 60,
        },
      },
      include: [
        'src/TOOL/utils/**/*.ts',
        'src/IMPLEMENT/services/**/*.ts',
        'src/IMPLEMENT/stores/**/*.ts',
        'src/DESIGN/**/*.ts',
      ],
      exclude: [
        'src/**/*.d.ts',
        'src/**/*.test.ts',
        'src/**/*.test.tsx',
        'src/HOME/main.tsx',
      ],
    },
    setupFiles: ['./src/test-setup.ts'],
  },
});
