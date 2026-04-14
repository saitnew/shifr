import React, { useState, useRef } from 'react';
import { motion } from 'motion/react';
import { X, Camera, Users, AlertCircle } from 'lucide-react';
import { db } from '../lib/firebase';
import { collection, addDoc, doc, setDoc } from 'firebase/firestore';
import { useStore } from '../store/useStore';
import { DEFAULT_AVATAR } from '../lib/constants';

export default function CreateGroupModal({ onClose, onGroupCreated }: { onClose: () => void, onGroupCreated: (chatId: string) => void }) {
  const { currentUser } = useStore();
  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setAvatar(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleCreate = async () => {
    if (!name.trim()) {
      setError('Введите название группы');
      return;
    }
    if (!currentUser) return;

    setLoading(true);
    setError('');

    try {
      const chatId = 'group_' + crypto.randomUUID();
      
      await setDoc(doc(db, 'chats', chatId), {
        type: 'group',
        name: name.trim(),
        avatarUrl: avatar || DEFAULT_AVATAR,
        creatorId: currentUser.uid,
        participants: [currentUser.uid],
        updatedAt: Date.now(),
        order: {
          [currentUser.uid]: Date.now()
        },
        cooldowns: {
          global: 0
        },
        statuses: {
          [currentUser.uid]: 'Создатель'
        }
      });

      onGroupCreated(chatId);
      onClose();
    } catch (err: any) {
      console.error(err);
      setError('Ошибка при создании группы');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="w-full max-w-md bg-surface border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col"
      >
        <div className="p-4 border-b border-white/5 flex items-center justify-between bg-white/5">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-white/70" />
            <h2 className="text-lg font-semibold text-white">Создать группу</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full smooth-transition">
            <X className="w-5 h-5 text-white/70" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div className="flex justify-center">
            <div 
              className="relative w-24 h-24 rounded-full bg-surface border-2 border-white/10 flex items-center justify-center cursor-pointer overflow-hidden group smooth-transition hover:border-white/30"
              onClick={() => fileInputRef.current?.click()}
            >
              {avatar ? (
                <img src={avatar} alt="Group Avatar" className="w-full h-full object-cover" />
              ) : (
                <Camera className="w-8 h-8 text-white/30 group-hover:text-white/60 smooth-transition" />
              )}
              <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 smooth-transition">
                <span className="text-xs text-white font-medium">Изменить</span>
              </div>
            </div>
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleImageUpload} 
              accept="image/*" 
              className="hidden" 
            />
          </div>

          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Название группы"
            maxLength={30}
            className="w-full bg-surface border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-white/30 focus:outline-none focus:border-white/30 focus:ring-1 focus:ring-white/30 smooth-transition"
          />

          {error && (
            <div className="flex items-center gap-2 text-danger text-sm bg-danger/10 p-3 rounded-xl">
              <AlertCircle className="w-4 h-4" />
              {error}
            </div>
          )}

          <button
            onClick={handleCreate}
            disabled={loading || !name.trim()}
            className="w-full py-3 rounded-xl bg-white text-black font-semibold hover:bg-white/90 disabled:opacity-50 disabled:cursor-not-allowed smooth-transition"
          >
            {loading ? 'Создание...' : 'Создать'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
