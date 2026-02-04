import axios from 'axios'
import { API_BASE_URL } from '@/constants'
import { useAuthStore, getAccessToken, getRefreshToken } from '@/store/authStore'

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

// Response interceptor for error handling and token refresh
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config

    // If 401 and we haven't tried to refresh yet
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true

      const refreshTokenValue = getRefreshToken()
      if (refreshTokenValue) {
        try {
          // Try to refresh the token
          const response = await axios.post(`${API_BASE_URL}/api/auth/refresh`, {
            refresh_token: refreshTokenValue,
          })

          const { access_token, refresh_token } = response.data
          
          // Update store with new tokens
          useAuthStore.getState().setTokens({
            access_token,
            refresh_token,
            token_type: 'bearer',
          })

          // Retry the original request with new token
          originalRequest.headers.Authorization = `Bearer ${access_token}`
          return apiClient(originalRequest)
        } catch (refreshError) {
          // Refresh failed - logout user
          useAuthStore.getState().logout()
          // Redirect to home/login
          globalThis.location.href = '/'
          throw refreshError
        }
      } else {
        // No refresh token - logout
        useAuthStore.getState().logout()
      }
    }

    throw error
  }
)

export default apiClient
