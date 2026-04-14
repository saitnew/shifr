import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { X, MessageSquare, Phone } from 'lucide-react';
import { db } from '../lib/firebase';
import { doc, getDoc, setDoc, query, collection, where, getDocs } from 'firebase/firestore';
import { useStore } from '../store/useStore';
import { useNavigate } from 'react-router-dom';

export default function UserProfileModal({ userId, onClose }: { userId: string, onClose: () => void }) {
  const [user, setUser] = useState<any>(null);
  const { currentUser } = useStore();
  const navigate = useNavigate();

  useEffect(() => {
    const fetchUser = async () => {
      const docRef = doc(db, 'users', userId);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        setUser(docSnap.data());
      }
    };
    fetchUser();
  }, [userId]);

  const handleStartChat = async () => {
    if (!currentUser || !user) return;
    
    // Check if chat already exists
    const q = query(
      collection(db, 'chats'),
      where('participants', 'array-contains', currentUser.uid)
    );
    const snapshot = await getDocs(q);
    const existingChat = snapshot.docs.find(d => d.data().participants.includes(user.uid));
    
    if (existingChat) {
      navigate(`/app/chat/${existingChat.id}`);
      onClose();
      return;
    }

    // Create new chat
    const chatId = [currentUser.uid, user.uid].sort().join('_');
    await setDoc(doc(db, 'chats', chatId), {
      participants: [currentUser.uid, user.uid],
      updatedAt: Date.now(),
      order: {
        [currentUser.uid]: Date.now(),
        [user.uid]: Date.now()
      }
    });

    navigate(`/app/chat/${chatId}`);
    onClose();
  };

  if (!user) return null;

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/90 md:bg-black/60 md:backdrop-blur-sm"
    >
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1], delay: 0.05 }}
        className="w-full max-w-sm glass-panel rounded-[2rem] overflow-hidden shadow-2xl border border-white/10 flex flex-col relative hardware-accelerated"
      >
        <button 
          onClick={onClose} 
          className="absolute top-4 right-4 p-2 rounded-full bg-black/20 hover:bg-black/40 text-white/70 hover:text-white smooth-transition z-10"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="relative h-48 bg-surface">
          <img src={user.avatarUrl} alt="" className="w-full h-full object-cover opacity-50 blur-xl" />
          <div className="absolute inset-0 bg-gradient-to-t from-background to-transparent" />
          <div className="absolute -bottom-12 left-1/2 -translate-x-1/2">
            <img 
              src={user.avatarUrl} 
              alt="" 
              className="w-24 h-24 rounded-full object-cover border-4 border-background shadow-xl" 
            />
          </div>
        </div>

        <div className="pt-16 pb-8 px-6 text-center">
          <h2 className="text-2xl font-bold text-white mb-1 flex items-center justify-center gap-2">
            {user.name}
            {user.isAdmin && <span className="text-[10px] uppercase tracking-widest text-danger font-bold bg-danger/10 px-2 py-1 rounded-full">Admin</span>}
          </h2>
          <p className="text-sm text-white/50 mb-8">@{user.username}</p>

          <div className="flex items-center justify-center gap-4">
            <button 
              onClick={handleStartChat}
              className="w-14 h-14 rounded-full bg-white text-black flex items-center justify-center hover:scale-105 active:scale-95 smooth-transition shadow-lg"
            >
              <MessageSquare className="w-6 h-6" />
            </button>
            <button 
              onClick={() => {
                window.dispatchEvent(new CustomEvent('start-call', { detail: { targetUser: user } }));
                onClose();
              }}
              className="w-14 h-14 rounded-full bg-white/10 text-white flex items-center justify-center hover:bg-white/20 hover:scale-105 active:scale-95 smooth-transition shadow-lg"
            >
              <Phone className="w-6 h-6" />
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
