import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Shield, Key, Users, Trash2, Copy, Check, AlertTriangle } from 'lucide-react';
import { db } from '../lib/firebase';
import { collection, query, onSnapshot, addDoc, doc, deleteDoc, getDocs, where } from 'firebase/firestore';
import { useStore } from '../store/useStore';

export default function AdminPanelModal({ onClose }: { onClose: () => void }) {
  const { currentUser } = useStore();
  const [tokens, setTokens] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'tokens' | 'users'>('tokens');
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [userToDelete, setUserToDelete] = useState<any>(null);

  useEffect(() => {
    if (!currentUser?.isAdmin) return;

    // Listen to admin tokens
    const tokensQ = query(collection(db, 'adminTokens'));
    const unsubTokens = onSnapshot(tokensQ, (snapshot) => {
      const now = Date.now();
      const validTokens = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter((t: any) => t.expiresAt > now);
      setTokens(validTokens.sort((a: any, b: any) => b.createdAt - a.createdAt));
    }, (error) => {
      console.error("Error fetching admin tokens:", error);
    });

    // Listen to users
    const usersQ = query(collection(db, 'users'));
    const unsubUsers = onSnapshot(usersQ, (snapshot) => {
      const allUsers = snapshot.docs
        .map(doc => doc.data())
        .filter(u => u.uid !== currentUser.uid);
      setUsers(allUsers);
    }, (error) => {
      console.error("Error fetching users:", error);
    });

    return () => {
      unsubTokens();
      unsubUsers();
    };
  }, [currentUser]);

  const generateAdminToken = async () => {
    if (!currentUser?.isAdmin) return;

    // Cleanup expired tokens first
    try {
      const now = Date.now();
      const expiredQuery = query(collection(db, 'adminTokens'), where('expiresAt', '<', now));
      const expiredSnapshot = await getDocs(expiredQuery);
      expiredSnapshot.forEach((doc) => {
        deleteDoc(doc.ref);
      });
    } catch (e) {
      console.error("Error cleaning up tokens", e);
    }

    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_';
    let token = '';
    for (let i = 0; i < 15; i++) {
      token += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    await addDoc(collection(db, 'adminTokens'), {
      value: token,
      createdBy: currentUser.uid,
      createdAt: Date.now(),
      expiresAt: Date.now() + 10 * 60 * 1000 // 10 minutes
    });
  };

  const handleDeleteUser = async () => {
    if (!currentUser?.isAdmin || !userToDelete) return;
    try {
      // Delete user document
      await deleteDoc(doc(db, 'users', userToDelete.uid));
      
      // Delete all chats where this user is a participant
      const chatsQ = query(collection(db, 'chats'), where('participants', 'array-contains', userToDelete.uid));
      const chatsSnapshot = await getDocs(chatsQ);
      
      for (const chatDoc of chatsSnapshot.docs) {
        await deleteDoc(doc(db, 'chats', chatDoc.id));
      }

      setUserToDelete(null);
    } catch (e) {
      console.error("Error deleting user or their chats:", e);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedToken(text);
    setTimeout(() => setCopiedToken(null), 2000);
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 md:bg-black/60 md:backdrop-blur-sm"
    >
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1], delay: 0.05 }}
        className="w-full max-w-2xl glass-panel rounded-3xl overflow-hidden shadow-2xl border border-danger/20 flex flex-col max-h-[90vh] hardware-accelerated"
      >
        <div className="p-6 border-b border-white/5 flex items-center justify-between bg-surface/95 md:bg-surface/80 md:backdrop-blur-md">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-danger/20 flex items-center justify-center text-danger">
              <Shield className="w-5 h-5" />
            </div>
            <h2 className="text-xl font-bold text-white">Панель управления</h2>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-white/10 text-white/50 hover:text-white smooth-transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex border-b border-white/5">
          <button 
            onClick={() => setActiveTab('tokens')}
            className={`flex-1 py-4 text-sm font-medium flex items-center justify-center gap-2 smooth-transition ${activeTab === 'tokens' ? 'text-white border-b-2 border-danger bg-white/5' : 'text-white/50 hover:text-white hover:bg-white/5'}`}
          >
            <Key className="w-4 h-4" />
            Токены
          </button>
          <button 
            onClick={() => setActiveTab('users')}
            className={`flex-1 py-4 text-sm font-medium flex items-center justify-center gap-2 smooth-transition ${activeTab === 'users' ? 'text-white border-b-2 border-danger bg-white/5' : 'text-white/50 hover:text-white hover:bg-white/5'}`}
          >
            <Users className="w-4 h-4" />
            Пользователи
          </button>
        </div>

        <div className="p-6 overflow-y-auto custom-scrollbar flex-1 relative">
          {activeTab === 'tokens' && (
            <div className="space-y-6">
              <button 
                onClick={generateAdminToken}
                className="w-full bg-danger text-white font-medium rounded-xl px-6 py-4 flex items-center justify-center gap-2 hover:bg-danger/90 active:scale-[0.98] smooth-transition"
              >
                <Key className="w-5 h-5" />
                Сгенерировать токен (10 мин)
              </button>

              <div className="space-y-2">
                <h3 className="text-xs text-white/50 uppercase tracking-wider mb-3">Активные токены</h3>
                {tokens.length === 0 ? (
                  <p className="text-sm text-white/30 text-center py-8">Нет активных токенов</p>
                ) : (
                  tokens.map(token => (
                    <div key={token.id} className="flex items-center justify-between p-4 rounded-xl bg-white/5 border border-white/5">
                      <div className="font-mono text-sm text-white">{token.value}</div>
                      <div className="flex items-center gap-4">
                        <div className="text-xs text-danger font-medium">
                          {Math.max(0, Math.floor((token.expiresAt - Date.now()) / 60000))} мин
                        </div>
                        <button 
                          onClick={() => copyToClipboard(token.value)}
                          className="p-2 rounded-lg hover:bg-white/10 text-white/50 hover:text-white smooth-transition"
                        >
                          {copiedToken === token.value ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {activeTab === 'users' && (
            <div className="space-y-2">
              {users.map(user => (
                <div key={user.uid} className="flex items-center justify-between p-4 rounded-xl bg-white/5 border border-white/5">
                  <div className="flex items-center gap-3">
                    <img src={user.avatarUrl} alt="" className="w-10 h-10 rounded-full object-cover bg-surface" />
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-medium text-white">{user.name}</h3>
                        {user.isAdmin && <span className="text-[10px] uppercase tracking-widest text-danger font-bold">Admin</span>}
                        {user.isBlocked && <span className="text-[10px] uppercase tracking-widest text-white/30 font-bold">Blocked</span>}
                      </div>
                      <p className="text-xs text-white/50">@{user.username}</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setUserToDelete(user)}
                    className="px-4 py-2 rounded-lg text-xs font-medium flex items-center gap-2 smooth-transition bg-danger/10 text-danger hover:bg-danger/20"
                  >
                    <Trash2 className="w-4 h-4" />
                    Удалить
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Delete Confirmation Overlay */}
        <AnimatePresence>
          {userToDelete && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-50 bg-black/95 md:bg-black/80 md:backdrop-blur-md flex items-center justify-center p-4 sm:p-6"
            >
              <div className="bg-surface border border-white/10 rounded-3xl p-6 sm:p-8 max-w-sm w-full text-center shadow-2xl">
                <div className="w-16 h-16 rounded-full bg-danger/20 text-danger flex items-center justify-center mx-auto mb-4">
                  <AlertTriangle className="w-8 h-8" />
                </div>
                <h3 className="text-xl font-bold text-white mb-2">Удалить пользователя?</h3>
                <p className="text-white/50 text-sm mb-6">
                  Вы уверены, что хотите навсегда удалить пользователя <span className="text-white font-medium">@{userToDelete.username}</span>? Это действие нельзя отменить.
                </p>
                <div className="flex gap-3">
                  <button 
                    onClick={() => setUserToDelete(null)}
                    className="flex-1 py-3 rounded-xl bg-white/5 hover:bg-white/10 text-white font-medium smooth-transition"
                  >
                    Отмена
                  </button>
                  <button 
                    onClick={handleDeleteUser}
                    className="flex-1 py-3 rounded-xl bg-danger hover:bg-danger/90 text-white font-medium smooth-transition"
                  >
                    Удалить
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}
