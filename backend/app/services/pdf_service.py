try:
    import pymupdf as fitz
except ImportError:
    import fitz

import re
import logging

logger = logging.getLogger(__name__)


class PDFService:
    """Handles PDF text extraction using PyMuPDF."""
    
    @staticmethod
    def extract_text_by_page(file_path: str) -> list[dict]:
        """
        Extract text from a PDF file, page by page.
        
        Returns a list of dicts:
        [
            {'page_number': 1, 'text': '...'},
            {'page_number': 2, 'text': '...'},
            ...
        ]
        
        Raises ValueError if PDF has no extractable text.
        """
        pages = []
        
        try:
            doc = fitz.open(file_path)
        except Exception as e:
            raise ValueError(f'Failed to open PDF: {str(e)}')
        
        total_pages = len(doc)
        total_text_length = 0
        
        for page_num in range(total_pages):
            page = doc[page_num]
            raw_text = page.get_text()
            cleaned_text = PDFService._clean_text(raw_text)
            
            if cleaned_text.strip():
                pages.append({
                    'page_number': page_num + 1,  # 1-indexed
                    'text': cleaned_text,
                    'char_count': len(cleaned_text),
                })
                total_text_length += len(cleaned_text)
        
        doc.close()
        
        if total_text_length == 0:
            raise ValueError(
                'This PDF appears to be a scanned image or contains no extractable text. '
                'OCR support can be added in a future update.'
            )
        
        logger.info(f'Extracted text from {total_pages} pages ({total_text_length} chars) in {file_path}')
        return pages
    
    @staticmethod
    def get_page_count(file_path: str) -> int:
        """Return the number of pages in a PDF."""
        try:
            doc = fitz.open(file_path)
            count = len(doc)
            doc.close()
            return count
        except Exception as e:
            raise ValueError(f'Failed to read PDF: {str(e)}')
    
    @staticmethod
    def _clean_text(text: str) -> str:
        """Clean extracted text — remove excessive whitespace, fix linebreaks and hyphenations."""
        if not text:
            return ''
        
        # Normalize line endings
        text = text.replace('\r\n', '\n').replace('\r', '\n')
        # Remove null bytes and control chars
        text = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', '', text)
        # Fix hyphenated words broken across line breaks
        text = re.sub(r'(\w+)-\n(\w+)', r'\1\2', text)
        # Collapse 3+ newlines to double newline
        text = re.sub(r'\n{3,}', '\n\n', text)
        
        # Merge soft line breaks within paragraphs
        paragraphs = text.split('\n\n')
        cleaned_paras = []
        for p in paragraphs:
            lines = [l.strip() for l in p.split('\n') if l.strip()]
            if lines:
                cleaned_paras.append(' '.join(lines))
        
        return '\n\n'.join(cleaned_paras).strip()
