import { api } from '../lib/api';
import { User, useAuthStore } from '../store/authStore';

export interface LoginResponse {
  access_token: string;
  refresh_token?: string;
  user: User;
}

export const authService = {
  async register(payload: {
    username: string;
    display_name: string;
    password: string;
    public_key: string;
    wrapped_private_key: string;
    pbkdf2_salt: string;
  }) {
    // The instructions say: POST /auth/register: Send username, password, public_key, wrapped_private_key, and pbkdf2_salt.
    const { data } = await api.post('/auth/register', payload);
    return data;
  },

  async login(username: string, password: string): Promise<LoginResponse> {
    // The prompt says POST /auth/login: Fetch tokens and the user profile. Send username and password.
    const { data } = await api.post<LoginResponse>('/auth/login', {
      username,
      password,
    });
    return data;
  },
};
