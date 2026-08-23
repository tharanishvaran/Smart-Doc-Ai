import os
import uuid
import logging
import chromadb
from flask import current_app

logger = logging.getLogger(__name__)

# Singleton ChromaDB client
_chroma_client = None
_collection = None
COLLECTION_NAME = 'smart_doc_ai_chunks'

# Resolve the backend root directory (two levels up from this file)
_BACKEND_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def get_chroma_client():
    """Return singleton persistent ChromaDB client."""
    global _chroma_client
    
    if _chroma_client is None:
        persist_dir = current_app.config.get('CHROMA_PERSIST_DIRECTORY', 'chroma_db')
        # Always resolve to an absolute path relative to the backend root
        # so the correct DB is found regardless of the process working directory.
        if not os.path.isabs(persist_dir):
            persist_dir = os.path.join(_BACKEND_ROOT, persist_dir)
        persist_dir = os.path.normpath(persist_dir)
        os.makedirs(persist_dir, exist_ok=True)
        logger.info(f'Initializing ChromaDB at: {persist_dir}')
        try:
            from chromadb.config import Settings
            _chroma_client = chromadb.PersistentClient(
                path=persist_dir,
                settings=Settings(anonymized_telemetry=False, is_persistent=True)
            )
        except Exception as e:
            logger.warning(f'ChromaDB initialization fallback: {e}')
            _chroma_client = chromadb.PersistentClient(path=persist_dir)
    
    return _chroma_client


def get_collection():
    """Return the main ChromaDB collection (create if not exists)."""
    global _collection
    
    if _collection is None:
        client = get_chroma_client()
        _collection = client.get_or_create_collection(
            name=COLLECTION_NAME,
            metadata={'hnsw:space': 'cosine'},  # cosine similarity
        )
        logger.info(f'Using ChromaDB collection: {COLLECTION_NAME} ({_collection.count()} vectors)')
    
    return _collection


class VectorService:
    """Manages ChromaDB vector operations."""
    
    def add_chunks(self, chunks: list[dict], embeddings: list[list[float]]) -> list[str]:
        """
        Add document chunks and their embeddings to ChromaDB.
        
        Args:
            chunks: List of {'text': str, 'metadata': dict}
            embeddings: Corresponding list of embedding vectors
        
        Returns:
            List of generated chunk IDs.
        """
        collection = get_collection()
        
        ids = []
        documents = []
        metadatas = []
        
        for chunk in chunks:
            chunk_id = str(uuid.uuid4())
            ids.append(chunk_id)
            documents.append(chunk['text'])
            
            # ChromaDB metadata values must be str, int, float, or bool
            # None values for int fields must become 0 so $eq filters work
            int_fields = {'user_id', 'document_id', 'category_id', 'page_number'}
            meta = {}
            for k, v in chunk['metadata'].items():
                if v is None:
                    meta[k] = 0 if k in int_fields else ''
                else:
                    meta[k] = v
            metadatas.append(meta)
        
        try:
            collection.add(
                ids=ids,
                embeddings=embeddings,
                documents=documents,
                metadatas=metadatas,
            )
        except Exception as e:
            if 'dimension' in str(e).lower():
                logger.warning(f'ChromaDB vector dimension mismatch ({e}). Resetting collection...')
                client = get_chroma_client()
                try:
                    client.delete_collection(COLLECTION_NAME)
                except Exception:
                    pass
                global _collection
                _collection = None
                collection = get_collection()
                collection.add(
                    ids=ids,
                    embeddings=embeddings,
                    documents=documents,
                    metadatas=metadatas,
                )
            else:
                raise e

        logger.info(f'Added {len(ids)} chunks to ChromaDB.')
        return ids

    def add_chunks_batch(self, chunks: list[dict], embeddings: list[list[float]], batch_size: int = 50, progress_callback=None) -> list[str]:
        """Add document chunks to ChromaDB in deterministic batch sizes to ensure idempotency and progress reporting."""
        if not chunks or not embeddings:
            return []

        collection = get_collection()
        total_chunks = len(chunks)
        all_ids = []

        for i in range(0, total_chunks, batch_size):
            batch_chunks = chunks[i:i + batch_size]
            batch_embeddings = embeddings[i:i + batch_size]

            batch_ids = []
            batch_documents = []
            batch_metadatas = []

            for idx, chunk in enumerate(batch_chunks, start=i):
                meta = chunk.get('metadata', {})
                user_id = meta.get('user_id', 0)
                doc_id = meta.get('document_id', 0)
                chunk_id = f"user_{user_id}_doc_{doc_id}_chunk_{idx}"
                batch_ids.append(chunk_id)
                batch_documents.append(chunk['text'])

                int_fields = {'user_id', 'document_id', 'category_id', 'page_number'}
                clean_meta = {}
                for k, v in meta.items():
                    if v is None:
                        clean_meta[k] = 0 if k in int_fields else ''
                    else:
                        clean_meta[k] = v
                batch_metadatas.append(clean_meta)

            try:
                collection.upsert(
                    ids=batch_ids,
                    embeddings=batch_embeddings,
                    documents=batch_documents,
                    metadatas=batch_metadatas,
                )
            except Exception:
                try:
                    collection.add(
                        ids=batch_ids,
                        embeddings=batch_embeddings,
                        documents=batch_documents,
                        metadatas=batch_metadatas,
                    )
                except Exception as err:
                    logger.warning(f"ChromaDB batch insertion fallback notice: {err}")

            all_ids.extend(batch_ids)

            if progress_callback:
                pct = min(98, int(80 + ((i + len(batch_chunks)) / total_chunks) * 18))
                progress_callback(pct)

        logger.info(f'Batch added {len(all_ids)} deterministic chunks to ChromaDB.')
        return all_ids
    
    def query(
        self,
        query_embedding: list[float],
        user_id: int,
        n_results: int = 5,
        document_id: int = None,
        category_id: int = None,
    ) -> list[dict]:
        """
        Search for relevant chunks using vector similarity.
        Always filters by user_id for data isolation.
        
        Returns list of results with text, metadata, and relevance score.
        """
        try:
            collection = get_collection()
            total_count = collection.count() if collection else 0
            if total_count == 0:
                logger.info('Vector store is empty, proceeding with general knowledge.')
                return []
            n_results = min(n_results, total_count)
        except Exception as e:
            logger.warning(f'Vector store count check notice: {e}')
            return []
        
        # Build where filter — always scope to the user
        # ChromaDB v0.4+ requires $and operator for multiple conditions
        if document_id is not None:
            where_filter = {
                '$and': [
                    {'user_id': {'$eq': user_id}},
                    {'document_id': {'$eq': document_id}},
                ]
            }
        elif category_id is not None:
            where_filter = {
                '$and': [
                    {'user_id': {'$eq': user_id}},
                    {'category_id': {'$eq': category_id}},
                ]
            }
        else:
            # Single condition — no $and needed
            where_filter = {'user_id': {'$eq': user_id}}
        
        try:
            results = collection.query(
                query_embeddings=[query_embedding],
                n_results=n_results,
                where=where_filter,
                include=['documents', 'metadatas', 'distances'],
            )
        except Exception as e:
            if 'dimension' in str(e).lower():
                logger.warning(f'ChromaDB vector dimension mismatch in query ({e}). Resetting collection...')
                try:
                    client = get_chroma_client()
                    client.delete_collection(COLLECTION_NAME)
                except Exception:
                    pass
                global _collection
                _collection = None
                return []
            logger.warning(f'ChromaDB query notice (proceeding with fallback): {e}')
            return []
        
        # Parse results
        parsed = []
        min_relevance = current_app.config.get('RAG_MIN_RELEVANCE_SCORE', 0.0)
        if results and results['ids'] and results['ids'][0]:
            for i, chunk_id in enumerate(results['ids'][0]):
                distance = results['distances'][0][i]
                # Convert cosine distance to similarity score (1 = perfect match)
                relevance_score = 1.0 - distance
                
                if relevance_score < min_relevance:
                    logger.debug(f'Skipping chunk {chunk_id} — score {relevance_score:.3f} below threshold {min_relevance}')
                    continue
                
                parsed.append({
                    'chunk_id': chunk_id,
                    'text': results['documents'][0][i],
                    'metadata': results['metadatas'][0][i],
                    'relevance_score': relevance_score,
                })
        
        logger.info(f'ChromaDB query returned {len(parsed)} results (filter: user={user_id}, doc={document_id}, cat={category_id})')
        return parsed
    
    def delete_by_document(self, document_id: int, user_id: int):
        """Remove all chunks belonging to a specific document."""
        collection = get_collection()
        
        try:
            collection.delete(
                where={
                    '$and': [
                        {'user_id': {'$eq': user_id}},
                        {'document_id': {'$eq': document_id}},
                    ]
                }
            )
            logger.info(f'Deleted ChromaDB chunks for document {document_id}')
        except Exception as e:
            logger.error(f'Failed to delete ChromaDB chunks: {e}')
    
    def get_collection_count(self) -> int:
        """Return total number of vectors in the collection."""
        return get_collection().count()
