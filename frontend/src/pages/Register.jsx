import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Sparkles, User, Mail, Lock, ArrowRight } from 'lucide-react';
import GoogleLoginButton from '../components/GoogleLoginButton';

export default function Register() {
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { register } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (form.password !== form.confirm) return setError('Passwords do not match.');
    setLoading(true);
    try {
      await register(form.name, form.email, form.password);
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.error || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="app-ambient-bg">
        <div className="blob blob-1" />
        <div className="blob blob-2" />
      </div>

      <div className="auth-card glass-card animate-fade-in">
        <div className="auth-logo">
          <div className="auth-logo-icon">
            <Sparkles size={22} className="logo-sparkle" />
          </div>
          <div className="auth-logo-text">
            SmartDoc <span className="logo-badge">AI</span>
          </div>
        </div>

        <h2 style={{ marginBottom: 6 }}>Create Your Account</h2>
        <p style={{ marginBottom: 24, fontSize: '0.9rem', color: 'var(--text-muted)' }}>
          Start indexing research papers and asking AI-driven questions
        </p>

        {error && <div className="alert alert-error" style={{ marginBottom: 16 }}>⚠️ {error}</div>}

        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="input-group">
            <label className="input-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <User size={14} className="text-primary" /> Full Name
            </label>
            <input 
              className="input" 
              type="text" 
              placeholder="Alex Smith" 
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })} 
              required 
            />
          </div>

          <div className="input-group">
            <label className="input-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Mail size={14} className="text-primary" /> Email address
            </label>
            <input 
              className="input" 
              type="email" 
              placeholder="alex@university.edu" 
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })} 
              required 
            />
          </div>

          <div className="input-group">
            <label className="input-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Lock size={14} className="text-primary" /> Password
            </label>
            <input 
              className="input" 
              type="password" 
              placeholder="Min 8 chars, 1 uppercase, 1 digit" 
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })} 
              required 
            />
          </div>

          <div className="input-group">
            <label className="input-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Lock size={14} className="text-primary" /> Confirm Password
            </label>
            <input 
              className="input" 
              type="password" 
              placeholder="Repeat your password" 
              value={form.confirm}
              onChange={(e) => setForm({ ...form, confirm: e.target.value })} 
              required 
            />
          </div>

          <button 
            className="btn btn-primary btn-lg" 
            type="submit" 
            disabled={loading} 
            style={{ width: '100%', marginTop: 8, justifyContent: 'center' }}
          >
            {loading ? (
              <>
                <Sparkles className="spin" size={18} />
                <span>Creating Account...</span>
              </>
            ) : (
              <>
                <span>Create Workspace Account</span>
                <ArrowRight size={18} />
              </>
            )}
          </button>
        </form>

        <div className="auth-divider">
          <span>OR</span>
        </div>

        <GoogleLoginButton text="signup_with" onError={(err) => setError(err)} />

        <div className="auth-footer" style={{ marginTop: 24, textAlign: 'center', fontSize: '0.88rem', color: 'var(--text-muted)' }}>
          Already have an account? <Link to="/login" style={{ fontWeight: 600 }}>Sign in</Link>
        </div>
      </div>
    </div>
  );
}
