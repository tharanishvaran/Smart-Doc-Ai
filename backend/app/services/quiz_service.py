import os
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
            # Fast BM25 lexical vector query (0.002s, no remote embedding delay)
            results = self.vector_service.query(
                query_embedding=None,
                user_id=user_id,
                n_results=2,
                category_id=category_id,
                query_text=topic
            )
            if not results:
                return "No specific document context found."
            return "\n\n---\n\n".join([f"[Source: {r['metadata'].get('filename', 'Doc')}]\n{r['text'][:600]}" for r in results])
        except Exception as e:
            logger.warning(f"QuizService context lookup failed: {e}")
            return ""

    def _call_llm(self, prompt: str, is_json: bool = False, max_tokens: int = 900) -> str:
        use_gemini = bool(current_app.config.get('GEMINI_API_KEY')) or bool(os.getenv('GEMINI_API_KEY'))
        if use_gemini:
            res = self.gemini_service.generate_raw(prompt=prompt, max_tokens=max_tokens, is_json=is_json)
        else:
            res = self.ollama_service.generate_answer(context="", question=prompt)
        return res.replace('**', '') if res else res

    def generate_questions(self, user_id: int, topic: str, question_type: str, mark_type: str = '5', count: int = 5, category_id: int = None) -> str:
        context = self._get_context(user_id, topic, category_id)
        prompt = f"""You are a helpful teacher creating simple, clear exam practice questions.
Topic/Subject: {topic}
Question Category: {question_type}
Mark Allocation: {mark_type} Marks each
Number of Questions: {count}

REQUIREMENTS:
1. Questions must be SIMPLE, DIRECT, and EASY TO UNDERSTAND. Test fundamental core concepts without tricky or complicated phrasing.
2. Keep each question short and clear.
3. For each question, provide a brief, clear, 2-3 line model answer.
4. Do NOT use markdown bold formatting or asterisks (**). Output clean plain text without **.

DOCUMENT CONTEXT:
{context}

Generate {count} simple, beginner-friendly questions with concise model answers:"""
        max_tok = min(1200, 180 * count)
        return self._call_llm(prompt, max_tokens=max_tok)

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
        if not raw:
            raise ValueError("Empty response from LLM")
        cleaned = raw.replace('**', '').strip()
        cleaned = re.sub(r'^```(?:json)?\s*', '', cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r'\s*```$', '', cleaned)
        cleaned = re.sub(r'^\*\([^)]+\)\*\s*', '', cleaned)

        start_idx = cleaned.find('{')
        end_idx = cleaned.rfind('}')
        if start_idx != -1 and end_idx != -1 and end_idx > start_idx:
            candidate = cleaned[start_idx:end_idx + 1]
            try:
                return json.loads(candidate)
            except Exception:
                pass

        # Fallback: try regex extraction of individual question objects if full JSON was cut off
        try:
            return json.loads(cleaned)
        except Exception as e:
            logger.warning(f"Standard JSON parse failed: {e}. Attempting question recovery...")
            q_matches = re.findall(r'\{\s*"id":\s*\d+[^}]*?"question":\s*"[^"]+?"[^}]*?"options":\s*\[[^\]]+?\].*?\}', cleaned, re.DOTALL)
            if q_matches:
                recovered = []
                for qm in q_matches:
                    try:
                        q_obj = json.loads(qm)
                        if q_obj.get('question') and q_obj.get('options'):
                            recovered.append(q_obj)
                    except Exception:
                        continue
                if recovered:
                    return {"questions": recovered}
            raise

    def start_quiz(self, user_id: int, subject: str, topic: str, question_count: int = 5, category_id: int = None) -> dict:
        topic_phrase = self._clean_subject_topic_phrase(topic, subject)
        context = self._get_context(user_id, f"{subject} {topic}", category_id)
        prompt = f"""You are an expert academic examiner. Create a comprehensive, beginner-friendly multiple choice quiz for subject "{subject}" and topic "{topic}".

CRITICAL REQUIREMENTS:
1. Generate EXACTLY {question_count} distinct, simple multiple-choice questions. Do not generate fewer or more.
2. Questions must test fundamental concepts clearly and directly.
3. For EVERY question provide:
   - "id": integer from 1 to {question_count}
   - "question": clear question text
   - "options": an array of EXACTLY 4 distinct short strings
   - "correct_option_index": integer (0, 1, 2, or 3) indicating the correct option
   - "correct_answer": the EXACT text of the option matching options[correct_option_index]. (MUST match one of the 4 options verbatim!)
   - "explanation": brief 1-line reason why this option is correct
   - "topic_tag": "{topic}"
4. Do NOT use markdown bold formatting or asterisks (**). Output plain text without **.
5. Output ONLY valid JSON matching the schema below.

DOCUMENT CONTEXT:
{context}

Respond ONLY in valid JSON format:
{{
  "subject": "{subject}",
  "topic": "{topic}",
  "questions": [
    {{
      "id": 1,
      "question": "Question text?",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correct_option_index": 0,
      "correct_answer": "Option A",
      "explanation": "Option A is correct because...",
      "topic_tag": "{topic}"
    }}
  ]
}}"""
        # Generous token allowance so 15-25 questions are never truncated
        max_tok = max(2500, min(8000, 220 * question_count))
        raw = self._call_llm(prompt, is_json=True, max_tokens=max_tok)

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

        parsed = {}
        try:
            parsed = self._clean_and_parse_json(raw)
        except Exception as e:
            logger.warning(f"Quiz JSON parsing failed for '{subject} - {topic}': {e}")

        # Validate and sanitize questions
        raw_questions = parsed.get('questions', []) if isinstance(parsed, dict) else []
        valid_questions = []

        for q in raw_questions:
            if not isinstance(q, dict) or not q.get('question'):
                continue
            opts = q.get('options', [])
            if not isinstance(opts, list) or len(opts) < 2:
                continue
            opts = [str(o).strip() for o in opts if str(o).strip()]
            while len(opts) < 4:
                opts.append(f"Additional option {chr(65 + len(opts))}")
            opts = opts[:4]

            corr_idx = q.get('correct_option_index')
            if not isinstance(corr_idx, int) or corr_idx < 0 or corr_idx >= len(opts):
                corr_idx = 0
                if q.get('correct_answer'):
                    ca_str = str(q.get('correct_answer')).strip().lower()
                    for oi, opt in enumerate(opts):
                        if opt.lower() == ca_str:
                            corr_idx = oi
                            break

            # Guarantee that correct_answer is identical to the option at correct_option_index
            correct_ans_text = opts[corr_idx]
            expl = str(q.get('explanation') or f"{correct_ans_text} is the correct answer for this question.").strip()

            valid_questions.append({
                "id": len(valid_questions) + 1,
                "question": str(q.get('question')).strip(),
                "options": opts,
                "correct_option_index": corr_idx,
                "correct_answer": correct_ans_text,
                "explanation": expl,
                "topic_tag": str(q.get('topic_tag') or topic).strip()
            })

        # Dynamic fallback / backfill to guarantee EXACTLY question_count questions
        if len(valid_questions) < question_count:
            sub_clean = subject.strip() or "Subject"
            top_clean = topic.strip() or "Topic"
            aspects = [
                ("primary objective", "Providing standardized systematic operation", "Manual unverified execution", "Eliminating structured design", "Bypassing foundational protocols"),
                ("fundamental role", f"Ensuring consistent and modular behavior in {top_clean}", f"Hardcoding isolated routines", f"Randomizing operations in {sub_clean}", f"Disabling safety checks"),
                ("key advantage", "Higher reliability, maintainability, and clean architecture", "Greater code obfuscation", "Slower execution time", "Increased system vulnerability"),
                ("standard methodology", "Systematic analysis, design, and modular implementation", "Arbitrary trial and error", "Omitting boundary validation", "Ignoring specifications"),
                ("primary consideration", "Correct state management and robustness", "Unnecessary resource consumption", "Removing error handling", "Circumventing architectural patterns"),
                ("typical lifecycle stage", "Continuous validation, maintenance, and enhancement", "One-time unmonitored deployment", "Skipping testing phases", "Immediate deprecation"),
                ("essential attribute", "High coherence and well-defined scope", "Tight unmaintainable coupling", "Unstructured flow control", "Redundant dependencies"),
                ("core challenge", "Balancing trade-offs and handling edge cases", "Avoiding all structured documentation", "Overwriting core dependencies", "Neglecting validation"),
                ("recommended approach", "Adhering to verified standards and clean modular patterns", "Ignoring established best practices", "Bypassing encapsulation", "Relying on deprecated mechanisms"),
                ("defining characteristic", "Deterministic, predictable, and verifiable outcomes", "Randomized non-reproducible outcomes", "Unchecked memory or state mutations", "Fragile external coupling"),
                ("common use case", f"Solving complex domain problems within {sub_clean}", "Trivial redundant calculations", "Bypassing authorization", "Generating uncontrolled side effects"),
                ("main objective during evaluation", "Assessing structural integrity and correctness", "Ignoring performance bottlenecks", "Disabling automated tests", "Hardcoding test results"),
                ("standard metric for quality", "Accurate execution matching specified criteria", "Arbitrary line count", "Excessive code complexity", "Uncontrolled branching factor"),
                ("governing design principle", "Separation of concerns and high cohesion", "Monolithic coupling", "Unrestricted global mutations", "Redundant code duplication"),
                ("best practice for debugging", "Isolating components and inspecting input/output state", "Guessing without logging", "Deleting error messages", "Suppressing all exceptions"),
                ("significance in modern applications", f"Forms the foundational building block for {top_clean} workflows", "Has no practical modern relevance", "Only used in legacy deprecated environments", "Superseded by arbitrary scripting"),
                ("primary data handling requirement", "Consistent formatting, validation, and integrity", "Accepting unsanitized input directly", "Dropping state randomly", "Bypassing boundary checks"),
                ("key feature", "Scalable, reusable, and testable modules", "Inflexible monolithic scripts", "Fragile hardcoded constants", "Non-reusable one-off logic"),
                ("architectural layer", f"Core logical layer managing {top_clean} capabilities", "Uncontrolled physical hardware", "Unregulated bypass layer", "Transient scratch buffer"),
                ("primary outcome", "Reliable, performant, and maintainable software system", "Unpredictable runtime crashes", "High technical debt with zero extensibility", "Silent calculation errors")
            ]

            while len(valid_questions) < question_count:
                curr_num = len(valid_questions) + 1
                aspect_idx = (curr_num - 1) % len(aspects)
                label, correct_opt, wrong1, wrong2, wrong3 = aspects[aspect_idx]

                opts = [correct_opt, wrong1, wrong2, wrong3]
                rot = (curr_num - 1) % 4
                opts = opts[rot:] + opts[:rot]
                correct_idx = (4 - rot) % 4

                valid_questions.append({
                    "id": curr_num,
                    "question": f"What is the {label} of {top_clean} in {sub_clean}?",
                    "options": opts,
                    "correct_option_index": correct_idx,
                    "correct_answer": opts[correct_idx],
                    "explanation": f"The {label} of {top_clean} is {opts[correct_idx]}.",
                    "topic_tag": top_clean
                })

        valid_questions = valid_questions[:question_count]

        return {
            "attempt_id": attempt.id,
            "subject": subject,
            "topic": topic,
            "questions": valid_questions
        }

    def evaluate_answer(self, user_id: int, attempt_id: int, question: str, user_answer: str, expected_answer: str = "", topic_tag: str = "", explanation: str = "") -> dict:
        u_ans_clean = str(user_answer).strip()
        exp_clean = str(expected_answer).strip()

        # Instantaneous direct evaluation when expected_answer is known (MCQs)
        if exp_clean:
            import re
            u_norm = u_ans_clean.lower()
            exp_norm = exp_clean.lower()

            is_correct = (u_norm == exp_norm)
            if not is_correct:
                u_sub = re.sub(r'^[a-d][.)]\s*', '', u_norm).strip()
                exp_sub = re.sub(r'^[a-d][.)]\s*', '', exp_norm).strip()
                if u_sub and exp_sub and (u_sub == exp_sub or u_sub in exp_norm or exp_sub in u_norm):
                    is_correct = True

            score_earned = 1.0 if is_correct else 0.0
            weakness = "None" if is_correct else f"Review fundamental principles of {topic_tag or 'this concept'}."
            expl = explanation.strip() if explanation else f"{expected_answer} is the correct answer."

            eval_data = {
                "is_correct": is_correct,
                "score_earned": score_earned,
                "correct_answer": expected_answer,
                "explanation": expl,
                "weakness_identified": weakness
            }
        else:
            # Fallback for open-ended questions without pre-determined answer
            prompt = f"""Evaluate student's answer simply, accurately, and quickly.
Do NOT use asterisks (**).

Question: {question}
Expected Concept: {expected_answer}
Student Answer: {user_answer}

Respond ONLY in valid JSON format matching:
{{
  "is_correct": true,
  "score_earned": 1.0,
  "correct_answer": "Concise correct answer...",
  "explanation": "Brief 1-2 sentence simple explanation.",
  "weakness_identified": "Identified gap in simple words (or 'None' if correct)"
}}"""
            try:
                raw = self._call_llm(prompt, is_json=True, max_tokens=300)
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
