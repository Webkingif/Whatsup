import { create } from 'zustand';
import { Conversation } from '../services/messages';

export interface DecryptedMessage {
  id: string;
  from_user_id: string;
  to_user_id: string;
  text: string;
  created_at: string;
}

interface ChatState {
  conversations: Conversation[];
  activeConversationId: string | null;
  activeConversationUsername: string | null;
  messages: Record<string, DecryptedMessage[]>;
  onlineUsers: Set<string>;
  setConversations: (conversations: Conversation[]) => void;
  setActiveConversation: (id: string | null, username?: string | null) => void;
  addMessage: (conversationId: string, message: DecryptedMessage) => void;
  setMessages: (conversationId: string, messages: DecryptedMessage[]) => void;
  setOnlineStatus: (userId: string, isOnline: boolean) => void;
  updateConversationTimestamp: (conversationId: string, timestamp: string, username?: string) => void;
}

export const useChatStore = create<ChatState>((set) => ({
  conversations: [],
  activeConversationId: null,
  activeConversationUsername: null,
  messages: {},
  onlineUsers: new Set(),

  setConversations: (conversations) => set({ conversations }),
  
  setActiveConversation: (id, username) => set((state) => ({ 
    activeConversationId: id,
    activeConversationUsername: username !== undefined ? username : state.activeConversationUsername
  })),

  addMessage: (conversationId, message) => set((state) => {
    const existing = state.messages[conversationId] || [];
    // Ensure we don't duplicate
    if (existing.some(m => m.id === message.id)) return state;
    return {
      messages: {
        ...state.messages,
        [conversationId]: [...existing, message].sort((a, b) => 
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        )
      }
    };
  }),

  setMessages: (conversationId, messages) => set((state) => ({
    messages: {
      ...state.messages,
      [conversationId]: messages.sort((a, b) => 
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      )
    }
  })),

  setOnlineStatus: (userId, isOnline) => set((state) => {
    const nextSet = new Set(state.onlineUsers);
    if (isOnline) {
      nextSet.add(userId);
    } else {
      nextSet.delete(userId);
    }
    return { onlineUsers: nextSet };
  }),

  updateConversationTimestamp: (conversationId, timestamp, username) => set((state) => {
    const idx = state.conversations.findIndex(c => c.user_id === conversationId);
    let newConversations = [...state.conversations];
    
    if (idx >= 0) {
      newConversations[idx] = {
        ...newConversations[idx],
        last_message_at: timestamp
      };
    } else {
      newConversations.push({
        user_id: conversationId,
        username: username || 'Unknown User',
        last_message_at: timestamp
      });
    }
    
    // Sort by most recent
    newConversations.sort((a, b) => 
      new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime()
    );

    return { conversations: newConversations };
  })
}));
