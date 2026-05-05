import { api } from '../lib/api';

export interface UserProfile {
  id: string;
  username: string;
  is_online?: boolean;
}

export const usersService = {
  async search(query: string): Promise<UserProfile[]> {
    const { data } = await api.get('/users/search', { params: { q: query } });
    return data.users || data;
  },
  
  async getPublicKey(userId: string): Promise<string> {
    const { data } = await api.get(`/users/${userId}/public-key`);
    return data.public_key;
  }
};
