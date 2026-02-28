/**
 * Utility functions for handling API error responses
 *
 * FastAPI returns validation errors as an array of objects with format:
 * { type, loc, msg, input, ctx }
 *
 * These utilities safely extract human-readable error messages
 * from various error response formats.
 */

/**
 * Pydantic/FastAPI validation error item format
 */
interface ValidationError {
  type: string
  loc: (string | number)[]
  msg: string
  input?: unknown
  ctx?: Record<string, unknown>
}

/**
 * Possible shapes of error.response.data from FastAPI
 */
interface ApiErrorData {
  detail?: string | ValidationError[] | { message?: string }
  message?: string
  error?: string
}

/**
 * Axios-like error shape
 */
interface ApiError {
  response?: {
    data?: ApiErrorData
    status?: number
  }
  message?: string
}

/**
 * Extract a user-friendly error message from an API error
 *
 * Handles multiple error formats:
 * - FastAPI HTTPException: { detail: "Error message" }
 * - FastAPI Validation: { detail: [{ loc: [...], msg: "..." }, ...] }
 * - Generic: { message: "Error" } or { error: "Error" }
 * - Network errors: error.message
 *
 * @param error - The error object from a catch block
 * @param fallback - Fallback message if no message can be extracted
 * @returns Human-readable error message string
 */
export function getApiErrorMessage(
  error: unknown,
  fallback: string = 'An error occurred'
): string {
  if (!error) return fallback

  // Cast to our expected error shape
  const apiError = error as ApiError

  // Try to get detail from response
  const data = apiError.response?.data
  if (data) {
    // Case 1: detail is a string (FastAPI HTTPException)
    if (typeof data.detail === 'string') {
      return data.detail
    }

    // Case 2: detail is an array (FastAPI validation error)
    if (Array.isArray(data.detail) && data.detail.length > 0) {
      const firstError = data.detail[0] as ValidationError
      // Format: "field: message" or just "message"
      if (firstError.loc && firstError.loc.length > 1) {
        // Skip 'body' from location path
        const field = firstError.loc.slice(1).join('.')
        return `${field}: ${firstError.msg}`
      }
      return firstError.msg
    }

    // Case 3: detail is an object with message
    if (
      typeof data.detail === 'object' &&
      data.detail !== null &&
      'message' in data.detail
    ) {
      return data.detail.message || fallback
    }

    // Case 4: message at top level
    if (typeof data.message === 'string') {
      return data.message
    }

    // Case 5: error at top level
    if (typeof data.error === 'string') {
      return data.error
    }
  }

  // Fallback to error.message (network errors, etc.)
  if (typeof apiError.message === 'string') {
    return apiError.message
  }

  return fallback
}

/**
 * Extract all validation errors from an API error
 *
 * Useful when you want to display multiple field-level errors
 *
 * @param error - The error object from a catch block
 * @returns Array of { field, message } objects, or empty array
 */
export function getValidationErrors(
  error: unknown
): Array<{ field: string; message: string }> {
  const apiError = error as ApiError
  const detail = apiError.response?.data?.detail

  if (!Array.isArray(detail)) return []

  return detail.map((err: ValidationError) => {
    const field =
      err.loc && err.loc.length > 1 ? err.loc.slice(1).join('.') : 'unknown'
    return { field, message: err.msg }
  })
}

/**
 * Check if an error is a validation error (422 status)
 */
export function isValidationError(error: unknown): boolean {
  const apiError = error as ApiError
  return apiError.response?.status === 422
}

/**
 * Check if an error is an authentication error (401 status)
 */
export function isAuthError(error: unknown): boolean {
  const apiError = error as ApiError
  return apiError.response?.status === 401
}

/**
 * Check if an error is a forbidden error (403 status)
 */
export function isForbiddenError(error: unknown): boolean {
  const apiError = error as ApiError
  return apiError.response?.status === 403
}
