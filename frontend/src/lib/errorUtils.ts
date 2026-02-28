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

  const apiError = error as ApiError
  const data = apiError.response?.data

  if (data) {
    const msg = extractFromResponseData(data)
    if (msg) return msg
  }

  // Fallback to error.message (network errors, etc.)
  if (typeof apiError.message === 'string') {
    return apiError.message
  }

  return fallback
}

/** Extract a message from the response data, trying each known format. */
function extractFromResponseData(data: ApiErrorData): string | null {
  // FastAPI HTTPException: { detail: "Error message" }
  if (typeof data.detail === 'string') return data.detail

  // FastAPI validation error: { detail: [{ loc, msg }, ...] }
  if (Array.isArray(data.detail) && data.detail.length > 0) {
    return formatValidationError(data.detail[0])
  }

  // Object detail with message: { detail: { message: "..." } }
  if (typeof data.detail === 'object' && data.detail !== null && 'message' in data.detail) {
    return data.detail.message || null
  }

  // Top-level message or error fields
  return data.message ?? data.error ?? null
}

/** Format a single validation error as "field: message" or just "message". */
function formatValidationError(err: ValidationError): string {
  if (err.loc && err.loc.length > 1) {
    const field = err.loc.slice(1).join('.')
    return `${field}: ${err.msg}`
  }
  return err.msg
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
