import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { X, Camera, Trash2, Clock, Shield, AlertTriangle, UserMinus, UserPlus } from 'lucide-react';
import { db } from '../lib/firebase';
import { doc, updateDoc, getDoc, getDocs, collection, query, where, deleteDoc } from 'firebase/firestore';
import { useStore } from '../store/useStore';
import { DEFAULT_AVATAR } from '../lib/constants';

export default function GroupSettingsModal({ chatId, chatData, onClose }: { chatId: string, chatData: any, onClose: () => void }) {
  const { currentUser } = useStore();
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [avatar, setAvatar] = useState(chatData.avatarUrl);
  const [globalCooldown, setGlobalCooldown] = useState(chatData.cooldowns?.global || 0);
  const [userStatuses, setUserStatuses] = useState<Record<string, string>>(chatData.statuses || {});
  const [userCooldowns, setUserCooldowns] = useState<Record<string, number>>(chatData.cooldowns || {});
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isAddingMember, setIsAddingMember] = useState(false);
  const [addMemberUsername, setAddMemberUsername] = useState('');
  const [actionError, setActionError] = useState('');
  const [actionSuccess, setActionSuccess] = useState('');
  
  const [confirmAction, setConfirmAction] = useState<{
    type: 'remove' | 'status' | 'cooldown';
    uid: string;
    title: string;
    promptText?: string;
    value?: string;
  } | null>(null);

  const isCreator = currentUser?.uid === chatData.creatorId;

  useEffect(() => {
    const fetchMembers = async () => {
      if (!chatData.participants || chatData.participants.length === 0) return;
      
      try {
        const q = query(collection(db, 'users'), where('uid', 'in', chatData.participants));
        const snapshot = await getDocs(q);
        const users = snapshot.docs.map(doc => doc.data());
        setMembers(users);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    fetchMembers();
  }, [chatData.participants]);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!isCreator) return;
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const newAvatar = reader.result as string;
        setAvatar(newAvatar);
        await updateDoc(doc(db, 'chats', chatId), { avatarUrl: newAvatar });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRemoveMember = async (uid: string) => {
    if (!isCreator || uid === currentUser?.uid) return;
    
    const newParticipants = chatData.participants.filter((p: string) => p !== uid);
    await updateDoc(doc(db, 'chats', chatId), { participants: newParticipants });
    setMembers(members.filter(m => m.uid !== uid));
    setConfirmAction(null);
  };

  const handleUpdateGlobalCooldown = async (val: number) => {
    if (!isCreator) return;
    setGlobalCooldown(val);
    await updateDoc(doc(db, 'chats', chatId), {
      'cooldowns.global': val
    });
  };

  const handleUpdateUserStatus = async (uid: string, status: string) => {
    if (!isCreator) return;
    const newStatuses = { ...userStatuses, [uid]: status };
    setUserStatuses(newStatuses);
    await updateDoc(doc(db, 'chats', chatId), {
      [`statuses.${uid}`]: status
    });
    setConfirmAction(null);
  };

  const handleUpdateUserCooldown = async (uid: string, cooldown: number) => {
    if (!isCreator) return;
    const newCooldowns = { ...userCooldowns, [uid]: cooldown };
    setUserCooldowns(newCooldowns);
    await updateDoc(doc(db, 'chats', chatId), {
      [`cooldowns.${uid}`]: cooldown
    });
    setConfirmAction(null);
  };

  const handleAddMember = async () => {
    if (!isCreator) return;
    setActionError('');
    setActionSuccess('');

    if (members.length >= 20) {
      setActionError('Достигнут лимит участников (20)');
      return;
    }

    if (!addMemberUsername.trim()) {
      setActionError('Введите username');
      return;
    }

    try {
      const q = query(collection(db, 'users'), where('username', '==', addMemberUsername.trim()));
      const snapshot = await getDocs(q);
      
      if (snapshot.empty) {
        setActionError('Пользователь не найден');
        return;
      }

      const newUser = snapshot.docs[0].data();
      
      if (chatData.participants.includes(newUser.uid)) {
        setActionError('Пользователь уже в группе');
        return;
      }

      const newParticipants = [...chatData.participants, newUser.uid];
      await updateDoc(doc(db, 'chats', chatId), { participants: newParticipants });
      
      setMembers([...members, newUser]);
      chatData.participants = newParticipants;
      setActionSuccess('Пользователь добавлен!');
      setAddMemberUsername('');
      setIsAddingMember(false);
      setTimeout(() => setActionSuccess(''), 3000);
    } catch (e) {
      console.error(e);
      setActionError('Ошибка при добавлении пользователя');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="w-full max-w-md max-h-[90vh] bg-surface border border-white/10 rounded-2xl shadow-2xl flex flex-col"
      >
        <div className="p-4 border-b border-white/5 flex items-center justify-between bg-white/5">
          <h2 className="text-lg font-semibold text-white">Настройки группы</h2>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full smooth-transition">
            <X className="w-5 h-5 text-white/70" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto custom-scrollbar space-y-6">
          <div className="flex flex-col items-center">
            <div 
              className={`relative w-24 h-24 rounded-full bg-surface border-2 border-white/10 flex items-center justify-center overflow-hidden group smooth-transition ${isCreator ? 'cursor-pointer hover:border-white/30' : ''}`}
              onClick={() => isCreator && fileInputRef.current?.click()}
            >
              <img src={avatar || DEFAULT_AVATAR} alt="Group Avatar" className="w-full h-full object-cover" />
              {isCreator && (
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 smooth-transition">
                  <Camera className="w-6 h-6 text-white" />
                </div>
              )}
            </div>
            <input type="file" ref={fileInputRef} onChange={handleImageUpload} accept="image/*" className="hidden" />
            <h3 className="mt-4 text-xl font-bold text-white">{chatData.name}</h3>
            <p className="text-sm text-white/50">{members.length} / 20 участников</p>
          </div>

          {isCreator && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-white/70 flex items-center gap-2">
                <Clock className="w-4 h-4" /> Общая задержка сообщений (сек)
              </label>
              <input 
                type="number" 
                min="0"
                value={globalCooldown}
                onChange={(e) => handleUpdateGlobalCooldown(Number(e.target.value))}
                className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-white/30"
              />
            </div>
          )}

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium text-white/70 uppercase tracking-wider">Участники</h4>
              {isCreator && members.length < 20 && (
                <button 
                  onClick={() => setIsAddingMember(!isAddingMember)}
                  className="text-xs bg-white/10 hover:bg-white/20 text-white px-3 py-1.5 rounded-lg smooth-transition flex items-center gap-1"
                >
                  <UserPlus className="w-3 h-3" />
                  {isAddingMember ? 'Отмена' : 'Добавить'}
                </button>
              )}
            </div>

            {actionError && (
              <div className="text-xs text-danger bg-danger/10 p-2 rounded-lg flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" /> {actionError}
              </div>
            )}
            {actionSuccess && (
              <div className="text-xs text-success bg-success/10 p-2 rounded-lg">
                {actionSuccess}
              </div>
            )}

            {isAddingMember && (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={addMemberUsername}
                  onChange={(e) => setAddMemberUsername(e.target.value)}
                  placeholder="Введите username..."
                  className="flex-1 bg-black/20 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-white/30"
                />
                <button
                  onClick={handleAddMember}
                  className="bg-white text-black px-4 py-2 rounded-xl text-sm font-medium hover:bg-white/90 smooth-transition"
                >
                  Ок
                </button>
              </div>
            )}

            {loading ? (
              <div className="text-center text-white/30 py-4">Загрузка...</div>
            ) : (
              <div className="space-y-3">
                {members.map(member => (
                  <div key={member.uid} className="flex items-center justify-between bg-white/5 p-3 rounded-xl">
                    <div className="flex items-center gap-3">
                      <img src={member.avatarUrl} alt={member.name} className="w-10 h-10 rounded-full object-cover" />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-white">{member.name}</span>
                          {userStatuses[member.uid] && (
                            <span className="text-[10px] uppercase tracking-widest font-bold px-2 py-0.5 rounded-full bg-[#1a1a1a] text-[#888] border border-[#333] shadow-inner">
                              {userStatuses[member.uid]}
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-white/40">@{member.username}</span>
                      </div>
                    </div>
                    
                    {isCreator && member.uid !== currentUser?.uid && (
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={() => setConfirmAction({
                            type: 'status',
                            uid: member.uid,
                            title: 'Изменить статус',
                            promptText: 'Введите статус (например, СТАРШИЙ):',
                            value: userStatuses[member.uid] || ''
                          })}
                          className="p-1.5 hover:bg-white/10 rounded-lg text-white/50 hover:text-white smooth-transition"
                          title="Изменить статус"
                        >
                          <Shield className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => setConfirmAction({
                            type: 'cooldown',
                            uid: member.uid,
                            title: 'Индивидуальная задержка',
                            promptText: 'Задержка сообщений (сек):',
                            value: (userCooldowns[member.uid] || 0).toString()
                          })}
                          className="p-1.5 hover:bg-white/10 rounded-lg text-white/50 hover:text-white smooth-transition"
                          title="Индивидуальная задержка"
                        >
                          <Clock className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => setConfirmAction({
                            type: 'remove',
                            uid: member.uid,
                            title: 'Удалить из группы?'
                          })}
                          className="p-1.5 hover:bg-danger/20 rounded-lg text-danger smooth-transition"
                          title="Удалить из группы"
                        >
                          <UserMinus className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </motion.div>

      {/* Action Modal */}
      {confirmAction && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-sm bg-surface border border-white/10 rounded-2xl p-6 shadow-2xl"
          >
            <h3 className="text-lg font-bold text-white mb-4">{confirmAction.title}</h3>
            
            {confirmAction.promptText && (
              <div className="mb-6">
                <label className="block text-sm text-white/70 mb-2">{confirmAction.promptText}</label>
                <input
                  type={confirmAction.type === 'cooldown' ? 'number' : 'text'}
                  value={confirmAction.value || ''}
                  onChange={(e) => setConfirmAction({ ...confirmAction, value: e.target.value })}
                  className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-white/30"
                />
              </div>
            )}

            <div className="flex gap-3">
              <button 
                onClick={() => setConfirmAction(null)}
                className="flex-1 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white font-medium smooth-transition"
              >
                Отмена
              </button>
              <button 
                onClick={() => {
                  if (confirmAction.type === 'remove') {
                    handleRemoveMember(confirmAction.uid);
                  } else if (confirmAction.type === 'status') {
                    handleUpdateUserStatus(confirmAction.uid, confirmAction.value || '');
                  } else if (confirmAction.type === 'cooldown') {
                    handleUpdateUserCooldown(confirmAction.uid, Number(confirmAction.value) || 0);
                  }
                }}
                className={`flex-1 py-2.5 rounded-xl font-medium smooth-transition ${
                  confirmAction.type === 'remove' ? 'bg-danger hover:bg-danger/90 text-white' : 'bg-white text-black hover:bg-white/90'
                }`}
              >
                {confirmAction.type === 'remove' ? 'Удалить' : 'Сохранить'}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
