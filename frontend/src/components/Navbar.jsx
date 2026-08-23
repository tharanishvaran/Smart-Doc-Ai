import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { Palette, Bell, Sparkles, ChevronDown, Menu, Zap } from 'lucide-react';
import './Navbar.css';
import { ViewProfileModal } from './ProfileImageModal';

const PAGE_TITLES = {
  '/dashboard': 'Command Center',
  '/documents': 'Study Repository',
  '/chat': 'Academic Intelligence Chat',
  '/exam-prep': 'Exam Strategy & Prep',
  '/quiz': 'Interactive AI Quiz Hub',
  '/analysis': 'Question Paper Analysis',
  '/profile': 'Profile & Settings',
};

export default function Navbar({ onToggleSidebar }) {
  const { pathname } = useLocation();
  const { user } = useAuth();
  const { theme, changeTheme, themes } = useTheme();
  const [themeDropdownOpen, setThemeDropdownOpen] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);

  const title = Object.entries(PAGE_TITLES).find(([path]) => pathname.startsWith(path))?.[1] || 'SmartDoc AI';
  const currentThemeObj = themes.find(t => t.id === theme) || themes[0];

  return (
    <>
      <header className="navbar glass-navbar">
        <div className="navbar-left">
          {/* Mobile Hamburger Menu Toggle */}
          <button 
            className="mobile-menu-btn btn-ghost" 
            onClick={onToggleSidebar}
            aria-label="Open Navigation"
          >
            <Menu size={22} />
          </button>

          <div className="navbar-title-group">
            <h2 className="navbar-title">{title}</h2>
            <div className="navbar-pill">
              <span className="pill-dot" />
              <span>RAG Engine Online</span>
            </div>
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
                <div className="dropdown-header">CYBER & AURORA PALETTES</div>
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
                    <span className="theme-dot" style={{ background: t.color, boxShadow: `0 0 8px ${t.color}` }} />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* User Pill */}
          <div 
            className="navbar-user-pill" 
            onClick={() => setShowViewModal(true)} 
            title="Click to view profile photo"
          >
            {user?.avatar_url ? (
              <img 
                src={user.avatar_url} 
                alt={user.name} 
                className="user-pill-avatar-img"
              />
            ) : (
              <div className="user-pill-avatar">
                {user?.name?.charAt(0).toUpperCase()}
              </div>
            )}
            <span className="user-pill-name">{user?.name?.split(' ')[0]}</span>
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
