export interface UserConfirmationOptions {
  /**
   * Kept for call-site compatibility. Dialog failures always fail closed.
   */
  fallbackOnDialogError?: boolean;
}

export const confirmUserAction = (
  message: string,
  _options: UserConfirmationOptions = {}
): Promise<boolean> => {
  let confirmed = false;
  try {
    if (typeof globalThis.confirm === 'function') {
      confirmed = globalThis.confirm(message) === true;
    }
  } catch {
    confirmed = false;
  }
  return Promise.resolve(confirmed);
};
