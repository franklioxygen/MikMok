import { create } from "zustand";

type UiState = {
  activeFeedIndex: number;
  isMuted: boolean;
  setActiveFeedIndex: (index: number) => void;
  toggleMute: () => void;
};

export const useUiStore = create<UiState>((set) => ({
  activeFeedIndex: 0,
  isMuted: true,
  setActiveFeedIndex: (index) => {
    set({ activeFeedIndex: index });
  },
  toggleMute: () => {
    set((state) => ({ isMuted: !state.isMuted }));
  }
}));
