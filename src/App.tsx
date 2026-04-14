/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { auth, db } from './lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { useStore } from './store/useStore';
import TokenPage from './pages/TokenPage';
import RegistrationPage from './pages/RegistrationPage';
import MainApp from './pages/MainApp';
import { AnimatePresence, motion } from 'motion/react';

export default function App() {
  const [isAuthReady, setIsAuthReady] = useState(false);
  const { currentUser, setCurrentUser } = useStore();

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (user) {
        // Check if we have a saved userId in localStorage
        const savedUserId = localStorage.getItem('userId');
        if (savedUserId) {
          try {
            const userDoc = await getDoc(doc(db, 'users', savedUserId));
            if (userDoc.exists()) {
              setCurrentUser(userDoc.data() as any);
            } else {
              localStorage.removeItem('userId');
            }
          } catch (e) {
            console.error(e);
          }
        }
      }
      // Small delay to ensure smooth transition out of loading screen
      setTimeout(() => setIsAuthReady(true), 100);
    });
    return () => unsubscribe();
  }, [setCurrentUser]);

  if (!isAuthReady) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center overflow-hidden">
        <motion.div 
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 1.1, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 400, damping: 25 }}
          className="flex flex-col items-center gap-6 hardware-accelerated"
        >
          <div className="relative w-24 h-24 flex items-center justify-center">
            <motion.div 
              className="absolute inset-0 border-2 border-white/10 rounded-full"
            />
            <motion.div 
              className="absolute inset-0 border-2 border-white rounded-full border-t-transparent"
              animate={{ rotate: 360 }}
              transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
            />
            <motion.div 
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.2, type: 'spring', stiffness: 500, damping: 20 }}
            >
              <svg width="24" height="36" viewBox="0 0 24 36" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M7 2L17 2L14 8L18 24L12 34L6 24L10 8L7 2Z" fill="#ffffff"/>
              </svg>
            </motion.div>
          </div>
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="text-white/40 text-xs font-bold tracking-[0.3em] uppercase"
          >
            Шифр
          </motion.div>
        </motion.div>
      </div>
    );
  }

  return (
    <HashRouter>
      <AnimatePresence mode="wait">
        <Routes>
          <Route path="/" element={currentUser ? <Navigate to="/app" /> : <TokenPage />} />
          <Route path="/register" element={currentUser ? <Navigate to="/app" /> : <RegistrationPage />} />
          <Route path="/app/*" element={currentUser ? <MainApp /> : <Navigate to="/" />} />
        </Routes>
      </AnimatePresence>
    </HashRouter>
  );
}
