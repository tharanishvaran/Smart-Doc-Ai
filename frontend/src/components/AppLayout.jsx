import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Navbar from './Navbar';
import MobileBottomNav from './MobileBottomNav';

export default function AppLayout() {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  return (
    <div className="app-layout">
      {/* Dynamic Ambient Background Blobs */}
      <div className="app-ambient-bg">
        <div className="blob blob-1" />
        <div className="blob blob-2" />
      </div>

      <Sidebar 
        isOpen={mobileSidebarOpen} 
        onClose={() => setMobileSidebarOpen(false)} 
      />
      
      <Navbar 
        onToggleSidebar={() => setMobileSidebarOpen(prev => !prev)} 
      />

      <main className="main-content">
        <div className="page-container animate-fade-in">
          <Outlet />
        </div>
      </main>

      <MobileBottomNav />
    </div>
  );
}
