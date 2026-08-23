import requests
import logging
from flask import current_app

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are Smart Doc AI, an intelligent academic assistant helping college students.

Instructions:
- Prioritize information from the student's uploaded document context below whenever available, citing sources.
- If the question is NOT covered by the provided document context (or no documents match), answer the question completely and accurately using your general knowledge.
- Provide thorough, clear, detailed, and complete explanations. Never cut off or abbreviate code snippets or answers.
- Always provide complete, fully runnable code blocks when explaining programs or algorithms.
- Structure your response cleanly using headings, bullet points, and code blocks for maximum clarity."""


class OllamaService:
    """Communicates with the Ollama local LLM API."""
    
    def __init__(self):
        self.base_url = None
        self.model = None
        self.timeout = (2.0, 20.0)  # (connect_timeout, read_timeout) to prevent hanging if Ollama is offline
    
    def _get_config(self):
        base_url = current_app.config.get('OLLAMA_BASE_URL', 'http://localhost:11434')
        model = current_app.config.get('OLLAMA_MODEL', 'llama3.2:latest')
        num_predict = current_app.config.get('OLLAMA_NUM_PREDICT', 1500)
        num_ctx = current_app.config.get('OLLAMA_NUM_CTX', 4096)
        return base_url, model, num_predict, num_ctx
    
    def generate_answer(self, context: str, question: str) -> str:
        """
        Generate an answer using the Ollama LLM given context and a question.
        
        Args:
            context: Relevant text chunks retrieved from the vector database.
            question: The user's question.
        
        Returns:
            Generated answer string.
        
        Raises:
            RuntimeError if Ollama is unavailable or returns an error.
        """
        base_url, model, num_predict, num_ctx = self._get_config()
        
        prompt = self._build_prompt(context, question)
        
        payload = {
            'model': model,
            'prompt': prompt,
            'stream': False,
            'options': {
                'temperature': 0.3,   # Lower = more focused/grounded
                'top_p': 0.9,
                'num_predict': num_predict,  # Generous output token limit for complete answers
                'num_ctx': num_ctx,          # Expanded context window
                'num_thread': 4,            # Utilize available CPU cores
            }
        }
        
        try:
            response = requests.post(
                f'{base_url}/api/generate',
                json=payload,
                timeout=self.timeout,
            )
            response.raise_for_status()
            
            result = response.json()
            answer = result.get('response', '').strip()
            
            if not answer:
                raise RuntimeError('Ollama returned an empty response.')
            
            return answer
            
        except requests.exceptions.ConnectionError:
            raise RuntimeError(
                'Cannot connect to Ollama. Please ensure Ollama is running at '
                f'{base_url}. Run: ollama serve'
            )
        except requests.exceptions.Timeout:
            raise RuntimeError('Ollama request timed out. The model may be overloaded.')
        except requests.exceptions.HTTPError as e:
            raise RuntimeError(f'Ollama API error: {str(e)}')
    
    def is_available(self) -> bool:
        """Check if the Ollama service is reachable."""
        base_url, _ = self._get_config()
        try:
            response = requests.get(f'{base_url}/api/tags', timeout=5)
            return response.status_code == 200
        except Exception:
            return False
    
    def _build_prompt(self, context: str, question: str) -> str:
        """Build the LLM prompt with system instructions, context, and question."""
        return f"""{SYSTEM_PROMPT}

---

CONTEXT FROM DOCUMENTS:
{context}

---

STUDENT'S QUESTION:
{question}

ANSWER:"""
