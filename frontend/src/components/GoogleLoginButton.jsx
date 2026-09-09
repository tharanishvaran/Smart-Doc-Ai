import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { ExternalLink, X, CheckCircle, Play } from 'lucide-react';

export default function GoogleLoginButton({ text = 'signin_with', onError }) {
  const buttonRef = useRef(null);
  const { loginWithGoogle } = useAuth();
  const { theme } = useTheme();
  const navigate = useNavigate();
  const [scriptLoaded, setScriptLoaded] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [showSetupModal, setShowSetupModal] = useState(false);

  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
  const isDark = theme !== 'light-luxury';

  // Load Google Identity Services script if not already present
  useEffect(() => {
    const existingScript = document.getElementById('google-gsi-script');
    if (existingScript) {
      if (window.google?.accounts?.id) {
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

  const handleCredentialResponse = async (response) => {
    if (!response || !response.credential) {
      if (onError) onError('Google sign-in was cancelled or failed to return credentials.');
      return;
    }

    setAuthLoading(true);
    try {
      await loginWithGoogle(response.credential);
      navigate('/dashboard');
    } catch (err) {
      const errorMsg = err.response?.data?.error || err.message || 'Google sign-in failed. Please try again.';
      if (onError) onError(errorMsg);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleDevDemoLogin = async () => {
    setAuthLoading(true);
    setShowSetupModal(false);
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

  // Render Google button once script and client ID are ready
  useEffect(() => {
    if (!scriptLoaded || !window.google?.accounts?.id || !buttonRef.current || !clientId) {
      return;
    }

    try {
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: handleCredentialResponse,
      });

      // Clear previous button content if re-rendering due to theme change
      buttonRef.current.innerHTML = '';

      window.google.accounts.id.renderButton(buttonRef.current, {
        type: 'standard',
        shape: 'rectangular',
        theme: isDark ? 'filled_black' : 'outline',
        text: text,
        size: 'large',
        logo_alignment: 'left',
        width: buttonRef.current.offsetWidth || 380,
      });
    } catch (e) {
      console.error('Error initializing Google Sign-In button:', e);
    }
  }, [scriptLoaded, clientId, isDark, text]);

  // If client ID is not configured, show styled placeholder button with setup modal trigger
  if (!clientId) {
    return (
      <div className="google-auth-container">
        {authLoading ? (
          <div className="google-auth-loading">
            <div className="spinner-sm" />
            <span>Signing in with Google Demo Account...</span>
          </div>
        ) : (
          <>
            <button
              type="button"
              className="google-btn-custom google-btn-unconfigured"
              onClick={() => setShowSetupModal(true)}
              title="Click to view setup instructions or test Google login"
            >
              <GoogleIcon />
              <span>{text === 'signup_with' ? 'Sign up with Google' : 'Sign in with Google'}</span>
            </button>
            <div className="google-setup-hint-row">
              <span className="google-setup-hint">Client ID not configured</span>
              <button 
                type="button" 
                className="google-setup-link-btn"
                onClick={() => setShowSetupModal(true)}
              >
                Setup Guide / Quick Test
              </button>
            </div>
          </>
        )}

        {showSetupModal && (
          <div className="modal-backdrop animate-fade-in" onClick={() => setShowSetupModal(false)}>
            <div 
              className="glass-card google-setup-modal" 
              onClick={(e) => e.stopPropagation()}
            >
              <div className="google-modal-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <GoogleIcon />
                  <h3 style={{ margin: 0 }}>Configure Google Authentication</h3>
                </div>
                <button 
                  type="button" 
                  className="btn-icon" 
                  onClick={() => setShowSetupModal(false)}
                >
                  <X size={18} />
                </button>
              </div>

              <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: 16 }}>
                Google Sign-In requires an OAuth 2.0 Web Client ID from the Google Cloud Console.
              </p>

              <div className="google-steps-list">
                <div className="google-step-item">
                  <span className="step-num">1</span>
                  <div className="step-content">
                    <strong>Open Google Cloud Credentials</strong>
                    <p>Go to the Google Cloud Console API & Services page.</p>
                    <a 
                      href="https://console.cloud.google.com/apis/credentials" 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className="google-link-out"
                    >
                      <span>Open Google Cloud Console</span>
                      <ExternalLink size={13} />
                    </a>
                  </div>
                </div>

                <div className="google-step-item">
                  <span className="step-num">2</span>
                  <div className="step-content">
                    <strong>Create OAuth Client ID</strong>
                    <p>Click <b>Create Credentials &gt; OAuth client ID</b>, choose <b>Web application</b>, and add:</p>
                    <div className="code-snippet">Authorized JavaScript origins: <code>http://localhost:3000</code></div>
                  </div>
                </div>

                <div className="google-step-item">
                  <span className="step-num">3</span>
                  <div className="step-content">
                    <strong>Paste in frontend/.env</strong>
                    <p>Copy your Client ID and add it to <code>frontend/.env</code>:</p>
                    <div className="code-snippet">
                      <code>VITE_GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com</code>
                    </div>
                  </div>
                </div>
              </div>

              <div className="google-modal-footer">
                <div className="google-dev-test-callout">
                  <span>Want to test the full app flow right now?</span>
                  <button 
                    type="button" 
                    className="btn btn-primary"
                    onClick={handleDevDemoLogin}
                    style={{ gap: 8 }}
                  >
                    <Play size={14} />
                    <span>Test Google Login (Dev Mode)</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="google-auth-container">
      {authLoading && (
        <div className="google-auth-loading">
          <div className="spinner-sm" />
          <span>Authenticating with Google...</span>
        </div>
      )}
      <div 
        ref={buttonRef} 
        className="google-btn-slot"
        style={{ display: authLoading ? 'none' : 'flex', justifyContent: 'center' }} 
      />
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
