import { NavLink } from 'react-router-dom';
import { 
  LayoutDashboard, 
  FileText, 
  MessageSquare, 
  Target, 
  Award,
  Search,
  User
} from 'lucide-react';
import './MobileBottomNav.css';

const MOBILE_TABS = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Home' },
  { to: '/documents', icon: FileText, label: 'Materials' },
  { to: '/chat', icon: MessageSquare, label: 'AI Chat', highlight: true },
  { to: '/exam-prep', icon: Target, label: 'Exam' },
  { to: '/quiz', icon: Award, label: 'Quiz' },
  { to: '/profile', icon: User, label: 'Profile' },
];

export default function MobileBottomNav() {
  return (
    <nav className="mobile-bottom-nav glass-nav">
      {MOBILE_TABS.map(({ to, icon: Icon, label, highlight }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) => 
            `mobile-tab-item ${isActive ? 'active' : ''} ${highlight ? 'highlight-tab' : ''}`
          }
        >
          <div className="tab-icon-wrapper">
            <Icon size={20} className="tab-icon" />
          </div>
          <span className="tab-label">{label}</span>
          <div className="tab-active-dot" />
        </NavLink>
      ))}
    </nav>
  );
}
