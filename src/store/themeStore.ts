import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type LattTheme = 'original' | 'cosmic' | 'hematomas' | 'digital' | 'thunderstorm' | 'twilight';

interface ThemeState {
  theme: LattTheme;
  setTheme: (theme: LattTheme) => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: 'original',
      setTheme: (theme) => {
        // Apply class to body for global CSS targeting
        document.documentElement.classList.remove('theme-original', 'theme-cosmic', 'theme-hematomas', 'theme-digital', 'theme-thunderstorm', 'theme-twilight');
        document.documentElement.classList.add(`theme-${theme}`);
        set({ theme });
      },
    }),
    {
      name: 'latt-theme-storage',
    }
  )
);
