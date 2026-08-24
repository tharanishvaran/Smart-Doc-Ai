import os
import json
import uuid
import math
import logging
from flask import current_app

logger = logging.getLogger(__name__)

# Resolve the backend root directory (two levels up from this file)
_BACKEND_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
COLLECTION_NAME = 'smart_doc_ai_chunks'


def _get_store_file_path():
    try:
        persist_dir = current_app.config.get('CHROMA_PERSIST_DIRECTORY', 'chroma_db')
    except Exception:
        persist_dir = 'chroma_db'
    if not os.path.isabs(persist_dir):
        persist_dir = os.path.join(_BACKEND_ROOT, persist_dir)
    os.makedirs(persist_dir, exist_ok=True)
    return os.path.join(persist_dir, 'vector_store.json')


def _load_store() -> dict:
    path = _get_store_file_path()
    if os.path.exists(path):
        try:
            with open(path, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception as e:
            logger.warning(f"Error reading vector store: {e}")
    return {"chunks": []}


def _save_store(data: dict):
    path = _get_store_file_path()
    try:
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(data, f)
    except Exception as e:
        logger.warning(f"Error writing vector store: {e}")


def _cosine_similarity(vec1: list[float], vec2: list[float]) -> float:
    if not vec1 or not vec2 or len(vec1) != len(vec2):
        return 0.0
    dot = sum(a * b for a, b in zip(vec1, vec2))
    mag1 = math.sqrt(sum(a * a for a in vec1))
    mag2 = math.sqrt(sum(b * b for b in vec2))
    if mag1 == 0 or mag2 == 0:
        return 0.0
    return max(0.0, min(1.0, dot / (mag1 * mag2)))


def _tokenize(text: str) -> list[str]:
    import re
    return [w for w in re.findall(r'[a-zA-Z0-9_\u0900-\u0DFF]+', text.lower()) if len(w) > 1]


def _bm25_scores(query: str, corpus: list[str]) -> list[float]:
    """Compute normalized BM25 scores for a query across a list of chunk texts."""
    if not query or not corpus:
        return [0.0] * len(corpus)

    query_tokens = _tokenize(query)
    if not query_tokens:
        return [0.0] * len(corpus)

    doc_tokens = [_tokenize(doc) for doc in corpus]
    doc_lens = [len(dt) for dt in doc_tokens]
    avg_len = sum(doc_lens) / max(1, len(corpus))
    if avg_len == 0:
        return [0.0] * len(corpus)

    N = len(corpus)
    k1 = 1.5
    b = 0.75

    # Document frequency per query term
    df = {}
    for t in set(query_tokens):
        df[t] = sum(1 for dt in doc_tokens if t in dt)

    scores = []
    for dt, dlen in zip(doc_tokens, doc_lens):
        score = 0.0
        # Term frequencies in this document
        tf_dict = {}
        for t in dt:
            tf_dict[t] = tf_dict.get(t, 0) + 1

        for qt in query_tokens:
            if qt not in df or df[qt] == 0:
                continue
            # Smoothed IDF
            idf = math.log((N - df[qt] + 0.5) / (df[qt] + 0.5) + 1.0)
            tf = tf_dict.get(qt, 0)
            tf_weight = (tf * (k1 + 1.0)) / (tf + k1 * (1.0 - b + b * (dlen / avg_len)))
            score += idf * tf_weight

        # Bonus for exact phrase or substring match
        query_clean = query.strip().lower()
        if len(query_clean) > 3 and query_clean in ' '.join(dt):
            score += 2.0

        scores.append(score)

    max_score = max(scores) if scores else 0.0
    if max_score > 0:
        return [s / max_score for s in scores]
    return [0.0] * len(corpus)


class VectorService:
    """Ultra-fast, zero-crash pure Python vector store with hybrid BM25 + dense semantic search."""

    def add_chunks(self, chunks: list[dict], embeddings: list[list[float]]) -> list[str]:
        if not chunks or not embeddings:
            return []

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

        store = _load_store()
        existing_ids = {c['id'] for c in store.get('chunks', [])}
        for chunk_id, text, emb, meta in zip(ids, documents, embeddings, metadatas):
            if chunk_id not in existing_ids:
                store['chunks'].append({
                    'id': chunk_id,
                    'text': text,
                    'embedding': emb,
                    'metadata': meta
                })
        _save_store(store)
        logger.info(f'Added {len(ids)} chunks to vector store.')
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
        query_embedding: list[float] = None,
        user_id: int = 0,
        n_results: int = 8,
        document_id: int = None,
        category_id: int = None,
        query_text: str = None,
    ) -> list[dict]:
        """
        Search for relevant chunks using Hybrid Search:
        Dense Semantic Cosine Similarity + Sparse Lexical BM25 Keyword Scoring.
        """
        store = _load_store()
        all_chunks = store.get('chunks', [])
        if not all_chunks:
            return []

        # Filter candidates matching user and optional document/category constraints
        candidate_items = []
        for item in all_chunks:
            meta = item.get('metadata', {})
            item_user_id = int(meta.get('user_id', 0))
            if user_id and item_user_id != int(user_id):
                continue
            if document_id is not None and int(document_id) > 0 and int(meta.get('document_id', 0)) != int(document_id):
                continue
            if category_id is not None and int(category_id) > 0 and int(meta.get('category_id', 0)) != int(category_id):
                continue
            candidate_items.append(item)

        if not candidate_items:
            return []

        # 1. Compute BM25 Lexical Keyword Scores
        corpus_texts = [item['text'] for item in candidate_items]
        bm25_scores = _bm25_scores(query_text, corpus_texts) if query_text else [0.0] * len(candidate_items)

        # 2. Compute Semantic Cosine Similarity Scores
        scored = []
        for idx, item in enumerate(candidate_items):
            meta = item.get('metadata', {})
            dense_sim = 0.0
            if query_embedding:
                dense_sim = _cosine_similarity(query_embedding, item.get('embedding', []))

            lexical_sim = bm25_scores[idx]

            # Weighted Hybrid Score: 0.55 semantic + 0.45 BM25
            if query_text and query_embedding:
                hybrid_score = (0.55 * dense_sim) + (0.45 * lexical_sim)
            elif query_text:
                hybrid_score = lexical_sim
            else:
                hybrid_score = dense_sim

            scored.append({
                'chunk_id': item['id'],
                'text': item['text'],
                'metadata': meta,
                'relevance_score': hybrid_score,
                'dense_score': dense_sim,
                'bm25_score': lexical_sim,
            })

        # Sort by relevance score descending
        scored.sort(key=lambda x: x['relevance_score'], reverse=True)
        return scored[:n_results]

    def delete_document_chunks(self, user_id: int, document_id: int):
        store = _load_store()
        store['chunks'] = [
            c for c in store.get('chunks', []) 
            if not (int(c.get('metadata', {}).get('user_id', 0)) == int(user_id) and int(c.get('metadata', {}).get('document_id', 0)) == int(document_id))
        ]
        _save_store(store)

    def delete_by_document(self, document_id: int, user_id: int):
        """Alias for delete_document_chunks."""
        self.delete_document_chunks(user_id=user_id, document_id=document_id)

    def delete_user_chunks(self, user_id: int):
        store = _load_store()
        store['chunks'] = [c for c in store.get('chunks', []) if int(c.get('metadata', {}).get('user_id', 0)) != int(user_id)]
        _save_store(store)

    def get_stats(self) -> dict:
        store = _load_store()
        total = len(store.get('chunks', []))
        return {'total_chunks': total, 'collection_name': COLLECTION_NAME}
