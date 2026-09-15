from flask import Blueprint, request
from flask_jwt_extended import jwt_required, get_jwt_identity

from app.extensions import db
from app.models.document import Document
from app.models.chat_session import ChatSession
from app.models.category import Category
from app.services.question_analysis_service import QuestionAnalysisService
from app.utils.error_handlers import success_response, error_response

dashboard_bp = Blueprint('dashboard', __name__)
analysis_service = QuestionAnalysisService()


@dashboard_bp.route('', methods=['GET'])
@jwt_required()
def get_dashboard():
    """Return dashboard statistics for the authenticated user."""
    user_id = int(get_jwt_identity())

    total_documents = Document.query.filter_by(user_id=user_id).count()
    completed_documents = Document.query.filter(
        Document.user_id == user_id,
        Document.upload_status.in_(['INDEXED', 'completed', 'indexed', 'COMPLETED'])
    ).count()
    total_categories = Category.query.count()
    total_sessions = ChatSession.query.filter_by(user_id=user_id).count()

    recent_documents = (
        Document.query
        .filter_by(user_id=user_id)
        .order_by(Document.created_at.desc())
        .limit(5)
        .all()
    )

    recent_sessions = (
        ChatSession.query
        .filter_by(user_id=user_id)
        .order_by(ChatSession.updated_at.desc())
        .limit(5)
        .all()
    )

    # Documents by category
    from sqlalchemy import func
    category_stats = (
        db.session.query(Category.name, func.count(Document.id))
        .outerjoin(Document, Document.category_id == Category.id)
        .group_by(Category.name)
        .all()
    )

    return success_response(data={
        'stats': {
            'total_documents': total_documents,
            'completed_documents': completed_documents,
            'total_categories': total_categories,
            'total_chat_sessions': total_sessions,
        },
        'recent_documents': [d.to_dict() for d in recent_documents],
        'recent_sessions': [s.to_dict() for s in recent_sessions],
        'documents_by_category': [
            {'category': name, 'count': count}
            for name, count in category_stats
        ],
    })


@dashboard_bp.route('/analyze', methods=['POST'])
@jwt_required()
def analyze_question_papers():
    """Analyze selected previous question papers for repeated topics."""
    user_id = int(get_jwt_identity())
    data = request.get_json() or {}

    document_ids = data.get('document_ids', [])
    if not document_ids:
        return error_response('Please provide at least one document ID.', 400)

    # Fetch documents — ensure they belong to this user
    documents = Document.query.filter(
        Document.id.in_(document_ids),
        Document.user_id == user_id
    ).all()

    if not documents:
        return error_response('No valid documents found for analysis.', 404)

    try:
        result = analysis_service.analyze_question_papers(documents)
        return success_response(data=result)
    except Exception as e:
        return error_response(f'Analysis failed: {str(e)}', 500)
