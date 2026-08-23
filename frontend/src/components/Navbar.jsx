import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { Palette, Bell, Sparkles, ChevronDown } from 'lucide-react';
import './Navbar.css';

import { ViewProfileModal } from './ProfileImageModal';

const PAGE_TITLES = {
  '/dashboard': 'Dashboard Overview',
  '/documents': 'Study Materials Repository',
  '/chat': 'RAG Intelligence Chat',
  '/exam-prep': 'Exam Prep & Strategy Hub',
  '/quiz': 'AI Quiz & Question Generator',
  '/analysis': 'Question & Paper Analysis',
  '/profile': 'User Profile & Settings',
};

export default function Navbar() {
  const { pathname } = useLocation();
  const { user } = useAuth();
  const { theme, changeTheme, themes } = useTheme();
  const [themeDropdownOpen, setThemeDropdownOpen] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);

  const title = Object.entries(PAGE_TITLES).find(([path]) => pathname.startsWith(path))?.[1] || 'Smart Doc AI';
  const currentThemeObj = themes.find(t => t.id === theme) || themes[0];

  return (
    <>
      <header className="navbar glass-navbar">
        <div className="navbar-left">
          <h2 className="navbar-title">{title}</h2>
          <div className="navbar-pill">
            <span className="pill-dot" />
            <span>Active Session</span>
          </div>
        </div>

        <div className="navbar-right">
          {/* Theme Switcher Dropdown */}
          <div className="theme-switcher-wrapper">
            <button 
              className="theme-switcher-btn btn btn-secondary btn-sm"
              onClick={() => setThemeDropdownOpen(!themeDropdownOpen)}
            >
              <Palette size={15} style={{ color: currentThemeObj.color }} />
              <span className="theme-name">{currentThemeObj.name}</span>
              <ChevronDown size={14} className={`chevron ${themeDropdownOpen ? 'open' : ''}`} />
            </button>

            {themeDropdownOpen && (
              <div className="theme-dropdown-menu glass-card">
                <div className="dropdown-header">Select Palette Theme</div>
                {themes.map(t => (
                  <button
                    key={t.id}
                    className={`theme-option ${theme === t.id ? 'active' : ''}`}
                    onClick={() => {
                      changeTheme(t.id);
                      setThemeDropdownOpen(false);
                    }}
                  >
                    <span className="theme-icon">{t.icon}</span>
                    <span className="theme-label">{t.name}</span>
                    <span className="theme-dot" style={{ background: t.color }} />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Notifications Mock Bell */}
          <button className="navbar-icon-btn btn btn-ghost btn-sm" title="Notifications">
            <Bell size={18} />
            <span className="notification-badge" />
          </button>

          {/* User Pill */}
          <div className="navbar-user-pill" onClick={() => setShowViewModal(true)} style={{ cursor: 'pointer' }} title="Click to view profile photo">
            {user?.avatar_url ? (
              <img 
                src={user.avatar_url} 
                alt={user.name} 
                style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover' }}
              />
            ) : (
              <div className="user-pill-avatar">
                {user?.name?.charAt(0).toUpperCase()}
              </div>
            )}
            <span className="user-pill-name">Hello, {user?.name?.split(' ')[0]}</span>
          </div>
        </div>
      </header>

      {showViewModal && (
        <ViewProfileModal 
          user={user} 
          onClose={() => setShowViewModal(false)} 
        />
      )}
    </>
  );
}


