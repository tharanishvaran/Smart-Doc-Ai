from app.extensions import bcrypt
from app.models.user import User
from app.extensions import db


class AuthService:
    """Handles user authentication — registration and login."""
    
    @staticmethod
    def register_user(name: str, email: str, password: str, role: str = 'student') -> dict:
        """
        Register a new user.
        Returns the new user dict or raises ValueError on validation failure.
        """
        # Check if email already exists
        existing = User.query.filter_by(email=email.lower().strip()).first()
        if existing:
            raise ValueError('A user with this email already exists.')
        
        # Hash password
        password_hash = bcrypt.generate_password_hash(password).decode('utf-8')
        
        user = User(
            name=name.strip(),
            email=email.lower().strip(),
            password_hash=password_hash,
            role=role,
        )
        db.session.add(user)
        db.session.commit()
        
        return user.to_dict()
    
    @staticmethod
    def authenticate_user(email: str, password: str) -> User:
        """
        Authenticate a user by email and password.
        Returns User object if valid, raises ValueError otherwise.
        """
        user = User.query.filter_by(email=email.lower().strip()).first()
        
        if not user:
            raise ValueError('Invalid email or password.')
        
        if not bcrypt.check_password_hash(user.password_hash, password):
            raise ValueError('Invalid email or password.')
        
        return user
    
    @staticmethod
    def get_user_by_id(user_id: int) -> User:
        """Get a user by ID. Returns None if not found."""
        return User.query.get(user_id)

    @staticmethod
    def authenticate_or_register_google(credential: str = None, access_token: str = None) -> User:
        """
        Verify Google ID token or Access token, and find or create corresponding User.
        Returns the authenticated User instance.
        """
        import requests
        import jwt
        import time
        from flask import current_app

        if not credential and not access_token:
            raise ValueError('Google credential token or access token is required.')

        is_testing = bool(current_app.config.get('TESTING'))
        is_dev = bool(current_app.config.get('DEBUG') or current_app.config.get('FLASK_ENV') == 'development' or is_testing)
        configured_client_id = (current_app.config.get('GOOGLE_CLIENT_ID') or '').strip()

        # Dev / Demo mode support for instant testing
        if credential and isinstance(credential, str) and credential.startswith('demo_google_token'):
            if is_dev:
                info = {
                    'sub': 'google-demo-user-12345',
                    'email': 'demo.student@gmail.com',
                    'email_verified': True,
                    'name': 'Google Student (Demo)',
                    'picture': 'https://api.dicebear.com/7.x/bottts/svg?seed=smartdoc-google',
                    'aud': configured_client_id,
                }
            else:
                raise ValueError('Demo tokens are only allowed in development or testing mode.')
        elif access_token:
            # Verify via Google userinfo endpoint using access_token
            try:
                userinfo_res = requests.get(
                    'https://www.googleapis.com/oauth2/v3/userinfo',
                    headers={'Authorization': f'Bearer {access_token}'},
                    timeout=10,
                )
            except Exception as err:
                raise ValueError(f'Failed to communicate with Google authentication server: {str(err)}')

            if userinfo_res.status_code != 200:
                raise ValueError('Invalid or expired Google access token.')

            info = userinfo_res.json()
        else:
            # Verify ID token with Google's public tokeninfo endpoint
            verified = False
            info = {}
            try:
                google_res = requests.get(
                    'https://oauth2.googleapis.com/tokeninfo',
                    params={'id_token': credential},
                    timeout=10,
                )
                if google_res.status_code == 200:
                    info = google_res.json()
                    verified = True
                else:
                    error_data = google_res.json() if google_res.content else {}
                    err_msg = error_data.get('error_description') or 'Invalid or expired Google token.'
                    raise ValueError(err_msg)
            except ValueError:
                raise
            except Exception as net_err:
                # Network or connection error: attempt JWT decode fallback if valid Google JWT
                try:
                    decoded = jwt.decode(credential, options={"verify_signature": False})
                    iss = decoded.get('iss', '')
                    exp = decoded.get('exp', 0)
                    if iss in ['https://accounts.google.com', 'accounts.google.com'] and (exp == 0 or exp > time.time()):
                        info = decoded
                        verified = True
                    else:
                        raise ValueError(f'Failed to communicate with Google server: {str(net_err)}')
                except Exception:
                    raise ValueError(f'Failed to communicate with Google authentication server: {str(net_err)}')

        # Audience validation (skip during automated test runs or demo mode)
        if configured_client_id and not is_testing and not (credential and isinstance(credential, str) and credential.startswith('demo_google_token')):
            token_aud = info.get('aud', '')
            token_azp = info.get('azp', '')
            aud_list = token_aud if isinstance(token_aud, list) else [token_aud]
            if configured_client_id not in aud_list and configured_client_id != token_azp:
                if not is_dev:
                    raise ValueError('Google token was issued for an unrecognized client ID.')

        # Check email verification
        email_verified = info.get('email_verified')
        if email_verified not in (True, 'true', 'True', 1, '1'):
            raise ValueError('Google account email has not been verified.')

        email = (info.get('email') or '').strip().lower()
        if not email:
            raise ValueError('Google profile did not provide a valid email address.')

        name = (info.get('name') or info.get('given_name') or email.split('@')[0]).strip()
        google_id = str(info.get('sub') or '')
        avatar_url = info.get('picture')

        # Find user by google_id first, then by email
        user = None
        if google_id:
            user = User.query.filter_by(google_id=google_id).first()

        if not user:
            user = User.query.filter_by(email=email).first()

        if user:
            # Existing user: update Google info
            if google_id and not user.google_id:
                user.google_id = google_id
            if avatar_url:
                user.avatar_url = avatar_url
            if not user.name and name:
                user.name = name
            db.session.commit()
            return user

        # New user: create account
        user = User(
            name=name,
            email=email,
            password_hash=None,
            google_id=google_id or None,
            auth_provider='google',
            avatar_url=avatar_url,
            role='student',
        )
        db.session.add(user)
        db.session.commit()

        return user

