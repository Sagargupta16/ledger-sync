import axios, { type AxiosRequestConfig } from 'axios'
import { API_BASE_URL } from '@/constants'
import { useAuthStore, getAccessToken, getRefreshToken, getSessionId } from '@/store/authStore'

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Request interceptor - add auth token to requests
apiClient.interceptors.request.use(
  (config) => {
    const token = getAccessToken()
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => Promise.reject(error)
)

// --- Token refresh mutex ---
// Prevents multiple concurrent 401s from each firing their own refresh request.
let isRefreshing = false
let failedQueue: Array<{
  resolve: (token: string) => void
  reject: (error: unknown) => void
}> = []

function processQueue(error: unknown, token: string | null) {
  for (const { resolve, reject } of failedQueue) {
    if (error) {
      reject(error)
    } else {
      resolve(token!)
    }
  }
  failedQueue = []
}

// Response interceptor for error handling and token refresh
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config as AxiosRequestConfig & { _retry?: boolean }

    // If 401 and we haven't tried to refresh yet
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true

      // Capture session ID — if it changes during refresh (new login/demo happened),
      // discard the refreshed tokens to avoid overwriting the new session's tokens.
      const sessionAtError = getSessionId()

      // If a refresh is already in-flight, queue this request
      if (isRefreshing) {
        return new Promise<string>((resolve, reject) => {
          failedQueue.push({ resolve, reject })
        }).then((token) => {
          originalRequest.headers = { ...originalRequest.headers, Authorization: `Bearer ${token}` }
          return apiClient(originalRequest)
        })
      }

      const refreshTokenValue = getRefreshToken()
      if (refreshTokenValue) {
        isRefreshing = true
        try {
          const response = await axios.post(`${API_BASE_URL}/api/auth/refresh`, {
            refresh_token: refreshTokenValue,
          })

          const { access_token, refresh_token } = response.data

          // Guard: only update tokens if session hasn't changed
          if (getSessionId() !== sessionAtError) {
            // A new login happened — discard these tokens
            processQueue(new Error('Session changed'), null)
            throw error
          }

          useAuthStore.getState().setTokens({
            access_token,
            refresh_token,
            token_type: 'bearer',
          })

          processQueue(null, access_token)

          originalRequest.headers = { ...originalRequest.headers, Authorization: `Bearer ${access_token}` }
          return apiClient(originalRequest)
        } catch (refreshError) {
          processQueue(refreshError, null)
          // Only logout if session hasn't changed
          if (getSessionId() === sessionAtError) {
            useAuthStore.getState().logout()
            globalThis.location.href = '/'
          }
          throw refreshError
        } finally {
          isRefreshing = false
        }
      } else {
        // No refresh token — only logout if session unchanged
        if (getSessionId() === sessionAtError) {
          useAuthStore.getState().logout()
        }
      }
    }

    throw error
  }
)

export default apiClient
