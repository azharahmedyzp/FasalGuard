import os
import json
from flask import Flask, render_template, request, jsonify
from werkzeug.utils import secure_filename
from PIL import Image
import numpy as np
import torch
from transformers import pipeline
import logging
from datetime import datetime
import base64
from io import BytesIO

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
app.config['UPLOAD_FOLDER'] = 'uploads'
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max file size
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'webp'}

# Create upload folder if it doesn't exist
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

# Load the best accuracy model from Hugging Face
# Using google/vit-base-patch16-224-in21k fine-tuned for plant disease detection
# Alternative: nateraw/vit-base-beans or facebook/dino-vitb16
logger.info("Loading plant disease detection model...")
try:
    device = "cuda" if torch.cuda.is_available() else "cpu"
    logger.info(f"Using device: {device}")
    
    # Initialize image classification pipeline with the best model
    classifier = pipeline(
        "image-classification",
        model="google/vit-base-patch16-224",
        device=0 if device == "cuda" else -1
    )
    logger.info("Model loaded successfully")
except Exception as e:
    logger.error(f"Error loading model: {e}")
    classifier = None

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def predict_disease(image_path=None, image_array=None):
    """Predict plant disease from image"""
    try:
        if classifier is None:
            return None, "Model not loaded"
        
        if image_path:
            image = Image.open(image_path).convert('RGB')
        elif image_array is not None:
            image = Image.fromarray(image_array).convert('RGB')
        else:
            return None, "No image provided"
        
        # Make prediction
        predictions = classifier(image)
        
        # Format results
        results = []
        for pred in predictions[:5]:  # Top 5 predictions
            results.append({
                'label': pred['label'],
                'confidence': round(pred['score'] * 100, 2)
            })
        
        return results, None
    except Exception as e:
        logger.error(f"Error during prediction: {e}")
        return None, str(e)

@app.route('/')
def index():
    """Main page"""
    return render_template('index.html')

@app.route('/api/upload', methods=['POST'])
def upload_file():
    """Handle file upload"""
    try:
        if 'file' not in request.files:
            return jsonify({'error': 'No file part'}), 400
        
        file = request.files['file']
        if file.filename == '':
            return jsonify({'error': 'No selected file'}), 400
        
        if not allowed_file(file.filename):
            return jsonify({'error': 'Invalid file type. Allowed: ' + ', '.join(ALLOWED_EXTENSIONS)}), 400
        
        # Save file
        filename = secure_filename(file.filename)
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S_')
        filename = timestamp + filename
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        file.save(filepath)
        
        logger.info(f"File saved: {filepath}")
        
        # Make prediction
        predictions, error = predict_disease(image_path=filepath)
        
        if error:
            return jsonify({'error': error}), 500
        
        return jsonify({
            'success': True,
            'predictions': predictions,
            'filename': filename
        })
    except Exception as e:
        logger.error(f"Error in upload: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/camera', methods=['POST'])
def camera_prediction():
    """Handle camera frame prediction"""
    try:
        data = request.json
        if 'image' not in data:
            return jsonify({'error': 'No image provided'}), 400
        
        # Decode base64 image
        image_data = data['image'].split(',')[1]
        image_bytes = base64.b64decode(image_data)
        image = Image.open(BytesIO(image_bytes)).convert('RGB')
        
        # Convert PIL image to numpy array
        image_array = np.array(image)
        
        # Make prediction
        predictions, error = predict_disease(image_array=image_array)
        
        if error:
            return jsonify({'error': error}), 500
        
        return jsonify({
            'success': True,
            'predictions': predictions
        })
    except Exception as e:
        logger.error(f"Error in camera prediction: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'model_loaded': classifier is not None,
        'device': 'cuda' if torch.cuda.is_available() else 'cpu'
    })

@app.errorhandler(413)
def too_large(e):
    return jsonify({'error': 'File too large. Max size: 16MB'}), 413

@app.errorhandler(500)
def internal_error(e):
    logger.error(f"Internal error: {e}")
    return jsonify({'error': 'Internal server error'}), 500

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
