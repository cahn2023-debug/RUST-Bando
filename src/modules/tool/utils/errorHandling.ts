/**
 * Error Handling Utilities for Production
 * 
 * Provides standardized error handling patterns that:
 * - Log errors appropriately for debugging
 * - Show user-friendly messages
 * - Never swallow errors silently
 * - Support error reporting integration
 */

import { logger } from './logger';

/**
 * Standard error handler for catch blocks
 * Logs error and re-throws with user-friendly message
 * 
 * @param context - Description of what was being attempted
 * @param error - The caught error
 * @param fallbackMessage - User-friendly fallback message (optional)
 */
export function handleError(
  context: string,
  error: unknown,
  fallbackMessage = 'Đã xảy ra lỗi. Vui lòng thử lại.'
): never {
  // Always log errors (never silent)
  logger.error(`[${context}]`, error);
  
  // Create user-friendly error
  const userError = error instanceof Error 
    ? error 
    : new Error(fallbackMessage);
  
  throw userError;
}

/**
 * Safe async handler that catches and logs errors
 * Returns Result pattern: { success: boolean, data?: T, error?: string }
 * 
 * @param fn - Async function to execute
 * @param context - Description for logging
 */
export async function safeAsync<T>(
  fn: () => Promise<T>,
  context: string
): Promise<{ success: boolean; data?: T; error?: string }> {
  try {
    const data = await fn();
    return { success: true, data };
  } catch (error) {
    logger.error(`[${context}]`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Parse JSON safely with error handling
 * 
 * @param jsonString - JSON string to parse
 * @param fallback - Fallback value if parsing fails
 */
export function safeJsonParse<T>(jsonString: string, fallback: T): T {
  try {
    return JSON.parse(jsonString) as T;
  } catch (error) {
    logger.warn('[safeJsonParse] Failed to parse JSON:', { jsonString: jsonString.substring(0, 100), error });
    return fallback;
  }
}

/**
 * Safely parse coordinate data
 * 
 * @param coords - Coordinate string or object
 * @param fallback - Fallback coordinates
 */
export function safeParseCoordinates(
  coords: string | unknown,
  fallback: { lng: number; lat: number } = { lng: 0, lat: 0 }
): { lng: number; lat: number } {
  try {
    if (typeof coords === 'string') {
      const parsed = JSON.parse(coords);
      if (parsed && typeof parsed.lng === 'number' && typeof parsed.lat === 'number') {
        return parsed;
      }
    }
    return fallback;
  } catch (error) {
    logger.warn('[safeParseCoordinates] Invalid coordinates:', { coords, error });
    return fallback;
  }
}

/**
 * User-friendly error messages map
 * Translate technical errors to user-friendly Vietnamese messages
 */
export const USER_ERROR_MESSAGES: Record<string, string> = {
  // Database errors
  'Database connection lock poisoned': 'Không thể kết nối đến cơ sở dữ liệu. Vui lòng khởi động lại ứng dụng.',
  'NOT NULL constraint failed': 'Thiếu thông tin bắt buộc. Vui lòng kiểm tra và thử lại.',
  'Database is locked': 'Cơ sở dữ liệu đang được sử dụng. Vui lòng chờ và thử lại.',
  
  // File errors
  'ENOENT': 'Không tìm thấy file. Vui lòng kiểm tra đường dẫn.',
  'EACCES': 'Không có quyền truy cập file. Vui lòng kiểm tra quyền.',
  'File not found': 'Không tìm thấy file. Vui lòng kiểm tra và thử lại.',
  
  // Network errors
  'Network Error': 'Lỗi kết nối mạng. Vui lòng kiểm tra internet và thử lại.',
  'timeout': 'Yêu cầu hết thời gian. Vui lòng thử lại.',
  'Failed to fetch': 'Không thể tải dữ liệu. Vui lòng kiểm tra kết nối mạng.',
  
  // Authentication errors
  'No user logged in': 'Vui lòng đăng nhập để thực hiện chức năng này.',
  'Invalid credentials': 'Thông tin đăng nhập không chính xác. Vui lòng thử lại.',
  
  // Default fallback
  'default': 'Đã xảy ra lỗi không mong muốn. Vui lòng thử lại hoặc liên hệ hỗ trợ nếu lỗi tiếp tục xảy ra.'
};

/**
 * Get user-friendly error message
 * 
 * @param error - Error object or message
 * @returns User-friendly message in Vietnamese
 */
export function getUserFriendlyMessage(error: unknown): string {
  if (!error) {
    return USER_ERROR_MESSAGES['default'];
  }
  
  const message = error instanceof Error ? error.message : String(error as any);
  
  // Check for known error patterns
  for (const [pattern, friendlyMessage] of Object.entries(USER_ERROR_MESSAGES)) {
    if (pattern !== 'default' && message.includes(pattern)) {
      return friendlyMessage;
    }
  }
  
  return USER_ERROR_MESSAGES['default'];
}
