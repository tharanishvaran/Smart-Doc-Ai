import os
import time
import requests
import logging
from flask import current_app

logger = logging.getLogger(__name__)

# Key rotation & cooldown tracking
_key_cursor: int = 0
_key_cooldown: dict = {}      # api_key -> resume_epoch_timestamp
_model_cooldown: dict = {}    # model_name -> resume_epoch_timestamp


def _get_api_keys_round_robin() -> list:
    """
    Return configured API keys starting from the current round-robin cursor,
    prioritizing keys that are NOT currently in a 429 rate-limit cooldown window.
    """
    global _key_cursor
    raw = ''
    try:
        raw = current_app.config.get('GEMINI_API_KEY', '')
    except Exception:
        pass
    if not raw:
        raw = os.getenv('GEMINI_API_KEY', '')

    keys = [k.strip(' "\'\r\n\t') for k in raw.split(',') if k.strip(' "\'\r\n\t')]
    if not keys:
        return []

    n = len(keys)
    start = _key_cursor % n
    _key_cursor = (_key_cursor + 1) % n
    ordered = [keys[(start + i) % n] for i in range(n)]

    now = time.time()
    active = [k for k in ordered if _key_cooldown.get(k, 0) <= now]
    cooling = [k for k in ordered if _key_cooldown.get(k, 0) > now]
    return active + cooling


def _get_active_models(models: list) -> list:
    """Filter out models that are currently in a rate-limit cooldown window."""
    now = time.time()
    active = [m for m in models if _model_cooldown.get(m, 0) <= now]
    return active if active else models


SYSTEM_PROMPT = """You are SmartDoc AI, an expert academic assistant. Answer the STUDENT'S QUESTION directly, accurately, and concisely.

RESPONSE GUIDELINES:
1. Conciseness: Be crisp, clear, and high-yield (around 100-180 words). Use clean bullet points for key concepts. Avoid unnecessary preamble or lengthy filler text so the answer generates immediately.
2. If the topic is NOT in the provided documents (e.g. asking about Java when documents are C):
   - Always start with: "Based on the provided documents, there is no information about <topic>. However, here is a general explanation:"
   - Then provide a clear, concise general overview (definition, 3-4 bullet points of core features/syntax).
3. Do NOT add inline [Source:...] markers.
4. Do NOT use markdown bold formatting or asterisks (**). Output clean plain text without **."""


class GeminiService:
    """Communicates with Google Gemini API using high-performance HTTP REST calls."""

    def _get_candidate_models(self) -> list:
        try:
            preferred = current_app.config.get('GEMINI_MODEL', 'gemini-3.1-flash-lite')
        except Exception:
            preferred = os.getenv('GEMINI_MODEL', 'gemini-3.1-flash-lite')

        candidates = [
            preferred,
            'gemini-3.1-flash-lite',  # universal fast model (~1.2s response time)
            'gemini-3.5-flash',       # universal fast fallback (~1.3s response time)
            'gemini-2.5-flash-lite',  # legacy fast model for older keys
        ]
        ordered = []
        for m in candidates:
            if m and m not in ordered:
                ordered.append(m)
        return ordered

    def generate_answer(
        self, 
        context: str, 
        question: str, 
        explanation_mode: str = 'normal', 
        language: str = 'English', 
        history: list = None
    ) -> str:
        """
        Generate an answer using Google Gemini REST API given context, question, mode, and language.
        Rotates across available API keys round-robin.
        """
        api_keys = _get_api_keys_round_robin()
        if not api_keys:
            raise ValueError('Valid GEMINI_API_KEY not found.')

        models_to_try = self._get_candidate_models()

        mode_instructions = {
            'simple': "EXPLAIN LIKE I'M A BEGINNER: Use extremely simple language, simple real-world comparisons, and avoid jargon.",
            'example': "GIVE DETAILED EXAMPLES: Illustrate every concept with step-by-step practical examples.",
            'analogy': "USE ANALOGIES: Use creative analogies from everyday life to explain the concept intuitively.",
            'normal': "Provide a clear, academic explanation."
        }
        style_instruction = mode_instructions.get(explanation_mode, mode_instructions['normal'])

        lang_instruction = ""
        if language and language.lower() != 'english':
            lang_instruction = f"IMPORTANT: Respond in {language}. If technical terms are involved, keep the English term in parentheses alongside the translation."

        history_str = ""
        if history:
            formatted_history = []
            for msg in history[-6:]:
                role = "Student" if msg.get('role') == 'user' else "AI Assistant"
                formatted_history.append(f"{role}: {msg.get('content', '')}")
            history_str = "\n" + "\n".join(formatted_history) + "\n"

        prompt = f"""{SYSTEM_PROMPT}

STYLE REQUIREMENT: {style_instruction}
{lang_instruction}

---

PREVIOUS CONVERSATION HISTORY:{history_str if history_str else " None"}

---

CONTEXT FROM DOCUMENTS:
{context}

---

STUDENT'S QUESTION:
{question}

ANSWER:"""

        payload = {
            'contents': [{'parts': [{'text': prompt}]}],
            'generationConfig': {
                'temperature': 0.2,
                'maxOutputTokens': 600,
                'topP': 0.85,
                'topK': 20,
            }
        }

        last_error = None
        active_models = _get_active_models(models_to_try)

        for key_idx, active_key in enumerate(api_keys):
            for model_name in active_models:
                url = f'https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={active_key}'
                try:
                    masked_key = active_key[:8] + '...' + active_key[-4:]
                    logger.info(f'Trying Gemini model ({model_name}) with key [{masked_key}]...')
                    response = requests.post(url, json=payload, timeout=12)
                    if response.status_code == 200:
                        data = response.json()
                        candidates = data.get('candidates', [])
                        if candidates and 'content' in candidates[0]:
                            parts = candidates[0]['content'].get('parts', [])
                            text_parts = [p['text'] for p in parts if 'text' in p and p['text'].strip()]
                            if text_parts:
                                return "\n".join(text_parts).replace('**', '').strip()
                    elif response.status_code == 404:
                        # Model not available for this key, try next model without discarding key
                        logger.info(f'Model {model_name} not found (404) for this key, trying next model...')
                        continue
                    elif response.status_code in (429, 503):
                        # Rate limit exceeded on this key: cool down this key for 60s and switch to next key immediately
                        _key_cooldown[active_key] = time.time() + 60.0
                        logger.warning(f'Gemini key [{masked_key}] rate limited (HTTP {response.status_code}) — cooling down 60s, trying next key...')
                        last_error = f'Key rate limited ({response.status_code})'
                        break  # rotate to next key immediately
                    elif response.status_code in (403, 400):
                        _key_cooldown[active_key] = time.time() + 300.0
                        logger.warning(f'Gemini key [{masked_key}] status {response.status_code}: {response.text[:100]}')
                        last_error = f'Key error {response.status_code}'
                        break  # rotate to next key immediately
                    else:
                        last_error = f'HTTP {response.status_code}: {response.text[:100]}'
                except Exception as e:
                    logger.warning(f'Gemini model ({model_name}) error: {e}')
                    last_error = str(e)

        raise RuntimeError(f'Gemini API error: All keys and models exhausted. Last error: {last_error}')

    def stream_answer(
        self,
        context: str,
        question: str,
        explanation_mode: str = 'normal',
        language: str = 'English',
        history: list = None,
    ):
        """
        Stream answer tokens from Gemini via SSE (streamGenerateContent).
        Yields text chunks as they arrive — first token in ~1.2s.
        Rotates across available API keys round-robin.
        """
        import json
        api_keys = _get_api_keys_round_robin()
        if not api_keys:
            raise ValueError('Valid GEMINI_API_KEY not found.')

        mode_instructions = {
            'simple': "Use extremely simple language and real-world comparisons.",
            'example': "Illustrate every concept with step-by-step practical examples.",
            'analogy': "Use creative everyday analogies to explain concepts.",
            'normal': "Provide a clear, academic explanation.",
        }
        style_instruction = mode_instructions.get(explanation_mode, mode_instructions['normal'])
        lang_instruction = (
            f"IMPORTANT: Respond in {language}. Keep technical terms in English in parentheses."
            if language and language.lower() != 'english' else ""
        )

        history_str = ""
        if history:
            lines = []
            for msg in history[-4:]:
                role = "Student" if msg.get('role') == 'user' else "AI"
                lines.append(f"{role}: {msg.get('content', '')}")
            history_str = "\n" + "\n".join(lines) + "\n"

        prompt = f"""{SYSTEM_PROMPT}

STYLE: {style_instruction}
{lang_instruction}

PREVIOUS CONVERSATION:{history_str if history_str else ' None'}

CONTEXT FROM DOCUMENTS:
{context}

STUDENT'S QUESTION:
{question}

ANSWER:"""

        payload = {
            'contents': [{'parts': [{'text': prompt}]}],
            'generationConfig': {
                'temperature': 0.1,
                'maxOutputTokens': 300,
                'topP': 0.85,
                'topK': 20,
            },
        }

        models_to_try = self._get_candidate_models()
        active_models = _get_active_models(models_to_try)
        last_error = None

        for active_key in api_keys:
            masked_key = active_key[:8] + '...' + active_key[-4:]
            for model_name in active_models:
                stream_url = (
                    f'https://generativelanguage.googleapis.com/v1beta/models/'
                    f'{model_name}:streamGenerateContent?key={active_key}&alt=sse'
                )
                try:
                    logger.info(f'Streaming from {model_name} with key [{masked_key}]...')
                    with requests.post(stream_url, json=payload, stream=True, timeout=(3.5, 25)) as resp:
                        if resp.status_code == 200:
                            yielded = False
                            for raw_line in resp.iter_lines():
                                if not raw_line:
                                    continue
                                line = raw_line.decode('utf-8') if isinstance(raw_line, bytes) else raw_line
                                if not line.startswith('data: '):
                                    continue
                                data_str = line[6:].strip()
                                if data_str in ('', '[DONE]'):
                                    continue
                                try:
                                    data = json.loads(data_str)
                                    cands = data.get('candidates', [])
                                    if cands and 'content' in cands[0]:
                                        for part in cands[0]['content'].get('parts', []):
                                            if 'text' in part and part['text']:
                                                yield part['text']
                                                yielded = True
                                except json.JSONDecodeError:
                                    pass
                            if yielded:
                                return  # streaming succeeded
                        elif resp.status_code == 404:
                            logger.info(f'Streaming: model {model_name} returned 404 for this key, trying next model...')
                            continue
                        elif resp.status_code in (429, 503):
                            _key_cooldown[active_key] = time.time() + 60.0
                            logger.warning(f'Streaming: key [{masked_key}] hit 429/503 — cooling down 60s, rotating key...')
                            last_error = f'Key rate limited ({resp.status_code})'
                            break  # rotate to next key immediately
                        elif resp.status_code in (403, 400):
                            _key_cooldown[active_key] = time.time() + 300.0
                            last_error = f'Key error ({resp.status_code})'
                            break  # rotate to next key immediately
                        else:
                            last_error = f'{model_name} HTTP {resp.status_code}'
                except Exception as stream_err:
                    last_error = str(stream_err)
                    logger.warning(f'Streaming failed ({model_name}) with [{masked_key}]: {stream_err}')
                    # Connection dropped/timed out: cool down this key for 60s and try next key
                    _key_cooldown[active_key] = time.time() + 60.0
                    break

                # ── Fallback: non-streaming generateContent ──────────────────
                fallback_url = (
                    f'https://generativelanguage.googleapis.com/v1beta/models/'
                    f'{model_name}:generateContent?key={active_key}'
                )
                try:
                    logger.info(f'Non-streaming fallback for {model_name} with [{masked_key}]...')
                    fb_resp = requests.post(fallback_url, json=payload, timeout=(3.5, 15))
                    if fb_resp.status_code == 200:
                        fb_data = fb_resp.json()
                        fb_cands = fb_data.get('candidates', [])
                        if fb_cands and 'content' in fb_cands[0]:
                            for part in fb_cands[0]['content'].get('parts', []):
                                if 'text' in part and part['text']:
                                    yield part['text']
                            return  # fallback succeeded
                    elif fb_resp.status_code == 404:
                        continue
                    elif fb_resp.status_code in (429, 503):
                        _key_cooldown[active_key] = time.time() + 60.0
                        break
                except Exception as fb_err:
                    last_error = str(fb_err)

        raise RuntimeError(f'Gemini unavailable: {last_error}')

    def generate_raw(
        self,
        prompt: str,
        max_tokens: int = 1500,
        temperature: float = 0.3,
        is_json: bool = False,
    ) -> str:
        """
        Directly generate text or JSON using Gemini REST API with the fastest available models.
        Rotates across available API keys round-robin.
        Ideal for Exam Prep, Question Paper Analysis, and AI Quiz Mode.
        """
        api_keys = _get_api_keys_round_robin()
        if not api_keys:
            raise ValueError('Valid GEMINI_API_KEY not found.')

        models_to_try = self._get_candidate_models()

        generation_config = {
            'temperature': temperature,
            'maxOutputTokens': max_tokens,
            'topP': 0.9,
            'topK': 40,
        }
        if is_json:
            generation_config['responseMimeType'] = 'application/json'

        payload = {
            'contents': [{'parts': [{'text': prompt}]}],
            'generationConfig': generation_config,
        }

        last_error = None
        active_models = _get_active_models(models_to_try)

        for key_idx, active_key in enumerate(api_keys):
            masked_key = active_key[:8] + '...' + active_key[-4:]
            for model_name in active_models:
                url = f'https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={active_key}'
                try:
                    response = requests.post(url, json=payload, timeout=(6, 20))
                    if response.status_code == 200:
                        data = response.json()
                        candidates = data.get('candidates', [])
                        if candidates and 'content' in candidates[0]:
                            parts = candidates[0]['content'].get('parts', [])
                            text_parts = [p['text'] for p in parts if 'text' in p and p['text'].strip()]
                            if text_parts:
                                return "\n".join(text_parts).replace('**', '').strip()
                    elif response.status_code == 404:
                        continue
                    elif response.status_code in (429, 503):
                        _key_cooldown[active_key] = time.time() + 60.0
                        logger.warning(f'generate_raw: key [{masked_key}] hit {response.status_code} — rotating key...')
                        last_error = f'{model_name} status {response.status_code}'
                        break  # rotate to next key immediately
                    elif response.status_code in (403, 400):
                        _key_cooldown[active_key] = time.time() + 300.0
                        last_error = f'API Key status {response.status_code}'
                        break  # rotate to next key immediately
                    else:
                        last_error = f'HTTP {response.status_code}: {response.text[:100]}'
                except Exception as e:
                    last_error = str(e)

        raise RuntimeError(f'Gemini raw generation failed: {last_error}')
