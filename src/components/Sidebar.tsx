import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'motion/react';
import { Search, Settings, Shield, User as UserIcon, Users } from 'lucide-react';
import { useStore } from '../store/useStore';
import { db } from '../lib/firebase';
import { collection, query, where, onSnapshot, getDocs, setDoc, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { DEFAULT_AVATAR } from '../lib/constants';
import CreateGroupModal from './CreateGroupModal';

export default function Sidebar({ onOpenSettings, onOpenAdmin }: { onOpenSettings: () => void, onOpenAdmin: () => void }) {
  const { currentUser } = useStore();
  const navigate = useNavigate();
  const { chatId: activeChatId } = useParams();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [chats, setChats] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isCreateGroupOpen, setIsCreateGroupOpen] = useState(false);
  const userCache = useRef<Record<string, any>>({});

  useEffect(() => {
    if (!currentUser) return;

    const q = query(
      collection(db, 'chats'),
      where('participants', 'array-contains', currentUser.uid)
    );

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const chatsData = await Promise.all(snapshot.docs.map(async (docSnapshot) => {
        const data = docSnapshot.data();
        
        if (data.type === 'group') {
          return {
            id: docSnapshot.id,
            ...data,
            isGroup: true,
            order: data.order?.[currentUser.uid] || 0
          };
        }

        const otherUserId = data.participants.find((id: string) => id !== currentUser.uid);
        
        // Fetch other user details with caching
        let otherUser = null;
        if (otherUserId) {
          if (userCache.current[otherUserId]) {
            otherUser = userCache.current[otherUserId];
          } else {
            const userQ = query(collection(db, 'users'), where('uid', '==', otherUserId));
            const userSnap = await getDocs(userQ);
            if (!userSnap.empty) {
              otherUser = userSnap.docs[0].data();
              userCache.current[otherUserId] = otherUser;
            }
          }
        }

        return {
          id: docSnapshot.id,
          ...data,
          otherUser,
          isGroup: false,
          order: data.order?.[currentUser.uid] || 0
        };
      }));

      // Filter out chats where the other user is deleted (unless it's a group)
      const validChats = chatsData.filter((chat: any) => chat.isGroup || chat.otherUser !== null);

      // Sort by custom order, then by updatedAt
      validChats.sort((a: any, b: any) => {
        if (a.order !== b.order) return a.order - b.order;
        return (b.updatedAt || 0) - (a.updatedAt || 0);
      });

      setChats(validChats);
    });

    return () => unsubscribe();
  }, [currentUser]);

  useEffect(() => {
    const searchUsers = async () => {
      const trimmedQuery = searchQuery.trim();
      if (trimmedQuery.length < 2) {
        setSearchResults([]);
        setIsSearching(false);
        return;
      }
      setIsSearching(true);
      try {
        const q = query(
          collection(db, 'users'),
          where('username', '==', trimmedQuery)
        );
        const snapshot = await getDocs(q);
        const results = snapshot.docs
          .map(doc => doc.data())
          .filter(user => user.uid !== currentUser?.uid && !user.isInvisible && !user.isBlocked);
        setSearchResults(results);
      } catch (e) {
        console.error(e);
      }
    };

    const debounce = setTimeout(searchUsers, 300);
    return () => clearTimeout(debounce);
  }, [searchQuery, currentUser]);

  const handleStartChat = async (otherUser: any) => {
    if (!currentUser) return;
    
    // Check if chat already exists
    const existingChat = chats.find(c => c.participants.includes(otherUser.uid));
    if (existingChat) {
      navigate(`/app/chat/${existingChat.id}`);
      setSearchQuery('');
      return;
    }

    // Create new chat
    const chatId = [currentUser.uid, otherUser.uid].sort().join('_');
    await setDoc(doc(db, 'chats', chatId), {
      participants: [currentUser.uid, otherUser.uid],
      updatedAt: Date.now(),
      order: {
        [currentUser.uid]: Date.now(),
        [otherUser.uid]: Date.now()
      }
    });

    navigate(`/app/chat/${chatId}`);
    setSearchQuery('');
  };

  const onDragEnd = async (result: any) => {
    if (!result.destination || !currentUser) return;

    const items = Array.from(chats);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);

    setChats(items);

    // Update order in Firestore
    items.forEach((item: any, index) => {
      updateDoc(doc(db, 'chats', item.id), {
        [`order.${currentUser.uid}`]: index
      });
    });
  };

  return (
    <div className="w-full md:w-80 border-r border-white/5 bg-surface/95 md:bg-surface/30 md:backdrop-blur-xl flex flex-col h-full z-10">
      {/* Header */}
      <div className="p-6 flex items-center justify-between border-b border-white/5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-lg">
            <svg width="16" height="24" viewBox="0 0 24 36" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M7 2L17 2L14 8L18 24L12 34L6 24L10 8L7 2Z" fill="#000000"/>
              <path d="M10 8L14 8L12 12L10 8Z" fill="#333333"/>
            </svg>
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Шифр</h1>
            {currentUser?.isAdmin && (
              <span className="text-[10px] uppercase tracking-widest text-danger font-bold">Admin</span>
            )}
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setIsCreateGroupOpen(true)}
            className="p-2 rounded-full hover:bg-white/10 text-white/70 hover:text-white smooth-transition group"
            title="Создать группу"
          >
            <Users className="w-5 h-5 group-hover:scale-110 smooth-transition" />
          </button>
          {currentUser?.isAdmin && (
            <button 
              onClick={onOpenAdmin}
              className="p-2 rounded-full hover:bg-white/10 text-danger smooth-transition"
            >
              <Shield className="w-5 h-5" />
            </button>
          )}
          <button 
            onClick={onOpenSettings}
            className="p-2 rounded-full hover:bg-white/10 text-white/70 hover:text-white smooth-transition group"
          >
            <Settings className="w-5 h-5 group-hover:rotate-90 smooth-transition" />
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="p-4">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Поиск по User name..."
            className="w-full bg-black/20 border border-white/5 rounded-2xl pl-11 pr-4 py-3 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-white/20 focus:bg-black/40 smooth-transition"
          />
        </div>
      </div>

      {/* Chat List */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {searchQuery.length >= 2 ? (
          <div className="p-2">
            <div className="px-3 py-2 text-xs font-medium text-white/30 uppercase tracking-wider">
              Результаты поиска
            </div>
            {searchResults.map((user) => (
              <div 
                key={user.uid}
                onClick={() => handleStartChat(user)}
                className="flex items-center gap-3 p-3 rounded-2xl hover:bg-white/5 cursor-pointer smooth-transition"
              >
                <img src={user.avatarUrl} alt={user.name} className="w-12 h-12 rounded-full object-cover bg-surface" />
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-medium text-white truncate">{user.name}</h3>
                  <p className="text-xs text-white/50 truncate">@{user.username}</p>
                </div>
              </div>
            ))}
            {searchResults.length === 0 && !isSearching && (
              <div className="text-center py-8 text-white/30 text-sm">
                Ничего не найдено
              </div>
            )}
          </div>
        ) : (
          <DragDropContext onDragEnd={onDragEnd}>
            <Droppable droppableId="chats">
              {(provided) => (
                <div {...provided.droppableProps} ref={provided.innerRef} className="p-2 space-y-1 overflow-hidden">
                  {chats.map((chat: any, index) => (
                    // @ts-ignore - React 18 type conflict with react-beautiful-dnd
                    <Draggable key={chat.id} draggableId={chat.id} index={index}>
                      {(provided, snapshot) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          {...provided.dragHandleProps}
                          onClick={() => navigate(`/app/chat/${chat.id}`)}
                          style={{
                            ...provided.draggableProps.style,
                          }}
                          className={`flex items-center gap-3 p-3 rounded-2xl cursor-pointer transition-colors duration-200 ${
                            activeChatId === chat.id ? 'bg-white/10' : 'hover:bg-white/5'
                          } ${snapshot.isDragging ? 'shadow-2xl bg-surface/90 backdrop-blur-xl z-50 ring-1 ring-white/20' : ''}`}
                        >
                          <img 
                            src={chat.isGroup ? chat.avatarUrl : (chat.otherUser?.avatarUrl || DEFAULT_AVATAR)} 
                            alt={chat.isGroup ? chat.name : (chat.otherUser?.name || 'User')} 
                            className="w-12 h-12 rounded-full object-cover bg-surface" 
                          />
                          <div className="flex-1 min-w-0">
                            <h3 className="text-sm font-medium text-white truncate flex items-center gap-2">
                              {chat.isGroup ? chat.name : (chat.otherUser?.name || 'Удаленный аккаунт')}
                              {chat.isGroup && <Users className="w-3 h-3 text-white/40" />}
                            </h3>
                            <p className="text-xs text-white/50 truncate">
                              {chat.lastMessage ? chat.lastMessage : 'Нет сообщений'}
                            </p>
                          </div>
                        </div>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </DragDropContext>
        )}
      </div>
      {isCreateGroupOpen && (
        <CreateGroupModal 
          onClose={() => setIsCreateGroupOpen(false)} 
          onGroupCreated={(chatId) => {
            navigate(`/app/chat/${chatId}`);
          }}
        />
      )}
    </div>
  );
}
