import os
import json
import uuid
import math
import logging
from flask import current_app

logger = logging.getLogger(__name__)

# Singleton ChromaDB client
_chroma_client = None
_collection = None
COLLECTION_NAME = 'smart_doc_ai_chunks'
_use_fallback_store = False

# Resolve the backend root directory (two levels up from this file)
_BACKEND_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def _get_fallback_file_path():
    try:
        persist_dir = current_app.config.get('CHROMA_PERSIST_DIRECTORY', 'chroma_db')
    except Exception:
        persist_dir = 'chroma_db'
    if not os.path.isabs(persist_dir):
        persist_dir = os.path.join(_BACKEND_ROOT, persist_dir)
    os.makedirs(persist_dir, exist_ok=True)
    return os.path.join(persist_dir, 'vector_store.json')


def _load_fallback_store() -> dict:
    path = _get_fallback_file_path()
    if os.path.exists(path):
        try:
            with open(path, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception as e:
            logger.warning(f"Error reading fallback vector store: {e}")
    return {"chunks": []}


def _save_fallback_store(data: dict):
    path = _get_fallback_file_path()
    try:
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(data, f)
    except Exception as e:
        logger.warning(f"Error writing fallback vector store: {e}")


def _cosine_similarity(vec1: list[float], vec2: list[float]) -> float:
    if not vec1 or not vec2 or len(vec1) != len(vec2):
        return 0.0
    dot = sum(a * b for a, b in zip(vec1, vec2))
    mag1 = math.sqrt(sum(a * a for a in vec1))
    mag2 = math.sqrt(sum(b * b for b in vec2))
    if mag1 == 0 or mag2 == 0:
        return 0.0
    return max(0.0, min(1.0, dot / (mag1 * mag2)))


def get_chroma_client():
    """Return singleton persistent ChromaDB client with graceful fallback."""
    global _chroma_client, _use_fallback_store
    if _use_fallback_store:
        return None

    if _chroma_client is None:
        try:
            import chromadb
            from chromadb.config import Settings
            persist_dir = current_app.config.get('CHROMA_PERSIST_DIRECTORY', 'chroma_db')
            if not os.path.isabs(persist_dir):
                persist_dir = os.path.join(_BACKEND_ROOT, persist_dir)
            persist_dir = os.path.normpath(persist_dir)
            os.makedirs(persist_dir, exist_ok=True)
            _chroma_client = chromadb.PersistentClient(
                path=persist_dir,
                settings=Settings(anonymized_telemetry=False, is_persistent=True)
            )
        except Exception as e:
            logger.warning(f'ChromaDB initialization failed ({e}), enabling lightweight vector store fallback.')
            _use_fallback_store = True
            return None
    
    return _chroma_client


def get_collection():
    """Return the main ChromaDB collection with fallback."""
    global _collection, _use_fallback_store
    if _use_fallback_store:
        return None

    if _collection is None:
        client = get_chroma_client()
        if client is None:
            _use_fallback_store = True
            return None
        try:
            _collection = client.get_or_create_collection(
                name=COLLECTION_NAME,
                metadata={'hnsw:space': 'cosine'},
            )
        except Exception as e:
            logger.warning(f'ChromaDB collection retrieval failed ({e}), enabling lightweight fallback.')
            _use_fallback_store = True
            return None
    
    return _collection


class VectorService:
    """Manages High-Performance Vector Storage & Semantic Search with Zero-Crash Fallback."""

    def add_chunks(self, chunks: list[dict], embeddings: list[list[float]]) -> list[str]:
        if not chunks or not embeddings:
            return []

        collection = get_collection()
        ids = []
        documents = []
        metadatas = []

        for i, chunk in enumerate(chunks):
            chunk_id = chunk.get('chunk_id') or str(uuid.uuid4())
            ids.append(chunk_id)
            documents.append(chunk['text'])
            meta = {
                'user_id': int(chunk.get('user_id', 0)),
                'document_id': int(chunk.get('document_id', 0)),
                'category_id': int(chunk.get('category_id', 0)) if chunk.get('category_id') is not None else 0,
                'chunk_index': int(chunk.get('chunk_index', i)),
                'page_number': int(chunk.get('page_number', 1)),
                'filename': str(chunk.get('filename', '')),
                'file_type': str(chunk.get('file_type', '')),
                'section': str(chunk.get('section', '')),
            }
            metadatas.append(meta)

        # 1. Try ChromaDB
        if collection is not None:
            try:
                collection.add(
                    ids=ids,
                    embeddings=embeddings,
                    documents=documents,
                    metadatas=metadatas,
                )
                logger.info(f'Added {len(ids)} chunks to ChromaDB.')
                return ids
            except Exception as e:
                logger.warning(f'ChromaDB add failed ({e}), saving to lightweight vector store.')

        # 2. Lightweight Fallback Store
        store = _load_fallback_store()
        existing_ids = {c['id'] for c in store.get('chunks', [])}
        for chunk_id, text, emb, meta in zip(ids, documents, embeddings, metadatas):
            if chunk_id not in existing_ids:
                store['chunks'].append({
                    'id': chunk_id,
                    'text': text,
                    'embedding': emb,
                    'metadata': meta
                })
        _save_fallback_store(store)
        logger.info(f'Added {len(ids)} chunks to lightweight vector store.')
        return ids

    def add_chunks_batch(self, chunks: list[dict], embeddings: list[list[float]], batch_size: int = 50, progress_callback=None) -> list[str]:
        if not chunks or not embeddings:
            return []
        ids = self.add_chunks(chunks, embeddings)
        if progress_callback:
            progress_callback(100)
        return ids

    def query(
        self,
        query_embedding: list[float],
        user_id: int,
        n_results: int = 6,
        document_id: int = None,
        category_id: int = None,
    ) -> list[dict]:
        """Search for relevant chunks using vector similarity."""
        collection = get_collection()

        # 1. Try ChromaDB if available
        if collection is not None:
            try:
                total_count = collection.count()
                if total_count > 0:
                    k = min(n_results, total_count)
                    if document_id is not None:
                        where_filter = {'$and': [{'user_id': {'$eq': user_id}}, {'document_id': {'$eq': document_id}}]}
                    elif category_id is not None:
                        where_filter = {'$and': [{'user_id': {'$eq': user_id}}, {'category_id': {'$eq': category_id}}]}
                    else:
                        where_filter = {'user_id': {'$eq': user_id}}

                    results = collection.query(
                        query_embeddings=[query_embedding],
                        n_results=k,
                        where=where_filter,
                        include=['documents', 'metadatas', 'distances'],
                    )
                    parsed = []
                    if results and results.get('ids') and results['ids'][0]:
                        for i, chunk_id in enumerate(results['ids'][0]):
                            distance = results['distances'][0][i]
                            score = max(0.0, 1.0 - distance)
                            parsed.append({
                                'chunk_id': chunk_id,
                                'text': results['documents'][0][i],
                                'metadata': results['metadatas'][0][i],
                                'relevance_score': score,
                            })
                        if parsed:
                            return parsed
            except Exception as e:
                logger.warning(f'ChromaDB query fallback notice: {e}')

        # 2. Lightweight Vector Store Search
        store = _load_fallback_store()
        chunks = store.get('chunks', [])
        if not chunks:
            return []

        scored = []
        for item in chunks:
            meta = item.get('metadata', {})
            if meta.get('user_id') != user_id:
                continue
            if document_id is not None and meta.get('document_id') != document_id:
                continue
            if category_id is not None and meta.get('category_id') != category_id:
                continue

            sim = _cosine_similarity(query_embedding, item.get('embedding', []))
            scored.append({
                'chunk_id': item['id'],
                'text': item['text'],
                'metadata': meta,
                'relevance_score': sim,
            })

        # Sort by similarity descending
        scored.sort(key=lambda x: x['relevance_score'], reverse=True)
        return scored[:n_results]

    def delete_document_chunks(self, user_id: int, document_id: int):
        collection = get_collection()
        if collection is not None:
            try:
                collection.delete(where={
                    '$and': [{'user_id': {'$eq': user_id}}, {'document_id': {'$eq': document_id}}]
                })
            except Exception as e:
                logger.warning(f'ChromaDB delete notice: {e}')

        store = _load_fallback_store()
        store['chunks'] = [c for c in store.get('chunks', []) if not (c.get('metadata', {}).get('user_id') == user_id and c.get('metadata', {}).get('document_id') == document_id)]
        _save_fallback_store(store)

    def delete_user_chunks(self, user_id: int):
        collection = get_collection()
        if collection is not None:
            try:
                collection.delete(where={'user_id': {'$eq': user_id}})
            except Exception as e:
                logger.warning(f'ChromaDB user delete notice: {e}')

        store = _load_fallback_store()
        store['chunks'] = [c for c in store.get('chunks', []) if c.get('metadata', {}).get('user_id') != user_id]
        _save_fallback_store(store)

    def get_stats(self) -> dict:
        total = 0
        collection = get_collection()
        if collection is not None:
            try:
                total = collection.count()
            except Exception:
                pass
        if total == 0:
            store = _load_fallback_store()
            total = len(store.get('chunks', []))
        return {'total_chunks': total, 'collection_name': COLLECTION_NAME}
