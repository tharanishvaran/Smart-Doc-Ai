import { useState, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { authService } from '../services/authService';
import { AdjustFrameModal, ViewProfileModal } from '../components/ProfileImageModal';
import { 
  User, 
  Mail, 
  Shield, 
  Calendar, 
  Palette, 
  Check, 
  Camera,
  UploadCloud,
  Eye,
  Cpu
} from 'lucide-react';

export default function Profile() {
  const { user, updateUser } = useAuth();
  const { theme, changeTheme, themes } = useTheme();
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState({ text: '', type: '' });
  const [rawImageSrc, setRawImageSrc] = useState(null);
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const fileRef = useRef();

  const handleFileSelected = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      setRawImageSrc(e.target.result);
      setShowAdjustModal(true);
    };
    reader.readAsDataURL(file);
  };

  const handleSaveCroppedAvatar = async (croppedDataUrl) => {
    setUploading(true);
    setMsg({ text: '', type: '' });

    try {
      // 1. Try sending as File object via FormData
      const resBlob = await fetch(croppedDataUrl);
      const blob = await resBlob.blob();
      const file = new File([blob], 'avatar.png', { type: 'image/png' });

      const formData = new FormData();
      formData.append('avatar', file);

      const res = await authService.uploadAvatar(formData);
      const updatedUser = res.data.data.user;
      updateUser(updatedUser);
      setMsg({ text: 'Profile picture frame adjusted & saved successfully!', type: 'success' });
      setShowAdjustModal(false);
    } catch (err) {
      console.warn("FormData crop upload failed, trying base64 JSON payload...", err);
      try {
        const res = await authService.uploadAvatar({ avatar_url: croppedDataUrl });
        const updatedUser = res.data.data.user;
        updateUser(updatedUser);
        setMsg({ text: 'Profile picture frame adjusted & saved successfully!', type: 'success' });
        setShowAdjustModal(false);
      } catch (fallbackErr) {
        setMsg({ text: fallbackErr.response?.data?.error || err.response?.data?.error || 'Failed to save profile picture frame.', type: 'error' });
      }
    } finally {
      setUploading(false);
    }
  };


  return (
    <div className="profile-page animate-fade-in">
      <div className="page-header">
        <h1>User Profile & Workspace Preferences</h1>
        <p>Upload & adjust your circular profile photo frame, view full resolution photo, and customize workspace themes.</p>
      </div>

      <div className="grid-2" style={{ alignItems: 'flex-start' }}>
        {/* User Account Card */}
        <div className="glass-card" style={{ padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
            <div 
              style={{ position: 'relative', cursor: 'pointer', flexShrink: 0 }} 
              onClick={() => setShowViewModal(true)}
              title="Click to view full profile picture"
            >
              {user?.avatar_url ? (
                <img 
                  src={user.avatar_url} 
                  alt={user.name} 
                  style={{
                    width: 76,
                    height: 76,
                    borderRadius: '50%',
                    objectFit: 'cover',
                    border: '3px solid var(--primary)',
                    boxShadow: '0 0 20px var(--primary-glow)'
                  }}
                />
              ) : (
                <div style={{ 
                  width: 76, 
                  height: 76, 
                  background: 'var(--primary-gradient)', 
                  borderRadius: '50%', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center', 
                  fontSize: '2rem', 
                  color: '#fff', 
                  fontWeight: 800,
                  boxShadow: '0 0 20px var(--primary-glow)'
                }}>
                  {user?.name?.charAt(0).toUpperCase()}
                </div>
              )}

              <div 
                style={{
                  position: 'absolute',
                  bottom: 0,
                  right: 0,
                  background: 'var(--primary)',
                  color: '#000',
                  borderRadius: '50%',
                  padding: 6,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.5)'
                }}
                onClick={(e) => { e.stopPropagation(); fileRef.current?.click(); }}
                title="Change & Adjust Frame"
              >
                <Camera size={14} />
              </div>
              <input 
                ref={fileRef} 
                type="file" 
                accept="image/png,image/jpeg,image/webp,image/jpg" 
                hidden 
                onChange={e => {
                  if (e.target.files?.[0]) handleFileSelected(e.target.files[0]);
                  e.target.value = '';
                }}
              />
            </div>

            <div style={{ flex: 1, minWidth: 160 }}>
              <h2 style={{ margin: 0, fontSize: 'clamp(1.15rem, 2.5vw, 1.4rem)', overflowWrap: 'break-word' }}>{user?.name}</h2>
              <span className="badge badge-primary" style={{ marginTop: 6, textTransform: 'capitalize' }}>
                <Shield size={12} /> {user?.role || 'Student'}
              </span>
              
              <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                <button 
                  type="button"
                  className="btn btn-primary btn-sm" 
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                >
                  <UploadCloud size={14} />
                  <span>{uploading ? 'Processing...' : 'Upload & Adjust Frame'}</span>
                </button>
                <button 
                  type="button"
                  className="btn btn-secondary btn-sm" 
                  onClick={() => setShowViewModal(true)}
                >
                  <Eye size={14} />
                  <span>View Image</span>
                </button>
              </div>
            </div>
          </div>

          {msg.text && (
            <div className={`alert alert-${msg.type}`} style={{ marginBottom: 20 }}>
              {msg.type === 'success' ? '✓ ' : '⚠️ '}{msg.text}
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="input-group">
              <label className="input-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <User size={14} className="text-primary" /> Full Name
              </label>
              <input className="input" value={user?.name || ''} readOnly style={{ opacity: 0.9 }} />
            </div>

            <div className="input-group">
              <label className="input-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Mail size={14} className="text-primary" /> Email Address
              </label>
              <input className="input" value={user?.email || ''} readOnly style={{ opacity: 0.9 }} />
            </div>

            <div className="input-group">
              <label className="input-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Calendar size={14} className="text-primary" /> Account Created
              </label>
              <input 
                className="input" 
                value={user?.created_at ? new Date(user.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : 'N/A'} 
                readOnly 
                style={{ opacity: 0.9 }} 
              />
            </div>
          </div>
        </div>

        {/* Theme & Workspace Settings Card */}
        <div className="glass-card" style={{ padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <Palette size={20} className="text-primary" />
            <h3 style={{ margin: 0 }}>Theme & Appearance</h3>
          </div>

          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 16 }}>
            Select a high-contrast theme customized for maximum readability and visual appeal.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10 }}>
            {themes.map(t => (
              <button
                key={t.id}
                onClick={() => changeTheme(t.id)}
                className="glass-card"
                style={{
                  padding: 14,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                  textAlign: 'left',
                  cursor: 'pointer',
                  borderColor: theme === t.id ? 'var(--primary)' : 'var(--border)',
                  background: theme === t.id ? 'var(--primary-subtle)' : 'var(--bg-surface)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '1.2rem' }}>{t.icon}</span>
                  {theme === t.id && <Check size={16} style={{ color: 'var(--primary)' }} />}
                </div>
                <div style={{ fontWeight: 700, fontSize: '0.86rem', color: 'var(--text-main)' }}>{t.name}</div>
                <div style={{ width: '100%', height: 4, borderRadius: 2, background: t.color }} />
              </button>
            ))}
          </div>

          {/* Developer Credit & RAG Overview */}
          <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: '0.86rem', marginBottom: 6, color: 'var(--text-main)', flexWrap: 'wrap' }}>
              <Cpu size={16} className="text-primary" />
              <span>RAG Engine 2.0 • Developed by Tharanish</span>
            </div>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              Vector Store: ChromaDB • Embedding Model: all-MiniLM-L6-v2 • LLM Backend: Gemini 3.5 & Ollama
            </p>
          </div>
        </div>
      </div>

      {/* Frame Adjustment Modal */}
      {showAdjustModal && (
        <AdjustFrameModal
          imageSrc={rawImageSrc}
          onClose={() => setShowAdjustModal(false)}
          onSave={handleSaveCroppedAvatar}
          uploading={uploading}
        />
      )}

      {/* View Profile Image Lightbox Modal */}
      {showViewModal && (
        <ViewProfileModal
          user={user}
          onClose={() => setShowViewModal(false)}
          onChangePhoto={() => fileRef.current?.click()}
        />
      )}
    </div>
  );
}
