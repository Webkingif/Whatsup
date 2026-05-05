import axios from 'axios';
import { useAuthStore } from '../store/authStore';

export const API_URL = 'https://whisperbox.koyeb.app';

export const api = axios.create({
  baseURL: API_URL,
});

// Request Interceptor: Attach token
api.interceptors.request.use(
  (config) => {
    const token = useAuthStore.getState().accessToken;
    if (token && !config.url?.includes('/auth/login') && !config.url?.includes('/auth/register') && !config.url?.includes('/auth/refresh')) {
      config.headers['Authorization'] = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response Interceptor: Token refresh
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if (error.response?.status === 401 && !originalRequest._retry) {
      // Don't retry auth endpoints
      if (originalRequest.url?.includes('/auth/login') || originalRequest.url?.includes('/auth/register') || originalRequest.url?.includes('/auth/refresh')) {
        return Promise.reject(error);
      }
      
      originalRequest._retry = true;
      try {
        const refreshToken = useAuthStore.getState().refreshToken;
        if (!refreshToken) throw new Error('No refresh token available');

        // We use axios directly to avoid interceptor loops
        const { data } = await axios.post(`${API_URL}/auth/refresh`, {
          refresh_token: refreshToken, // adjust if the api expects it as a header instead or a different payload key
        });

        const newAccessToken = data.access_token || data.token;
        const newRefreshToken = data.refresh_token || refreshToken;
        
        useAuthStore.getState().setTokens(newAccessToken, newRefreshToken);
        originalRequest.headers['Authorization'] = `Bearer ${newAccessToken}`;

        return api(originalRequest);
      } catch (refreshError) {
        useAuthStore.getState().logout();
        return Promise.reject(refreshError);
      }
    }
    return Promise.reject(error);
  }
);
