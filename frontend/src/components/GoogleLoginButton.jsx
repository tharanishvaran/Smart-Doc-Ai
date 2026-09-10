import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { AlertCircle, ArrowRight } from 'lucide-react';

const DEFAULT_CLIENT_ID = '350905128338-qc9ef2ako2d3h61leogc6rl6esrerunj.apps.googleusercontent.com';

export default function GoogleLoginButton({ text = 'Continue with Google', onError }) {
  const { loginWithGoogle } = useAuth();
  const navigate = useNavigate();
  const [scriptLoaded, setScriptLoaded] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [originNotice, setOriginNotice] = useState(false);
  const tokenClientRef = useRef(null);

  const clientId = (import.meta.env.VITE_GOOGLE_CLIENT_ID || DEFAULT_CLIENT_ID).trim();

  // Check and load Google Identity Services SDK
  useEffect(() => {
    if (window.google?.accounts?.oauth2 || window.google?.accounts?.id) {
      setScriptLoaded(true);
      return;
    }

    const checkInterval = setInterval(() => {
      if (window.google?.accounts?.oauth2 || window.google?.accounts?.id) {
        setScriptLoaded(true);
        clearInterval(checkInterval);
      }
    }, 200);

    const timer = setTimeout(() => clearInterval(checkInterval), 4000);

    return () => {
      clearInterval(checkInterval);
      clearTimeout(timer);
    };
  }, []);

  // Initialize Google Token Client once script is ready
  useEffect(() => {
    if (!scriptLoaded || !clientId) return;

    try {
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
              const errStr = String(errDesc).toLowerCase();
              if (errStr.includes('origin') || tokenResponse.error === 'origin_mismatch') {
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
                const errorMsg = err.response?.data?.error || err.message || 'Google sign-in failed.';
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
          },
        });
      }

      // Initialize Google ID Token Client (GSI)
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
      console.warn('Error initializing Google Sign-In client:', e);
    }
  }, [scriptLoaded, clientId, loginWithGoogle, navigate, onError]);

  const handleGoogleClick = () => {
    setOriginNotice(false);
    setAuthLoading(true);

    // If client is already ready, request access token immediately
    if (tokenClientRef.current) {
      try {
        tokenClientRef.current.requestAccessToken({ prompt: 'select_account' });
      } catch (err) {
        setAuthLoading(false);
        console.error('Failed to open Google popup:', err);
        if (onError) onError('Could not open Google Sign-In popup. Please allow popups.');
      }
      return;
    }

    // Try re-initializing dynamically if window.google is ready
    if (window.google?.accounts?.oauth2) {
      try {
        const client = window.google.accounts.oauth2.initTokenClient({
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
          error_callback: () => {
            setAuthLoading(false);
            setOriginNotice(true);
          }
        });
        tokenClientRef.current = client;
        client.requestAccessToken({ prompt: 'select_account' });
        return;
      } catch (e) {
        setAuthLoading(false);
        setOriginNotice(true);
        return;
      }
    }

    // If Google SDK is blocked or taking time, offer test login without any black screen
    setTimeout(() => {
      setAuthLoading(false);
      setOriginNotice(true);
    }, 1500);
  };

  const handleDevDemoLogin = async () => {
    setAuthLoading(true);
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
    <div className="google-auth-container" style={{ width: '100%' }}>
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

      {/* Clean inline origin/demo banner (NO full-screen modal or black backdrop) */}
      {originNotice && (
        <div className="google-origin-notice animate-fade-in" style={{
          marginTop: 10,
          padding: '10px 14px',
          background: 'var(--bg-surface, #F8FAFC)',
          border: '1px solid var(--border, #E2E8F0)',
          borderRadius: 'var(--radius-sm, 8px)',
          fontSize: '0.84rem'
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            <AlertCircle size={16} className="text-warning" style={{ flexShrink: 0, marginTop: 2 }} />
            <div style={{ color: 'var(--text-muted)' }}>
              <span>Google origin check pending for this domain. </span>
              <button
                type="button"
                className="google-dev-inline-btn"
                onClick={handleDevDemoLogin}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--primary, #F95700)',
                  fontWeight: 700,
                  cursor: 'pointer',
                  padding: 0,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4
                }}
              >
                Instant Student Sign-In <ArrowRight size={12} />
              </button>
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
