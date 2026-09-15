from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.services.quiz_service import QuizService

quiz_bp = Blueprint('quiz', __name__)
quiz_service = QuizService()


@quiz_bp.route('/generate-questions', methods=['POST'])
@jwt_required()
def generate_questions():
    user_id = int(get_jwt_identity())
    data = request.get_json() or {}
    topic = data.get('topic', 'General Topic')
    question_type = data.get('question_type', 'MCQs')
    mark_type = str(data.get('mark_type', '5'))
    count = int(data.get('count', 5))
    category_id = data.get('category_id')

    try:
        content = quiz_service.generate_questions(
            user_id=user_id,
            topic=topic,
            question_type=question_type,
            mark_type=mark_type,
            count=count,
            category_id=category_id
        )
        return jsonify({'success': True, 'data': {'questions_text': content}})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@quiz_bp.route('/start-quiz', methods=['POST'])
@jwt_required()
def start_quiz():
    user_id = int(get_jwt_identity())
    data = request.get_json() or {}
    subject = data.get('subject', 'General Subject')
    topic = data.get('topic', 'Core Topics')
    count = int(data.get('count', 5))
    category_id = data.get('category_id')

    try:
        quiz_data = quiz_service.start_quiz(
            user_id=user_id,
            subject=subject,
            topic=topic,
            question_count=count,
            category_id=category_id
        )
        return jsonify({'success': True, 'data': quiz_data})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@quiz_bp.route('/evaluate-answer', methods=['POST'])
@jwt_required()
def evaluate_answer():
    user_id = int(get_jwt_identity())
    data = request.get_json() or {}
    attempt_id = int(data.get('attempt_id', 0))
    question = data.get('question', '')
    user_answer = data.get('user_answer', '')
    expected_answer = data.get('expected_answer', '')
    explanation = data.get('explanation', '')
    topic_tag = data.get('topic_tag', '')

    if not question or not user_answer:
        return jsonify({'success': False, 'error': 'Question and user_answer are required.'}), 400

    try:
        result = quiz_service.evaluate_answer(
            user_id=user_id,
            attempt_id=attempt_id,
            question=question,
            user_answer=user_answer,
            expected_answer=expected_answer,
            topic_tag=topic_tag,
            explanation=explanation
        )
        return jsonify({'success': True, 'data': result})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@quiz_bp.route('/dashboard-stats', methods=['GET'])
@jwt_required()
def get_dashboard_stats():
    user_id = int(get_jwt_identity())
    try:
        stats = quiz_service.get_dashboard_stats(user_id)
        return jsonify({'success': True, 'data': stats})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500
