import { createContext, useContext, useEffect } from 'react';

const ThemeContext = createContext();

export const THEMES = [
  { id: 'white-orange', name: 'Clean White & Flame Orange', icon: '🔥', type: 'light', color: '#F95700' },
];

export function ThemeProvider({ children }) {
  const theme = 'white-orange';

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', 'white-orange');
    document.documentElement.classList.remove('dark');
    document.documentElement.classList.add('light');
    localStorage.setItem('smartdoc_theme', 'white-orange');
  }, []);

  const changeTheme = () => {};

  return (
    <ThemeContext.Provider value={{ theme, changeTheme, themes: THEMES }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
