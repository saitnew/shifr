import { useState } from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { useStore } from '../store/useStore';
import Sidebar from '../components/Sidebar';
import ChatArea from '../components/ChatArea';
import SettingsModal from '../components/SettingsModal';
import AdminPanelModal from '../components/AdminPanelModal';
import UserProfileModal from '../components/UserProfileModal';
import CallOverlay from '../components/CallOverlay';

export default function MainApp() {
  const { currentUser } = useStore();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isAdminOpen, setIsAdminOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const location = useLocation();

  if (!currentUser) return null;

  const isChatActive = location.pathname.includes('/chat/');

  return (
    <div className="h-screen w-full bg-background flex overflow-hidden text-white">
      {/* Sidebar - hidden on mobile if chat is active */}
      <div className={`w-full md:w-80 flex-shrink-0 h-full ${isChatActive ? 'hidden md:block' : 'block'}`}>
        <Sidebar 
          onOpenSettings={() => setIsSettingsOpen(true)} 
          onOpenAdmin={() => setIsAdminOpen(true)}
        />
      </div>

      {/* Main Chat Area - hidden on mobile if no chat is active */}
      <div className={`flex-1 flex flex-col relative h-full ${!isChatActive ? 'hidden md:flex' : 'flex'}`}>
        <Routes>
          <Route path="/" element={
            <div className="flex-1 flex items-center justify-center flex-col text-white/30">
              <div className="w-24 h-24 bg-white/5 rounded-full flex items-center justify-center mb-6">
                <svg width="40" height="60" viewBox="0 0 24 36" fill="none" xmlns="http://www.w3.org/2000/svg" className="opacity-50">
                  <path d="M7 2L17 2L14 8L18 24L12 34L6 24L10 8L7 2Z" fill="#ffffff"/>
                </svg>
              </div>
              <p className="text-lg font-medium tracking-wide">Выберите чат для начала общения</p>
            </div>
          } />
          <Route path="/chat/:chatId" element={<ChatArea onUserClick={setSelectedUserId} />} />
        </Routes>
      </div>

      {/* Modals */}
      <AnimatePresence>
        {isSettingsOpen && (
          <SettingsModal 
            onClose={() => setIsSettingsOpen(false)} 
          />
        )}
        {isAdminOpen && currentUser.isAdmin && (
          <AdminPanelModal onClose={() => setIsAdminOpen(false)} />
        )}
        {selectedUserId && (
          <UserProfileModal userId={selectedUserId} onClose={() => setSelectedUserId(null)} />
        )}
      </AnimatePresence>

      {/* Call Overlay */}
      <CallOverlay />
    </div>
  );
}
