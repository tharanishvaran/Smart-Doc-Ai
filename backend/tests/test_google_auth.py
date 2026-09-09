import os
os.environ['DATABASE_URL'] = 'sqlite:///test_google_auth.db'
os.environ['FLASK_ENV'] = 'testing'

import pytest
from unittest.mock import patch
from app import create_app
from app.extensions import db as _db
from app.models.user import User


@pytest.fixture(scope='session')
def app():
    test_app = create_app()
    test_app.config.update({
        'TESTING': True,
        'JWT_SECRET_KEY': 'test-jwt-secret-key',
    })
    return test_app


@pytest.fixture(scope='function', autouse=True)
def clean_db(app):
    with app.app_context():
        _db.create_all()
        yield
        _db.session.remove()
        _db.drop_all()


@pytest.fixture
def client(app):
    return app.test_client()


class MockGoogleResponse:
    def __init__(self, status_code, json_data):
        self.status_code = status_code
        self._json_data = json_data
        self.content = b'mock'

    def json(self):
        return self._json_data


def test_google_auth_missing_credential(client):
    """Test that missing credential or empty payload returns 400."""
    res1 = client.post('/api/auth/google', json={})
    assert res1.status_code == 400
    assert 'required' in res1.get_json()['error'].lower()

    res2 = client.post('/api/auth/google', json={'other': 'field'})
    assert res2.status_code == 400
    assert 'credential' in res2.get_json()['error'].lower()


def test_google_auth_invalid_token(client):
    """Test that Google rejecting the token returns 401."""
    with patch('requests.get') as mock_get:
        mock_get.return_value = MockGoogleResponse(
            400,
            {'error_description': 'Invalid Value'}
        )
        res = client.post('/api/auth/google', json={'credential': 'invalid_token_123'})
        assert res.status_code == 401
        assert 'invalid' in res.get_json()['error'].lower()


def test_google_auth_new_user_success(client, app):
    """Test successful Google sign-up / login creates a new student user."""
    mock_payload = {
        'sub': 'google-uid-10001',
        'email': 'googlestudent@university.edu',
        'email_verified': True,
        'name': 'Google Scholar',
        'picture': 'https://lh3.googleusercontent.com/a/mockavatar',
        'aud': '',
    }

    with patch('requests.get') as mock_get:
        mock_get.return_value = MockGoogleResponse(200, mock_payload)
        res = client.post('/api/auth/google', json={'credential': 'valid_google_jwt'})
        assert res.status_code == 200
        data = res.get_json()['data']
        assert 'access_token' in data
        assert data['user']['email'] == 'googlestudent@university.edu'
        assert data['user']['name'] == 'Google Scholar'
        assert data['user']['auth_provider'] == 'google'

    # Verify user exists in database
    with app.app_context():
        user = User.query.filter_by(email='googlestudent@university.edu').first()
        assert user is not None
        assert user.google_id == 'google-uid-10001'
        assert user.password_hash is None


def test_google_auth_existing_user_linking(client, app):
    """Test that an existing local user can authenticate with Google by matching email."""
    # First register local user
    client.post('/api/auth/register', json={
        'name': 'Existing Student',
        'email': 'existing@college.edu',
        'password': 'Password123',
    })

    mock_payload = {
        'sub': 'google-uid-20002',
        'email': 'existing@college.edu',
        'email_verified': True,
        'name': 'Existing Student',
        'picture': 'https://lh3.googleusercontent.com/a/existingavatar',
        'aud': '',
    }

    with patch('requests.get') as mock_get:
        mock_get.return_value = MockGoogleResponse(200, mock_payload)
        res = client.post('/api/auth/google', json={'credential': 'valid_token_for_existing'})
        assert res.status_code == 200
        data = res.get_json()['data']
        assert data['user']['email'] == 'existing@college.edu'

    # Verify database record is linked with google_id
    with app.app_context():
        user = User.query.filter_by(email='existing@college.edu').first()
        assert user is not None
        assert user.google_id == 'google-uid-20002'
