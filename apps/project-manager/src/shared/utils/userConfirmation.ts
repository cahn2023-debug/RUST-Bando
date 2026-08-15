export interface UserConfirmationOptions {
  /**
   * Kept for call-site compatibility. Dialog failures always fail closed.
   */
  fallbackOnDialogError?: boolean;
}

export const confirmUserAction = async (
  message: string,
  _options: UserConfirmationOptions = {}
): Promise<boolean> => {
  try {
    if (typeof globalThis !== 'undefined' && typeof globalThis.confirm === 'function') {
      const result: unknown = globalThis.confirm(message);
      if (result instanceof Promise) {
        return (await result.catch(() => false)) === true;
      }
      return result === true;
    }
  } catch {
    return false;
  }
  return false;
};
