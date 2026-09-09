import os
from dotenv import load_dotenv

load_dotenv()


class Config:
    """Base configuration class."""
    
    # Flask
    SECRET_KEY = os.getenv('SECRET_KEY', 'fallback-secret-key')
    DEBUG = False
    TESTING = False
    
    # JWT
    JWT_SECRET_KEY = os.getenv('JWT_SECRET_KEY', 'fallback-jwt-secret')
    JWT_ACCESS_TOKEN_EXPIRES = 86400  # 24 hours in seconds
    
    # Google OAuth
    GOOGLE_CLIENT_ID = os.getenv('GOOGLE_CLIENT_ID', '')
    GOOGLE_CLIENT_SECRET = os.getenv('GOOGLE_CLIENT_SECRET', '')
    
    # Database
    _raw_db_url = os.getenv('DATABASE_URL', '')
    if _raw_db_url.startswith('postgres://'):
        _raw_db_url = _raw_db_url.replace('postgres://', 'postgresql://', 1)
    elif _raw_db_url.startswith('mysql://'):
        _raw_db_url = _raw_db_url.replace('mysql://', 'mysql+pymysql://', 1)
    elif not _raw_db_url:
        _raw_db_url = 'sqlite:///app.db'
    
    SQLALCHEMY_DATABASE_URI = _raw_db_url
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    # SQLite: allow multi-threaded access (required for Flask dev server & Gunicorn)
    # For MySQL/PostgreSQL the connect_args block is skipped automatically
    if _raw_db_url.startswith('sqlite'):
        SQLALCHEMY_ENGINE_OPTIONS = {
            'connect_args': {'check_same_thread': False},
        }
    elif _raw_db_url.startswith('mysql'):
        import ssl as _ssl
        _connect_args = {'connect_timeout': 3}
        if 'tidb' in _raw_db_url.lower() or 'ssl' in _raw_db_url.lower() or 'aws' in _raw_db_url.lower():
            try:
                _connect_args['ssl'] = _ssl.create_default_context()
            except Exception:
                pass
        SQLALCHEMY_ENGINE_OPTIONS = {
            'pool_recycle': 300,
            'pool_pre_ping': True,
            'connect_args': _connect_args,
        }
    else:
        SQLALCHEMY_ENGINE_OPTIONS = {
            'pool_recycle': 300,
            'pool_pre_ping': True,
        }
    
    # File Uploads
    UPLOAD_FOLDER = os.getenv('UPLOAD_FOLDER', 'uploads')
    MAX_CONTENT_LENGTH = int(os.getenv('MAX_CONTENT_LENGTH', 52428800))  # 50MB
    ALLOWED_EXTENSIONS = {'pdf', 'docx', 'doc', 'txt', 'md', 'pptx', 'png', 'jpg', 'jpeg', 'webp'}

    
    # Redis & Celery Config
    REDIS_URL = os.getenv('REDIS_URL', 'redis://localhost:6379/0')
    CELERY_BROKER_URL = os.getenv('CELERY_BROKER_URL', REDIS_URL)
    CELERY_RESULT_BACKEND = os.getenv('CELERY_RESULT_BACKEND', REDIS_URL)
    CELERY_TASK_ALWAYS_EAGER = os.getenv('CELERY_ALWAYS_EAGER', 'False').lower() == 'true'

    # Batch Processing & Concurrency Limits
    EMBEDDING_BATCH_SIZE = int(os.getenv('EMBEDDING_BATCH_SIZE', 32))
    VECTOR_BATCH_SIZE = int(os.getenv('VECTOR_BATCH_SIZE', 50))
    MAX_CONCURRENT_UPLOADS = int(os.getenv('MAX_CONCURRENT_UPLOADS', 3))

    # Rate Limiting
    RATELIMIT_DEFAULT = os.getenv('RATELIMIT_DEFAULT', '100 per day;30 per hour')
    
    # ChromaDB
    CHROMA_PERSIST_DIRECTORY = os.getenv('CHROMA_PERSIST_DIRECTORY', 'chroma_db')
    
    # Gemini API
    GEMINI_API_KEY = os.getenv('GEMINI_API_KEY', '')
    GEMINI_MODEL = os.getenv('GEMINI_MODEL', 'gemini-3.1-flash-lite')
    GEMINI_MAX_TOKENS = int(os.getenv('GEMINI_MAX_TOKENS', 4096))

    # Ollama
    OLLAMA_BASE_URL = os.getenv('OLLAMA_BASE_URL', 'http://localhost:11434')
    OLLAMA_MODEL = os.getenv('OLLAMA_MODEL', 'llama3.2:latest')
    OLLAMA_NUM_PREDICT = int(os.getenv('OLLAMA_NUM_PREDICT', 1500))
    OLLAMA_NUM_CTX = int(os.getenv('OLLAMA_NUM_CTX', 4096))
    
    # RAG Settings
    RAG_TOP_K = int(os.getenv('RAG_TOP_K', 8))
    CHUNK_SIZE = int(os.getenv('CHUNK_SIZE', 1000))
    CHUNK_OVERLAP = int(os.getenv('CHUNK_OVERLAP', 150))


class DevelopmentConfig(Config):
    """Development configuration."""
    DEBUG = True
    FLASK_ENV = 'development'


class ProductionConfig(Config):
    """Production configuration."""
    DEBUG = False
    FLASK_ENV = 'production'


class TestingConfig(Config):
    """Testing configuration."""
    TESTING = True
    SQLALCHEMY_DATABASE_URI = 'sqlite:///:memory:'


config_map = {
    'development': DevelopmentConfig,
    'production': ProductionConfig,
    'testing': TestingConfig,
}


def get_config():
    env = os.getenv('FLASK_ENV', 'development')
    return config_map.get(env, DevelopmentConfig)
