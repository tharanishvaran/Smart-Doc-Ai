import os
import logging
from flask import Flask

from app.config import get_config
from app.extensions import db, jwt, cors, bcrypt
from app.utils.error_handlers import register_error_handlers

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(name)s: %(message)s',
)


def create_app():
    """Flask application factory."""
    app = Flask(__name__)

    # Load configuration
    config = get_config()
    app.config.from_object(config)

    # Ensure upload and chroma folders exist (resolve relative paths to absolute)
    _backend_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    for folder_key in ('UPLOAD_FOLDER', 'CHROMA_PERSIST_DIRECTORY'):
        folder = app.config.get(folder_key, '')
        if folder and not os.path.isabs(folder):
            app.config[folder_key] = os.path.normpath(os.path.join(_backend_root, folder))
        os.makedirs(app.config[folder_key], exist_ok=True)

    # Initialize extensions
    db.init_app(app)
    jwt.init_app(app)
    bcrypt.init_app(app)
    cors.init_app(app, resources={r'/api/*': {
        'origins': '*',
        'allow_headers': ['Content-Type', 'Authorization'],
        'methods': ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
    }})

    # Bind Celery
    from app.celery_app import make_celery
    celery = make_celery(app)
    app.celery = celery

    # Register blueprints
    from app.routes.auth import auth_bp
    from app.routes.documents import documents_bp
    from app.routes.chat import chat_bp
    from app.routes.categories import categories_bp
    from app.routes.dashboard import dashboard_bp
    from app.routes.exam_prep import exam_prep_bp
    from app.routes.quiz import quiz_bp

    app.register_blueprint(auth_bp, url_prefix='/api/auth')
    app.register_blueprint(documents_bp, url_prefix='/api/documents')
    app.register_blueprint(chat_bp, url_prefix='/api/chat')
    app.register_blueprint(categories_bp, url_prefix='/api/categories')
    app.register_blueprint(dashboard_bp, url_prefix='/api/dashboard')
    app.register_blueprint(exam_prep_bp, url_prefix='/api/exam-prep')
    app.register_blueprint(quiz_bp, url_prefix='/api/quiz')

    @app.route('/api/health', methods=['GET'])
    def api_health():
        return {'status': 'healthy', 'rag_engine': 'ready', 'service': 'SmartDoc AI Unified'}

    # Serve built React frontend in production (unified full-stack deployment)
    from flask import send_from_directory
    frontend_dist = os.path.abspath(os.path.join(_backend_root, '..', 'frontend', 'dist'))

    @app.route('/', defaults={'path': ''}, methods=['GET', 'HEAD'])
    @app.route('/<path:path>', methods=['GET', 'HEAD'])
    def serve_frontend(path):
        # Do not capture API routes
        if path.startswith('api/') or path == 'api':
            return {'error': 'API endpoint not found', 'path': f'/{path}'}, 404

        # Serve static file if it exists in dist/ (e.g. assets/*.js, *.css, *.png, favicon.ico)
        target_file = os.path.join(frontend_dist, path)
        if path and os.path.isfile(target_file):
            return send_from_directory(frontend_dist, path)

        # SPA fallback: serve index.html for all client routes (/login, /chat, /quiz, /exam-prep, etc.)
        index_file = os.path.join(frontend_dist, 'index.html')
        if os.path.isfile(index_file):
            return send_from_directory(frontend_dist, 'index.html')

        return {
            'status': 'online',
            'service': 'SmartDoc AI Unified Server',
            'message': 'Frontend build not found at frontend/dist. Please run npm run build.'
        }, 200


    # Register global error handlers
    register_error_handlers(app)

    # Create tables, run migrations, and seed default categories
    try:
        with app.app_context():
            db.create_all()
            _migrate_db()
            _seed_categories()
    except Exception as e:
        logging.getLogger(__name__).warning(f"Database initialization warning: {e}")

    return app



def _migrate_db():
    """Ensure missing columns exist — compatible with both SQLite and MySQL."""
    from sqlalchemy import text, inspect

    db_url = str(db.engine.url)
    is_sqlite = db_url.startswith('sqlite')

    def column_exists(table: str, column: str) -> bool:
        """Check whether a column already exists (works for SQLite & MySQL)."""
        inspector = inspect(db.engine)
        cols = [c['name'] for c in inspector.get_columns(table)]
        return column in cols

    def safe_add_column(table: str, column: str, definition: str):
        """Add a column only if it doesn't already exist."""
        if not column_exists(table, column):
            try:
                db.session.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {definition}"))
                db.session.commit()
            except Exception:
                db.session.rollback()

    # --- users table ---
    safe_add_column('users', 'avatar_url', 'TEXT NULL')
    safe_add_column('users', 'google_id', 'VARCHAR(100) NULL')
    safe_add_column('users', 'auth_provider', "VARCHAR(50) NOT NULL DEFAULT 'local'")

    # MODIFY COLUMN is MySQL-only; SQLite handles nullable via model definition at create_all()
    if not is_sqlite:
        for stmt in [
            "ALTER TABLE users MODIFY COLUMN password_hash VARCHAR(255) NULL;",
            "ALTER TABLE documents MODIFY COLUMN upload_status VARCHAR(50) NOT NULL DEFAULT 'uploaded';",
        ]:
            try:
                db.session.execute(text(stmt))
                db.session.commit()
            except Exception:
                db.session.rollback()

    # --- documents table ---
    safe_add_column('documents', 'processing_progress', 'INT NOT NULL DEFAULT 0')
    safe_add_column('documents', 'total_chunks', 'INT NOT NULL DEFAULT 0')
    safe_add_column('documents', 'error_message', 'TEXT NULL')
    safe_add_column('documents', 'updated_at', 'DATETIME NULL')
    safe_add_column('documents', 'indexed_at', 'DATETIME NULL')

    # Enable WAL journal mode for SQLite (better concurrent read performance)
    if is_sqlite:
        try:
            db.session.execute(text('PRAGMA journal_mode=WAL'))
            db.session.execute(text('PRAGMA synchronous=NORMAL'))
            db.session.execute(text('PRAGMA cache_size=-64000'))  # 64 MB cache
            db.session.commit()
        except Exception:
            db.session.rollback()



def _seed_categories():
    """Seed default categories if they don't exist yet."""
    from app.models.category import Category, DEFAULT_CATEGORIES

    if Category.query.count() == 0:
        for cat_data in DEFAULT_CATEGORIES:
            category = Category(
                name=cat_data['name'],
                description=cat_data['description'],
            )
            db.session.add(category)
        db.session.commit()
        logging.getLogger(__name__).info('Default categories seeded.')
