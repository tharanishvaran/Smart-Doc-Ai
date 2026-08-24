import os
import requests
import logging
from flask import current_app

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are Smart Doc AI, an expert academic assistant specializing in document understanding and knowledge retrieval.

CORE OPERATING GUIDELINES:
1. PRIMARY CONTEXT FOCUS:
   - When "CONTEXT FROM DOCUMENTS" is provided below, you MUST thoroughly analyze and synthesize your answer from that context.
   - Directly extract and explain definitions, facts, numbers, methodologies, formulas, algorithms, and concepts present in the document chunks.
   - Connect related points across chunks to provide a complete, well-reasoned response.
   - Do NOT add repetitive inline citation markers like "[Source: ...]" or "[Source 1: ...]" inside your response text.

2. COMPREHENSIVE & HELPFUL EXPLANATION:
   - Answer the student's question directly, clearly, and authoritatively based on the document context.
   - Structure your response with clean markdown headings, bullet points, and syntax-highlighted code blocks where applicable.
   - Never truncate explanations or code snippets prematurely."""


class GeminiService:
    """Communicates with Google Gemini API using high-performance HTTP REST calls."""

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
        """
        raw_api_key = current_app.config.get('GEMINI_API_KEY') or os.getenv('GEMINI_API_KEY', '')
        if not raw_api_key:
            raise ValueError('GEMINI_API_KEY is not configured in Render environment variables.')

        # Support single or multiple comma-separated keys (e.g. key1, key2, key3)
        api_keys = [k.strip(' "\'\r\n\t') for k in raw_api_key.split(',') if k.strip(' "\'\r\n\t')]
        if not api_keys:
            raise ValueError('Valid GEMINI_API_KEY not found.')

        preferred_model = current_app.config.get('GEMINI_MODEL', 'gemini-3.5-flash-lite')
        max_tokens = current_app.config.get('GEMINI_MAX_TOKENS', 4096)
        
        candidate_models = [
            preferred_model, 
            'gemini-3.5-flash-lite', 
            'gemini-3.5-flash', 
            'gemini-2.5-flash', 
            'gemini-1.5-flash',
            'gemini-3.6-flash'
        ]
        
        # Deduplicate while preserving order
        models_to_try = []
        for m in candidate_models:
            if m and m not in models_to_try:
                models_to_try.append(m)

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
            for msg in history[-6:]:  # include up to last 6 turns
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
                'temperature': 0.3,
                'maxOutputTokens': max_tokens,
            }
        }

        last_error = None
        # Try each API key in rotation
        for key_idx, active_key in enumerate(api_keys):
            for model_name in models_to_try:
                url = f'https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={active_key}'
                try:
                    logger.info(f'Trying Gemini model ({model_name}) with API Key #{key_idx + 1}...')
                    response = requests.post(url, json=payload, timeout=30)
                    if response.status_code == 200:
                        data = response.json()
                        candidates = data.get('candidates', [])
                        if candidates and 'content' in candidates[0]:
                            parts = candidates[0]['content'].get('parts', [])
                            text_parts = [p['text'] for p in parts if 'text' in p and p['text'].strip()]
                            if text_parts:
                                answer = "\n".join(text_parts).strip()
                                logger.info(f'Gemini model ({model_name}) responded successfully!')
                                return answer
                    elif response.status_code in (429, 403, 400):
                        logger.warning(f'Gemini API Key #{key_idx + 1} ({model_name}) status {response.status_code}: {response.text[:120]}')
                        last_error = f'Key #{key_idx + 1} error: {response.text[:120]}'
                        # If rate limited (429) or invalid key (400/403), break to next key
                        break
                    else:
                        logger.warning(f'Gemini model ({model_name}) status {response.status_code}: {response.text[:120]}')
                        last_error = f'HTTP {response.status_code}: {response.text[:120]}'
                except Exception as e:
                    logger.warning(f'Gemini model ({model_name}) error: {e}')
                    last_error = str(e)

        raise RuntimeError(f'All Gemini API keys/models failed. Last error: {last_error}')

