import logging
from flask import current_app

from app.services.embedding_service import EmbeddingService
from app.services.vector_service import VectorService
from app.services.gemini_service import GeminiService
from app.models.chat_message import ChatMessage
from app.models.message_source import MessageSource
from app.extensions import db

logger = logging.getLogger(__name__)


class RAGService:
    """
    Orchestrates the full Retrieval-Augmented Generation pipeline:
    question → embedding → vector search → context → Gemini / Ollama → answer + sources
    """
    
    def __init__(self):
        self.embedding_service = EmbeddingService()
        self.vector_service = VectorService()
        self.gemini_service = GeminiService()
    
    def answer_question(
        self,
        question: str,
        user_id: int,
        session_id: int,
        document_id: int = None,
        category_id: int = None,
        explanation_mode: str = 'normal',
        language: str = 'English',
        history: list = None,
    ) -> dict:
        """
        Full RAG pipeline for answering a user question with style mode, language, and context preservation.
        
        Returns:
            {
                'answer': str,
                'sources': [{'document_id', 'filename', 'page_number', 'section', 'file_type', 'relevance_score', 'chunk_id', 'snippet'}],
                'message_id': int,
            }
        """
        top_k = current_app.config.get('RAG_TOP_K', 8)
        
        # Fetch session history if not explicitly provided
        if history is None and session_id:
            # Fetch only last 4 messages — less DB I/O + smaller prompt = faster Gemini
            past_messages = ChatMessage.query.filter_by(session_id=session_id).order_by(ChatMessage.created_at.asc()).limit(4).all()
            history = [{'role': m.role, 'content': m.message} for m in past_messages]

        # Fast short-circuit for common conversational greetings (< 0.05s response)
        greetings_map = {
            'hi': "Hello! 👋 How can I assist you with your study materials today?",
            'hello': "Hello! 👋 I'm SmartDoc AI, your academic assistant. How can I help you today?",
            'hey': "Hey there! 👋 What topic or document would you like to explore today?",
            'hi there': "Hello! 👋 How can I help with your exam prep or document questions?",
            'good morning': "Good morning! ☀️ Ready to study or review your exam materials?",
            'good evening': "Good evening! 🌙 How can I assist with your studies today?",
            'how are you': "I'm doing great and ready to help you study! What would you like to review today?",
            'who are you': "I'm SmartDoc AI, an intelligent RAG academic assistant designed to help you analyze study materials, generate quizzes, and prepare for exams!",
            'help': "I can help you analyze study documents, generate practice quizzes, build study plans, and answer subject-specific questions. What would you like to do?"
        }
        clean_prompt = question.strip().lower().rstrip('!?.,')
        if clean_prompt in greetings_map:
            greeting_resp = greetings_map[clean_prompt]
            msg_id = self._store_message(session_id, question, greeting_resp, [])
            return {
                'answer': greeting_resp,
                'sources': [],
                'message_id': msg_id,
            }

        # Step 1 & 2: Fast Vector search (0ms BM25 lexical matching)
        logger.info(f'Vector search (user={user_id}, doc={document_id}, cat={category_id})')
        raw_results = self.vector_service.query(
            query_embedding=None,
            user_id=user_id,
            n_results=min(3, top_k),
            document_id=document_id,
            category_id=category_id,
            query_text=question,
        )
        
        if not raw_results:
            logger.info('No document chunks found. Proceeding with general knowledge mode...')
            deduplicated = []
            context = "No uploaded document context found for this query."
        else:
            deduplicated = self._deduplicate_chunks(raw_results)
            context = self._build_context(deduplicated)
        
        # Step 4: Generate answer with Gemini (sole AI provider)
        try:
            logger.info(f'Sending {len(deduplicated)} chunks to Gemini...')
            answer = self.gemini_service.generate_answer(
                context=context,
                question=question,
                explanation_mode=explanation_mode,
                language=language,
                history=history,
            )
        except Exception as e:
            raise RuntimeError(f"Gemini API error: {e}")
        
        import re
        if answer:
            # Strip out any repetitive inline [Source: ...] or [Source X: ...] brackets from answer text
            answer = re.sub(r'\s*\[Source:\s*[^\]]+\]', '', answer)
            answer = re.sub(r'\s*\[Source\s*\d+:\s*[^\]]+\]', '', answer)
            answer = answer.replace('**', '')
            answer = answer.strip()

        # Step 5: Prepare source citations
        sources = self._extract_sources(deduplicated)
        
        # Step 6: Store in MySQL
        message_id = self._store_message(session_id, question, answer, sources)
        
        return {
            'answer': answer,
            'sources': sources,
            'message_id': message_id,
        }

    
    def _deduplicate_chunks(self, results: list[dict]) -> list[dict]:
        """Remove duplicate chunks based on chunk_id or full normalized text hash."""
        import hashlib
        seen_ids = set()
        seen_hashes = set()
        unique = []
        
        for result in results:
            chunk_id = result.get('chunk_id')
            if chunk_id and chunk_id in seen_ids:
                continue

            text_norm = ' '.join(result['text'].split())
            text_hash = hashlib.md5(text_norm.encode('utf-8')).hexdigest()
            if text_hash in seen_hashes:
                continue

            if chunk_id:
                seen_ids.add(chunk_id)
            seen_hashes.add(text_hash)
            unique.append(result)
        
        return unique
    
    def _build_context(self, chunks: list[dict]) -> str:
        """Format chunks into a clean context string for the LLM prompt."""
        parts = []
        
        for i, chunk in enumerate(chunks, 1):
            meta = chunk['metadata']
            filename = meta.get('filename', 'Unknown Document')
            page_num = meta.get('page_number', '?')
            
            parts.append(
                f'[Source {i}: {filename}, Page {page_num}]\n{chunk["text"]}'
            )
        
        return '\n\n---\n\n'.join(parts)
    
    def _extract_sources(self, chunks: list[dict]) -> list[dict]:
        """Extract unique source citations from retrieved chunks."""
        seen = set()
        sources = []
        
        for chunk in chunks:
            meta = chunk['metadata']
            doc_id = meta.get('document_id')
            page = meta.get('page_number')
            key = (doc_id, page)
            
            if key not in seen:
                seen.add(key)
                sources.append({
                    'document_id': doc_id,
                    'filename': meta.get('filename', 'Unknown'),
                    'page_number': page,
                    'relevance_score': round(chunk['relevance_score'], 4),
                    'chunk_id': chunk['chunk_id'],
                })
        
        return sources
    
    def _store_message(
        self,
        session_id: int,
        question: str,
        answer: str,
        sources: list[dict],
    ) -> int:
        """Store user question, AI answer, and sources in MySQL."""
        # Store user message
        user_msg = ChatMessage(
            session_id=session_id,
            role='user',
            message=question,
        )
        db.session.add(user_msg)
        db.session.flush()
        
        # Store assistant message
        assistant_msg = ChatMessage(
            session_id=session_id,
            role='assistant',
            message=answer,
        )
        db.session.add(assistant_msg)
        db.session.flush()
        
        # Store source citations safely (validate document_id exists to satisfy foreign key)
        from app.models.document import Document
        valid_doc_ids = set()
        if sources:
            raw_doc_ids = [s.get('document_id') for s in sources if s.get('document_id')]
            if raw_doc_ids:
                try:
                    existing_docs = Document.query.filter(Document.id.in_(raw_doc_ids)).all()
                    valid_doc_ids = {d.id for d in existing_docs}
                except Exception:
                    valid_doc_ids = set()

        for source in sources:
            doc_id = source.get('document_id')
            safe_doc_id = doc_id if doc_id in valid_doc_ids else None
            msg_source = MessageSource(
                message_id=assistant_msg.id,
                document_id=safe_doc_id,
                page_number=source.get('page_number'),
                chunk_id=source.get('chunk_id'),
                relevance_score=source.get('relevance_score'),
            )
            db.session.add(msg_source)
        
        db.session.commit()
        return assistant_msg.id
