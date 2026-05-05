import { useEffect, useRef, useCallback } from 'react';
import { useAuthStore } from '../store/authStore';
import { useChatStore } from '../store/chatStore';
import { decryptMessage } from '../lib/crypto';
import type { EncryptedMessagePayload } from '../lib/crypto';
import { API_URL } from '../lib/api';

export function useSocket() {
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimeout = useRef<number | null>(null);
  
  const accessToken = useAuthStore(state => state.accessToken);
  const privateKey = useAuthStore(state => state.privateKey);
  const user = useAuthStore(state => state.user);
  
  const addMessage = useChatStore(state => state.addMessage);
  const setOnlineStatus = useChatStore(state => state.setOnlineStatus);
  const updateConversationTimestamp = useChatStore(state => state.updateConversationTimestamp);

  const connect = useCallback(() => {
    if (!accessToken || !privateKey || !user) return;
    
    // Parse WS URL from API_URL (handles https -> wss, http -> ws)
    const wsUrl = `${API_URL.replace(/^http/, 'ws')}/ws?token=${accessToken}`;
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      if (reconnectTimeout.current) {
        clearTimeout(reconnectTimeout.current);
        reconnectTimeout.current = null;
      }
    };

    ws.onmessage = async (messageEvent) => {
      try {
        const data = JSON.parse(messageEvent.data);
        
        switch (data.event) {
          case 'message.receive': {
            const msg = data;
            
            const payload: EncryptedMessagePayload = {
              ciphertext: msg.payload.ciphertext,
              iv: msg.payload.iv,
              encryptedKey: msg.payload.encryptedKey,
              encryptedKeyForSelf: msg.payload.encryptedKeyForSelf,
            };
            
            const isSender = msg.from_user_id === user.id;
            const conversationId = isSender ? msg.to_user_id : msg.from_user_id;

            try {
              const rawPlaintext = await decryptMessage(payload, privateKey, isSender);
              
              let plaintext = rawPlaintext;
              try {
                const parsed = JSON.parse(rawPlaintext);
                if (parsed.text) plaintext = parsed.text;
              } catch {
                // handle legacy unformatted messages
              }
              
              const decryptedMsg = {
                id: msg.id || Date.now().toString(),
                from_user_id: msg.from_user_id,
                to_user_id: msg.to_user_id,
                text: plaintext,
                created_at: msg.created_at || new Date().toISOString()
              };
              
              addMessage(conversationId, decryptedMsg);
              updateConversationTimestamp(
                conversationId, 
                decryptedMsg.created_at, 
                isSender ? undefined : msg.from_username // If server sends username
              );
            } catch (err) {
              // Message decryption failed
            }
            break;
          }
          
          case 'user.online': {
            setOnlineStatus(data.user_id, true);
            break;
          }
          
          case 'user.offline': {
            setOnlineStatus(data.user_id, false);
            break;
          }
        }
      } catch (e) {
        // Failed to parse WS message
      }
    };

    ws.onclose = () => {
      // Attempt reconnect after 3 seconds
      reconnectTimeout.current = window.setTimeout(connect, 3000);
    };
    
    ws.onerror = (err) => {
      // WebSocket error
    };
    
    socketRef.current = ws;
  }, [accessToken, privateKey, user, addMessage, setOnlineStatus, updateConversationTimestamp]);

  useEffect(() => {
    connect();
    return () => {
      if (socketRef.current) {
        socketRef.current.close();
      }
      if (reconnectTimeout.current) {
        clearTimeout(reconnectTimeout.current);
      }
    };
  }, [connect]);

  const sendWsMessage = useCallback((to_user_id: string, payload: any) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({
        event: 'message.send',
        to: to_user_id,
        payload
      }));
      return true;
    }
    return false;
  }, []);

  return { sendWsMessage, isConnected: socketRef.current?.readyState === WebSocket.OPEN };
}
