import axios from 'axios'

export const API_TOKEN_STORAGE_KEY = 'access_token'

export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
})

export function getStoredToken(): string | null {
  return localStorage.getItem(API_TOKEN_STORAGE_KEY)
}

apiClient.interceptors.request.use((config) => {
  const token = getStoredToken()

  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }

  return config
})
