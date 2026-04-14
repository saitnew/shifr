import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Camera, EyeOff, Eye, Shield, Copy, Check, LogOut, AlertTriangle } from 'lucide-react';
import { useStore } from '../store/useStore';
import { db, auth } from '../lib/firebase';
import { doc, updateDoc, query, collection, where, getDocs } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';

export default function SettingsModal({ onClose }: { onClose: () => void }) {
  const { currentUser, setCurrentUser } = useStore();
  const navigate = useNavigate();
  const [name, setName] = useState(currentUser?.name || '');
  const [username, setUsername] = useState(currentUser?.username || '');
  const [avatar, setAvatar] = useState(currentUser?.avatarUrl || '');
  const [isInvisible, setIsInvisible] = useState(currentUser?.isInvisible || false);
  const [copied, setCopied] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setAvatar(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const [error, setError] = useState('');

  const handleSave = async () => {
    if (!currentUser) return;
    setError('');

    // Validate username: only English letters and numbers, no spaces or special chars
    const usernameRegex = /^[a-zA-Z0-9]+$/;
    if (!usernameRegex.test(username)) {
      setError('User name должен содержать только английские буквы и цифры, без пробелов');
      return;
    }

    if (username.length < 3 || username.length > 15) {
      setError('User name должен быть от 3 до 15 символов');
      return;
    }

    try {
      // Check if username is taken by someone else
      const q = query(collection(db, 'users'), where('username', '==', username));
      const snapshot = await getDocs(q);
      const isTaken = snapshot.docs.some(doc => doc.id !== currentUser.uid);
      
      if (isTaken) {
        setError('Этот User name уже занят');
        return;
      }

      const updates = { name, username, avatarUrl: avatar, isInvisible };
      await updateDoc(doc(db, 'users', currentUser.uid), updates);
      setCurrentUser({ ...currentUser, ...updates });
      onClose();
    } catch (e) {
      console.error(e);
      setError('Произошла ошибка при сохранении');
    }
  };

  const handleCopyToken = () => {
    if (currentUser?.permanentToken) {
      navigator.clipboard.writeText(currentUser.permanentToken);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('userId');
    setCurrentUser(null);
    navigate('/');
  };

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
        className="w-full max-w-md glass-panel rounded-3xl overflow-hidden shadow-2xl border border-white/10 flex flex-col max-h-[90vh] hardware-accelerated"
      >
        <div className="p-4 sm:p-6 border-b border-white/5 flex items-center justify-between sticky top-0 bg-surface/95 md:bg-surface/80 md:backdrop-blur-md z-10">
          <h2 className="text-xl font-bold text-white">Настройки</h2>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-white/10 text-white/50 hover:text-white smooth-transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto custom-scrollbar space-y-6">
          {/* Avatar */}
          <div className="flex justify-center">
            <div 
              className="relative w-24 h-24 rounded-full bg-surface border-2 border-white/10 flex items-center justify-center cursor-pointer overflow-hidden group smooth-transition hover:border-white/30"
              onClick={() => fileInputRef.current?.click()}
            >
              <img src={avatar} alt="Avatar" className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 smooth-transition">
                <Camera className="w-6 h-6 text-white" />
              </div>
            </div>
            <input type="file" ref={fileInputRef} onChange={handleImageUpload} accept="image/*" className="hidden" />
          </div>

          {/* Fields */}
          <div className="space-y-4">
            {error && (
              <div className="p-3 rounded-xl bg-danger/20 border border-danger/30 flex items-center gap-2 text-danger text-sm">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                <p>{error}</p>
              </div>
            )}
            <div>
              <label className="text-xs text-white/50 uppercase tracking-wider mb-1 block pl-1">Имя</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-black/20 border border-white/5 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-white/20 focus:bg-black/40 smooth-transition"
              />
            </div>
            <div>
              <label className="text-xs text-white/50 uppercase tracking-wider mb-1 block pl-1">User name</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                maxLength={15}
                className="w-full bg-black/20 border border-white/5 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-white/20 focus:bg-black/40 smooth-transition"
              />
            </div>
          </div>

          {/* Toggles & Actions */}
          <div className="space-y-2 pt-2 border-t border-white/5">
            <div className="flex items-center justify-between p-4 rounded-xl bg-white/5">
              <div className="flex items-center gap-3">
                {isInvisible ? <EyeOff className="w-5 h-5 text-white/50" /> : <Eye className="w-5 h-5 text-white/50" />}
                <div>
                  <p className="text-sm font-medium text-white">Невидимка</p>
                  <p className="text-xs text-white/40">Скрыть из поиска</p>
                </div>
              </div>
              <button 
                onClick={() => setIsInvisible(!isInvisible)}
                className={`w-12 h-6 rounded-full p-1 smooth-transition ${isInvisible ? 'bg-white' : 'bg-white/10'}`}
              >
                <div className={`w-4 h-4 rounded-full bg-black smooth-transition ${isInvisible ? 'translate-x-6' : 'translate-x-0 bg-white/50'}`} />
              </button>
            </div>

            <button 
              onClick={handleCopyToken}
              className="w-full flex items-center justify-between p-4 rounded-xl bg-white/5 hover:bg-white/10 smooth-transition group"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white">
                  <span className="text-xs font-mono">TKN</span>
                </div>
                <div className="text-left">
                  <p className="text-sm font-medium text-white">Мой уникальный токен</p>
                  <p className="text-xs text-white/40 font-mono truncate w-32">{currentUser?.permanentToken}</p>
                </div>
              </div>
              {copied ? <Check className="w-5 h-5 text-success" /> : <Copy className="w-5 h-5 text-white/30 group-hover:text-white/70 smooth-transition" />}
            </button>
          </div>
        </div>

        <div className="p-4 sm:p-6 border-t border-white/5 bg-surface/95 md:bg-surface/80 md:backdrop-blur-md flex gap-3">
          <button 
            onClick={() => setShowLogoutConfirm(true)}
            className="p-4 rounded-xl bg-white/5 hover:bg-danger/20 text-white/50 hover:text-danger smooth-transition flex items-center justify-center"
          >
            <LogOut className="w-5 h-5" />
          </button>
          <button 
            onClick={handleSave}
            className="flex-1 bg-white text-black font-medium rounded-xl px-6 py-4 hover:bg-white/90 active:scale-[0.98] smooth-transition"
          >
            Сохранить
          </button>
        </div>

        {/* Logout Confirmation Overlay */}
        <AnimatePresence>
          {showLogoutConfirm && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-20 bg-surface/95 md:backdrop-blur-md flex items-center justify-center p-4 sm:p-6"
            >
              <div className="bg-background border border-white/10 rounded-3xl p-6 sm:p-8 max-w-sm w-full text-center shadow-2xl">
                <div className="w-16 h-16 rounded-full bg-danger/20 text-danger flex items-center justify-center mx-auto mb-4">
                  <LogOut className="w-8 h-8 ml-1" />
                </div>
                <h3 className="text-xl font-bold text-white mb-2">Выйти из аккаунта?</h3>
                <p className="text-white/50 text-sm mb-6">
                  Для повторного входа вам понадобится ваш уникальный токен. Убедитесь, что вы его сохранили!
                </p>
                <div className="flex gap-3">
                  <button 
                    onClick={() => setShowLogoutConfirm(false)}
                    className="flex-1 py-3 rounded-xl bg-white/5 hover:bg-white/10 text-white font-medium smooth-transition"
                  >
                    Отмена
                  </button>
                  <button 
                    onClick={handleLogout}
                    className="flex-1 py-3 rounded-xl bg-danger hover:bg-danger/90 text-white font-medium smooth-transition"
                  >
                    Выйти
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
