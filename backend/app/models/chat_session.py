from app.extensions import db
from datetime import datetime


class ChatSession(db.Model):
    """Chat session model — groups related chat messages."""
    
    __tablename__ = 'chat_sessions'
    
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True)
    title = db.Column(db.String(255), nullable=False, default='New Chat')
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    messages = db.relationship('ChatMessage', backref='session', lazy='dynamic', cascade='all, delete-orphan', order_by='ChatMessage.created_at')
    
    def to_dict(self, include_messages=False):
        data = {
            'id': self.id,
            'user_id': self.user_id,
            'title': self.title,
            'created_at': self.created_at.isoformat(),
            'updated_at': self.updated_at.isoformat(),
        }
        if include_messages:
            # Query messages once; use len() instead of extra count() query; skip source joins
            msgs = self.messages.all()
            data['message_count'] = len(msgs)
            data['messages'] = [m.to_dict(include_sources=False) for m in msgs]
        else:
            data['message_count'] = self.messages.count()
        return data
    
    def __repr__(self):
        return f'<ChatSession {self.id}: {self.title}>'
