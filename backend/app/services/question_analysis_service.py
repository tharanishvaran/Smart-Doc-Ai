import os
import re
import json
import logging
from app.document_processor.processor import DocumentProcessor
from app.services.embedding_service import EmbeddingService, _term_embedding
from app.services.storage_service import get_storage_service
from app.services.vector_service import VectorService, _load_store
from app.services.gemini_service import GeminiService

logger = logging.getLogger(__name__)


class QuestionAnalysisService:
    """
    Analyzes previous question papers for repeated topics and frequently asked questions.
    Extracts the EXACT questions from each document and uses Gemini AI intelligence
    (with deterministic semantic clustering fallback) to find cross-paper recurrence.
    """

    def __init__(self):
        self.doc_processor = DocumentProcessor()
        self.embedding_service = EmbeddingService()
        self.vector_service = VectorService()
        self.gemini_service = GeminiService()

    def _extract_questions_from_text(self, text: str, filename: str) -> list[dict]:
        """
        Extract exact questions from raw or processed text, handling:
        - Q1. a) Explain...
        - b) Explain...
        - 1. What is...
        - Question 1: ...
        - Filtering out markdown tables, course titles, instructions, and marks markers like [6], [8].
        """
        if not text:
            return []

        # Remove RAG Evaluation Notes or footer boilerplate
        if 'RAG Evaluation Notes' in text:
            text = text.split('RAG Evaluation Notes')[0]

        lines = text.split('\n')
        clean_lines = []
        for line in lines:
            ls = line.strip()
            # Ignore markdown table rows
            if ls.startswith('|') and ls.endswith('|'):
                continue
            # Ignore exam headers and instructions
            if re.match(r'^(?:Course|Time|Units|Maximum Marks|Instructions:?|Section [A-Z]|Page \d+)', ls, re.IGNORECASE):
                continue
            clean_lines.append(line)

        cleaned_text = '\n'.join(clean_lines)

        # Question split boundary regex
        q_split_pattern = re.compile(
            r'(?:^|\n|\s{2,}|\.\s+)(?='
            r'(?:Q(?:uestion)?\s*\d+[\.\:\)]?\s*(?:[a-z]\))?|\b\d{1,2}[\.\)]|[a-e]\))\s+'
            r'|(?:Explain|Describe|Define|What is|What are|How does|How to|Compare|Differentiate|Discuss|Illustrate|Prove|State|List|Write a C program|Write a program|Calculate|Derive|Evaluate)\b'
            r')',
            re.IGNORECASE
        )

        header_junk = re.compile(
            r'^(?:c programming|model question paper|maximum marks|instructions|time|hours|section [a-z]|units?|course|rag evaluation notes)',
            re.IGNORECASE
        )

        parts = q_split_pattern.split(cleaned_text)
        questions = []

        for part in parts:
            p = part.strip()
            # Clean marks notation like [6], [8], [7], (5 marks), [10 marks]
            p_clean = re.sub(r'\s*\[\d+\]\s*$', '', p).strip()
            p_clean = re.sub(r'\s*\(\d+\s*marks?\)\s*$', '', p_clean, flags=re.IGNORECASE).strip()
            # Collapse multiple spaces and inner newlines to a single space
            p_clean = ' '.join(p_clean.split())

            if len(p_clean) < 15:
                continue
            if header_junk.match(p_clean):
                continue

            # Must qualify as an academic question
            is_q = (
                re.match(r'^(?:Q\d+|\d+[\.\)]|[a-e]\))', p_clean, re.IGNORECASE) or
                re.search(r'\?$', p_clean) or
                re.match(r'^(?:Explain|Describe|Define|What|How|Compare|Differentiate|Discuss|Illustrate|Prove|State|List|Write|Calculate|Derive|Evaluate|Show|Find|Check)\b', p_clean, re.IGNORECASE)
            )

            if is_q:
                # Clean leading marker (e.g., "Q1. a) " or "a) " or "1. ") for clean display while keeping full question
                clean_display = re.sub(r'^(?:Q\d+[\.\:\)]?\s*(?:[a-z]\))?|\d+[\.\)]|[a-e]\))\s*', '', p_clean).strip()
                final_text = clean_display if len(clean_display) >= 15 else p_clean
                questions.append({
                    'raw_text': p_clean,
                    'text': final_text,
                    'filename': filename
                })

        return questions

    def _get_document_questions(self, doc) -> list[dict]:
        """
        Extract exact questions from a Document record using multiple fallback strategies.
        First tries direct PyMuPDF/PDF access to preserve question formatting,
        then fallback to doc_processor and VectorStore chunks.
        """
        file_path = None

        # Strategy 1: Storage service
        try:
            storage = get_storage_service()
            f_path = storage.get_file_path(doc.stored_filename)
            if f_path and os.path.exists(f_path):
                file_path = f_path
        except Exception as e:
            logger.warning(f"Storage lookup fallback for {doc.original_filename}: {e}")

        # Strategy 2: doc.file_path
        if not file_path and doc.file_path and os.path.exists(doc.file_path):
            file_path = doc.file_path

        # If local file exists, read text
        if file_path and os.path.exists(file_path):
            try:
                # If PDF, read page by page using PyMuPDF
                if file_path.lower().endswith('.pdf'):
                    try:
                        import fitz
                    except ImportError:
                        import pymupdf as fitz
                    doc_fitz = fitz.open(file_path)
                    all_text = []
                    for page in doc_fitz:
                        all_text.append(page.get_text())
                    doc_fitz.close()
                    combined_text = '\n'.join(all_text)
                    questions = self._extract_questions_from_text(combined_text, doc.original_filename)
                    if questions:
                        return questions
            except Exception as e:
                logger.warning(f"Direct fitz extraction fallback for {doc.original_filename}: {e}")

            # General document processor fallback
            try:
                pages = self.doc_processor.extract_text(file_path)
                combined_text = '\n'.join(p.get('text', '') for p in pages)
                questions = self._extract_questions_from_text(combined_text, doc.original_filename)
                if questions:
                    return questions
            except Exception as e:
                logger.warning(f"Doc processor fallback for {doc.original_filename}: {e}")

        # Strategy 3: VectorStore chunk fallback
        try:
            store = _load_store()
            chunks = store.get('chunks', [])
            doc_chunks = [
                c for c in chunks
                if int(c.get('metadata', {}).get('document_id', 0)) == doc.id
            ]
            if doc_chunks:
                chunk_text = '\n'.join(c.get('text', '') for c in doc_chunks)
                questions = self._extract_questions_from_text(chunk_text, doc.original_filename)
                if questions:
                    return questions
        except Exception as e:
            logger.warning(f"Vector store chunk fallback for {doc.original_filename}: {e}")

        return []

    def _cluster_questions_with_gemini(self, docs_questions: dict) -> dict:
        """
        Use Gemini AI to analyze exact questions across papers, identify recurring themes,
        calculate exact cross-paper frequencies, and provide exam weightage insights.
        """
        docs_summary_lines = []
        for doc_name, q_list in docs_questions.items():
            q_lines = [f"- {q['text']}" for q in q_list]
            docs_summary_lines.append(f"=== PAPER: {doc_name} ===\n" + "\n".join(q_lines))

        docs_context = "\n\n".join(docs_summary_lines)

        prompt = f"""You are an expert academic mentor and exam paper pattern analyzer.
Analyze the following EXACT exam questions extracted from {len(docs_questions)} question papers:

{docs_context}

TASK:
1. Identify all recurring exam topics / question themes across these question papers.
2. Group the recurring questions. For each recurring topic:
   - "topic": concise, descriptive exam topic name (e.g. "Looping Constructs (for, while, do-while)", "Pointers & Pointer Arithmetic", "One-Dimensional & Two-Dimensional Arrays", "Recursion & Function Calls", "Strings & Standard String Handling Functions", "Decision Making & Conditional Branching", "C Structure, Tokens & Data Types").
   - "frequency": number of papers that contain questions for this topic (integer).
   - "total_occurrences": total questions across all papers for this topic (integer).
   - "document_names": array of document filenames where questions for this topic appear.
   - "sample_questions": array of EXACT questions from the question papers belonging to this topic.
   - "note": short, high-value exam advice / expected marks weightage note.
3. Order the topics by frequency in descending order (topics appearing in the most papers come first).
4. Provide a 2-3 sentence executive "summary" highlighting key focus areas and repetition patterns.

Respond ONLY with a valid JSON object matching this schema:
{{
  "summary": "Executive analysis summary of recurring patterns...",
  "topics": [
    {{
      "topic": "Topic Name",
      "frequency": 3,
      "total_occurrences": 4,
      "document_names": ["doc1.pdf", "doc2.pdf"],
      "sample_questions": ["Exact question 1", "Exact question 2"],
      "note": "High priority topic found across 3 papers with 15+ marks."
    }}
  ]
}}"""

        try:
            raw_response = self.gemini_service.generate_raw(prompt=prompt, max_tokens=2500, is_json=True)
            if not raw_response:
                return None

            cleaned = raw_response.replace('**', '').strip()
            start_idx = cleaned.find('{')
            end_idx = cleaned.rfind('}')
            if start_idx != -1 and end_idx != -1 and end_idx > start_idx:
                cleaned = cleaned[start_idx:end_idx + 1]

            data = json.loads(cleaned)
            if 'topics' in data and isinstance(data['topics'], list) and len(data['topics']) > 0:
                return data
        except Exception as e:
            logger.warning(f"Gemini question clustering failed, using fallback: {e}")

        return None

    def _deterministic_clustering(self, all_questions: list[dict], threshold: float = 0.52) -> list[dict]:
        """
        Fast CPU-based deterministic semantic clustering fallback using normalized term embeddings.
        Groups exact questions by semantic similarity without external API calls.
        """
        if not all_questions:
            return []

        import numpy as np

        texts = [q['text'] for q in all_questions]
        embeddings = [_term_embedding(t, dim=512) for t in texts]

        emb_array = np.array(embeddings)
        norms = np.linalg.norm(emb_array, axis=1, keepdims=True)
        norms = np.where(norms == 0, 1, norms)
        normalized = emb_array / norms
        similarity_matrix = np.dot(normalized, normalized.T)

        assigned = [False] * len(all_questions)
        clusters = []

        for i in range(len(all_questions)):
            if assigned[i]:
                continue

            cluster = {
                'representative': all_questions[i]['text'],
                'questions': [all_questions[i]],
                'document_names': {all_questions[i]['filename']},
            }
            assigned[i] = True

            for j in range(i + 1, len(all_questions)):
                if not assigned[j] and similarity_matrix[i][j] >= threshold:
                    cluster['questions'].append(all_questions[j])
                    cluster['document_names'].add(all_questions[j]['filename'])
                    assigned[j] = True

            clusters.append(cluster)

        # Format clusters into topics
        topics = []
        for cluster in clusters:
            rep = cluster['representative']
            clean_title = re.sub(
                r'^(?:Explain|Describe|Define|What is|What are|Discuss|Compare|Differentiate)\s+',
                '',
                rep,
                flags=re.IGNORECASE
            ).strip().rstrip('?.')
            if len(clean_title) > 85:
                clean_title = clean_title[:82] + '...'

            freq = len(cluster['document_names'])
            tot = len(cluster['questions'])
            topics.append({
                'topic': clean_title.capitalize() if clean_title else rep[:80],
                'frequency': freq,
                'total_occurrences': tot,
                'document_names': list(cluster['document_names']),
                'sample_questions': [q['text'] for q in cluster['questions'][:5]],
                'note': f"Appears across {freq} document(s) with {tot} question variation(s)."
            })

        # Sort by frequency descending
        topics = sorted(topics, key=lambda t: (t['frequency'], t['total_occurrences']), reverse=True)
        return topics[:20]

    def analyze_question_papers(self, documents: list) -> dict:
        """
        Analyze selected documents for exact questions and recurring patterns.
        Returns:
        - summary: Executive summary
        - total_documents: Number of selected documents
        - total_questions_found: Total exact questions extracted
        - topics: Recurring question topic clusters with frequency and exact sample questions
        - exact_questions_by_doc: List of documents with their full exact question list
        """
        docs_questions = {}
        all_questions = []

        for doc in documents:
            try:
                qs = self._get_document_questions(doc)
                docs_questions[doc.original_filename] = qs
                all_questions.extend(qs)
            except Exception as e:
                logger.error(f"Error extracting questions from {doc.original_filename}: {e}")
                docs_questions[doc.original_filename] = []

        # Prepare exact_questions_by_doc
        exact_questions_by_doc = []
        for doc in documents:
            qs = docs_questions.get(doc.original_filename, [])
            exact_questions_by_doc.append({
                'document_id': doc.id,
                'document_name': doc.original_filename,
                'total_questions': len(qs),
                'questions': [q['text'] for q in qs]
            })

        # If no questions extracted at all
        if not all_questions:
            doc_names = [d.original_filename for d in documents]
            return {
                'total_documents': len(documents),
                'total_questions_found': 0,
                'topics': [],
                'exact_questions_by_doc': exact_questions_by_doc,
                'summary': f"Scanned {len(documents)} document(s). No extractable question items were detected. Ensure the files contain readable academic question text."
            }

        # Strategy A: Use Gemini AI to cluster exact questions with cross-paper analysis
        gemini_result = self._cluster_questions_with_gemini(docs_questions)
        if gemini_result and 'topics' in gemini_result and len(gemini_result['topics']) > 0:
            topics = gemini_result['topics']
            summary = gemini_result.get('summary', f"Analyzed {len(documents)} papers and identified {len(topics)} recurring question themes.")
            return {
                'total_documents': len(documents),
                'total_questions_found': len(all_questions),
                'topics': topics,
                'exact_questions_by_doc': exact_questions_by_doc,
                'summary': summary
            }

        # Strategy B: Resilient Deterministic Semantic Clustering Fallback
        topics = self._deterministic_clustering(all_questions)
        summary = f"Analyzed {len(documents)} document(s). Extracted {len(all_questions)} exact questions grouped into {len(topics)} recurring topic clusters."

        return {
            'total_documents': len(documents),
            'total_questions_found': len(all_questions),
            'topics': topics,
            'exact_questions_by_doc': exact_questions_by_doc,
            'summary': summary
        }
