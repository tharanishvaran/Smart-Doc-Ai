import json
import logging
from flask import current_app
from app.services.embedding_service import EmbeddingService
from app.services.vector_service import VectorService
from app.services.gemini_service import GeminiService
from app.services.ollama_service import OllamaService

logger = logging.getLogger(__name__)


class ExamPrepService:
    """Handles Exam Preparation Strategy, AI Study Planner, Topic Priorities, Paper Analysis, and Expected Questions."""
    
    def __init__(self):
        self.embedding_service = EmbeddingService()
        self.vector_service = VectorService()
        self.gemini_service = GeminiService()
        self.ollama_service = OllamaService()

    def _get_context(self, user_id: int, query: str = "syllabus questions exam units", category_id: int = None) -> str:
        try:
            emb = self.embedding_service.embed_query(query)
            results = self.vector_service.query(emb, user_id, n_results=6, category_id=category_id)
            if not results:
                return "No document context uploaded."
            chunks = [f"[Document: {r['metadata'].get('filename', 'Doc')}]\n{r['text']}" for r in results]
            return "\n\n---\n\n".join(chunks)
        except Exception as e:
            logger.warning(f"Error fetching context for exam prep: {e}")
            return "General Knowledge Mode"

    def _call_llm(self, prompt: str) -> str:
        use_gemini = bool(current_app.config.get('GEMINI_API_KEY')) or bool(os.getenv('GEMINI_API_KEY'))
        if use_gemini:
            return self.gemini_service.generate_answer(context="", question=prompt)
        return self.ollama_service.generate_answer(context="", question=prompt)

    def _clean_and_parse_json(self, raw: str) -> dict:
        import re
        cleaned = raw.strip()
        # Remove any leading LLM note lines like *(Note: ...)*
        cleaned = re.sub(r'^\*\([^)]+\)\*\s*', '', cleaned)
        start_idx = cleaned.find('{')
        end_idx = cleaned.rfind('}')
        if start_idx != -1 and end_idx != -1 and end_idx > start_idx:
            cleaned = cleaned[start_idx:end_idx + 1]
        return json.loads(cleaned)

    def generate_strategy(self, user_id: int, subject: str, unit: str, exam_type: str, days_remaining: int, category_id: int = None) -> str:
        context = self._get_context(user_id, f"{subject} {unit} syllabus exam preparation", category_id)
        prompt = f"""You are an expert academic mentor and exam strategist.
Subject: {subject}
Unit: {unit if unit else 'All Units'}
Exam Type: {exam_type}
Days Remaining until Exam: {days_remaining} days

UPLOADED SYLLABUS & NOTES CONTEXT:
{context}

Generate a comprehensive, highly effective Exam Preparation Strategy for "{subject}".
IMPORTANT FORMATTING: Format all points clearly using bullet points (•) and concise sub-headings. Avoid long wall-of-text paragraphs.

Structure your output into:
1. 🎯 Overall Strategy & Mindset
2. 📖 Core Focus Topics for {unit if unit else 'All Units'}
3. ⏱️ Time Management & Daily Breakdown (for {days_remaining} days)
4. 📝 High-Yield Revision Techniques & Key Concepts
5. ⚠️ Common Pitfalls & How to Avoid Them"""
        return self._call_llm(prompt)

    def generate_study_plan(self, user_id: int, subject: str, days_remaining: int, category_id: int = None) -> dict:
        context = self._get_context(user_id, f"{subject} units syllabus modules topics", category_id)
        prompt = f"""You are an AI Study Planner. Create an adaptable day-by-day study schedule for a student taking an exam in {days_remaining} days for the subject "{subject}".

DOCUMENT CONTEXT:
{context}

Respond ONLY in valid JSON format matching this structure:
{{
  "subject": "{subject}",
  "total_days": {days_remaining},
  "plan": [
    {{ "day": 1, "focus": "{subject} Unit 1 - Core Foundations", "activities": ["Review key definitions & notes", "Practice core 2-mark questions"], "status": "pending" }},
    {{ "day": 2, "focus": "{subject} Unit 2 - Conceptual Modules", "activities": ["Solve previous exam papers", "Practice diagrammatic derivations"], "status": "pending" }}
  ],
  "recommendation": "Focus heavily on core weightage topics and solve past papers during final revision."
}}"""
        raw = self._call_llm(prompt)
        try:
            return self._clean_and_parse_json(raw)
        except Exception as e:
            logger.warning(f"Study plan JSON fallback for {subject}: {e}")
            return {
                "subject": subject,
                "total_days": days_remaining,
                "plan": [
                    {"day": d, "focus": f"Day {d}: {subject} Core Unit & Revision Focus", "activities": ["Review syllabus notes & key concepts", "Attempt practice exam questions"], "status": "pending"}
                    for d in range(1, days_remaining + 1)
                ],
                "recommendation": f"Dedicate balanced revision time across all {subject} modules and practice problem solving daily."
            }

    def detect_important_topics(self, user_id: int, subject: str, category_id: int = None) -> dict:
        context = self._get_context(user_id, f"{subject} question papers syllabus topics weightage", category_id)
        prompt = f"""Analyze the syllabus and previous question papers for subject "{subject}".
Identify important topics specifically for "{subject}" based on frequency and exam weightage.

DOCUMENT CONTEXT:
{context}

Respond ONLY in valid JSON format:
{{
  "high_priority": [
    {{ "topic": "High-Yield {subject} Core Concept", "reason": "Appears in 85% of exam papers (10-15 mark section)", "weightage": "High" }}
  ],
  "medium_priority": [
    {{ "topic": "Secondary {subject} Module", "reason": "Frequently asked in 5-mark conceptual section", "weightage": "Medium" }}
  ],
  "low_priority": [
    {{ "topic": "Introductory {subject} Basics", "reason": "Basic 2-mark definitions & history", "weightage": "Low" }}
  ]
}}"""
        raw = self._call_llm(prompt)
        try:
            return self._clean_and_parse_json(raw)
        except Exception as e:
            logger.warning(f"Important topics JSON fallback for {subject}: {e}")
            return {
                "high_priority": [
                    {"topic": f"{subject} Core Architecture & Algorithms", "reason": "High frequency in major 10/15 mark exam questions", "weightage": "High"},
                    {"topic": f"{subject} Key Functional Principles", "reason": "Tested in 80%+ of previous exam papers", "weightage": "High"}
                ],
                "medium_priority": [
                    {"topic": f"{subject} Secondary Implementations", "reason": "Regularly featured in 5-mark short answer questions", "weightage": "Medium"}
                ],
                "low_priority": [
                    {"topic": f"Introduction & Historical Overview of {subject}", "reason": "Basic definitions and short terminology", "weightage": "Low"}
                ]
            }

    def analyze_previous_papers(self, user_id: int, subject: str, category_id: int = None) -> str:
        context = self._get_context(user_id, f"{subject} previous question paper questions patterns marks", category_id)
        prompt = f"""Analyze uploaded previous question papers and syllabus for subject "{subject}".

DOCUMENT CONTEXT:
{context}

Provide a detailed Previous Question Paper Breakdown for "{subject}".
IMPORTANT FORMATTING: Format all key insights using clear bullet points (•) and concise sections for easy reading.

Structure:
1. 🔁 Frequently Repeated Questions & Topics
2. 📊 Unit-Wise Question & Mark Distribution
3. 💡 Question Patterns (MCQs, Short answers, Long analytical questions)
4. 🔑 Must-Study High Yield Topics for "{subject}\""""
        return self._call_llm(prompt)

    def generate_expected_questions(self, user_id: int, subject: str, category_id: int = None) -> str:
        context = self._get_context(user_id, f"{subject} syllabus question paper important topics", category_id)
        prompt = f"""Based on patterns in uploaded syllabus and previous papers for subject "{subject}", generate AI-Predicted Expected Questions for upcoming "{subject}" exam.

DOCUMENT CONTEXT:
{context}

IMPORTANT FORMATTING: Format all questions clearly using bullet points (•) with clear numbering under each category.

Categorize into:
1. 📌 Predicted 2-Mark Short Questions
2. 📌 Predicted 5-Mark Medium Questions
3. 📌 Predicted 10/15-Mark Essay & Analytical Questions"""
        return self._call_llm(prompt)
