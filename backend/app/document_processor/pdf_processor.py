try:
    import pymupdf as fitz
except ImportError:
    import fitz

import re
import logging

logger = logging.getLogger(__name__)


class PDFProcessor:
    """Extracts text from PDF documents page by page."""
    
    @staticmethod
    def extract(file_path: str) -> list[dict]:
        pages = []
        try:
            doc = fitz.open(file_path)
        except Exception as e:
            raise ValueError(f"Failed to open PDF: {str(e)}")
        
        total_pages = len(doc)
        total_chars = 0
        
        # 1. Fast Native PyMuPDF Text Extraction Loop (< 0.05s)
        for page_num in range(total_pages):
            page = doc[page_num]
            raw_text = page.get_text()
            cleaned = PDFProcessor._clean_text(raw_text)
            
            if cleaned.strip():
                pages.append({
                    'page_number': page_num + 1,
                    'section': f'Page {page_num + 1}',
                    'text': cleaned,
                    'file_type': 'pdf'
                })
                total_chars += len(cleaned)
        
        # 2. OCR Fallback ONLY if zero digital text characters were found across entire PDF
        if total_chars == 0 and total_pages > 0:
            logger.info(f"PDF {file_path} has 0 digital text characters. Attempting OCR on page 1...")
            try:
                from app.services.ocr_service import OCRService
                page = doc[0]
                pix = page.get_pixmap(dpi=120)
                png_bytes = pix.tobytes("png")
                ocr_text = OCRService.extract_text_from_image_bytes(png_bytes, 'image/png')
                if ocr_text and ocr_text.strip():
                    pages.append({
                        'page_number': 1,
                        'section': 'Page 1 (OCR)',
                        'text': ocr_text.strip(),
                        'file_type': 'pdf'
                    })
                    total_chars += len(ocr_text)
            except Exception as e:
                logger.warning(f"Failed OCR on PDF {file_path}: {e}")
        
        doc.close()
        
        if total_chars == 0:
            raise ValueError("PDF appears to be empty or contains no extractable text.")
            
        logger.info(f"Extracted {total_chars} chars across {len(pages)} pages from {file_path}")
        return pages

    @staticmethod
    def _clean_text(text: str) -> str:
        if not text:
            return ""
        # Normalize line endings
        text = text.replace('\r\n', '\n').replace('\r', '\n')
        # Remove null and control bytes
        text = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', '', text)
        # Fix hyphenated words broken across line breaks (e.g. "comput-\ner" -> "computer")
        text = re.sub(r'(\w+)-\n(\w+)', r'\1\2', text)
        # Collapse 3+ newlines to double newline
        text = re.sub(r'\n{3,}', '\n\n', text)
        
        # Merge soft line breaks within paragraphs while preserving paragraph breaks
        paragraphs = text.split('\n\n')
        cleaned_paras = []
        for p in paragraphs:
            lines = [l.strip() for l in p.split('\n') if l.strip()]
            if lines:
                cleaned_paras.append(' '.join(lines))
        
        return '\n\n'.join(cleaned_paras).strip()
