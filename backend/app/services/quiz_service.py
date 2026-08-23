import json
import logging
from flask import current_app
from app.extensions import db
from app.models.quiz import QuizAttempt, QuizAnswer
from app.services.embedding_service import EmbeddingService
from app.services.vector_service import VectorService
from app.services.gemini_service import GeminiService
from app.services.ollama_service import OllamaService

logger = logging.getLogger(__name__)


class QuizService:
    """Handles Automatic Question Generation, AI Quiz Execution, Answer Evaluation, and Performance Analytics."""

    def __init__(self):
        self.embedding_service = EmbeddingService()
        self.vector_service = VectorService()
        self.gemini_service = GeminiService()
        self.ollama_service = OllamaService()

    def _get_context(self, user_id: int, topic: str, category_id: int = None) -> str:
        try:
            emb = self.embedding_service.embed_query(topic)
            results = self.vector_service.query(emb, user_id, n_results=6, category_id=category_id)
            if not results:
                return "No specific document context found."
            return "\n\n---\n\n".join([f"[Source: {r['metadata'].get('filename', 'Doc')}]\n{r['text']}" for r in results])
        except Exception as e:
            logger.warning(f"QuizService context lookup failed: {e}")
            return ""

    def _call_llm(self, prompt: str) -> str:
        use_gemini = bool(current_app.config.get('GEMINI_API_KEY')) or bool(os.getenv('GEMINI_API_KEY'))
        if use_gemini:
            return self.gemini_service.generate_answer(context="", question=prompt)
        return self.ollama_service.generate_answer(context="", question=prompt)

    def generate_questions(self, user_id: int, topic: str, question_type: str, mark_type: str = '5', count: int = 5, category_id: int = None) -> str:
        context = self._get_context(user_id, topic, category_id)
        prompt = f"""You are a university professor creating exam questions.
Topic/Subject: {topic}
Question Category: {question_type} (e.g. MCQs, 2-mark short questions, 5-mark conceptual, 10/15-mark essay questions, Important questions, Previous-year style)
Mark Allocation: {mark_type} Marks each
Number of Questions: {count}

DOCUMENT CONTEXT:
{context}

Generate {count} high-quality academic questions with model answer guidelines for each. Format cleanly with numbering, question text, options (if MCQ), and model answers."""
        return self._call_llm(prompt)

    def _clean_subject_topic_phrase(self, topic: str, subject: str) -> str:
        t_clean = (topic or '').strip()
        s_clean = (subject or '').strip()
        if not s_clean:
            return t_clean
        if not t_clean:
            return s_clean
        if s_clean.lower() in t_clean.lower():
            return t_clean
        return f"{t_clean} in {s_clean}"

    def _clean_and_parse_json(self, raw: str) -> dict:
        import re
        cleaned = raw.strip()
        cleaned = re.sub(r'^\*\([^)]+\)\*\s*', '', cleaned)
        start_idx = cleaned.find('{')
        end_idx = cleaned.rfind('}')
        if start_idx != -1 and end_idx != -1 and end_idx > start_idx:
            cleaned = cleaned[start_idx:end_idx + 1]
        return json.loads(cleaned)

    def start_quiz(self, user_id: int, subject: str, topic: str, question_count: int = 5, category_id: int = None) -> dict:
        topic_phrase = self._clean_subject_topic_phrase(topic, subject)
        context = self._get_context(user_id, f"{subject} {topic}", category_id)
        prompt = f"""You are a university examiner creating a multiple choice quiz for subject "{subject}" and topic "{topic}".
IMPORTANT: Generate {question_count} questions with 4 unique options (A, B, C, D) relevant specifically to "{subject}" and "{topic}".
Do NOT duplicate subject names redundantly in question text or options.

DOCUMENT CONTEXT:
{context}

Respond ONLY in valid JSON format matching:
{{
  "subject": "{subject}",
  "topic": "{topic}",
  "questions": [
    {{
      "id": 1,
      "question": "What is the primary function of {topic_phrase}?",
      "options": ["Option A relevant to {topic}", "Option B relevant to {topic}", "Option C relevant to {topic}", "Option D relevant to {topic}"],
      "correct_option_index": 0,
      "correct_answer": "Option A explanation",
      "topic_tag": "{topic}"
    }}
  ]
}}"""
        raw = self._call_llm(prompt)

        attempt = QuizAttempt(
            user_id=user_id,
            subject=subject,
            topic=topic,
            total_questions=question_count,
            score=0,
            accuracy=0.0
        )
        db.session.add(attempt)
        db.session.commit()

        try:
            parsed = self._clean_and_parse_json(raw)
            parsed['attempt_id'] = attempt.id
            if not parsed.get('questions'):
                raise ValueError("No questions parsed")
            return parsed
        except Exception as e:
            logger.warning(f"Quiz JSON parsing fallback for '{subject} - {topic}': {e}")
            return {
                "attempt_id": attempt.id,
                "subject": subject,
                "topic": topic,
                "questions": [
                    {
                        "id": 1,
                        "question": f"What is the core principle of {topic_phrase}?",
                        "options": [
                            f"Standard implementation of {topic}",
                            f"Theoretical structure of {topic}",
                            f"Optimized processing of {topic}",
                            f"Alternative framework for {topic}"
                        ],
                        "correct_option_index": 0,
                        "correct_answer": f"Standard implementation of {topic_phrase}.",
                        "topic_tag": topic
                    },
                    {
                        "id": 2,
                        "question": f"Which component is essential for {topic_phrase}?",
                        "options": [
                            f"{topic} Execution Module",
                            f"{subject} Control Layer",
                            f"Data Pipeline for {topic}",
                            f"Interface layer for {topic}"
                        ],
                        "correct_option_index": 0,
                        "correct_answer": f"{topic} Execution Module performs key operations.",
                        "topic_tag": topic
                    }
                ]
            }

    def evaluate_answer(self, user_id: int, attempt_id: int, question: str, user_answer: str, expected_answer: str = "", topic_tag: str = "") -> dict:
        prompt = f"""Evaluate student's answer to the following academic question.

Question: {question}
Expected Answer Concept: {expected_answer}
Student's Answer: {user_answer}

Respond ONLY in valid JSON format matching:
{{
  "is_correct": true,
  "score_earned": 1.0,
  "correct_answer": "The full correct answer details...",
  "explanation": "Detailed explanation of why the answer is correct or incorrect...",
  "weakness_identified": "Identified conceptual gap (or 'None' if correct)"
}}"""
        raw = self._call_llm(prompt)
        try:
            eval_data = self._clean_and_parse_json(raw)
        except Exception:
            eval_data = {
                "is_correct": len(user_answer.strip()) > 10,
                "score_earned": 1.0 if len(user_answer.strip()) > 10 else 0.0,
                "correct_answer": expected_answer or "Consult uploaded notes for details.",
                "explanation": "Evaluated based on completeness of response.",
                "weakness_identified": "Conceptual accuracy needs review." if len(user_answer.strip()) <= 10 else "None"
            }

        # Save answer record
        ans_record = QuizAnswer(
            attempt_id=attempt_id,
            user_id=user_id,
            question=question,
            user_answer=user_answer,
            correct_answer=eval_data.get('correct_answer', expected_answer),
            is_correct=eval_data.get('is_correct', False),
            score_earned=eval_data.get('score_earned', 0.0),
            topic_tag=topic_tag or "General",
            explanation=eval_data.get('explanation', ''),
            weakness_identified=eval_data.get('weakness_identified', '')
        )
        db.session.add(ans_record)
        
        # Update attempt totals
        attempt = QuizAttempt.query.filter_by(id=attempt_id, user_id=user_id).first()
        if attempt:
            all_answers = QuizAnswer.query.filter_by(attempt_id=attempt_id).all()
            correct_count = sum(1 for a in all_answers if a.is_correct) + (1 if ans_record.is_correct else 0)
            total_ans = len(all_answers) + 1
            attempt.score = correct_count
            attempt.accuracy = round((correct_count / max(total_ans, 1)) * 100, 1)

        db.session.commit()
        return eval_data

    def get_dashboard_stats(self, user_id: int) -> dict:
        answers = QuizAnswer.query.filter_by(user_id=user_id).all()
        total_attempted = len(answers)
        correct_count = sum(1 for a in answers if a.is_correct)
        accuracy = round((correct_count / total_attempted * 100), 1) if total_attempted > 0 else 0.0

        # Topic breakdown
        topic_stats = {}
        for a in answers:
            tag = a.topic_tag or "General"
            if tag not in topic_stats:
                topic_stats[tag] = {'total': 0, 'correct': 0}
            topic_stats[tag]['total'] += 1
            if a.is_correct:
                topic_stats[tag]['correct'] += 1

        strong_topics = []
        weak_topics = []
        for tag, stats in topic_stats.items():
            acc = (stats['correct'] / stats['total']) * 100
            item = {'topic': tag, 'accuracy': round(acc, 1), 'attempts': stats['total']}
            if acc >= 70:
                strong_topics.append(item)
            else:
                weak_topics.append(item)

        # Return empty lists if no quizzes taken yet for this user
        return {
            'questions_attempted': total_attempted,
            'correct_questions': correct_count,
            'accuracy': accuracy,
            'strong_topics': strong_topics,
            'weak_topics': weak_topics
        }
