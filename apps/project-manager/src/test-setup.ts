// Test setup file for Vitest
import { vi, beforeAll, afterAll } from 'vitest';
import '@testing-library/jest-dom';

// Mock window globals for Leaflet
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock Tauri invoke
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

// Suppress console during tests (can be overridden with --reporter=verbose)
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

beforeAll(() => {
  console.error = (...args) => {
    if (process.env.SHOW_CONSOLE !== 'true') {
      return;
    }
    originalConsoleError(...args);
  };

  console.warn = (...args) => {
    if (process.env.SHOW_CONSOLE !== 'true') {
      return;
    }
    originalConsoleWarn(...args);
  };
});

afterAll(() => {
  console.error = originalConsoleError;
  console.warn = originalConsoleWarn;
});
