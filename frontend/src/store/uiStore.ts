import { create } from "zustand";

type UiState = {
  activeFeedIndex: number;
  feedControlsVisible: boolean;
  isMuted: boolean;
  setFeedControlsVisible: (visible: boolean) => void;
  setActiveFeedIndex: (index: number) => void;
  toggleMute: () => void;
};

export const useUiStore = create<UiState>((set) => ({
  activeFeedIndex: 0,
  feedControlsVisible: true,
  isMuted: true,
  setFeedControlsVisible: (visible) => {
    set({ feedControlsVisible: visible });
  },
  setActiveFeedIndex: (index) => {
    set({ activeFeedIndex: index });
  },
  toggleMute: () => {
    set((state) => ({ isMuted: !state.isMuted }));
  }
}));
