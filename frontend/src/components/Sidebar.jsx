import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { 
  LayoutDashboard, 
  FileText, 
  MessageSquare, 
  Search, 
  User, 
  LogOut,
  Sparkles,
  Zap,
  Target,
  Award,
  X
} from 'lucide-react';
import './Sidebar.css';
import { useState } from 'react';
import { ViewProfileModal } from './ProfileImageModal';

const NAV_ITEMS = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/documents', icon: FileText, label: 'Study Materials' },
  { to: '/chat', icon: MessageSquare, label: 'AI Chat' },
  { to: '/exam-prep', icon: Target, label: 'Exam Prep' },
  { to: '/quiz', icon: Award, label: 'AI Quiz Mode' },
  { to: '/analysis', icon: Search, label: 'Question Analysis' },
  { to: '/profile', icon: User, label: 'Profile' },
];

export default function Sidebar({ isOpen, onClose }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [showViewModal, setShowViewModal] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleNavClick = () => {
    if (onClose) onClose();
  };

  return (
    <>
      {/* Mobile Backdrop Overlay */}
      {isOpen && (
        <div 
          className="sidebar-backdrop" 
          onClick={onClose} 
          aria-hidden="true"
        />
      )}

      <aside className={`sidebar glass-sidebar ${isOpen ? 'mobile-open' : ''}`}>
        {/* Sidebar Header Logo */}
        <div className="sidebar-logo">
          <div className="sidebar-logo-icon">
            <Sparkles className="logo-sparkle" size={20} />
          </div>
          <div className="sidebar-logo-text">
            <span className="logo-brand">SmartDoc</span>
            <span className="logo-badge">AI</span>
          </div>

          {/* Mobile Close Drawer Button */}
          <button 
            className="sidebar-close-btn btn-ghost" 
            onClick={onClose}
            aria-label="Close Navigation"
          >
            <X size={20} />
          </button>
        </div>

        {/* Navigation items */}
        <nav className="sidebar-nav">
          <div className="nav-section-title">ACADEMIC CONSOLE</div>
          {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              onClick={handleNavClick}
              className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
            >
              <Icon className="sidebar-icon" size={18} />
              <span>{label}</span>
              <div className="active-indicator" />
            </NavLink>
          ))}

          {/* Pro / RAG Status Card */}
          <div className="sidebar-promo-card holo-card">
            <div className="promo-header">
              <div className="promo-pulse" />
              <Zap size={15} className="promo-icon" />
              <span>RAG Engine 2.1</span>
            </div>
            <p>High-Speed Neural Vector Intelligence</p>
          </div>
        </nav>

        {/* Sidebar Footer User Info */}
        <div className="sidebar-footer">
          {user && (
            <div 
              className="sidebar-user" 
              onClick={() => setShowViewModal(true)}
              title="Click to view profile photo"
            >
              {user.avatar_url ? (
                <img 
                  src={user.avatar_url} 
                  alt={user.name} 
                  className="sidebar-avatar-img"
                />
              ) : (
                <div className="sidebar-avatar">
                  {user.name?.charAt(0).toUpperCase()}
                </div>
              )}
              <div className="sidebar-user-info">
                <div className="sidebar-user-name">{user.name}</div>
                <div className="sidebar-user-role">{user.role || 'Student'}</div>
              </div>
            </div>
          )}

          <button className="sidebar-logout btn btn-ghost btn-sm" onClick={handleLogout}>
            <LogOut size={16} />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {showViewModal && (
        <ViewProfileModal 
          user={user} 
          onClose={() => setShowViewModal(false)} 
        />
      )}
    </>
  );
}
