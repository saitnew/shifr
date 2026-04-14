import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Send, Mic, Phone, Square, Play, Pause, ChevronLeft, Trash2, AlertTriangle, Eraser } from 'lucide-react';
import { useStore } from '../store/useStore';
import { db } from '../lib/firebase';
import { collection, query, orderBy, onSnapshot, addDoc, doc, getDoc, updateDoc, deleteDoc, getDocs, writeBatch, limit, where } from 'firebase/firestore';
import { encryptText, decryptText } from '../lib/crypto';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';

import { DEFAULT_AVATAR } from '../lib/constants';
import GroupSettingsModal from './GroupSettingsModal';

export default function ChatArea({ onUserClick }: { onUserClick: (id: string) => void }) {
  const { chatId } = useParams();
  const navigate = useNavigate();
  const { currentUser } = useStore();
  const [messages, setMessages] = useState<any[]>([]);
  const [inputText, setInputText] = useState('');
  const [otherUser, setOtherUser] = useState<any>(null);
  const [chatData, setChatData] = useState<any>(null);
  const [showGroupSettings, setShowGroupSettings] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [messageToDelete, setMessageToDelete] = useState<string | null>(null);
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const [cooldownError, setCooldownError] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Voice recording state
  const [isRecording, setIsRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [audioChunks, setAudioChunks] = useState<Blob[]>([]);
  const [recordingTime, setRecordingTime] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const [groupParticipants, setGroupParticipants] = useState<Record<string, any>>({});
  const groupParticipantsCache = useRef<Record<string, any>>({});
  const otherUserCache = useRef<any>(null);
  const prevParticipantsRef = useRef<string>('');

  useEffect(() => {
    if (!chatId || !currentUser) return;

    // Listen to chat document to handle real-time deletion and fetch other user
    const unsubChat = onSnapshot(doc(db, 'chats', chatId), async (docSnap) => {
      if (!docSnap.exists()) {
        navigate('/app');
        return;
      }
      const data = docSnap.data();
      setChatData(data);
      
      const participantsStr = JSON.stringify(data.participants || []);
      const participantsChanged = participantsStr !== prevParticipantsRef.current;
      prevParticipantsRef.current = participantsStr;

      if (data.type !== 'group') {
        const otherId = data.participants.find((id: string) => id !== currentUser.uid);
        if (otherId) {
          if (!participantsChanged && otherUserCache.current) {
            setOtherUser(otherUserCache.current);
          } else {
            const userDoc = await getDoc(doc(db, 'users', otherId));
            if (userDoc.exists()) {
              const uData = userDoc.data();
              otherUserCache.current = uData;
              setOtherUser(uData);
            }
          }
        }
      } else {
        // Fetch all participants for group chat
        if (data.participants && data.participants.length > 0) {
          if (!participantsChanged && Object.keys(groupParticipantsCache.current).length > 0) {
            setGroupParticipants(groupParticipantsCache.current);
          } else {
            try {
              const q = query(collection(db, 'users'), where('uid', 'in', data.participants));
              const snapshot = await getDocs(q);
              const participantsMap: Record<string, any> = {};
              snapshot.docs.forEach(doc => {
                participantsMap[doc.id] = doc.data();
              });
              groupParticipantsCache.current = participantsMap;
              setGroupParticipants(participantsMap);
            } catch (e) {
              console.error("Error fetching group participants", e);
            }
          }
        }
      }
    });

    // Listen for messages (limit to 50 for speed)
    const q = query(
      collection(db, `chats/${chatId}/messages`),
      orderBy('createdAt', 'desc'),
      limit(50)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          text: data.text ? decryptText(data.text) : '',
        };
      }).reverse(); // Reverse to show oldest first at top
      setMessages(msgs);
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    });

    return () => {
      unsubChat();
      unsubscribe();
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
      }
    };
  }, [chatId, currentUser, navigate]);

  const cleanupOldMessages = async () => {
    if (messages.length >= 40) {
      const messagesToDelete = messages.slice(0, messages.length - 39);
      for (const msg of messagesToDelete) {
        try {
          await deleteDoc(doc(db, `chats/${chatId}/messages`, msg.id));
        } catch (e) {
          console.error("Error deleting old message", e);
        }
      }
    }
  };

  const checkCooldown = () => {
    if (!chatData || chatData.type !== 'group') return true;
    
    const globalCooldown = chatData.cooldowns?.global || 0;
    const userCooldown = chatData.cooldowns?.[currentUser!.uid] || 0;
    const activeCooldown = Math.max(globalCooldown, userCooldown);
    
    if (activeCooldown > 0) {
      // Find user's last message
      const userMessages = messages.filter(m => m.senderId === currentUser!.uid);
      if (userMessages.length > 0) {
        const lastMsgTime = userMessages[userMessages.length - 1].createdAt;
        const timeSinceLastMsg = (Date.now() - lastMsgTime) / 1000;
        if (timeSinceLastMsg < activeCooldown) {
          const remaining = Math.ceil(activeCooldown - timeSinceLastMsg);
          setCooldownError(`Подождите ${remaining} сек.`);
          setTimeout(() => setCooldownError(''), 3000);
          return false;
        }
      }
    }
    return true;
  };

  const handleSendMessage = async () => {
    if (!inputText.trim() || !chatId || !currentUser) return;
    if (!checkCooldown()) return;

    const textToSend = inputText;
    setInputText('');

    const encryptedText = encryptText(textToSend);
    
    await addDoc(collection(db, `chats/${chatId}/messages`), {
      chatId,
      senderId: currentUser.uid,
      text: encryptedText,
      createdAt: Date.now()
    });

    await updateDoc(doc(db, 'chats', chatId), {
      lastMessage: textToSend.substring(0, 30) + (textToSend.length > 30 ? '...' : ''),
      updatedAt: Date.now()
    });

    cleanupOldMessages();
  };

    const startRecording = async () => {
      if (!checkCooldown()) return;
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const recorder = new MediaRecorder(stream);
        const chunks: Blob[] = [];

        recorder.ondataavailable = (e) => chunks.push(e.data);
        recorder.onstop = async () => {
          const audioBlob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
          const reader = new FileReader();
          reader.readAsDataURL(audioBlob);
          reader.onloadend = async () => {
            const base64Audio = reader.result as string;
            if (chatId && currentUser) {
              await addDoc(collection(db, `chats/${chatId}/messages`), {
                chatId,
                senderId: currentUser.uid,
                audioData: base64Audio,
                createdAt: Date.now()
              });
              await updateDoc(doc(db, 'chats', chatId), {
                lastMessage: 'Голосовое сообщение',
                updatedAt: Date.now()
              });
              cleanupOldMessages();
            }
          };
          stream.getTracks().forEach(track => track.stop());
        };

        recorder.start();
        setMediaRecorder(recorder);
        setIsRecording(true);
        setRecordingTime(0);
        timerRef.current = setInterval(() => setRecordingTime(prev => prev + 1), 1000);
      } catch (e: any) {
        console.error("Error accessing microphone", e);
        alert("Ошибка микрофона: " + (e.message || "Нет доступа. Разрешите микрофон в настройках телефона для этого приложения."));
      }
    };

  const stopRecording = () => {
    if (mediaRecorder && isRecording) {
      mediaRecorder.stop();
      setIsRecording(false);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  };

  const handleCall = () => {
    if (!otherUser) return;
    // Dispatch custom event to trigger call overlay
    window.dispatchEvent(new CustomEvent('start-call', { detail: { targetUser: otherUser } }));
  };

  const handleDeleteChat = async () => {
    if (!chatId || !currentUser) return;
    try {
      if (chatData?.type === 'group' && chatData.creatorId !== currentUser.uid) {
        // Leave group
        const newParticipants = chatData.participants.filter((p: string) => p !== currentUser.uid);
        await updateDoc(doc(db, 'chats', chatId), { participants: newParticipants });
      } else {
        // Delete chat entirely (direct chat or group creator)
        await deleteDoc(doc(db, 'chats', chatId));
      }
      navigate('/app');
    } catch (e) {
      console.error("Error deleting/leaving chat:", e);
    }
  };

  const handleClearChat = async () => {
    if (!chatId) return;
    try {
      const messagesQ = query(collection(db, `chats/${chatId}/messages`));
      const snapshot = await getDocs(messagesQ);
      
      const batches = [];
      let currentBatch = writeBatch(db);
      let operationCount = 0;

      snapshot.docs.forEach((msgDoc) => {
        currentBatch.delete(doc(db, `chats/${chatId}/messages`, msgDoc.id));
        operationCount++;
        
        if (operationCount === 490) {
          batches.push(currentBatch.commit());
          currentBatch = writeBatch(db);
          operationCount = 0;
        }
      });
      
      currentBatch.update(doc(db, 'chats', chatId), {
        lastMessage: 'Чат очищен',
        updatedAt: Date.now()
      });
      batches.push(currentBatch.commit());
      
      await Promise.all(batches);
      setShowClearConfirm(false);
    } catch (e) {
      console.error("Error clearing chat:", e);
    }
  };

  const confirmDeleteMessage = async () => {
    if (!chatId || !messageToDelete) return;
    try {
      await deleteDoc(doc(db, `chats/${chatId}/messages`, messageToDelete));
      setMessageToDelete(null);
      setSelectedMessageId(null);
    } catch (e) {
      console.error("Error deleting message:", e);
    }
  };

  const handleDeleteMessage = (msgId: string) => {
    setMessageToDelete(msgId);
  };

  const handlePointerDown = (msgId: string) => {
    longPressTimerRef.current = setTimeout(() => {
      setSelectedMessageId(msgId);
    }, 500);
  };

  const handlePointerUpOrLeave = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  if (!chatId) return null;

  return (
    <div className="flex-1 flex flex-col h-full bg-background relative overflow-hidden">
      {/* Header */}
      <div className="h-20 border-b border-white/5 bg-surface/95 md:bg-surface/50 md:backdrop-blur-md flex items-center justify-between px-4 md:px-6 z-10 flex-shrink-0">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => navigate('/app')}
            className="p-2 -ml-2 rounded-full hover:bg-white/10 text-white/70 hover:text-white smooth-transition"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
          <div 
            className="flex items-center gap-3 cursor-pointer group"
            onClick={() => {
              if (chatData?.type === 'group') {
                setShowGroupSettings(true);
              } else if (otherUser) {
                onUserClick(otherUser.uid);
              }
            }}
          >
            <img 
              src={chatData?.type === 'group' ? chatData.avatarUrl : (otherUser?.avatarUrl || DEFAULT_AVATAR)} 
              alt="Avatar" 
              className="w-10 h-10 md:w-12 md:h-12 rounded-full object-cover bg-surface group-hover:scale-105 smooth-transition"
            />
            <div>
              <h2 className="text-base md:text-lg font-medium text-white group-hover:text-white/80 smooth-transition">
                {chatData?.type === 'group' ? chatData.name : (otherUser?.name || 'Загрузка...')}
              </h2>
              <p className="text-xs text-white/50">
                {chatData?.type === 'group' ? `${chatData.participants?.length || 0} участников` : (otherUser?.username ? `@${otherUser.username}` : '')}
              </p>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setShowClearConfirm(true)}
            className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-danger/10 hover:bg-danger/20 flex items-center justify-center text-danger smooth-transition"
            title="Очистить чат"
          >
            <Eraser className="w-5 h-5" />
          </button>
          <button 
            onClick={() => setShowDeleteConfirm(true)}
            className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-danger/10 hover:bg-danger/20 flex items-center justify-center text-danger smooth-transition"
            title={chatData?.type === 'group' ? (chatData.creatorId === currentUser?.uid ? "Удалить группу" : "Покинуть группу") : "Удалить чат"}
          >
            <Trash2 className="w-5 h-5" />
          </button>
          {chatData?.type !== 'group' && (
            <button 
              onClick={handleCall}
              className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-white smooth-transition"
            >
              <Phone className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 md:p-6 space-y-4" onClick={() => setSelectedMessageId(null)}>
        {messages.map((msg, idx) => {
          const isMe = msg.senderId === currentUser?.uid;
          const showAvatar = !isMe && (idx === 0 || messages[idx - 1].senderId !== msg.senderId);
          const isSelected = selectedMessageId === msg.id;
          const senderInfo = chatData?.type === 'group' ? groupParticipants[msg.senderId] : otherUser;
          
          return (
            <motion.div 
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              key={msg.id} 
              className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} gap-1 hardware-accelerated`}
            >
              <div className={`flex ${isMe ? 'justify-end' : 'justify-start'} items-end gap-2 w-full`}>
                {!isMe && (
                  <div className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0 hidden md:block">
                    {showAvatar && <img src={senderInfo?.avatarUrl || DEFAULT_AVATAR} alt="" className="w-full h-full object-cover" />}
                  </div>
                )}
                
                <div 
                  onPointerDown={() => handlePointerDown(msg.id)}
                  onPointerUp={handlePointerUpOrLeave}
                  onPointerLeave={handlePointerUpOrLeave}
                  onClick={(e) => e.stopPropagation()}
                  className={`max-w-[85%] md:max-w-[70%] rounded-2xl px-4 py-3 md:px-5 md:py-3 cursor-pointer select-none ${
                    isMe 
                      ? 'bg-white text-black rounded-br-sm' 
                      : 'bg-surface border border-white/5 text-white rounded-bl-sm'
                  } ${isSelected ? 'ring-2 ring-danger' : ''}`}
                >
                  {!isMe && chatData?.type === 'group' && showAvatar && (
                    <div className="text-xs text-white/50 mb-1 font-medium flex items-center gap-2">
                      {senderInfo?.name || 'Пользователь'}
                      {chatData?.statuses?.[msg.senderId] && (
                        <span className="text-[8px] uppercase tracking-widest font-bold px-1.5 py-0.5 rounded-full bg-[#1a1a1a] text-[#888] border border-[#333]">
                          {chatData.statuses[msg.senderId]}
                        </span>
                      )}
                    </div>
                  )}
                  {msg.text && <p className="text-sm break-words whitespace-pre-wrap">{msg.text}</p>}
                  {msg.audioData && (
                    <AudioPlayer src={msg.audioData} isMe={isMe} />
                  )}
                  <span className={`text-[10px] mt-1 block ${isMe ? 'text-black/50' : 'text-white/30'}`}>
                    {format(msg.createdAt, 'HH:mm', { locale: ru })}
                  </span>
                </div>
              </div>
              
              <AnimatePresence>
                {isSelected && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                    className={`flex ${isMe ? 'justify-end' : 'justify-start'} w-full px-10 py-1 hardware-accelerated`}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteMessage(msg.id);
                      }}
                      className="text-xs text-danger hover:text-danger/80 font-medium flex items-center gap-1 py-1"
                    >
                      <Trash2 className="w-3 h-3" />
                      Удалить
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-4 bg-gradient-to-t from-background via-background to-transparent flex-shrink-0 z-10">
        {cooldownError && (
          <div className="text-center text-danger text-xs mb-2 animate-pulse">
            {cooldownError}
          </div>
        )}
        <div className="max-w-4xl mx-auto glass-panel rounded-full p-2 flex items-center gap-2 shadow-2xl">
          {isRecording ? (
            <div className="flex-1 flex items-center justify-between px-4">
              <div className="flex items-center gap-3 text-danger animate-pulse">
                <div className="w-3 h-3 rounded-full bg-danger" />
                <span className="text-sm font-medium">
                  {Math.floor(recordingTime / 60)}:{(recordingTime % 60).toString().padStart(2, '0')}
                </span>
              </div>
              <button 
                onClick={stopRecording}
                className="w-10 h-10 rounded-full bg-danger/20 hover:bg-danger/30 text-danger flex items-center justify-center smooth-transition"
              >
                <Square className="w-4 h-4 fill-current" />
              </button>
            </div>
          ) : (
            <>
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                placeholder="Написать сообщение..."
                className="flex-1 bg-transparent border-none px-4 py-3 text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-0"
              />
              {inputText.trim() ? (
                <button 
                  onClick={handleSendMessage}
                  className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-white text-black flex items-center justify-center hover:scale-105 active:scale-90 smooth-transition flex-shrink-0 hardware-accelerated"
                >
                  <Send className="w-4 h-4 md:w-5 md:h-5 ml-1" />
                </button>
              ) : (
                <button 
                  onClick={startRecording}
                  className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center active:scale-90 smooth-transition flex-shrink-0 hardware-accelerated"
                >
                  <Mic className="w-4 h-4 md:w-5 md:h-5" />
                </button>
              )}
            </>
          )}
        </div>
      </div>
      {/* Delete Confirmation Overlay */}
      <AnimatePresence>
        {showDeleteConfirm && (
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
              <h3 className="text-xl font-bold text-white mb-2">
                {chatData?.type === 'group' 
                  ? (chatData.creatorId === currentUser?.uid ? 'Удалить группу?' : 'Покинуть группу?') 
                  : 'Удалить чат?'}
              </h3>
              <p className="text-white/50 text-sm mb-6">
                {chatData?.type === 'group' 
                  ? (chatData.creatorId === currentUser?.uid 
                      ? 'Вы действительно хотите удалить эту группу? Она будет удалена у всех участников.'
                      : 'Вы действительно хотите покинуть эту группу? Вы не сможете вернуться без приглашения.')
                  : 'Вы уверены, что хотите удалить этот чат? Это действие нельзя отменить, и чат будет удален у обоих пользователей.'}
              </p>
              <div className="flex gap-3">
                <button 
                  onClick={() => setShowDeleteConfirm(false)}
                  className="flex-1 py-3 rounded-xl bg-white/5 hover:bg-white/10 text-white font-medium smooth-transition"
                >
                  Отмена
                </button>
                <button 
                  onClick={handleDeleteChat}
                  className="flex-1 py-3 rounded-xl bg-danger hover:bg-danger/90 text-white font-medium smooth-transition"
                >
                  {chatData?.type === 'group' 
                    ? (chatData.creatorId === currentUser?.uid ? 'Удалить' : 'Покинуть') 
                    : 'Удалить'}
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {/* Clear Chat Confirmation Overlay */}
        {showClearConfirm && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 bg-black/95 md:bg-black/80 md:backdrop-blur-md flex items-center justify-center p-4 sm:p-6"
          >
            <div className="bg-surface border border-white/10 rounded-3xl p-6 sm:p-8 max-w-sm w-full text-center shadow-2xl">
              <div className="w-16 h-16 rounded-full bg-danger/20 text-danger flex items-center justify-center mx-auto mb-4">
                <Eraser className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold text-white mb-2">Очистить чат?</h3>
              <p className="text-white/50 text-sm mb-6">
                Вы уверены, что хотите очистить этот чат? Все сообщения будут удалены у обоих пользователей.
              </p>
              <div className="flex gap-3">
                <button 
                  onClick={() => setShowClearConfirm(false)}
                  className="flex-1 py-3 rounded-xl bg-white/5 hover:bg-white/10 text-white font-medium smooth-transition"
                >
                  Отмена
                </button>
                <button 
                  onClick={handleClearChat}
                  className="flex-1 py-3 rounded-xl bg-danger hover:bg-danger/90 text-white font-medium smooth-transition"
                >
                  Очистить
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {/* Delete Message Confirmation Overlay */}
        {messageToDelete && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 bg-black/95 md:bg-black/80 md:backdrop-blur-md flex items-center justify-center p-4 sm:p-6"
          >
            <div className="bg-surface border border-white/10 rounded-3xl p-6 sm:p-8 max-w-sm w-full text-center shadow-2xl">
              <div className="w-16 h-16 rounded-full bg-danger/20 text-danger flex items-center justify-center mx-auto mb-4">
                <Trash2 className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold text-white mb-2">Удалить сообщение?</h3>
              <p className="text-white/50 text-sm mb-6">
                Вы уверены, что хотите удалить это сообщение? Оно будет удалено у обоих пользователей.
              </p>
              <div className="flex gap-3">
                <button 
                  onClick={() => {
                    setMessageToDelete(null);
                    setSelectedMessageId(null);
                  }}
                  className="flex-1 py-3 rounded-xl bg-white/5 hover:bg-white/10 text-white font-medium smooth-transition"
                >
                  Отмена
                </button>
                <button 
                  onClick={confirmDeleteMessage}
                  className="flex-1 py-3 rounded-xl bg-danger hover:bg-danger/90 text-white font-medium smooth-transition"
                >
                  Удалить
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      
      {showGroupSettings && chatData && (
        <GroupSettingsModal 
          chatId={chatId!} 
          chatData={chatData} 
          onClose={() => setShowGroupSettings(false)} 
        />
      )}
    </div>
  );
}

function AudioPlayer({ src, isMe }: { src: string, isMe: boolean }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const handleOtherPlay = (e: any) => {
      if (e.detail.src !== src && isPlaying) {
        audioRef.current?.pause();
        setIsPlaying(false);
      }
    };
    window.addEventListener('audio-play', handleOtherPlay);
    return () => window.removeEventListener('audio-play', handleOtherPlay);
  }, [src, isPlaying]);

  const togglePlay = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        window.dispatchEvent(new CustomEvent('audio-play', { detail: { src } }));
        audioRef.current.play();
      }
    }
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      const current = audioRef.current.currentTime;
      const duration = audioRef.current.duration;
      if (duration > 0) {
        setProgress((current / duration) * 100);
      }
    }
  };

  const handleEnded = () => {
    setIsPlaying(false);
    setProgress(0);
  };

  return (
    <div className="flex items-center gap-3 min-w-[160px] md:min-w-[200px]">
      <button 
        onClick={togglePlay}
        className={`relative w-10 h-10 md:w-12 md:h-12 rounded-full flex items-center justify-center flex-shrink-0 smooth-transition ${
          isMe ? 'bg-black/10 hover:bg-black/20 text-black' : 'bg-white/10 hover:bg-white/20 text-white'
        }`}
      >
        {isPlaying && (
          <motion.div 
            className="absolute inset-0 rounded-full border-2 border-current opacity-50"
            animate={{ scale: [1, 1.5], opacity: [0.5, 0] }}
            transition={{ duration: 1.5, repeat: Infinity, ease: "easeOut" }}
          />
        )}
        {isPlaying ? <Pause className="w-4 h-4 md:w-5 md:h-5 fill-current relative z-10" /> : <Play className="w-4 h-4 md:w-5 md:h-5 fill-current ml-1 relative z-10" />}
      </button>
      
      <div className="flex-1 flex flex-col gap-1">
        <div className="flex items-center gap-[2px] h-6 overflow-hidden">
          {/* Animated wave bars - Pure CSS for 120Hz smoothness */}
          {Array.from({ length: 15 }).map((_, i) => (
            <div
              key={i}
              className={`flex-1 rounded-full hardware-accelerated ${isMe ? 'bg-black' : 'bg-white'} ${progress > (i / 15) * 100 ? 'opacity-100' : 'opacity-30'} ${isPlaying ? 'eq-bar-playing' : ''}`}
              style={{ 
                minHeight: '6px', 
                transformOrigin: 'bottom',
                animationDelay: `${i * 0.05}s`
              }}
            />
          ))}
        </div>
      </div>

      <audio 
        ref={audioRef} 
        src={src} 
        onTimeUpdate={handleTimeUpdate}
        onEnded={handleEnded} 
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        className="hidden" 
      />
    </div>
  );
}
