import { useState, useEffect } from 'react';
import { Search, UserCircle, Settings } from 'lucide-react';
import { useChatStore } from '../store/chatStore';
import { usersService, UserProfile } from '../services/users';
import { messagesService } from '../services/messages';
import { cn } from '../lib/utils';
import { useAuthStore } from '../store/authStore';

export function Sidebar() {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<UserProfile[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  
  const { 
    conversations, 
    setConversations, 
    activeConversationId, 
    setActiveConversation,
    onlineUsers
  } = useChatStore();
  const currentUser = useAuthStore(state => state.user);
  const logout = useAuthStore(state => state.logout);

  useEffect(() => {
    const fetchConversations = async () => {
      try {
        const data = await messagesService.getConversations();
        setConversations(data);
      } catch (err) {
        // Failed to fetch conversations
      }
    };
    fetchConversations();
  }, [setConversations]);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }
    
    const timeoutId = setTimeout(async () => {
      setIsSearching(true);
      try {
        const results = await usersService.search(searchQuery);
        // exclude current user
        setSearchResults(results.filter(u => u.id !== currentUser?.id));
      } catch (e) {
        // Search failed
      } finally {
        setIsSearching(false);
      }
    }, 500);
    
    return () => clearTimeout(timeoutId);
  }, [searchQuery, currentUser?.id]);

  const displayList = searchQuery.trim() 
    ? searchResults.map(u => ({
        user_id: u.id,
        username: u.username,
        last_message_at: '',
      }))
    : conversations;

  return (
    <div className="w-80 h-full bg-white border-r border-gray-200 flex flex-col">
      <div className="p-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-900 tracking-tight">Whatsup</h2>
        <button onClick={logout} className="text-gray-500 hover:text-red-600 transition-colors" title="Logout">
          <Settings className="w-5 h-5" />
        </button>
      </div>
      
      <div className="p-4">
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-4 w-4 text-gray-400" />
          </div>
          <input
            type="text"
            placeholder="Search users..."
            className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg leading-5 bg-gray-50 placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm transition-shadow"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {displayList.length === 0 && !isSearching && (
          <div className="p-4 text-sm text-gray-500 text-center">
            {searchQuery ? "No users found" : "No conversations yet"}
          </div>
        )}
        
        {displayList.map((item) => (
          <button
            key={item.user_id}
            onClick={() => {
              setActiveConversation(item.user_id, item.username);
              setSearchQuery('');
            }}
            className={cn(
              "w-full flex items-center px-4 py-3 hover:bg-gray-50 border-b border-gray-100 transition-colors text-left focus:outline-none",
              activeConversationId === item.user_id && "bg-blue-50 hover:bg-blue-50 border-blue-100"
            )}
          >
            <div className="flex-shrink-0 relative">
              <UserCircle className={cn(
                "w-10 h-10",
                activeConversationId === item.user_id ? "text-blue-500" : "text-gray-400"
              )} />
              {onlineUsers.has(item.user_id) && (
                <span className="absolute bottom-0 right-0 block h-2.5 w-2.5 rounded-full bg-green-500 ring-2 ring-white" />
              )}
            </div>
            <div className="ml-3 flex-1 overflow-hidden">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {item.username}
                </p>
                {item.last_message_at && (
                  <p className="text-xs text-gray-500">
                    {new Date(item.last_message_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                )}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
