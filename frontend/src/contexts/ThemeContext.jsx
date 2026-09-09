import { createContext, useContext, useEffect } from 'react';

const ThemeContext = createContext();

export const THEMES = [
  { id: 'pondy-techfix', name: 'PondyTechFix Cyber', icon: '🔥', type: 'dark', color: '#F95700' },
];

export function ThemeProvider({ children }) {
  const theme = 'pondy-techfix';

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', 'pondy-techfix');
    document.documentElement.classList.add('dark');
    localStorage.setItem('smartdoc_theme', 'pondy-techfix');
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
