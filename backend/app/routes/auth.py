from flask import Blueprint, request
from flask_jwt_extended import create_access_token, jwt_required, get_jwt_identity

from app.services.auth_service import AuthService
from app.utils.validators import validate_email, validate_password, validate_name
from app.utils.error_handlers import success_response, error_response

auth_bp = Blueprint('auth', __name__)


@auth_bp.route('/register', methods=['POST'])
def register():
    """Register a new student account."""
    data = request.get_json()

    if not data:
        return error_response('Request body is required.', 400)

    name = data.get('name', '').strip()
    email = data.get('email', '').strip()
    password = data.get('password', '')

    # Validate inputs
    valid_name, name_err = validate_name(name)
    if not valid_name:
        return error_response(name_err, 400)

    if not validate_email(email):
        return error_response('Invalid email address.', 400)

    valid_pwd, pwd_err = validate_password(password)
    if not valid_pwd:
        return error_response(pwd_err, 400)

    try:
        user_dict = AuthService.register_user(name, email, password)
        access_token = create_access_token(identity=str(user_dict['id']))
        return success_response(
            data={'user': user_dict, 'access_token': access_token},
            message='Account created successfully.',
            status_code=201,
        )
    except ValueError as e:
        return error_response(str(e), 409)
    except Exception as e:
        return error_response('Registration failed. Please try again.', 500)


@auth_bp.route('/login', methods=['POST'])
def login():
    """Authenticate user and return JWT token."""
    data = request.get_json()

    if not data:
        return error_response('Request body is required.', 400)

    email = data.get('email', '').strip()
    password = data.get('password', '')

    if not email or not password:
        return error_response('Email and password are required.', 400)

    try:
        user = AuthService.authenticate_user(email, password)
        access_token = create_access_token(identity=str(user.id))
        return success_response(
            data={'user': user.to_dict(), 'access_token': access_token},
            message='Login successful.',
        )
    except ValueError as e:
        return error_response(str(e), 401)
    except Exception:
        return error_response('Login failed. Please try again.', 500)


@auth_bp.route('/google-config', methods=['GET'])
def google_config():
    """Return public Google OAuth Client ID for frontend initialization."""
    from flask import current_app
    import os
    cid = current_app.config.get('GOOGLE_CLIENT_ID') or os.getenv('GOOGLE_CLIENT_ID', '')
    return success_response(data={'client_id': cid})


@auth_bp.route('/google', methods=['POST'])
def google_auth():
    """Authenticate or register user using Google OAuth ID token or access token."""
    data = request.get_json()

    if not data:
        return error_response('Request body is required.', 400)

    credential = data.get('credential') or data.get('id_token') or data.get('token')
    access_token = data.get('access_token')
    if not credential and not access_token:
        return error_response('Google credential token or access token is required.', 400)

    try:
        user = AuthService.authenticate_or_register_google(credential=credential, access_token=access_token)
        access_token_jwt = create_access_token(identity=str(user.id))
        return success_response(
            data={'user': user.to_dict(), 'access_token': access_token_jwt},
            message='Google authentication successful.',
        )
    except ValueError as e:
        return error_response(str(e), 401)
    except Exception as e:
        return error_response('Google authentication failed. Please try again.', 500)


@auth_bp.route('/me', methods=['GET'])
@jwt_required()
def me():
    """Get the currently authenticated user's profile."""
    user_id = int(get_jwt_identity())
    user = AuthService.get_user_by_id(user_id)

    if not user:
        return error_response('User not found.', 404)

    return success_response(data={'user': user.to_dict()})


@auth_bp.route('/profile/avatar', methods=['POST'])
@jwt_required()
def upload_avatar():
    """Upload or update profile picture avatar."""
    user_id = int(get_jwt_identity())
    from app.models.user import User
    from app.extensions import db
    user = User.query.get(user_id)

    if not user:
        return error_response('User not found.', 404)

    # 1. Handle multipart file upload
    if 'avatar' in request.files:
        file = request.files['avatar']
        if file and file.filename != '':
            try:
                import io
                import base64
                from PIL import Image

                image_bytes = file.read()
                if not image_bytes:
                    return error_response('Uploaded avatar file is empty.', 400)

                # Open with Pillow to validate and compress
                try:
                    img = Image.open(io.BytesIO(image_bytes))
                    if img.mode in ('RGBA', 'LA', 'P'):
                        # Keep RGBA for transparency
                        img = img.convert('RGBA')
                        out_buffer = io.BytesIO()
                        img.thumbnail((400, 400), Image.Resampling.LANCZOS)
                        img.save(out_buffer, format='PNG', optimize=True)
                        encoded = base64.b64encode(out_buffer.getvalue()).decode('utf-8')
                        user.avatar_url = f"data:image/png;base64,{encoded}"
                    else:
                        img = img.convert('RGB')
                        out_buffer = io.BytesIO()
                        img.thumbnail((400, 400), Image.Resampling.LANCZOS)
                        img.save(out_buffer, format='JPEG', quality=90, optimize=True)
                        encoded = base64.b64encode(out_buffer.getvalue()).decode('utf-8')
                        user.avatar_url = f"data:image/jpeg;base64,{encoded}"
                except Exception:
                    # Fallback to direct base64 encoding if Pillow fails
                    encoded = base64.b64encode(image_bytes).decode('utf-8')
                    mime = file.mimetype or 'image/jpeg'
                    user.avatar_url = f"data:{mime};base64,{encoded}"

                db.session.commit()
                return success_response(data={'user': user.to_dict()}, message='Avatar updated successfully.')
            except Exception as e:
                db.session.rollback()
                return error_response(f'Failed to process avatar image: {str(e)}', 500)

    # 2. Handle base64 string or URL JSON payload
    data = request.get_json(silent=True) or {}
    avatar_url = data.get('avatar_url')
    if avatar_url and isinstance(avatar_url, str) and avatar_url.strip():
        user.avatar_url = avatar_url.strip()
        db.session.commit()
        return success_response(data={'user': user.to_dict()}, message='Avatar updated successfully.')

    return error_response('No image file or avatar URL provided.', 400)


