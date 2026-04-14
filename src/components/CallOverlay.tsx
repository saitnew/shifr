import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Phone, PhoneOff, Mic, MicOff } from 'lucide-react';
import { useStore } from '../store/useStore';
import Peer from 'peerjs';
import { doc, updateDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';

import { DEFAULT_AVATAR } from '../lib/constants';

export default function CallOverlay() {
  const { currentUser } = useStore();
  const [callState, setCallState] = useState<'idle' | 'calling' | 'receiving' | 'connected'>('idle');
  const [targetUser, setTargetUser] = useState<any>(null);
  const [peer, setPeer] = useState<Peer | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [currentCall, setCurrentCall] = useState<any>(null);
  const [callError, setCallError] = useState<string | null>(null);

  const showError = (msg: string) => {
    setCallError(msg);
    setTimeout(() => setCallError(null), 5000);
  };

  // Listen for wake-up calls from Firestore
  useEffect(() => {
    if (!currentUser || !peer) return;

    const unsub = onSnapshot(doc(db, 'users', currentUser.uid), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.incomingCall && data.incomingCall.timestamp > Date.now() - 10000) {
          // Someone is trying to call us! Wake up PeerJS if it's sleeping
          if (peer.disconnected && !peer.destroyed) {
            console.log("Waking up PeerJS due to incoming call signal...");
            peer.reconnect();
          }
        }
      }
    });

    return () => unsub();
  }, [currentUser, peer]);

  useEffect(() => {
    if (!currentUser) return;

    let newPeer: Peer | null = null;
    let retryTimeout: any;

    const initPeer = () => {
      // Initialize PeerJS with robust STUN servers for VPN/Russia
      newPeer = new Peer(currentUser.uid, {
        config: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun.yandex.ru:3478' }, // Best for Russia
            { urls: 'stun:stun.cloudflare.com:3478' } // Best global fallback
          ]
        },
        pingInterval: 5000, // Keep connection alive through VPNs
        debug: 0
      });

      newPeer.on('open', (id) => {
        console.log('Peer connected:', id);
      });

      // Auto-reconnect if VPN drops or switches
      newPeer.on('disconnected', () => {
        console.log('Peer disconnected, attempting to reconnect...');
        setTimeout(() => {
          if (newPeer && !newPeer.destroyed) {
            newPeer.reconnect();
          }
        }, 1000);
      });

      newPeer.on('error', (err: any) => {
        console.error('PeerJS error:', err.type, err);
        
        if (err.type === 'unavailable-id') {
          console.log('ID is taken (likely a ghost connection). Retrying in 3 seconds...');
          if (newPeer) newPeer.destroy();
          retryTimeout = setTimeout(initPeer, 3000);
        } else if (err.type === 'network' || err.type === 'disconnected' || err.type === 'server-error') {
          // Aggressive reconnect on network errors
          setTimeout(() => {
            if (newPeer && !newPeer.destroyed) {
              newPeer.reconnect();
            }
          }, 2000);
        }
      });

      newPeer.on('call', (call) => {
        setCallState('receiving');
        setCurrentCall(call);
        // We don't know the caller's full info here easily without a signaling server,
        // but for this demo we'll just show "Incoming call"
        setTargetUser({ name: 'Входящий звонок', avatarUrl: DEFAULT_AVATAR });
      });

      setPeer(newPeer);
    };

    initPeer();

    return () => {
      clearTimeout(retryTimeout);
      if (newPeer) {
        newPeer.destroy();
      }
    };
  }, [currentUser]);

  useEffect(() => {
    const handleStartCall = async (e: any) => {
      const { targetUser } = e.detail;
      setTargetUser(targetUser);
      setCallState('calling');

      let stream: MediaStream;
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          throw new Error("Microphone access is not supported in this browser or context (HTTPS required).");
        }
        stream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
        setLocalStream(stream);
      } catch (err: any) {
        console.error('Failed to get local stream:', err);
        showError("Ошибка микрофона: " + (err.message || "Нет доступа. Разрешите микрофон в настройках."));
        setCallState('idle');
        return;
      }

      try {
        if (peer) {
          if (peer.destroyed) {
            showError("Соединение с сервером потеряно. Пожалуйста, перезагрузите приложение.");
            setCallState('idle');
            return;
          }

          if (peer.disconnected) {
            console.log("Peer is disconnected, reconnecting before call...");
            peer.reconnect();
            // Wait a brief moment for reconnection
            await new Promise(resolve => setTimeout(resolve, 1000));
          }

          // Send wake-up signal via Firestore
          try {
            await updateDoc(doc(db, 'users', targetUser.uid), {
              incomingCall: {
                from: currentUser.uid,
                timestamp: Date.now()
              }
            });
            // Give the target a second to wake up
            await new Promise(resolve => setTimeout(resolve, 1500));
          } catch (e) {
            console.error("Failed to send wake-up signal", e);
          }

          const call = peer.call(targetUser.uid, stream);
          
          if (call) {
            setCurrentCall(call);

            call.on('stream', (remoteStream) => {
              setRemoteStream(remoteStream);
              setCallState('connected');
              const audio = new Audio();
              audio.srcObject = remoteStream;
              audio.play().catch(e => console.error("Error playing audio", e));
            });

            call.on('close', () => {
              endCall();
            });
            
            call.on('error', (err: any) => {
              console.error('Call error:', err);
              if (err.type === 'peer-unavailable') {
                showError('Собеседник не в сети или свернул приложение.');
              } else {
                showError('Ошибка звонка: ' + err.message);
              }
              endCall();
            });
          } else {
            console.error("Failed to initiate call. Peer might be disconnected or target is invalid.");
            showError("Не удалось начать звонок. Сервер звонков недоступен.");
            setCallState('idle');
          }
        } else {
          showError("Инициализация звонка... Подождите пару секунд и попробуйте снова.");
          setCallState('idle');
        }
      } catch (err: any) {
        console.error('Failed to initiate call:', err);
        showError("Ошибка соединения: " + (err.message || "Неизвестная ошибка"));
        setCallState('idle');
      }
    };

    window.addEventListener('start-call', handleStartCall);
    return () => window.removeEventListener('start-call', handleStartCall);
  }, [peer]);

  const answerCall = async () => {
    if (!currentCall) return;
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("Microphone access is not supported in this browser or context (HTTPS required).");
      }
      const stream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
      setLocalStream(stream);

      currentCall.answer(stream);
      currentCall.on('stream', (remoteStream: MediaStream) => {
        setRemoteStream(remoteStream);
        setCallState('connected');
        const audio = new Audio();
        audio.srcObject = remoteStream;
        audio.play().catch(e => console.error("Error playing audio", e));
      });
      
      currentCall.on('close', () => {
        endCall();
      });
      
      currentCall.on('error', (err: any) => {
        console.error('Call error:', err);
        showError('Ошибка звонка: ' + err.message);
        endCall();
      });
    } catch (err: any) {
      console.error('Failed to get local stream', err);
      showError("Ошибка микрофона: " + (err.message || "Нет доступа. Разрешите микрофон в настройках телефона для этого приложения."));
      endCall();
    }
  };

  const endCall = () => {
    if (currentCall) {
      currentCall.close();
    }
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
    }
    setLocalStream(null);
    setRemoteStream(null);
    setCurrentCall(null);
    setCallState('idle');
    setTargetUser(null);
  };

  const toggleMute = () => {
    if (localStream) {
      localStream.getAudioTracks().forEach(track => {
        track.enabled = !track.enabled;
      });
      setIsMuted(!isMuted);
    }
  };

  if (callState === 'idle') return null;

  return (
    <AnimatePresence>
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="fixed inset-0 z-[100] bg-background/95 md:backdrop-blur-2xl flex flex-col items-center justify-center hardware-accelerated"
      >
        <div className="relative z-10 flex flex-col items-center justify-center w-full h-full p-8">
          
          {/* Caller Info */}
          <div className="flex flex-col items-center transition-all duration-500">
            <div className="relative mb-6">
              <img 
                src={targetUser?.avatarUrl} 
                alt="" 
                className={`w-32 h-32 rounded-full object-cover shadow-2xl ${callState !== 'connected' ? 'animate-pulse' : ''}`}
              />
            </div>
            <h2 className="text-3xl font-bold text-white mb-2">{targetUser?.name}</h2>
            <p className="text-white/50 text-lg">
              {callState === 'calling' && 'Звонок...'}
              {callState === 'receiving' && 'Входящий звонок...'}
              {callState === 'connected' && 'Разговор'}
            </p>
            
            {callError && (
              <motion.div 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="mt-4 px-4 py-2 bg-danger/20 text-danger-foreground rounded-lg text-sm max-w-xs text-center"
              >
                {callError}
              </motion.div>
            )}
          </div>

          {/* Controls */}
          <div className="flex items-center gap-6 mt-24">
            {callState === 'receiving' ? (
              <>
                <button 
                  onClick={endCall}
                  className="w-16 h-16 rounded-full bg-danger text-white flex items-center justify-center hover:scale-105 active:scale-95 smooth-transition shadow-lg shadow-danger/20"
                >
                  <PhoneOff className="w-6 h-6" />
                </button>
                <button 
                  onClick={answerCall}
                  className="w-16 h-16 rounded-full bg-success text-white flex items-center justify-center hover:scale-105 active:scale-95 smooth-transition shadow-lg shadow-success/20 animate-bounce"
                >
                  <Phone className="w-6 h-6" />
                </button>
              </>
            ) : (
              <>
                <button 
                  onClick={toggleMute}
                  className={`w-14 h-14 rounded-full flex items-center justify-center hover:scale-105 active:scale-95 smooth-transition md:backdrop-blur-md ${isMuted ? 'bg-white text-black' : 'bg-white/10 text-white hover:bg-white/20'}`}
                >
                  {isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
                </button>
                <button 
                  onClick={endCall}
                  className="w-20 h-20 rounded-full bg-danger text-white flex items-center justify-center hover:scale-105 active:scale-95 smooth-transition shadow-2xl shadow-danger/20"
                >
                  <PhoneOff className="w-8 h-8" />
                </button>
              </>
            )}
          </div>

        </div>
      </motion.div>
    </AnimatePresence>
  );
}
