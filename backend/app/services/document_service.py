import os
import uuid
import re
import logging
from werkzeug.utils import secure_filename
from flask import current_app

from app.extensions import db
from app.models.document import Document
from app.document_processor.processor import DocumentProcessor
from app.services.chunking_service import ChunkingService
from app.services.embedding_service import EmbeddingService
from app.services.vector_service import VectorService

logger = logging.getLogger(__name__)

# Backend root — used to resolve relative folder paths
_BACKEND_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


class DocumentService:
    """Handles document upload, processing, and deletion."""
    
    def __init__(self):
        self.doc_processor = DocumentProcessor()
        self.chunking_service = ChunkingService()
        self.embedding_service = EmbeddingService()
        self.vector_service = VectorService()
    
    def save_and_process(self, file, user_id: int, category_id: int = None) -> Document:
        """
        Save an uploaded file, extract text (PDF, DOCX, PPTX, TXT, MD, Images), create embeddings, store in ChromaDB.
        
        Returns the Document model instance.
        """
        upload_folder = current_app.config.get('UPLOAD_FOLDER', 'uploads')
        # Always resolve to absolute path relative to backend root
        if not os.path.isabs(upload_folder):
            upload_folder = os.path.join(_BACKEND_ROOT, upload_folder)
        upload_folder = os.path.normpath(upload_folder)
        os.makedirs(upload_folder, exist_ok=True)
        
        # Safely preserve user's original filename while handling edge cases
        raw_name = file.filename or "uploaded_document"
        clean_display_name = os.path.basename(raw_name).strip()
        clean_display_name = re.sub(r'[\x00-\x1f\x7f]', '', clean_display_name)
        if not clean_display_name:
            clean_display_name = "uploaded_document.pdf"
            
        ext = os.path.splitext(clean_display_name)[1].lower()
        if not ext:
            sec_name = secure_filename(raw_name)
            ext = os.path.splitext(sec_name)[1].lower() or '.pdf'

        from app.services.storage_service import get_storage_service
        storage_service = get_storage_service()

        stored_filename = f"{uuid.uuid4().hex}{ext}"
        file_path = storage_service.save_file(file, stored_filename)
        file_size = os.path.getsize(file_path) if os.path.exists(file_path) else 0
        
        # Create document record in MySQL with UPLOADED status & 0% progress
        document = Document(
            user_id=user_id,
            category_id=category_id,
            original_filename=clean_display_name,
            stored_filename=stored_filename,
            file_path=file_path,
            file_size=file_size,
            upload_status='UPLOADED',
            processing_progress=0,
        )
        db.session.add(document)
        db.session.commit()
        
        # Dispatch background processing — skip Celery if Redis isn't running
        self._dispatch_processing(document.id)

        return document

    def _dispatch_processing(self, document_id: int):
        """Fast dispatch: try Redis/Celery with 0.5s timeout, else instant daemon thread."""
        # Step 1: Quick Redis ping (0.5s max) to avoid 30s connection hang
        redis_alive = False
        try:
            import redis as redis_lib
            redis_url = current_app.config.get('REDIS_URL', os.getenv('REDIS_URL', 'redis://localhost:6379/0'))
            r = redis_lib.from_url(redis_url, socket_connect_timeout=0.5, socket_timeout=0.5)
            r.ping()
            redis_alive = True
        except Exception:
            pass

        if redis_alive:
            try:
                from app.tasks.document_tasks import process_document_task
                process_document_task.delay(document_id)
                logger.info(f"Dispatched Celery task for Document {document_id}")
                return
            except Exception as e:
                logger.warning(f"Celery dispatch failed for Doc {document_id}: {e}")

        # Step 2: Instant daemon thread fallback (0ms overhead)
        logger.info(f"Using instant daemon thread for Document {document_id}")
        import threading
        try:
            app_obj = current_app._get_current_object()
            threading.Thread(
                target=self._fallback_background_process,
                args=(app_obj, document_id),
                daemon=True
            ).start()
        except Exception as err:
            logger.error(f"Daemon thread error for doc {document_id}: {err}")

    def _fallback_background_process(self, app, document_id: int):
        """Direct background processing without Celery overhead."""
        with app.app_context():
            try:
                from datetime import datetime
                doc = Document.query.get(document_id)
                if not doc:
                    return
                
                doc.upload_status = 'PROCESSING'
                doc.processing_progress = 5
                db.session.commit()

                # Resolve physical file path safely
                from app.services.storage_service import get_storage_service
                storage_service = get_storage_service()
                file_path = doc.file_path
                if not (file_path and os.path.exists(file_path)):
                    file_path = storage_service.get_file_path(doc.stored_filename)

                # Extract text
                pages = self.doc_processor.extract_text(file_path)
                doc.total_pages = max((p.get('page_number', 1) for p in pages), default=1)
                doc.processing_progress = 25
                db.session.commit()

                # Chunk
                doc_metadata = {
                    'document_id': doc.id,
                    'user_id': doc.user_id,
                    'category_id': doc.category_id,
                    'filename': doc.original_filename,
                }
                chunks = self.chunking_service.chunk_pages(pages, doc_metadata)
                if not chunks:
                    doc.upload_status = 'FAILED'
                    doc.error_message = 'No text could be extracted'
                    db.session.commit()
                    return

                doc.total_chunks = len(chunks)
                doc.processing_progress = 40
                db.session.commit()

                # Embed
                texts = [c['text'] for c in chunks]
                embeddings = self.embedding_service.embed_documents(texts)
                doc.processing_progress = 80
                db.session.commit()

                # Store vectors
                self.vector_service.add_chunks(chunks, embeddings)
                
                doc.upload_status = 'INDEXED'
                doc.processing_progress = 100
                doc.indexed_at = datetime.utcnow()
                db.session.commit()
                logger.info(f"Document {document_id} indexed successfully ({len(chunks)} chunks)")

            except Exception as e:
                logger.error(f"Background processing error for doc {document_id}: {e}")
                try:
                    doc = Document.query.get(document_id)
                    if doc:
                        doc.upload_status = 'FAILED'
                        doc.error_message = str(e)[:500]
                        db.session.commit()
                except Exception:
                    db.session.rollback()
    
    def _process_document(self, document: Document, file_path: str):
        """Internal: extract, chunk, embed, and store a document."""
        
        # 1. Extract text sections by format
        pages = self.doc_processor.extract_text(file_path)
        document.total_pages = max((p.get('page_number', 1) for p in pages), default=1)
        db.session.flush()

        
        # 2. Chunk the text with metadata
        doc_metadata = {
            'document_id': document.id,
            'user_id': document.user_id,
            'category_id': document.category_id,
            'filename': document.original_filename,
        }
        chunks = self.chunking_service.chunk_pages(pages, doc_metadata)
        
        if not chunks:
            raise ValueError('No text chunks could be created from this document.')
        
        # 3. Generate embeddings in batch
        texts = [c['text'] for c in chunks]
        embeddings = self.embedding_service.embed_documents(texts)
        
        # 4. Store in ChromaDB
        self.vector_service.add_chunks(chunks, embeddings)
    
    def delete_document(self, document_id: int, user_id: int) -> bool:
        """
        Delete a document: removes file, MySQL record, and ChromaDB embeddings.
        Returns True if deleted, False if not found.
        """
        document = Document.query.filter_by(id=document_id, user_id=user_id).first()
        
        if not document:
            return False
        
        # 1. Delete ChromaDB embeddings
        try:
            self.vector_service.delete_by_document(document_id, user_id)
        except Exception as e:
            logger.error(f'Failed to delete ChromaDB embeddings for doc {document_id}: {e}')
        
        # 2. Delete physical file via StorageService
        try:
            from app.services.storage_service import get_storage_service
            get_storage_service().delete_file(document.stored_filename)
        except Exception as e:
            logger.error(f'Failed to delete file for doc {document_id}: {e}')
        
        # 3. Delete MySQL record
        db.session.delete(document)
        db.session.commit()
        
        return True
    
    def get_user_documents(self, user_id: int, category_id: int = None) -> list:
        """Get all documents for a user, optionally filtered by category."""
        query = Document.query.filter_by(user_id=user_id)
        
        if category_id is not None:
            query = query.filter_by(category_id=category_id)
        
        documents = query.order_by(Document.created_at.desc()).all()
        return [d.to_dict() for d in documents]
    
    def get_document(self, document_id: int, user_id: int) -> Document:
        """Get a single document, ensuring it belongs to the user."""
        return Document.query.filter_by(id=document_id, user_id=user_id).first()
    
    def update_category(self, document_id: int, user_id: int, category_id: int) -> Document:
        """Update the category of a document."""
        document = Document.query.filter_by(id=document_id, user_id=user_id).first()
        
        if not document:
            raise ValueError('Document not found.')
        
        document.category_id = category_id
        db.session.commit()
        
        return document
