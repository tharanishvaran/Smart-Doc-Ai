from app.extensions import db
from datetime import datetime


class User(db.Model):
    """User model for student accounts."""
    
    __tablename__ = 'users'
    
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    email = db.Column(db.String(150), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(255), nullable=True)
    role = db.Column(db.String(20), nullable=False, default='student')  # student, admin
    avatar_url = db.Column(db.Text, nullable=True)
    google_id = db.Column(db.String(100), unique=True, nullable=True, index=True)
    auth_provider = db.Column(db.String(50), nullable=False, default='local')  # local, google
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    documents = db.relationship('Document', backref='owner', lazy='dynamic', cascade='all, delete-orphan')
    chat_sessions = db.relationship('ChatSession', backref='student', lazy='dynamic', cascade='all, delete-orphan')
    
    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'email': self.email,
            'role': self.role,
            'avatar_url': self.avatar_url,
            'auth_provider': self.auth_provider,
            'created_at': self.created_at.isoformat(),
        }

    
    def __repr__(self):
        return f'<User {self.email}>'
