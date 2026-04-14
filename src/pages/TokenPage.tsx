import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { CheckCircle2, XCircle, ArrowRight, AlertCircle } from 'lucide-react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { signInAnonymously } from 'firebase/auth';
import { useStore } from '../store/useStore';

const ADMIN_PASSWORD = 'V7x_Kp3-Rq9m_Zw2j-Fn8b_Lt5y-Hc1a_Wd4g-Su6e_Jo0r-Mp9n_Bv3x-Zq7';

export default function TokenPage() {
  const [token, setToken] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const navigate = useNavigate();
  const { setCurrentUser } = useStore();

  const handleGo = async () => {
    const cleanToken = token.trim();
    if (!cleanToken) return;
    
    setStatus('loading');
    setErrorMessage('');

    try {
      // Убеждаемся, что анонимная авторизация прошла успешно перед запросом к БД
      if (!auth.currentUser) {
        await signInAnonymously(auth);
      }

      if (cleanToken === ADMIN_PASSWORD) {
        setStatus('success');
        setTimeout(() => navigate('/register', { state: { isAdmin: true } }), 800);
        return;
      }

      if (cleanToken.length === 15) {
        // Check admin tokens
        const q = query(collection(db, 'adminTokens'), where('value', '==', cleanToken));
        const snapshot = await getDocs(q);
        if (!snapshot.empty) {
          const tokenDoc = snapshot.docs[0];
          const tokenData = tokenDoc.data();
          if (Date.now() < tokenData.expiresAt) {
            setStatus('success');
            setTimeout(() => navigate('/register', { state: { isAdmin: false, tokenId: tokenDoc.id } }), 800);
            return;
          } else {
            setErrorMessage('Срок действия этого токена истёк (прошло 10 минут)');
          }
        } else {
          setErrorMessage('Такой токен-приглашение не найден');
        }
      } else if (cleanToken.length === 20) {
        // Check permanent tokens
        const q = query(collection(db, 'users'), where('permanentToken', '==', cleanToken));
        const snapshot = await getDocs(q);
        if (!snapshot.empty) {
          const userData = snapshot.docs[0].data() as any;
          if (!userData.isBlocked) {
            setStatus('success');
            localStorage.setItem('userId', userData.uid);
            setTimeout(() => {
              setCurrentUser(userData);
              navigate('/app');
            }, 800);
            return;
          } else {
            setErrorMessage('Этот аккаунт заблокирован администратором');
          }
        } else {
          setErrorMessage('Аккаунт с таким токеном не найден в базе данных');
        }
      } else {
        setErrorMessage('Неверный формат токена (должен быть 15 или 20 символов)');
      }

      setStatus('error');
    } catch (e: any) {
      console.error(e);
      setErrorMessage(e.message || 'Произошла ошибка при проверке токена');
      setStatus('error');
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="min-h-screen bg-background flex flex-col items-center justify-center p-4"
    >
      <motion.div 
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
        className="w-full max-w-md flex flex-col items-center"
      >
        {/* The beautiful circle */}
        <div className="w-64 h-64 rounded-full glass-panel flex flex-col items-center justify-center p-8 mb-12 relative overflow-hidden group shadow-2xl shadow-white/5">
          <div className="absolute inset-0 bg-gradient-to-b from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          
          {/* Logo: Black tie on white background */}
          <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center mb-4 shadow-lg">
            <svg width="32" height="48" viewBox="0 0 24 36" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M7 2L17 2L14 8L18 24L12 34L6 24L10 8L7 2Z" fill="#000000"/>
              <path d="M10 8L14 8L12 12L10 8Z" fill="#333333"/>
            </svg>
          </div>
          
          <h1 className="text-3xl font-bold tracking-tight text-white mb-1">Шифр</h1>
          <p className="text-xs text-white/50 uppercase tracking-widest">Мессенджер</p>
        </div>

        <div className="w-full space-y-4">
          <div className="relative">
            <input
              type="text"
              value={token}
              onChange={(e) => {
                setToken(e.target.value);
                if (status === 'error') {
                  setStatus('idle');
                  setErrorMessage('');
                }
              }}
              placeholder="Введите токен"
              className={`w-full bg-surface border rounded-2xl px-6 py-4 text-white placeholder:text-white/30 focus:outline-none focus:ring-1 smooth-transition pr-12 ${
                status === 'error' ? 'border-danger/50 focus:border-danger focus:ring-danger/50' : 'border-white/10 focus:border-white/30 focus:ring-white/30'
              }`}
              onKeyDown={(e) => e.key === 'Enter' && handleGo()}
            />
            <div className="absolute right-4 top-1/2 -translate-y-1/2">
              {status === 'success' && <CheckCircle2 className="w-6 h-6 text-success animate-in zoom-in" />}
              {status === 'error' && <XCircle className="w-6 h-6 text-danger animate-in zoom-in" />}
              {status === 'loading' && <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />}
            </div>
          </div>

          {errorMessage && (
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-2 text-danger text-sm bg-danger/10 p-3 rounded-xl">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <p>{errorMessage}</p>
            </motion.div>
          )}

          <button
            onClick={handleGo}
            disabled={!token.trim() || status === 'loading'}
            className="w-full bg-white text-black font-medium rounded-2xl px-6 py-4 flex items-center justify-center gap-2 hover:bg-white/90 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none smooth-transition"
          >
            Поехали
            <ArrowRight className="w-5 h-5" />
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
