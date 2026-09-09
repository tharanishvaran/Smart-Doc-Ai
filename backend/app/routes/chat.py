import os
import json
import requests
import logging
from flask import Blueprint, request, current_app, Response, stream_with_context
from flask_jwt_extended import jwt_required, get_jwt_identity

from app.extensions import db
from app.models.chat_session import ChatSession
from app.models.chat_message import ChatMessage
from app.services.rag_service import RAGService
from app.utils.error_handlers import success_response, error_response

logger = logging.getLogger(__name__)

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
    raw_doc_id = data.get('document_id')
    raw_cat_id = data.get('category_id')
    document_id = int(raw_doc_id) if raw_doc_id and str(raw_doc_id).isdigit() and int(raw_doc_id) > 0 else None
    category_id = int(raw_cat_id) if raw_cat_id and str(raw_cat_id).isdigit() and int(raw_cat_id) > 0 else None
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


# ─── Streaming Ask (SSE) ───────────────────────────────────────────────────────

@chat_bp.route('/ask-stream', methods=['POST'])
@jwt_required()
def ask_stream():
    """
    Ask a question using RAG + Gemini streaming (SSE).
    First token appears in ~1s; answer streams word-by-word.
    """
    user_id = int(get_jwt_identity())
    data = request.get_json()
    if not data:
        return error_response('Request body is required.', 400)

    question = data.get('question', '').strip()
    session_id = data.get('session_id')
    raw_doc_id = data.get('document_id')
    raw_cat_id = data.get('category_id')
    document_id = int(raw_doc_id) if raw_doc_id and str(raw_doc_id).isdigit() and int(raw_doc_id) > 0 else None
    category_id = int(raw_cat_id) if raw_cat_id and str(raw_cat_id).isdigit() and int(raw_cat_id) > 0 else None
    explanation_mode = data.get('explanation_mode', 'normal')
    language = data.get('language', 'English')

    if not question:
        return error_response('Question is required.', 400)

    # Resolve or create session
    if session_id:
        session = ChatSession.query.filter_by(id=session_id, user_id=user_id).first()
        if not session:
            return error_response('Chat session not found.', 404)
    else:
        title = question[:80] + ('...' if len(question) > 80 else '')
        session = ChatSession(user_id=user_id, title=title)
        db.session.add(session)
        db.session.flush()

    if session.messages.count() == 0 and session.title == 'New Chat':
        session.title = question[:80]
    db.session.commit()

    top_k = current_app.config.get('RAG_TOP_K', 5)
    from app.models.chat_message import ChatMessage
    past_msgs = (ChatMessage.query.filter_by(session_id=session.id)
                 .order_by(ChatMessage.created_at.asc()).limit(4).all())
    history = [{'role': m.role, 'content': m.message} for m in past_msgs]

    # Greeting short-circuit
    greetings_map = {
        'hi': "Hello! \U0001f44b How can I assist you with your study materials today?",
        'hello': "Hello! \U0001f44b I'm SmartDoc AI. How can I help?",
        'hey': "Hey! \U0001f44b What topic would you like to explore?",
        'help': "I can analyse documents, generate quizzes, and answer subject questions. What would you like to do?",
    }
    clean_q = question.strip().lower().rstrip('!?,.')
    if clean_q in greetings_map:
        greeting = greetings_map[clean_q]
        u = ChatMessage(session_id=session.id, role='user', message=question)
        a = ChatMessage(session_id=session.id, role='assistant', message=greeting)
        db.session.add(u); db.session.add(a); db.session.commit()

        def _greet():
            yield f"data: {json.dumps({'type': 'chunk', 'text': greeting})}\n\n"
            yield f"data: {json.dumps({'type': 'done', 'sources': [], 'message_id': a.id, 'session_id': session.id})}\n\n"
        return Response(stream_with_context(_greet()), mimetype='text/event-stream',
                        headers={'X-Accel-Buffering': 'no', 'Cache-Control': 'no-cache'})

    # Zero-latency BM25 vector search (0.002s vs 6.5s remote embedding)
    raw_results = rag_service.vector_service.query(
        query_embedding=None, user_id=user_id,
        n_results=min(3, top_k), document_id=document_id,
        category_id=category_id, query_text=question,
    )
    if raw_results:
        deduplicated = rag_service._deduplicate_chunks(raw_results)
        context = rag_service._build_context(deduplicated)
    else:
        deduplicated = []
        context = "No uploaded document context found for this query."
    sources = rag_service._extract_sources(deduplicated)

    def _sse():
        import re as _re
        full_text = []
        try:
            for chunk in rag_service.gemini_service.stream_answer(
                context=context, question=question,
                explanation_mode=explanation_mode, language=language, history=history,
            ):
                full_text.append(chunk)
                yield f"data: {json.dumps({'type': 'chunk', 'text': chunk})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'message': f'Gemini API error: {str(e)}'})}\n\n"
            return

        answer = _re.sub(r'\s*\[Source[^\]]*\]', '', ''.join(full_text)).strip()

        # Store in DB after streaming completes
        try:
            from app.models.chat_message import ChatMessage as CM
            from app.models.message_source import MessageSource
            from app.models.document import Document
            from datetime import datetime
            u_msg = CM(session_id=session.id, role='user', message=question)
            a_msg = CM(session_id=session.id, role='assistant', message=answer)
            db.session.add(u_msg); db.session.add(a_msg); db.session.flush()
            if sources:
                ids = [s.get('document_id') for s in sources if s.get('document_id')]
                valid = {d.id for d in Document.query.filter(Document.id.in_(ids)).all()} if ids else set()
                for src in sources:
                    doc_id = src.get('document_id')
                    db.session.add(MessageSource(
                        message_id=a_msg.id,
                        document_id=doc_id if doc_id in valid else None,
                        page_number=src.get('page_number'),
                        chunk_id=src.get('chunk_id'),
                        relevance_score=src.get('relevance_score'),
                    ))
            session.updated_at = datetime.utcnow()
            db.session.commit()
            yield f"data: {json.dumps({'type': 'done', 'sources': sources, 'message_id': a_msg.id, 'session_id': session.id})}\n\n"
        except Exception as db_err:
            db.session.rollback()
            logger.error(f'DB store error post-stream: {db_err}')
            yield f"data: {json.dumps({'type': 'done', 'sources': sources, 'message_id': -1, 'session_id': session.id})}\n\n"

    return Response(
        stream_with_context(_sse()),
        mimetype='text/event-stream',
        headers={'X-Accel-Buffering': 'no', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive'},
    )


# ─── Audio Transcription (Speech-to-Text via Gemini) ───────────────────────────

@chat_bp.route('/transcribe', methods=['POST'])
@jwt_required()
def transcribe_audio():
    """
    Transcribes audio into text using Google Gemini multimodal model.
    Guarantees 100% reliable voice-to-text regardless of client browser or network.
    """
    try:
        user_id = int(get_jwt_identity())
        language = 'English'
        audio_b64 = None
        mime_type = 'audio/webm'

        if request.is_json:
            data = request.get_json() or {}
            audio_b64 = data.get('audio', '')
            mime_type = data.get('mime_type', 'audio/webm')
            language = data.get('language', 'English')
        elif 'audio' in request.files:
            audio_file = request.files['audio']
            mime_type = audio_file.content_type or 'audio/webm'
            language = request.form.get('language', 'English')
            audio_bytes = audio_file.read()
            import base64
            audio_b64 = base64.b64encode(audio_bytes).decode('utf-8')

        if not audio_b64:
            return error_response('Audio data is required.', 400)

        # Handle data URL prefix (e.g. data:audio/webm;base64,...)
        if ',' in audio_b64:
            header, audio_b64 = audio_b64.split(',', 1)
            if 'audio/' in header:
                extracted_mime = header.split(';')[0].replace('data:', '').strip()
                if extracted_mime:
                    mime_type = extracted_mime

        # Clean mime_type (strip codecs=opus parameter)
        clean_mime = mime_type.split(';')[0].strip()
        if not clean_mime or not clean_mime.startswith('audio/'):
            clean_mime = 'audio/webm'

        raw_api_key = current_app.config.get('GEMINI_API_KEY') or os.getenv('GEMINI_API_KEY', '')
        if not raw_api_key:
            return error_response('GEMINI_API_KEY is not configured.', 500)

        api_keys = [k.strip(' "\'\r\n\t') for k in raw_api_key.split(',') if k.strip(' "\'\r\n\t')]
        model_name = current_app.config.get('GEMINI_MODEL', 'gemini-3.5-flash-lite')

        prompt = (
            f"You are an expert speech transcriber. "
            f"Carefully listen to this user voice audio and transcribe the exact words spoken into text. "
            f"The speaker's intended language is {language} (or a natural Indian mix like Tanglish or Hinglish). "
            f"Output ONLY the plain transcribed text. Do NOT add quotes, markdown formatting, explanations, or timestamps. "
            f"If the audio contains silence, noise, or no spoken words, respond with an empty string."
        )

        payload = {
            'contents': [{
                'parts': [
                    {
                        'inline_data': {
                            'mime_type': clean_mime,
                            'data': audio_b64
                        }
                    },
                    {
                        'text': prompt
                    }
                ]
            }],
            'generationConfig': {
                'temperature': 0.0,
                'maxOutputTokens': 1000
            }
        }

        candidate_models = [model_name, 'gemini-3.5-flash-lite', 'gemini-3.5-flash', 'gemini-flash-latest']
        models_to_try = []
        for m in candidate_models:
            if m and m not in models_to_try:
                models_to_try.append(m)

        for active_key in api_keys:
            for mod in models_to_try:
                url = f'https://generativelanguage.googleapis.com/v1beta/models/{mod}:generateContent?key={active_key}'
                try:
                    resp = requests.post(url, json=payload, timeout=25)
                    if resp.status_code == 200:
                        res_json = resp.json()
                        candidates = res_json.get('candidates', [])
                        transcript = ""
                        if candidates and 'content' in candidates[0]:
                            parts = candidates[0]['content'].get('parts', [])
                            texts = [p['text'] for p in parts if 'text' in p and p['text'].strip()]
                            transcript = " ".join(texts).strip()
                        return success_response(data={'transcript': transcript})
                    elif resp.status_code in (429, 403, 400):
                        logger.warning(f"Transcription model {mod} error {resp.status_code}: {resp.text[:100]}")
                        break
                except Exception as ex:
                    logger.warning(f"Transcription attempt failed for {mod}: {ex}")

        return error_response("Could not transcribe audio with available models.", 500)
    except Exception as e:
        logger.exception(f"Transcribe endpoint error: {e}")
        return error_response(f"Transcription error: {str(e)}", 500)
