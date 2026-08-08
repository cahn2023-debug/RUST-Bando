import { lazy, type ComponentType, type LazyExoticComponent } from "react";

interface LazyWithRetryOptions {
  moduleName?: string;
  retries?: number;
  retryDelayMs?: number;
  timeoutMs?: number;
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const withTimeout = async <T>(
  importer: () => Promise<T>,
  moduleName: string,
  timeoutMs: number
): Promise<T> => {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`${moduleName} did not load within ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([importer(), timeoutPromise]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
};

export const loadWithRetry = async <T>(
  importer: () => Promise<T>,
  options: LazyWithRetryOptions = {}
): Promise<T> => {
  const {
    moduleName = "dynamic module",
    retries = 2,
    retryDelayMs = 300,
    timeoutMs = 15000,
  } = options;
  const attempts = retries + 1;
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await withTimeout(importer, moduleName, timeoutMs);
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        await delay(retryDelayMs);
      }
    }
  }

  const detail = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(`Failed to load ${moduleName} after ${attempts} attempts: ${detail}`);
};

export const lazyWithRetry = <TComponent extends ComponentType<any>>(
  importer: () => Promise<{ default: TComponent }>,
  options?: LazyWithRetryOptions
): LazyExoticComponent<TComponent> => {
  return lazy(() => loadWithRetry(importer, options));
};
