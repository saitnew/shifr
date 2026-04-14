import { create } from 'zustand';

interface User {
  uid: string;
  name: string;
  username: string;
  avatarUrl: string;
  isInvisible: boolean;
  isAdmin: boolean;
  isBlocked: boolean;
  permanentToken: string;
  createdAt: string;
  password?: string; // We store it hashed or just plain for this demo if needed, but better hashed
}

interface AppState {
  currentUser: User | null;
  setCurrentUser: (user: User | null) => void;
  activeChatId: string | null;
  setActiveChatId: (id: string | null) => void;
}

export const useStore = create<AppState>((set) => ({
  currentUser: null,
  setCurrentUser: (user) => set({ currentUser: user }),
  activeChatId: null,
  setActiveChatId: (id) => set({ activeChatId: id }),
}));
