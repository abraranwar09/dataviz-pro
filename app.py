import os
import json
import logging
from flask import Flask, request, jsonify, render_template
import pandas as pd
import numpy as np
from datetime import datetime
import uuid
from utils.db_models import db, AnalysisSession
from utils.data_processor import process_data, chunk_process_data
from utils.ai_helper import get_ai_insights
from utils.visualization_tool import create_visualization_code
import asyncio
from functools import wraps
from sqlalchemy.exc import OperationalError, SQLAlchemyError

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Create the Flask app instance
app = Flask(__name__)

# Configure PostgreSQL database
app.config['SQLALCHEMY_DATABASE_URI'] = os.getenv('DATABASE_URL')
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['SQLALCHEMY_ECHO'] = True  # Enable SQL query logging

# Configure logging
logging.getLogger('sqlalchemy.engine').setLevel(logging.INFO)

# Initialize the database with error handling
db.init_app(app)

def is_endpoint_disabled_error(error):
    """Check if the error is due to disabled endpoint."""
    return isinstance(error, OperationalError) and "endpoint is disabled" in str(error)

def init_db():
    """Initialize database with error handling and retry logic."""
    max_retries = 3
    retry_delay = 5

    for attempt in range(max_retries):
        try:
            with app.app_context():
                # Test the connection first
                db.engine.connect()
                db.create_all()
                logger.info("Database tables created successfully")
                return True
        except OperationalError as e:
            if is_endpoint_disabled_error(e):
                logger.warning("Database endpoint is disabled, application will run without database support")
                return False
            if attempt < max_retries - 1:
                logger.warning(f"Database connection attempt {attempt + 1} failed, retrying in {retry_delay} seconds...")
                time.sleep(retry_delay)
            else:
                logger.error(f"Database initialization failed after {max_retries} attempts: {str(e)}")
                return False
        except Exception as e:
            logger.error(f"Unexpected database error: {str(e)}")
            return False

    return False

def async_route(f):
    """Decorator to handle async routes."""
    @wraps(f)
    def wrapper(*args, **kwargs):
        try:
            loop = asyncio.get_event_loop()
        except RuntimeError:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
        return loop.run_until_complete(f(*args, **kwargs))
    return wrapper

@app.route('/')
def index():
    """Render the main page."""
    return render_template('index.html')

@app.route('/upload', methods=['POST'])
def upload_file():
    """Handle data loading from fixed file in data folder."""
    try:
        file_path = os.path.join('data', 'BankCustomerData2.csv')
        if not os.path.exists(file_path):
            return jsonify({'error': 'Database source file not found'}), 400

        try:
            df = pd.read_csv(file_path, encoding='utf-8')
            
            # Get file stats
            file_size = os.path.getsize(file_path)
            numeric_cols = df.select_dtypes(include=[np.number]).columns
            
            # Validate dataframe
            if df.empty:
                return jsonify({'error': 'The database source file is empty'}), 400
            
            if len(df) < 2:
                return jsonify({'error': 'The database source file must contain at least 2 rows of data'}), 400

            if len(numeric_cols) == 0:
                return jsonify({'error': 'The database source file must contain at least one numeric column'}), 400

            # Convert DataFrame to list of dictionaries for JSON serialization
            data = df.to_dict('records')

            # Create the response with both processed data and raw data
            result = {
                'data': data,
                'metadata': {
                    'filename': 'BankCustomerData2.csv',
                    'rows': len(df),
                    'columns': len(df.columns),
                    'column_names': list(df.columns),
                    'numeric_columns': list(numeric_cols),
                    'categorical_columns': list(df.select_dtypes(exclude=[np.number]).columns),
                    'file_size': file_size,
                    'last_modified': datetime.fromtimestamp(os.path.getmtime(file_path)).strftime('%Y-%m-%d %H:%M:%S')
                }
            }
            
            return jsonify(result)

        except pd.errors.EmptyDataError:
            return jsonify({'error': 'The database source file is empty'}), 400
        except pd.errors.ParserError:
            return jsonify({'error': 'Error parsing database source file'}), 400
        except Exception as e:
            logger.error(f"Error reading database source file: {str(e)}")
            return jsonify({'error': 'Error reading database source file'}), 400

    except Exception as e:
        logger.error(f"Error in file processing: {str(e)}")
        return jsonify({'error': 'Server error processing database source file'}), 500

@app.route('/ai/analyze', methods=['POST'])
@async_route
async def analyze_data():
    """Analyze data using AI insights with conversation context."""
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No data provided'}), 400

        question = data.get('question', '').strip()
        if not question:
            return jsonify({'error': 'No question provided'}), 400

        context = data.get('context', {})
        if not isinstance(context, dict):
            return jsonify({'error': 'Invalid context format'}), 400
        
        logger.info(f"Received analysis request - Question: {question}")
        
        # Initialize or update conversation history
        conversation_history = context.get('conversation_history', [])
        
        # Add the current question to history
        conversation_history.append({
            "role": "user",
            "content": question
        })
        
        # Keep only the last 10 messages to maintain context without overload
        conversation_history = conversation_history[-10:]
        context['conversation_history'] = conversation_history

        try:
            # Get AI insights with conversation context
            result = await get_ai_insights(question, context)
            
            # Add AI response to conversation history
            if result and result.get('answer'):
                conversation_history.append({
                    "role": "assistant",
                    "content": result['answer']
                })
            
            logger.info("Data analysis completed successfully")
            return jsonify({'response': result})

        except Exception as ai_error:
            logger.error(f"AI analysis error: {str(ai_error)}")
            return jsonify({
                'response': {
                    'answer': f'Error analyzing data: {str(ai_error)}',
                    'visualization': None,
                    'web_search_used': False
                }
            })

    except Exception as e:
        logger.error(f"Error in analyze_data: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/visualize_data', methods=['POST'])
@async_route
async def visualize_data():
    """Generate visualizations based on data and request."""
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No data provided'}), 400

        context = data.get('context', {})
        question = data.get('question', '')

        if not context.get('data'):
            return jsonify({
                'error': 'No data available for visualization',
                'answer': 'Please load some data before requesting visualizations.'
            }), 400

        # Get AI insights first
        result = await get_ai_insights(question, context)
        
        if result.get('visualization'):
            return jsonify(result)
        else:
            return jsonify({
                'answer': result.get('answer', 'I could not create a visualization for your request.'),
                'visualization': None
            })

    except Exception as e:
        logger.error(f"Error creating visualization: {str(e)}")
        return jsonify({
            'error': str(e),
            'answer': 'Sorry, I encountered an error while creating the visualization.'
        }), 500

@app.route('/save_session', methods=['POST'])
@async_route
async def save_session():
    """Save the current analysis session."""
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No data provided'}), 400

        # Check if database is available
        if not hasattr(db, 'session') or not db.session:
            logger.warning("Database not available, session not saved")
            return jsonify({
                'warning': 'Database not available, session not saved',
                'session_id': str(uuid.uuid4())
            })

        session_id = data.get('session_id', str(uuid.uuid4()))
        
        try:
            session = AnalysisSession.query.filter_by(session_id=session_id).first()
            
            if session:
                session.data = data
                session.updated_at = datetime.utcnow()
            else:
                session = AnalysisSession(session_id=session_id, data=data)
                db.session.add(session)
                
            db.session.commit()
            return jsonify({'session_id': session_id})
            
        except OperationalError as e:
            if is_endpoint_disabled_error(e):
                logger.warning("Database endpoint is disabled, session not saved")
                return jsonify({
                    'warning': 'Database endpoint is disabled, session not saved',
                    'session_id': session_id
                })
            raise
            
    except SQLAlchemyError as e:
        logger.error(f"Database error in save_session: {str(e)}")
        return jsonify({
            'error': 'Database error, session not saved',
            'session_id': session_id
        }), 500
    except Exception as e:
        logger.error(f"Error saving session: {str(e)}")
        return jsonify({'error': 'Error saving session'}), 500

@app.route('/load_session/<session_id>', methods=['GET'])
def load_session(session_id):
    """Load a saved analysis session."""
    try:
        # Check if database is available
        if not hasattr(db, 'session') or not db.session:
            logger.warning("Database not available, session not loaded")
            return jsonify({'error': 'Database not available'}), 503
            
        session = AnalysisSession.query.filter_by(session_id=session_id).first()
        if not session:
            return jsonify({'error': 'Session not found'}), 404
            
        return jsonify(session.to_dict())
        
    except OperationalError as e:
        if is_endpoint_disabled_error(e):
            logger.warning("Database endpoint is disabled, session not loaded")
            return jsonify({'error': 'Database endpoint is disabled'}), 503
        logger.error(f"Database error in load_session: {str(e)}")
        return jsonify({'error': 'Database error'}), 500
    except SQLAlchemyError as e:
        logger.error(f"Database error in load_session: {str(e)}")
        return jsonify({'error': 'Database error'}), 500
    except Exception as e:
        logger.error(f"Error loading session: {str(e)}")
        return jsonify({'error': 'Error loading session'}), 500

@app.route('/sessions', methods=['GET'])
def get_sessions():
    """Get all saved analysis sessions."""
    try:
        # Check if database is available
        if not hasattr(db, 'session') or not db.session:
            logger.warning("Database not available, returning empty sessions list")
            return jsonify([])
            
        sessions = AnalysisSession.query.order_by(AnalysisSession.created_at.desc()).all()
        return jsonify([session.to_dict() for session in sessions])
    except OperationalError as e:
        if is_endpoint_disabled_error(e):
            logger.warning("Database endpoint is disabled, returning empty sessions list")
            return jsonify([])
        logger.error(f"Database error in get_sessions: {str(e)}")
        return jsonify([])
    except SQLAlchemyError as e:
        logger.error(f"Database error in get_sessions: {str(e)}")
        return jsonify([])
    except Exception as e:
        logger.error(f"Error getting sessions: {str(e)}")
        return jsonify([])

# Initialize database
db_initialized = init_db()

if __name__ == '__main__':
    try:
        # Configure logging
        logging.basicConfig(
            level=logging.INFO,
            format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
        )
        logger.info("Starting Flask application...")
        app.run(host='0.0.0.0', port=5000, debug=True)
    except Exception as e:
        logger.error(f"Failed to start Flask application: {str(e)}")
        raise
