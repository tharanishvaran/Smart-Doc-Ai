import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Navbar from './Navbar';

export default function AppLayout() {
  return (
    <div className="app-layout">
      {/* Dynamic Ambient Background Blobs */}
      <div className="app-ambient-bg">
        <div className="blob blob-1" />
        <div className="blob blob-2" />
      </div>

      <Sidebar />
      <Navbar />

      <main className="main-content">
        <div className="page-container animate-fade-in">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
