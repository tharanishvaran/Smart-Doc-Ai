import base64
import os
import io
import requests
import logging
from flask import current_app

logger = logging.getLogger(__name__)


class OCRService:
    """Uses Gemini Multimodal Vision API (with local Tesseract fallback) for 100% accurate OCR on image-based documents."""

    @staticmethod
    def extract_text_from_image_bytes(image_bytes: bytes, mime_type: str = 'image/png') -> str:
        """
        Extract readable text and tables from image bytes using Gemini Vision API with local OCR fallback.
        """
        if not image_bytes:
            return ""

        raw_key = ""
        try:
            if current_app:
                raw_key = current_app.config.get('GEMINI_API_KEY', '')
        except Exception:
            pass

        if not raw_key:
            raw_key = os.getenv('GEMINI_API_KEY', '')

        api_keys = [k.strip(' "\'\r\n\t') for k in raw_key.split(',') if k.strip(' "\'\r\n\t')]

        prompt = (
            "You are an expert academic document and table OCR system. "
            "Extract ALL text, student names, registration numbers, classes, sections, rankings, scores, "
            "table data, headings, columns, and rows from this document image with 100% verbatim accuracy. "
            "Format all tables as clean markdown tables with column headers. Do not omit, truncate, or summarize any details."
        )

        b64_data = base64.b64encode(image_bytes).decode('utf-8')
        models_to_try = [
            'gemini-1.5-flash',
            'gemini-2.5-flash',
            'gemini-3.5-flash-lite',
            'gemini-2.0-flash',
            'gemini-3.5-flash'
        ]

        # 1. Primary: Gemini Multimodal Vision OCR
        if api_keys:
            for key_idx, active_key in enumerate(api_keys):
                for model_name in models_to_try:
                    url = f'https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={active_key}'
                    payload = {
                        'contents': [{
                            'parts': [
                                {'text': prompt},
                                {
                                    'inline_data': {
                                        'mime_type': mime_type,
                                        'data': b64_data
                                    }
                                }
                            ]
                        }]
                    }
                    try:
                        logger.info(f"Performing Gemini Vision OCR ({model_name}) with API Key #{key_idx + 1}...")
                        res = requests.post(url, json=payload, timeout=30)
                        if res.status_code == 200:
                            data = res.json()
                            candidates = data.get('candidates', [])
                            if candidates and 'content' in candidates[0]:
                                parts = candidates[0]['content'].get('parts', [])
                                text_parts = [p['text'] for p in parts if 'text' in p and p['text'].strip()]
                                if text_parts:
                                    result = "\n".join(text_parts).strip()
                                    logger.info(f"Gemini Vision OCR ({model_name}) successfully extracted {len(result)} characters!")
                                    return result
                        elif res.status_code in (429, 403, 400):
                            logger.warning(f"Gemini Vision OCR Key #{key_idx + 1} ({model_name}) HTTP {res.status_code}: {res.text[:120]}")
                            break
                        else:
                            logger.warning(f"Gemini Vision OCR ({model_name}) HTTP {res.status_code}: {res.text[:120]}")
                    except Exception as e:
                        logger.warning(f"Gemini Vision OCR ({model_name}) network notice: {e}")

        # 2. Secondary Fallback: Local Tesseract OCR (if installed)
        try:
            from PIL import Image
            import pytesseract
            img = Image.open(io.BytesIO(image_bytes))
            tess_text = pytesseract.image_to_string(img)
            if tess_text and len(tess_text.strip()) > 10:
                logger.info(f"Tesseract local OCR extracted {len(tess_text)} characters!")
                return tess_text.strip()
        except Exception as e:
            logger.debug(f"Local Tesseract OCR skipped: {e}")

        return ""
