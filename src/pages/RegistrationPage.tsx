import React, { useState, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { Camera, ArrowRight, AlertCircle } from 'lucide-react';
import { doc, setDoc, getDocs, query, collection, where, deleteDoc } from 'firebase/firestore';
import { signInAnonymously } from 'firebase/auth';
import { auth, db } from '../lib/firebase';
import { useStore } from '../store/useStore';
import { DEFAULT_AVATAR } from '../lib/constants';

const generateToken = (length: number) => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

export default function RegistrationPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { setCurrentUser } = useStore();
  const isAdmin = location.state?.isAdmin || false;

  const [avatar, setAvatar] = useState<string>('');
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
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

  const handleRegister = async () => {
    setError('');
    if (!name.trim() || !username.trim()) {
      setError('Заполните все поля');
      return;
    }
    
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

    setLoading(true);
    try {
      // Check if username is taken
      const q = query(collection(db, 'users'), where('username', '==', username));
      const snapshot = await getDocs(q);
      if (!snapshot.empty) {
        setError('Этот User name уже занят');
        setLoading(false);
        return;
      }

      if (!auth.currentUser) {
        await signInAnonymously(auth);
      }

      const uid = crypto.randomUUID();
      const permanentToken = generateToken(20);
      
      const newUser = {
        uid,
        name,
        username,
        avatarUrl: avatar || DEFAULT_AVATAR,
        isInvisible: false,
        isAdmin,
        isBlocked: false,
        permanentToken,
        createdAt: new Date().toISOString(),
      };

      await setDoc(doc(db, 'users', uid), newUser);
      
      // Delete the admin token if it was used
      const tokenId = location.state?.tokenId;
      if (tokenId) {
        try {
          await deleteDoc(doc(db, 'adminTokens', tokenId));
        } catch (e) {
          console.error("Error deleting admin token:", e);
        }
      }

      localStorage.setItem('userId', uid);
      setCurrentUser(newUser);
      navigate('/app');
    } catch (e: any) {
      console.error(e);
      setError(e.message || 'Ошибка при регистрации');
    } finally {
      setLoading(false);
    }
  };

  const isFormValid = name.trim() && username.trim() && username.length >= 3 && username.length <= 15;

  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="min-h-screen bg-background flex flex-col items-center justify-center p-4"
    >
      <div className="w-full max-w-md glass-panel rounded-[2rem] p-8 shadow-2xl">
        <h2 className="text-2xl font-bold text-white mb-8 text-center">Создание аккаунта</h2>

        <div className="flex justify-center mb-8">
          <div 
            className="relative w-24 h-24 rounded-full bg-surface border-2 border-white/10 flex items-center justify-center cursor-pointer overflow-hidden group smooth-transition hover:border-white/30"
            onClick={() => fileInputRef.current?.click()}
          >
            {avatar ? (
              <img src={avatar} alt="Avatar" className="w-full h-full object-cover" />
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

        <div className="space-y-4">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Имя пользователя"
            className="w-full bg-surface border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-white/30 focus:outline-none focus:border-white/30 focus:ring-1 focus:ring-white/30 smooth-transition"
          />
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="User name (3-15 символов)"
            maxLength={15}
            className="w-full bg-surface border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-white/30 focus:outline-none focus:border-white/30 focus:ring-1 focus:ring-white/30 smooth-transition"
          />

          {error && (
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-2 text-danger text-sm bg-danger/10 p-3 rounded-xl">
              <AlertCircle className="w-4 h-4" />
              {error}
            </motion.div>
          )}

          <motion.button
            initial={false}
            animate={{ 
              opacity: isFormValid ? 1 : 0.5,
              scale: isFormValid ? 1 : 0.98
            }}
            onClick={handleRegister}
            disabled={!isFormValid || loading}
            className="w-full bg-white text-black font-medium rounded-xl px-6 py-4 mt-4 flex items-center justify-center gap-2 hover:bg-white/90 active:scale-[0.98] smooth-transition"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-black/20 border-t-black rounded-full animate-spin" />
            ) : (
              <>
                Начать
                <ArrowRight className="w-5 h-5" />
              </>
            )}
          </motion.button>
        </div>
      </div>
    </motion.div>
  );
}
