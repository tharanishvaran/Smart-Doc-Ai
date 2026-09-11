import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Menu } from 'lucide-react';
import './Navbar.css';

import { ViewProfileModal } from './ProfileImageModal';
import UserAvatar from './UserAvatar';

const PAGE_TITLES = {
  '/dashboard': 'Dashboard Overview',
  '/documents': 'Study Materials Repository',
  '/chat': 'RAG Intelligence Chat',
  '/exam-prep': 'Exam Prep & Strategy Hub',
  '/quiz': 'AI Quiz & Question Generator',
  '/analysis': 'Question & Paper Analysis',
  '/profile': 'User Profile & Settings',
};

export default function Navbar({ onToggleSidebar }) {
  const { pathname } = useLocation();
  const { user } = useAuth();
  const [showViewModal, setShowViewModal] = useState(false);

  const title = Object.entries(PAGE_TITLES).find(([path]) => pathname.startsWith(path))?.[1] || 'Smart Doc AI';

  return (
    <>
      <header className="navbar glass-navbar">
        <div className="navbar-left">
          <button 
            className="mobile-hamburger-btn btn btn-ghost btn-sm" 
            onClick={onToggleSidebar}
            aria-label="Toggle menu"
          >
            <Menu size={20} />
          </button>
          <h2 className="navbar-title">{title}</h2>
          <div className="navbar-pill">
            <span className="pill-dot" />
            <span>Active Session</span>
          </div>
        </div>

        <div className="navbar-right">
          {/* User Pill */}
          <div className="navbar-user-pill" onClick={() => setShowViewModal(true)} style={{ cursor: 'pointer' }} title="Click to view profile photo">
            <UserAvatar 
              user={user} 
              size={28} 
              className="user-pill-avatar"
            />
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


