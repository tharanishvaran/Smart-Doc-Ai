from flask import Blueprint, request
from flask_jwt_extended import jwt_required, get_jwt_identity

from app.extensions import db
from app.models.chat_session import ChatSession
from app.models.chat_message import ChatMessage
from app.services.rag_service import RAGService
from app.utils.error_handlers import success_response, error_response

chat_bp = Blueprint('chat', __name__)
rag_service = RAGService()


@chat_bp.route('/diag-ask', methods=['GET', 'POST'])
def diag_ask_endpoint():
    steps = []
    try:
        steps.append("1. Creating GeminiService")
        from app.services.gemini_service import GeminiService
        gs = GeminiService()
        
        steps.append("2. Calling Gemini generate_answer directly")
        ans = gs.generate_answer(context="Java is a programming language", question="what is java")
        steps.append(f"3. Gemini responded: {ans[:60]}...")
        
        steps.append("4. Testing VectorService")
        from app.services.vector_service import VectorService
        vs = VectorService()
        res = vs.query([0.01]*768, user_id=1)
        steps.append(f"5. VectorService query returned: {len(res)} chunks")
        
        steps.append("6. Testing RAGService")
        from app.models.user import User
        from app.models.chat_session import ChatSession
        u = User.query.first()
        if not u:
            u = User(email="diag_user@example.com", name="Diag User")
            u.set_password("Pass123!")
            db.session.add(u)
            db.session.commit()
        
        s = ChatSession(user_id=u.id, title="Diag Test")
        db.session.add(s)
        db.session.commit()
        steps.append(f"7. ChatSession created (id={s.id})")
        
        rag_res = rag_service.answer_question(
            question="what is java",
            user_id=u.id,
            session_id=s.id,
            explanation_mode="normal",
            language="English"
        )
        steps.append(f"8. RAG completed successfully: {rag_res.get('answer')[:60]}...")
        return success_response(data={'steps': steps, 'answer': rag_res.get('answer')})
    except Exception as e:
        import traceback
        return error_response(f"Step failed: {steps[-1] if steps else 'init'} | Error: {str(e)} | Trace: {traceback.format_exc()}", 500)




# ─── Chat Sessions ─────────────────────────────────────────────────────────────

@chat_bp.route('/sessions', methods=['GET'])
@jwt_required()
def list_sessions():
    """Get all chat sessions for the authenticated user."""
    user_id = int(get_jwt_identity())
    sessions = (
        ChatSession.query
        .filter_by(user_id=user_id)
        .order_by(ChatSession.updated_at.desc())
        .all()
    )
    return success_response(data={'sessions': [s.to_dict() for s in sessions]})


@chat_bp.route('/sessions', methods=['POST'])
@jwt_required()
def create_session():
    """Create a new chat session."""
    user_id = int(get_jwt_identity())
    data = request.get_json() or {}
    title = data.get('title', 'New Chat').strip() or 'New Chat'

    session = ChatSession(user_id=user_id, title=title[:255])
    db.session.add(session)
    db.session.commit()

    return success_response(
        data={'session': session.to_dict()},
        message='Chat session created.',
        status_code=201,
    )


@chat_bp.route('/sessions/<int:session_id>', methods=['GET'])
@jwt_required()
def get_session(session_id):
    """Get a chat session with all its messages."""
    user_id = int(get_jwt_identity())
    session = ChatSession.query.filter_by(id=session_id, user_id=user_id).first()

    if not session:
        return error_response('Chat session not found.', 404)

    return success_response(data={'session': session.to_dict(include_messages=True)})


@chat_bp.route('/sessions/<int:session_id>', methods=['DELETE'])
@jwt_required()
def delete_session(session_id):
    """Delete a chat session and all its messages."""
    user_id = int(get_jwt_identity())
    session = ChatSession.query.filter_by(id=session_id, user_id=user_id).first()

    if not session:
        return error_response('Chat session not found.', 404)

    db.session.delete(session)
    db.session.commit()
    return success_response(message='Chat session deleted.')


# ─── Ask a Question ────────────────────────────────────────────────────────────

@chat_bp.route('/ask', methods=['POST'])
@jwt_required()
def ask():
    """
    Ask a question using the RAG pipeline.
    Creates or uses an existing chat session.
    """
    user_id = int(get_jwt_identity())
    data = request.get_json()

    if not data:
        return error_response('Request body is required.', 400)

    question = data.get('question', '').strip()
    session_id = data.get('session_id')
    document_id = data.get('document_id')
    category_id = data.get('category_id')
    explanation_mode = data.get('explanation_mode', 'normal')
    language = data.get('language', 'English')

    if not question:
        return error_response('Question is required.', 400)
    if len(question) > 2000:
        return error_response('Question is too long (max 2000 characters).', 400)

    # Get or create chat session
    if session_id:
        session = ChatSession.query.filter_by(id=session_id, user_id=user_id).first()
        if not session:
            return error_response('Chat session not found.', 404)
    else:
        # Auto-create a new session titled from the question
        title = question[:80] + ('...' if len(question) > 80 else '')
        session = ChatSession(user_id=user_id, title=title)
        db.session.add(session)
        db.session.flush()

    # If this is the first message, set title from the question
    if session.messages.count() == 0 and session.title == 'New Chat':
        session.title = question[:80] + ('...' if len(question) > 80 else '')

    try:
        result = rag_service.answer_question(
            question=question,
            user_id=user_id,
            session_id=session.id,
            document_id=document_id,
            category_id=category_id,
            explanation_mode=explanation_mode,
            language=language,
        )
        # Update session timestamp
        from datetime import datetime
        session.updated_at = datetime.utcnow()
        db.session.commit()

        return success_response(data={
            'session_id': session.id,
            'message_id': result['message_id'],
            'answer': result['answer'],
            'sources': result['sources'],
        })


    except RuntimeError as e:
        db.session.rollback()
        logger.warning(f"Chat RuntimeError: {e}")
        return error_response(str(e), 503)
    except Exception as e:
        db.session.rollback()
        logger.exception(f"Chat unexpected error: {e}")
        return error_response(f'Error: {str(e)}', 500)
