import { api } from '../lib/api';

export interface EncryptedMessage {
  id: string;
  from_user_id: string;
  to_user_id: string;
  payload: {
    ciphertext: string;
    iv: string;
    encryptedKey: string;
    encryptedKeyForSelf: string;
  };
  delivered?: boolean;
  created_at: string;
}

export interface Conversation {
  user_id: string; // The other user's ID
  username: string; // The other user's username
  last_message_at: string;
  is_online?: boolean;
}

export const messagesService = {
  async getConversations(): Promise<Conversation[]> {
    const { data } = await api.get('/conversations');
    return data.conversations || data; 
  },
  
  async getMessages(userId: string): Promise<EncryptedMessage[]> {
    const { data } = await api.get(`/conversations/${userId}/messages`);
    return data.messages || data;
  },
  
  async sendMessage(to: string, encryptedPayload: {
    ciphertext: string;
    iv: string;
    encryptedKey: string;
    encryptedKeyForSelf: string;
  }): Promise<EncryptedMessage> {
    const { data } = await api.post('/messages', {
      to,
      payload: encryptedPayload
    });
    return data;
  }
};
