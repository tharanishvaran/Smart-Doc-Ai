import os
import logging
import requests
from flask import current_app

logger = logging.getLogger(__name__)

# Singleton — lazy loaded once if local SentenceTransformer fallback is used
_model_instance = None


def _get_api_keys() -> list[str]:
    """Helper to get list of Gemini API keys from Flask config or environment."""
    raw = ''
    try:
        raw = current_app.config.get('GEMINI_API_KEY', '')
    except Exception:
        pass
    if not raw:
        raw = os.getenv('GEMINI_API_KEY', '')
    return [k.strip(' "\'\r\n\t') for k in raw.split(',') if k.strip(' "\'\r\n\t')]


def _get_api_key() -> str:
    """Helper to get first working Gemini API key."""
    keys = _get_api_keys()
    return keys[0] if keys else ''





def _term_embedding(text: str, dim: int = 768) -> list[float]:
    """
    Deterministic sub-word & token term-frequency vector generator (fallback).
    Ensures that shared words and n-grams yield real, measurable cosine similarity.
    """
    if not text:
        return [0.0] * dim
    import re
    import math
    import hashlib

    vec = [0.0] * dim
    words = re.findall(r'[a-zA-Z0-9_\u0900-\u0DFF]+', text.lower())
    if not words:
        return [0.0] * dim

    for w in words:
        # Exact word hash
        h = int(hashlib.md5(w.encode('utf-8')).hexdigest()[:8], 16) % dim
        vec[h] += 2.0
        # Character 3-grams for typo & stem tolerance
        if len(w) >= 3:
            for i in range(len(w) - 2):
                ngram = w[i:i+3]
                nh = int(hashlib.md5(ngram.encode('utf-8')).hexdigest()[:8], 16) % dim
                vec[nh] += 0.5

    # L2 normalize
    mag = math.sqrt(sum(x * x for x in vec))
    if mag == 0:
        return [0.0] * dim
    return [x / mag for x in vec]


class EmbeddingService:
    """Generates text embeddings using Gemini REST API (zero RAM overhead) with intelligent fallbacks."""

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        """Generate embeddings for a list of document chunks."""
        if not texts:
            return []

        api_keys = _get_api_keys()
        for api_key in api_keys:
            try:
                return self._embed_batch_gemini(texts, api_key)
            except Exception as e:
                logger.warning(f'Gemini embedding API key failed ({e}), trying next key or fallback...')

        # High-accuracy deterministic term-frequency vector fallback
        logger.info(f'Generating fast term-frequency embeddings for {len(texts)} chunks...')
        return [_term_embedding(t) for t in texts]

    def embed_documents_batch(self, texts: list[str], batch_size: int = 32, progress_callback=None) -> list[list[float]]:
        """Generate embeddings in configurable batches with progress updates."""
        if not texts:
            return []
        
        all_embeddings = []
        total_texts = len(texts)
        
        for i in range(0, total_texts, batch_size):
            batch = texts[i:i + batch_size]
            batch_emb = self.embed_documents(batch)
            all_embeddings.extend(batch_emb)
            
            if progress_callback:
                pct = min(80, int(50 + ((i + len(batch)) / total_texts) * 30))
                progress_callback(pct)

        return all_embeddings

    def embed_query(self, query: str) -> list[float]:
        """Generate an embedding for a single query string."""
        if not query:
            return [0.0] * 768

        api_keys = _get_api_keys()
        for api_key in api_keys:
            try:
                return self._embed_single_gemini(query, api_key)
            except Exception as e:
                logger.warning(f'Gemini query embedding failed ({e}), trying next...')

        # High-accuracy deterministic term-frequency vector fallback
        return _term_embedding(query)

    def _embed_single_gemini(self, text: str, api_key: str) -> list[float]:
        """Call Gemini REST API for a single text embedding using official text-embedding models."""
        models_to_try = ['text-embedding-004', 'embedding-001', 'gemini-embedding-001']
        last_err = None
        for m in models_to_try:
            url = f'https://generativelanguage.googleapis.com/v1beta/models/{m}:embedContent?key={api_key}'
            payload = {
                'model': f'models/{m}',
                'content': {'parts': [{'text': text[:2000]}]}
            }
            try:
                res = requests.post(url, json=payload, timeout=8)
                if res.status_code == 200:
                    data = res.json()
                    values = data.get('embedding', {}).get('values', [])
                    if values:
                        return values
                last_err = f'HTTP {res.status_code}: {res.text[:150]}'
            except Exception as e:
                last_err = str(e)
        raise RuntimeError(f'Gemini embedding failed: {last_err}')

    def _embed_batch_gemini(self, texts: list[str], api_key: str) -> list[list[float]]:
        """Call Gemini REST API in batches of up to 50 items."""
        models_to_try = ['text-embedding-004', 'embedding-001', 'gemini-embedding-001']
        last_err = None
        for m in models_to_try:
            url = f'https://generativelanguage.googleapis.com/v1beta/models/{m}:batchEmbedContents?key={api_key}'
            all_embeddings = []
            batch_size = 50
            failed = False

            for i in range(0, len(texts), batch_size):
                batch_texts = texts[i:i + batch_size]
                requests_payload = [
                    {
                        'model': f'models/{m}',
                        'content': {'parts': [{'text': t[:2000]}]}
                    }
                    for t in batch_texts
                ]
                try:
                    res = requests.post(url, json={'requests': requests_payload}, timeout=15)
                    if res.status_code == 200:
                        data = res.json()
                        emb_list = data.get('embeddings', [])
                        for item in emb_list:
                            all_embeddings.append(item.get('values', []))
                    else:
                        failed = True
                        last_err = f'HTTP {res.status_code}: {res.text[:150]}'
                        break
                except Exception as e:
                    failed = True
                    last_err = str(e)
                    break
            
            if not failed and len(all_embeddings) == len(texts):
                return all_embeddings

        raise RuntimeError(f'Gemini batch embedding failed: {last_err}')

