/**
 * Utility Logger for managing console logs in development and production.
 */

const IS_DEV = import.meta.env.DEV;

export const logger = {
  debug: (...args: any[]) => {
    if (IS_DEV) {
      console.debug("[DEBUG]", ...args);
    }
  },
  info: (...args: any[]) => {
    if (IS_DEV) {
      console.info("[INFO]", ...args);
    }
  },
  warn: (...args: any[]) => {
    console.warn("[WARN]", ...args);
  },
  error: (...args: any[]) => {
    console.error("[ERROR]", ...args);
  },
  // Breadcrumb for sequence tracking
  breadcrumb: (message: string, context?: string) => {
    if (IS_DEV) {
      console.log(`%c[Breadcrumb] ${context ? `[${context}] ` : ''}${message}`, "color: #6366f1; font-weight: bold;");
    }
  },
  // Specialist log for Sync logic
  sync: (message: string, ...args: any[]) => {
    if (IS_DEV) {
      console.log(`%c[Sync] ${message}`, "color: #10b981; font-weight: bold;", ...args);
    }
  }
};
