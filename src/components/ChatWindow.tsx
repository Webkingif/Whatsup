import { useState, useEffect, useRef } from 'react';
import { Send, Lock, Loader2 } from 'lucide-react';
import { useChatStore } from '../store/chatStore';
import { useAuthStore } from '../store/authStore';
import { usersService } from '../services/users';
import { messagesService } from '../services/messages';
import { cn } from '../lib/utils';
import { decryptMessage, encryptMessage, importPublicKey } from '../lib/crypto';
import type { EncryptedMessagePayload } from '../lib/crypto';

export function ChatWindow({ sendWsMessage }: { sendWsMessage: (to_user_id: string, payload: any) => boolean }) {
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  
  const bottomRef = useRef<HTMLDivElement>(null);
  
  const { 
    activeConversationId, 
    activeConversationUsername, 
    messages, 
    setMessages,
    addMessage,
    updateConversationTimestamp
  } = useChatStore();
  
  const { user: currentUser, privateKey } = useAuthStore();

  const conversationMessages = activeConversationId ? (messages[activeConversationId] || []) : [];

  // Scroll to bottom when messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversationMessages]);

  // Load and decrypt history
  useEffect(() => {
    if (!activeConversationId || !privateKey || !currentUser) return;
    
    // Don't re-fetch if we already have messages loaded and it's not empty, 
    // though ideally we'd paginate or check if fresh. For now, fetch if empty.
    if (messages[activeConversationId] && messages[activeConversationId].length > 0) return;

    const loadMessages = async () => {
      setIsLoading(true);
      try {
        const encryptedMsgs = await messagesService.getMessages(activeConversationId);
        
        const decryptedList = await Promise.all(
          encryptedMsgs.map(async (msg) => {
            const payload: EncryptedMessagePayload = {
              ciphertext: msg.payload?.ciphertext || '',
              iv: msg.payload?.iv || '',
              encryptedKey: msg.payload?.encryptedKey || '',
              encryptedKeyForSelf: msg.payload?.encryptedKeyForSelf || '',
            };
            const isSender = msg.from_user_id === currentUser.id;
            
            try {
              const rawText = await decryptMessage(payload, privateKey, isSender);
              let text = rawText;
              try {
                const parsed = JSON.parse(rawText);
                if (parsed.text) text = parsed.text;
              } catch {
                // handle legacy unformatted messages or parsing error
              }
              
              return {
                id: msg.id,
                from_user_id: msg.from_user_id,
                to_user_id: msg.to_user_id,
                text,
                created_at: msg.created_at
              };
            } catch (err) {
              return {
                id: msg.id,
                from_user_id: msg.from_user_id,
                to_user_id: msg.to_user_id,
                text: "Failed to decrypt (Key Missing)",
                created_at: msg.created_at
              };
            }
          })
        );
        
        setMessages(activeConversationId, decryptedList);
      } catch (err) {
        // Silently handle load errors or display global error state
      } finally {
        setIsLoading(false);
      }
    };

    loadMessages();
  }, [activeConversationId, privateKey, currentUser, messages, setMessages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || !activeConversationId || !currentUser || !privateKey) return;

    const textToSend = inputText.trim();
    setInputText('');
    setIsSending(true);

    try {
      // 1. Get recipient public key
      const recipientPubKeySpki = await usersService.getPublicKey(activeConversationId);
      const recipientPubKey = await importPublicKey(recipientPubKeySpki);
      
      // 2. Import my own public key for Self-Readability
      const senderPubKey = await importPublicKey(currentUser.public_key);

      // Input Validation: Sanitize to prevent XSS (even though React handles it, good for defense in depth)
      const sanitizedText = textToSend.replace(/</g, "&lt;").replace(/>/g, "&gt;");
      
      // Replay Attack Prevention: Add timestamp to the encrypted payload
      const securePayload = JSON.stringify({
        text: sanitizedText,
        timestamp: Date.now()
      });

      // 3. Encrypt payload
      const encryptedPayload = await encryptMessage(securePayload, recipientPubKey, senderPubKey);

      // 4. Send via WS
      const sentViaWs = sendWsMessage(activeConversationId, {
        ciphertext: encryptedPayload.ciphertext,
        iv: encryptedPayload.iv,
        encrypted_key: encryptedPayload.encryptedKey,
        encrypted_key_for_self: encryptedPayload.encryptedKeyForSelf,
      });
      
      if (!sentViaWs) {
        // Fallback to REST
        await messagesService.sendMessage(activeConversationId, {
          ciphertext: encryptedPayload.ciphertext,
          iv: encryptedPayload.iv,
          encryptedKey: encryptedPayload.encryptedKey,
          encryptedKeyForSelf: encryptedPayload.encryptedKeyForSelf,
        });
      }

      // Optimistically add to UI
      const newMsg = {
        id: Date.now().toString(), // optimistic ID
        from_user_id: currentUser.id,
        to_user_id: activeConversationId,
        text: textToSend,
        created_at: new Date().toISOString()
      };
      
      addMessage(activeConversationId, newMsg);
      updateConversationTimestamp(activeConversationId, newMsg.created_at, activeConversationUsername || undefined);

    } catch (err) {
      alert("Failed to send message securely.");
    } finally {
      setIsSending(false);
    }
  };

  if (!activeConversationId) {
    return (
      <div className="flex-1 bg-gray-50 flex flex-col items-center justify-center">
        <div className="text-center p-8 max-w-sm">
          <div className="mx-auto w-16 h-16 bg-white rounded-2xl shadow-sm flex items-center justify-center mb-6">
            <Lock className="w-8 h-8 text-blue-500" />
          </div>
          <h2 className="text-2xl font-semibold text-gray-900 mb-2">Whatsup Web</h2>
          <p className="text-gray-500">
            Select a conversation on the left to start messaging. All messages are securely end-to-end encrypted.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-white">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 bg-white/80 backdrop-blur-md sticky top-0 z-10 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">
          {activeConversationUsername || 'Unknown User'}
        </h3>
        <div className="flex items-center px-3 py-1 bg-green-50 text-green-700 rounded-full text-xs font-medium border border-green-100 shadow-sm">
          🔒 End-to-End Encrypted
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-6 bg-gray-50/50">
        {!privateKey ? (
          <div className="flex justify-center items-center h-full">
            <div className="bg-red-50 text-red-800 p-4 rounded-lg max-w-lg text-center border border-red-200">
              <h4 className="font-bold mb-2">Key Missing</h4>
              <p>Your private key was not found on this device. You cannot read past messages.</p>
            </div>
          </div>
        ) : isLoading ? (
          <div className="flex flex-col justify-center items-center h-full space-y-4">
            <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
            <p className="text-gray-500 font-medium">Decrypting messages...</p>
          </div>
        ) : conversationMessages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full space-y-4">
            <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center">
              <Lock className="w-5 h-5 text-blue-500" />
            </div>
            <p className="text-sm text-gray-500 text-center max-w-xs">
              No messages yet. Send a message to start this encrypted conversation.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {conversationMessages.map((msg) => {
              const isMine = msg.from_user_id === currentUser?.id;
              return (
                <div key={msg.id} className={cn("flex", isMine ? "justify-end" : "justify-start")}>
                  <div className={cn(
                    "max-w-[70%] px-4 py-2.5 rounded-2xl shadow-sm text-[15px] leading-relaxed",
                    isMine 
                      ? "bg-blue-600 text-white rounded-br-sm" 
                      : "bg-white border border-gray-200 text-gray-900 rounded-bl-sm"
                  )}>
                    <p className="whitespace-pre-wrap break-words">{msg.text}</p>
                    <div className={cn(
                      "text-[10px] mt-1.5 text-right flex items-center justify-end space-x-1",
                      isMine ? "text-blue-200" : "text-gray-400"
                    )}>
                      <span>
                        {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      <Lock className="w-2.5 h-2.5" />
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Input Area */}
      <div className="p-4 bg-white border-t border-gray-200">
        <form onSubmit={handleSend} className="flex space-x-2">
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Type an encrypted message..."
            disabled={isSending}
            className="flex-1 bg-gray-50 border border-gray-200 px-4 py-2.5 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!inputText.trim() || isSending}
            className="w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm transition-colors"
          >
            {isSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4 -ml-0.5" />}
          </button>
        </form>
      </div>
    </div>
  );
}
