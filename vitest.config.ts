import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@HOME': path.resolve(__dirname, './src/modules/home'),
      '@DESIGN': path.resolve(__dirname, './src/modules/design'),
      '@CONTRACT': path.resolve(__dirname, './src/modules/contract'),
      '@IMPLEMENT': path.resolve(__dirname, './src/modules/implement'),
      '@TOOL': path.resolve(__dirname, './src/modules/tool'),
      '@ANALYTICS': path.resolve(__dirname, './src/modules/analytics'),
      '@': path.resolve(__dirname, './src'),
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
        'src/modules/tool/utils/**/*.ts',
        'src/modules/implement/services/**/*.ts',
        'src/modules/implement/stores/**/*.ts',
        'src/modules/design/**/*.{ts,tsx}',
      ],
      exclude: [
        'src/**/*.d.ts',
        'src/**/*.test.ts',
        'src/**/*.test.tsx',
        'src/modules/home/main.tsx',
      ],
    },
    setupFiles: ['./src/test-setup.ts'],
  },
});
