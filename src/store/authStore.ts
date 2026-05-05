import { create } from 'zustand';
import { get, set as idbSet, del } from 'idb-keyval';

export interface User {
  id: string; 
  username: string;
  public_key: string;
  wrapped_private_key: string;
  pbkdf2_salt: string;
}

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null; 
  user: User | null;
  privateKey: CryptoKey | null;
  isGenerating: boolean;
  isHydrating: boolean;
  setTokens: (accessToken: string, refreshToken?: string) => void;
  setUser: (user: User) => void;
  setPrivateKey: (privateKey: CryptoKey) => void;
  setIsGenerating: (isGenerating: boolean) => void;
  logout: () => void;
  hydrateKeys: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: localStorage.getItem('access_token'),
  refreshToken: localStorage.getItem('refresh_token'),
  user: localStorage.getItem('user') ? JSON.parse(localStorage.getItem('user') as string) : null,
  privateKey: null,
  isGenerating: false,
  isHydrating: true,

  setTokens: (accessToken, refreshToken) => {
    localStorage.setItem('access_token', accessToken);
    if (refreshToken) {
      localStorage.setItem('refresh_token', refreshToken);
    }
    set({ accessToken, refreshToken: refreshToken || null });
  },

  setUser: (user) => {
    localStorage.setItem('user', JSON.stringify(user));
    set({ user });
  },

  setPrivateKey: (privateKey) => {
    idbSet('privateKey', privateKey).catch(console.error);
    set({ privateKey });
  },

  setIsGenerating: (isGenerating) => {
    set({ isGenerating });
  },

  hydrateKeys: async () => {
    try {
      const privateKey = await get<CryptoKey>('privateKey');
      if (privateKey) {
        set({ privateKey });
      }
    } catch (e) {
      // Failed to restore key from IndexedDB
    } finally {
      set({ isHydrating: false });
    }
  },

  logout: () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('user');
    del('privateKey').catch(console.error);
    set({ accessToken: null, refreshToken: null, user: null, privateKey: null });
  },
}));
