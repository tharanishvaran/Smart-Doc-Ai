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
    def authenticate_or_register_google(credential: str) -> User:
        """
        Verify Google ID token and find or create corresponding User.
        Returns the authenticated User instance.
        """
        import requests
        from flask import current_app

        if not credential or not isinstance(credential, str):
            raise ValueError('Google credential token is required.')

        # Dev / Demo mode support for instant testing when no Google Client ID is configured yet
        is_dev = current_app.config.get('DEBUG') or current_app.config.get('FLASK_ENV') == 'development'
        if is_dev and credential.startswith('demo_google_token'):
            info = {
                'sub': 'google-demo-user-12345',
                'email': 'demo.student@gmail.com',
                'email_verified': True,
                'name': 'Google Student (Demo)',
                'picture': 'https://api.dicebear.com/7.x/bottts/svg?seed=smartdoc-google',
            }
        else:
            # 1. Verify token with Google's public tokeninfo endpoint
            try:
                google_res = requests.get(
                    'https://oauth2.googleapis.com/tokeninfo',
                    params={'id_token': credential},
                    timeout=10,
                )
            except Exception as err:
                raise ValueError(f'Failed to communicate with Google authentication server: {str(err)}')

            if google_res.status_code != 200:
                error_data = google_res.json() if google_res.content else {}
                err_msg = error_data.get('error_description') or 'Invalid or expired Google token.'
                raise ValueError(err_msg)

            info = google_res.json()

        # 2. Validate token audience against configured GOOGLE_CLIENT_ID if present
        configured_client_id = current_app.config.get('GOOGLE_CLIENT_ID', '').strip()
        token_aud = info.get('aud', '')
        token_azp = info.get('azp', '')
        if configured_client_id and configured_client_id not in [token_aud, token_azp]:
            raise ValueError('Google token was issued for an unrecognized client ID.')

        # 3. Check email verification
        email_verified = info.get('email_verified')
        if email_verified not in (True, 'true', 'True'):
            raise ValueError('Google account email has not been verified.')

        email = (info.get('email') or '').strip().lower()
        if not email:
            raise ValueError('Google profile did not provide a valid email address.')

        name = (info.get('name') or info.get('given_name') or email.split('@')[0]).strip()
        google_id = info.get('sub')
        avatar_url = info.get('picture')

        # 4. Check if user already exists (by google_id first, then by email)
        user = None
        if google_id:
            user = User.query.filter_by(google_id=google_id).first()

        if not user:
            user = User.query.filter_by(email=email).first()

        if user:
            # Existing user: update Google info and update profile picture with Google photo
            if google_id and not user.google_id:
                user.google_id = google_id
            if avatar_url:
                user.avatar_url = avatar_url
            if not user.name and name:
                user.name = name
            db.session.commit()
            return user

        # 5. New user: create account with Google auth provider
        user = User(
            name=name,
            email=email,
            password_hash=None,
            google_id=google_id,
            auth_provider='google',
            avatar_url=avatar_url,
            role='student',
        )
        db.session.add(user)
        db.session.commit()

        return user

