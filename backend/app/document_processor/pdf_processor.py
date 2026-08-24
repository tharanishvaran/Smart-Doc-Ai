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
        
        for page_num in range(total_pages):
            page = doc[page_num]
            raw_text = page.get_text()
            cleaned = PDFProcessor._clean_text(raw_text)
            
            # Extract structured markdown tables if present in digital PDF
            table_md_parts = []
            try:
                tabs = page.find_tables()
                if tabs and hasattr(tabs, 'tables') and tabs.tables:
                    for tab in tabs.tables:
                        df = tab.extract()
                        if df and len(df) >= 1:
                            header = [str(c or '').strip() for c in df[0]]
                            if any(header):
                                md_lines = ["\n| " + " | ".join(header) + " |"]
                                md_lines.append("| " + " | ".join("---" for _ in header) + " |")
                                for r in df[1:]:
                                    row_vals = [str(c or '').strip() for c in r]
                                    md_lines.append("| " + " | ".join(row_vals) + " |")
                                table_md_parts.append("\n".join(md_lines) + "\n")
            except Exception:
                pass

            combined_page_text = cleaned
            if table_md_parts:
                combined_page_text = (cleaned + "\n\n" + "\n\n".join(table_md_parts)).strip()

            # If page has very little or zero digital text (e.g. scanned image / photo / roster), perform high-accuracy Vision OCR
            if len(combined_page_text.strip()) < 40:
                logger.info(f"Page {page_num + 1} of {file_path} has minimal digital text ({len(combined_page_text)} chars). Running Vision OCR...")
                try:
                    from app.services.ocr_service import OCRService
                    pix = page.get_pixmap(dpi=150)
                    png_bytes = pix.tobytes("png")
                    ocr_text = OCRService.extract_text_from_image_bytes(png_bytes, 'image/png')
                    if ocr_text and ocr_text.strip():
                        combined_page_text = ocr_text.strip()
                        logger.info(f"Page {page_num + 1} Vision OCR extracted {len(combined_page_text)} characters!")
                except Exception as e:
                    logger.warning(f"Failed OCR on Page {page_num + 1} of {file_path}: {e}")

            if combined_page_text.strip():
                pages.append({
                    'page_number': page_num + 1,
                    'section': f'Page {page_num + 1}',
                    'text': combined_page_text,
                    'file_type': 'pdf'
                })
                total_chars += len(combined_page_text)
        
        doc.close()
        
        if total_chars == 0:
            raise ValueError("PDF appears to be empty or contains no extractable text. Please ensure the document is clear and readable.")
            
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
