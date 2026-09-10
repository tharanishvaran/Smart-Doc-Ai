import logging
from collections import defaultdict

from app.document_processor.processor import DocumentProcessor
from app.services.embedding_service import EmbeddingService

logger = logging.getLogger(__name__)


class QuestionAnalysisService:
    """
    Analyzes previous question papers for repeated topics and frequently asked questions.
    Uses semantic similarity for grouping related questions.
    """
    
    def __init__(self):
        self.doc_processor = DocumentProcessor()
        self.embedding_service = EmbeddingService()
    
    def analyze_question_papers(self, documents: list) -> dict:
        """
        Analyze a list of document records for repeated topics.
        """
        all_questions = []
        
        for doc in documents:
            try:
                pages = self.doc_processor.extract_text(doc.file_path)
                questions = self._extract_questions_from_pages(pages, doc.original_filename)
                all_questions.extend(questions)
            except Exception as e:
                logger.error(f'Failed to extract from {doc.original_filename}: {e}')
                continue
        
        if not all_questions:
            return {
                'total_documents': len(documents),
                'topics': [],
                'summary': 'No extractable questions found in the selected documents.',
            }
        
        # Group by semantic similarity
        grouped_topics = self._group_by_similarity(all_questions)
        
        # Sort by frequency (most repeated first)
        sorted_topics = sorted(grouped_topics, key=lambda t: t['frequency'], reverse=True)
        
        return {
            'total_documents': len(documents),
            'total_questions_found': len(all_questions),
            'topics': sorted_topics[:20],  # Top 20 topics
            'summary': f'Analyzed {len(documents)} question papers. Found {len(all_questions)} questions grouped into {len(sorted_topics)} topic clusters.',
        }
    
    def _extract_questions_from_pages(self, pages: list[dict], filename: str) -> list[dict]:
        """Extract question-like sentences from page text."""
        import re
        questions = []
        
        question_patterns = [
            r'(?:^|\n)\s*\d+[\.\)]\s+(.{20,200}[?])',   # Numbered questions ending with ?
            r'(?:^|\n)\s*(?:Q\.|Question)\s*\d+[.:]\s*(.{20,200})',  # Q1. or Question 1:
            r'(?:^|\n)\s*(?:a|b|c|d|i|ii|iii|iv)[\.\)]\s+(.{20,200})',  # Lettered sub-questions
            r'(?:Explain|Describe|Define|What is|How does|Compare|Differentiate|List|State|Discuss)\s+.{15,200}[?.]',  # Question starters
        ]
        
        for page in pages:
            text = page['text']
            for pattern in question_patterns:
                matches = re.findall(pattern, text, re.IGNORECASE | re.MULTILINE)
                for match in matches:
                    clean_q = match.strip().replace('**', '')
                    if len(clean_q) > 15:
                        questions.append({
                            'text': clean_q,
                            'filename': filename,
                            'page_number': page['page_number'],
                        })
        
        return questions
    
    def _group_by_similarity(self, questions: list[dict], threshold: float = 0.75) -> list[dict]:
        """
        Group questions by semantic similarity using embeddings.
        Returns topic clusters with frequency counts.
        """
        if not questions:
            return []
        
        texts = [q['text'] for q in questions]
        embeddings = self.embedding_service.embed_documents(texts)
        
        import numpy as np
        emb_array = np.array(embeddings)
        
        # Cosine similarity matrix
        norms = np.linalg.norm(emb_array, axis=1, keepdims=True)
        norms = np.where(norms == 0, 1, norms)
        normalized = emb_array / norms
        similarity_matrix = np.dot(normalized, normalized.T)
        
        # Simple greedy clustering
        assigned = [False] * len(questions)
        clusters = []
        
        for i in range(len(questions)):
            if assigned[i]:
                continue
            
            cluster = {
                'representative': questions[i]['text'],
                'questions': [questions[i]],
                'document_names': {questions[i]['filename']},
            }
            assigned[i] = True
            
            for j in range(i + 1, len(questions)):
                if not assigned[j] and similarity_matrix[i][j] >= threshold:
                    cluster['questions'].append(questions[j])
                    cluster['document_names'].add(questions[j]['filename'])
                    assigned[j] = True
            
            clusters.append(cluster)
        
        # Format output
        topics = []
        for cluster in clusters:
            if len(cluster['questions']) >= 1:
                topics.append({
                    'topic': cluster['representative'][:150],
                    'frequency': len(cluster['document_names']),  # How many different papers it appeared in
                    'total_occurrences': len(cluster['questions']),
                    'document_names': list(cluster['document_names']),
                    'sample_questions': [q['text'] for q in cluster['questions'][:3]],
                    'note': 'Frequently appearing topic based on uploaded question papers.',
                })
        
        return topics
