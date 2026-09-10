import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { ExternalLink, X, Play, AlertCircle, RefreshCw } from 'lucide-react';

export default function GoogleLoginButton({ text = 'Continue with Google', onError }) {
  const { loginWithGoogle } = useAuth();
  const navigate = useNavigate();
  const [scriptLoaded, setScriptLoaded] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [showSetupModal, setShowSetupModal] = useState(false);
  const [originNotice, setOriginNotice] = useState(false);
  const tokenClientRef = useRef(null);

  const clientId = (import.meta.env.VITE_GOOGLE_CLIENT_ID || '').trim();

  // Load Google Identity Services SDK script if not already loaded
  useEffect(() => {
    if (window.google?.accounts?.oauth2 || window.google?.accounts?.id) {
      setScriptLoaded(true);
      return;
    }

    const existingScript = document.getElementById('google-gsi-script');
    if (existingScript) {
      if (window.google?.accounts?.oauth2 || window.google?.accounts?.id) {
        setScriptLoaded(true);
      } else {
        existingScript.addEventListener('load', () => setScriptLoaded(true));
      }
      return;
    }

    const script = document.createElement('script');
    script.id = 'google-gsi-script';
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => setScriptLoaded(true);
    script.onerror = () => {
      console.warn('Failed to load Google Identity Services SDK script.');
    };
    document.head.appendChild(script);
  }, []);

  // Initialize Google Token Client and GSI once script is ready
  useEffect(() => {
    if (!scriptLoaded || !clientId) return;

    try {
      // 1. Initialize Google OAuth 2.0 Token Client for custom button popups
      if (window.google?.accounts?.oauth2) {
        tokenClientRef.current = window.google.accounts.oauth2.initTokenClient({
          client_id: clientId,
          scope: 'openid email profile',
          callback: async (tokenResponse) => {
            if (tokenResponse.error) {
              setAuthLoading(false);
              if (tokenResponse.error === 'popup_closed_by_user') {
                return;
              }
              const errDesc = tokenResponse.error_description || tokenResponse.error;
              if (String(errDesc).toLowerCase().includes('origin') || tokenResponse.error === 'origin_mismatch') {
                setOriginNotice(true);
              }
              if (onError) onError(`Google sign-in error: ${errDesc}`);
              return;
            }

            if (tokenResponse.access_token) {
              setAuthLoading(true);
              try {
                await loginWithGoogle({ access_token: tokenResponse.access_token });
                navigate('/dashboard');
              } catch (err) {
                const errorMsg = err.response?.data?.error || err.message || 'Google sign-in failed. Please try again.';
                if (onError) onError(errorMsg);
              } finally {
                setAuthLoading(false);
              }
            }
          },
          error_callback: (nonOAuthErr) => {
            setAuthLoading(false);
            const msg = String(nonOAuthErr?.message || nonOAuthErr?.type || '');
            if (msg.toLowerCase().includes('origin') || msg.includes('mismatch')) {
              setOriginNotice(true);
            }
            console.warn('Google Token Client error:', nonOAuthErr);
          },
        });
      }

      // 2. Initialize Google ID Token Client (GSI) for One-Tap / credential callbacks
      if (window.google?.accounts?.id) {
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: async (response) => {
            if (!response?.credential) return;
            setAuthLoading(true);
            try {
              await loginWithGoogle(response.credential);
              navigate('/dashboard');
            } catch (err) {
              const errorMsg = err.response?.data?.error || err.message || 'Google sign-in failed.';
              if (onError) onError(errorMsg);
            } finally {
              setAuthLoading(false);
            }
          },
        });
      }
    } catch (e) {
      console.error('Error initializing Google Sign-In:', e);
    }
  }, [scriptLoaded, clientId]);

  const handleGoogleClick = () => {
    if (!clientId) {
      setShowSetupModal(true);
      return;
    }

    setAuthLoading(true);
    setOriginNotice(false);

    // If token client is ready, request access token
    if (tokenClientRef.current) {
      try {
        tokenClientRef.current.requestAccessToken({ prompt: 'select_account' });
      } catch (err) {
        setAuthLoading(false);
        console.error('Failed to request Google access token:', err);
        if (onError) onError('Could not open Google Sign-In popup. Please allow popups for this site.');
      }
      return;
    }

    // Fallback if tokenClientRef is not ready yet: re-initialize dynamically
    if (window.google?.accounts?.oauth2) {
      try {
        tokenClientRef.current = window.google.accounts.oauth2.initTokenClient({
          client_id: clientId,
          scope: 'openid email profile',
          callback: async (tokenResponse) => {
            if (tokenResponse.access_token) {
              try {
                await loginWithGoogle({ access_token: tokenResponse.access_token });
                navigate('/dashboard');
              } catch (err) {
                const errorMsg = err.response?.data?.error || err.message || 'Google sign-in failed.';
                if (onError) onError(errorMsg);
              } finally {
                setAuthLoading(false);
              }
            } else {
              setAuthLoading(false);
            }
          },
        });
        tokenClientRef.current.requestAccessToken({ prompt: 'select_account' });
        return;
      } catch (err) {
        setAuthLoading(false);
        if (onError) onError('Failed to open Google Sign-In.');
        return;
      }
    }

    // Script still loading fallback
    setTimeout(() => {
      setAuthLoading(false);
      setShowSetupModal(true);
    }, 1000);
  };

  const handleDevDemoLogin = async () => {
    setAuthLoading(true);
    setShowSetupModal(false);
    setOriginNotice(false);
    try {
      await loginWithGoogle('demo_google_token_' + Date.now());
      navigate('/dashboard');
    } catch (err) {
      const errorMsg = err.response?.data?.error || err.message || 'Demo Google sign-in failed.';
      if (onError) onError(errorMsg);
    } finally {
      setAuthLoading(false);
    }
  };

  return (
    <div className="google-auth-container">
      {/* Primary Custom Button Designed for Theme */}
      <button
        type="button"
        className={`google-btn-custom ${authLoading ? 'google-btn-loading' : ''}`}
        onClick={handleGoogleClick}
        disabled={authLoading}
        title="Sign in with your Google account"
      >
        {authLoading ? (
          <>
            <div className="spinner-sm google-spinner" />
            <span>Connecting to Google...</span>
          </>
        ) : (
          <>
            <GoogleIcon />
            <span className="google-btn-text">{text}</span>
          </>
        )}
      </button>

      {/* Origin Notice Banner if localhost:3000 isn't authorized in Google Cloud Console yet */}
      {originNotice && (
        <div className="google-origin-notice animate-fade-in">
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            <AlertCircle size={16} className="text-warning" style={{ flexShrink: 0, marginTop: 2 }} />
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              <span>Origin <code>http://localhost:3000</code> is not registered in Google Cloud Console yet. </span>
              <button 
                type="button" 
                className="google-dev-inline-btn"
                onClick={handleDevDemoLogin}
              >
                Instant Dev Test Login
              </button>
              <span> or </span>
              <button 
                type="button" 
                className="google-dev-inline-btn"
                onClick={() => setShowSetupModal(true)}
              >
                View Setup Steps
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Setup Guide / Dev Mode Modal */}
      {showSetupModal && (
        <div className="modal-backdrop animate-fade-in" onClick={() => setShowSetupModal(false)}>
          <div 
            className="glass-card google-setup-modal" 
            onClick={(e) => e.stopPropagation()}
          >
            <div className="google-modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <GoogleIcon />
                <h3 style={{ margin: 0, fontSize: '1.15rem' }}>Configure Google Authentication</h3>
              </div>
              <button 
                type="button" 
                className="btn-icon" 
                onClick={() => setShowSetupModal(false)}
              >
                <X size={18} />
              </button>
            </div>

            <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', marginBottom: 16 }}>
              To enable live Google Sign-In on <code>http://localhost:3000</code>, follow these quick steps:
            </p>

            <div className="google-steps-list">
              <div className="google-step-item">
                <span className="step-num">1</span>
                <div className="step-content">
                  <strong>Open Google Cloud Credentials</strong>
                  <p>Visit the Credentials page in Google Cloud Console.</p>
                  <a 
                    href="https://console.cloud.google.com/apis/credentials" 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="google-link-out"
                  >
                    <span>Google Cloud Console Credentials</span>
                    <ExternalLink size={13} />
                  </a>
                </div>
              </div>

              <div className="google-step-item">
                <span className="step-num">2</span>
                <div className="step-content">
                  <strong>Add Authorized JavaScript Origin</strong>
                  <p>Select your OAuth 2.0 Web Client and add:</p>
                  <div className="code-snippet">
                    Authorized JavaScript origins: <code>http://localhost:3000</code>
                  </div>
                </div>
              </div>

              <div className="google-step-item">
                <span className="step-num">3</span>
                <div className="step-content">
                  <strong>Save in frontend/.env & backend/.env</strong>
                  <div className="code-snippet">
                    <code>VITE_GOOGLE_CLIENT_ID={clientId || 'your-client-id.apps.googleusercontent.com'}</code>
                  </div>
                </div>
              </div>
            </div>

            <div className="google-modal-footer">
              <div className="google-dev-test-callout">
                <div>
                  <strong style={{ fontSize: '0.9rem', display: 'block', color: 'var(--text-main)' }}>
                    Quick Dev Mode Test
                  </strong>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    Log in instantly with a verified student Google test account
                  </span>
                </div>
                <button 
                  type="button" 
                  className="btn btn-primary"
                  onClick={handleDevDemoLogin}
                  style={{ gap: 8, flexShrink: 0 }}
                >
                  <Play size={14} />
                  <span>Test Login (Dev Mode)</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" className="google-icon" style={{ flexShrink: 0 }}>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
      />
    </svg>
  );
}
