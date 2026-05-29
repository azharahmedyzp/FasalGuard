// Global variables
let cameraStream = null;
let currentTab = 'upload';
let analysisHistory = JSON.parse(localStorage.getItem('analysisHistory')) || [];
const MAX_HISTORY = 10;

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    initializeEventListeners();
    checkServerHealth();
    loadTheme();
    setInterval(checkServerHealth, 10000);
});

// Initialize all event listeners
function initializeEventListeners() {
    // Tab switching
    document.querySelectorAll('.tab-button').forEach(button => {
        button.addEventListener('click', switchTab);
    });

    // Theme toggle
    document.getElementById('themeToggle').addEventListener('click', toggleTheme);

    // History and Info modals
    document.getElementById('historyBtn').addEventListener('click', showHistory);
    document.getElementById('infoBtn').addEventListener('click', showInfo);
    document.getElementById('closeHistoryBtn').addEventListener('click', closeHistoryModal);
    document.getElementById('closeInfoBtn').addEventListener('click', closeInfoModal);
    document.getElementById('modalOverlay').addEventListener('click', closeAllModals);

    // File upload
    const uploadArea = document.getElementById('uploadArea');
    const fileInput = document.getElementById('fileInput');
    const selectFileBtn = document.getElementById('selectFileBtn');

    selectFileBtn.addEventListener('click', () => fileInput.click());
    uploadArea.addEventListener('click', () => fileInput.click());
    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.classList.add('dragover');
    });
    uploadArea.addEventListener('dragleave', () => {
        uploadArea.classList.remove('dragover');
    });
    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('dragover');
        handleFileSelect(e.dataTransfer.files);
    });

    fileInput.addEventListener('change', (e) => handleFileSelect(e.target.files));

    // Clear preview button
    document.getElementById('clearPreviewBtn').addEventListener('click', clearPreview);

    // Compare feature
    const compareArea = document.getElementById('compareArea');
    const compareFileInput = document.getElementById('compareFileInput');
    const selectCompareBtn = document.getElementById('selectCompareBtn');

    selectCompareBtn.addEventListener('click', () => compareFileInput.click());
    compareArea.addEventListener('click', () => compareFileInput.click());
    compareArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        compareArea.classList.add('dragover');
    });
    compareArea.addEventListener('dragleave', () => {
        compareArea.classList.remove('dragover');
    });
    compareArea.addEventListener('drop', (e) => {
        e.preventDefault();
        compareArea.classList.remove('dragover');
        handleCompareFileSelect(e.dataTransfer.files);
    });

    compareFileInput.addEventListener('change', (e) => handleCompareFileSelect(e.target.files));

    // Camera buttons
    document.getElementById('startCameraBtn').addEventListener('click', startCamera);
    document.getElementById('stopCameraBtn').addEventListener('click', stopCamera);
    document.getElementById('captureBtn').addEventListener('click', captureAndAnalyze);

    // Results actions
    document.getElementById('downloadBtn').addEventListener('click', downloadResults);
    document.getElementById('shareBtn').addEventListener('click', shareResults);
}

// Theme toggle
function toggleTheme() {
    document.body.classList.toggle('dark-mode');
    const isDarkMode = document.body.classList.contains('dark-mode');
    localStorage.setItem('theme', isDarkMode ? 'dark' : 'light');
    updateThemeButton();
}

function loadTheme() {
    const theme = localStorage.getItem('theme') || 'light';
    if (theme === 'dark') {
        document.body.classList.add('dark-mode');
    }
    updateThemeButton();
}

function updateThemeButton() {
    const button = document.getElementById('themeToggle');
    const isDarkMode = document.body.classList.contains('dark-mode');
    button.setAttribute('title', isDarkMode ? 'Switch to light mode' : 'Switch to dark mode');
}

// Switch tabs
function switchTab(e) {
    const tabName = e.currentTarget.getAttribute('data-tab');
    currentTab = tabName;

    // Update active tab button
    document.querySelectorAll('.tab-button').forEach(btn => {
        btn.classList.remove('active');
    });
    e.currentTarget.classList.add('active');

    // Update active tab content
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });
    document.getElementById(tabName + '-tab').classList.add('active');

    // Stop camera if switching away from camera tab
    if (tabName !== 'camera' && cameraStream) {
        stopCamera();
    }
}

// Handle file selection
async function handleFileSelect(files) {
    if (files.length === 0) return;

    const file = files[0];

    // Validate file type
    if (!file.type.startsWith('image/')) {
        showError('Please select a valid image file');
        return;
    }

    // Show preview
    const reader = new FileReader();
    reader.onload = (e) => {
        document.getElementById('previewImage').src = e.target.result;
        document.getElementById('imageInfo').textContent = `File: ${file.name} | Size: ${(file.size / 1024).toFixed(2)} KB`;
        document.getElementById('previewSection').style.display = 'block';
    };
    reader.readAsDataURL(file);

    // Upload and analyze
    await uploadAndAnalyze(file);
}

// Upload and analyze image
async function uploadAndAnalyze(file) {
    const formData = new FormData();
    formData.append('file', file);

    try {
        showLoading(true, 'Analyzing plant image...');
        hideError();

        const response = await fetch('/api/upload', {
            method: 'POST',
            body: formData
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Upload failed');
        }

        displayResults(data.predictions, file.name);
        addToHistory(data.predictions[0].label, file.name);
        showSuccess('Analysis completed successfully!');
    } catch (error) {
        console.error('Error:', error);
        showError(error.message);
    } finally {
        showLoading(false);
    }
}

// Clear preview
function clearPreview() {
    document.getElementById('previewImage').src = '';
    document.getElementById('previewSection').style.display = 'none';
    document.getElementById('fileInput').value = '';
    document.getElementById('resultsSection').style.display = 'none';
}

// Compare functionality
function handleCompareFileSelect(files) {
    if (files.length === 0) return;

    const container = document.getElementById('comparePreviewsContainer');
    container.innerHTML = '';
    let fileCount = 0;

    for (let file of files) {
        if (file.type.startsWith('image/') && fileCount < 4) {
            const reader = new FileReader();
            reader.onload = (e) => {
                const item = document.createElement('div');
                item.className = 'compare-preview-item';
                const removeBtn = document.createElement('button');
                removeBtn.className = 'compare-preview-remove';
                removeBtn.textContent = '×';
                removeBtn.onclick = () => item.remove();
                
                const img = document.createElement('img');
                img.src = e.target.result;
                item.appendChild(img);
                item.appendChild(removeBtn);
                container.appendChild(item);
            };
            reader.readAsDataURL(file);
            fileCount++;
        }
    }

    if (fileCount > 0) {
        container.style.display = 'grid';
    }
}

// Start camera
async function startCamera() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'environment' },
            audio: false
        });

        cameraStream = stream;
        const video = document.getElementById('cameraVideo');
        video.srcObject = stream;

        document.getElementById('startCameraBtn').style.display = 'none';
        document.getElementById('stopCameraBtn').style.display = 'inline-block';
        document.getElementById('captureBtn').style.display = 'inline-block';

        hideError();
    } catch (error) {
        console.error('Camera error:', error);
        showError('Unable to access camera. Please check permissions.');
    }
}

// Stop camera
function stopCamera() {
    if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
        cameraStream = null;
    }

    document.getElementById('startCameraBtn').style.display = 'inline-block';
    document.getElementById('stopCameraBtn').style.display = 'none';
    document.getElementById('captureBtn').style.display = 'none';
}

// Capture and analyze from camera
async function captureAndAnalyze() {
    try {
        const video = document.getElementById('cameraVideo');
        const canvas = document.getElementById('cameraCanvas');
        const ctx = canvas.getContext('2d');

        // Set canvas size to match video
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        // Draw video frame to canvas
        ctx.drawImage(video, 0, 0);

        // Convert canvas to blob and upload
        canvas.toBlob(async (blob) => {
            const reader = new FileReader();
            reader.onload = async (e) => {
                await analyzeImage(e.target.result);
            };
            reader.readAsDataURL(blob);
        }, 'image/jpeg', 0.9);
    } catch (error) {
        console.error('Capture error:', error);
        showError('Failed to capture image');
    }
}

// Analyze image from camera
async function analyzeImage(imageData) {
    try {
        showLoading(true, 'Processing camera image...');
        hideError();

        const response = await fetch('/api/camera', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ image: imageData })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Analysis failed');
        }

        displayResults(data.predictions, 'Camera Capture');
        addToHistory(data.predictions[0].label, 'Camera Capture');
        showSuccess('Analysis completed successfully!');
    } catch (error) {
        console.error('Error:', error);
        showError(error.message);
    } finally {
        showLoading(false);
    }
}

// Display results
function displayResults(predictions, source = '') {
    if (!predictions || predictions.length === 0) {
        showError('No predictions available');
        return;
    }

    const topPred = predictions[0];
    document.getElementById('topLabel').textContent = topPred.label;
    document.getElementById('topConfidence').style.width = topPred.confidence + '%';
    document.getElementById('topConfidenceText').textContent = topPred.confidence + '%';

    // Add severity badge
    const severity = getSeverity(topPred.confidence);
    const severityBadge = document.getElementById('severityBadge');
    severityBadge.textContent = severity;
    severityBadge.style.background = getSeverityColor(topPred.confidence);

    const predList = document.getElementById('predictionsList');
    predList.innerHTML = '';

    predictions.forEach(pred => {
        const item = document.createElement('div');
        item.className = 'prediction-item';
        item.innerHTML = `
            <div class="prediction-name">${pred.label}</div>
            <div class="confidence-bar">
                <div class="confidence-fill" style="width: ${pred.confidence}%"></div>
            </div>
            <div class="confidence-text">${pred.confidence}%</div>
        `;
        predList.appendChild(item);
    });

    updateRecommendation(topPred.label);
    updateDiseaseInfo(topPred.label);

    document.getElementById('resultsSection').style.display = 'block';

    setTimeout(() => {
        document.getElementById('resultsSection').scrollIntoView({ behavior: 'smooth' });
    }, 100);
}

// Get severity level
function getSeverity(confidence) {
    if (confidence >= 90) return 'Critical';
    if (confidence >= 75) return 'High';
    if (confidence >= 60) return 'Medium';
    return 'Low';
}

// Get severity color
function getSeverityColor(confidence) {
    if (confidence >= 90) return 'rgba(231, 76, 60, 0.3)';
    if (confidence >= 75) return 'rgba(243, 156, 18, 0.3)';
    if (confidence >= 60) return 'rgba(52, 152, 219, 0.3)';
    return 'rgba(46, 204, 113, 0.3)';
}

// Update disease information
function updateDiseaseInfo(label) {
    const diseaseInfoBox = document.getElementById('diseaseInfoBox');
    const diseaseInfo = document.getElementById('diseaseInfo');
    
    const diseaseDatabase = {
        'healthy': 'Plant is healthy. Continue regular maintenance and monitoring.',
        'rust': 'Leaf rust is a fungal disease. Improve air circulation and apply fungicide if needed.',
        'powdery': 'Powdery mildew detected. Increase air circulation and use sulfur-based treatments.',
        'blight': 'Blight disease detected. Remove infected parts immediately and apply copper fungicide.',
        'spot': 'Leaf spot detected. Improve watering practices and apply fungicide.',
        'wilt': 'Wilt disease detected. Check soil moisture and root health.',
    };

    const info = Object.entries(diseaseDatabase).find(([key, val]) => 
        label.toLowerCase().includes(key)
    )?.[1] || 'Consult with a plant pathologist for accurate diagnosis.';

    diseaseInfo.textContent = info;
    diseaseInfoBox.style.display = 'block';
}

// Update recommendation based on disease
function updateRecommendation(label) {
    const recommendations = {
        'healthy': 'Your plant appears to be healthy! Continue with regular care and monitoring.',
        'disease': 'Disease detected. Consider consulting with a plant pathologist and apply appropriate fungicide if needed.',
        'rust': 'Leaf rust detected. Remove infected leaves and improve air circulation. Use appropriate fungicide.',
        'powdery': 'Powdery mildew detected. Increase air circulation and apply sulfur-based fungicide.',
        'blight': 'Blight detected. Remove infected parts and apply copper-based fungicide immediately.',
        'spot': 'Leaf spot detected. Improve watering practices (water at base) and apply fungicide.',
        'wilt': 'Wilt detected. Check soil moisture and root health. May require drainage improvement.',
        'default': 'Please consult with a plant pathologist for accurate diagnosis and treatment recommendations.'
    };

    let recommendation = recommendations.default;
    const labelLower = label.toLowerCase();

    for (const key in recommendations) {
        if (labelLower.includes(key)) {
            recommendation = recommendations[key];
            break;
        }
    }

    document.getElementById('recommendation').textContent = recommendation;
}

// Add to history
function addToHistory(disease, source) {
    const timestamp = new Date().toLocaleTimeString();
    analysisHistory.unshift({ disease, source, timestamp });
    
    if (analysisHistory.length > MAX_HISTORY) {
        analysisHistory = analysisHistory.slice(0, MAX_HISTORY);
    }
    
    localStorage.setItem('analysisHistory', JSON.stringify(analysisHistory));
}

// Download results
function downloadResults() {
    const topLabel = document.getElementById('topLabel').textContent;
    const confidence = document.getElementById('topConfidenceText').textContent;
    const recommendation = document.getElementById('recommendation').textContent;
    
    const content = `Plant Disease Detection Results\n\n` +
        `Disease: ${topLabel}\n` +
        `Confidence: ${confidence}\n` +
        `Time: ${new Date().toLocaleString()}\n\n` +
        `Recommendation:\n${recommendation}`;
    
    const blob = new Blob([content], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'plant_disease_result.txt';
    a.click();
    window.URL.revokeObjectURL(url);
    
    showSuccess('Results downloaded!');
}

// Share results
function shareResults() {
    const topLabel = document.getElementById('topLabel').textContent;
    const confidence = document.getElementById('topConfidenceText').textContent;
    
    const text = `Plant Disease Detection: ${topLabel} (${confidence} confidence)`;
    
    if (navigator.share) {
        navigator.share({
            title: 'Plant Disease Detection',
            text: text
        }).catch(() => {});
    } else {
        navigator.clipboard.writeText(text);
        showSuccess('Results copied to clipboard!');
    }
}

// Show/Close modals
function showHistory() {
    const historyList = document.getElementById('historyList');
    historyList.innerHTML = '';
    
    if (analysisHistory.length === 0) {
        historyList.innerHTML = '<p style="color: var(--text-light); text-align: center; padding: 20px;">No analysis history yet</p>';
    } else {
        analysisHistory.forEach(item => {
            const elem = document.createElement('div');
            elem.className = 'history-item';
            elem.innerHTML = `
                <div class="history-time">${item.timestamp}</div>
                <div class="history-disease">${item.disease}</div>
                <div class="history-source" style="font-size: 0.85em; color: var(--text-light); margin-top: 3px;">Source: ${item.source}</div>
            `;
            historyList.appendChild(elem);
        });
    }
    
    document.getElementById('historyModal').classList.add('active');
    document.getElementById('modalOverlay').classList.add('active');
}

function showInfo() {
    document.getElementById('infoModal').classList.add('active');
    document.getElementById('modalOverlay').classList.add('active');
}

function closeHistoryModal() {
    document.getElementById('historyModal').classList.remove('active');
    document.getElementById('modalOverlay').classList.remove('active');
}

function closeInfoModal() {
    document.getElementById('infoModal').classList.remove('active');
    document.getElementById('modalOverlay').classList.remove('active');
}

function closeAllModals() {
    closeHistoryModal();
    closeInfoModal();
}

// Show loading spinner
function showLoading(show, text = 'Analyzing plant image...') {
    const spinner = document.getElementById('loadingSpinner');
    const loadingText = document.getElementById('loadingText');
    loadingText.textContent = text;
    if (show) {
        spinner.style.display = 'flex';
    } else {
        spinner.style.display = 'none';
    }
}

// Show error message
function showError(message) {
    const errorDiv = document.getElementById('errorMessage');
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';

    setTimeout(() => {
        hideError();
    }, 5000);
}

// Show success message
function showSuccess(message) {
    const successDiv = document.getElementById('successMessage');
    successDiv.textContent = message;
    successDiv.style.display = 'block';

    setTimeout(() => {
        successDiv.style.display = 'none';
    }, 4000);
}

// Hide error message
function hideError() {
    document.getElementById('errorMessage').style.display = 'none';
}

// Check server health
async function checkServerHealth() {
    try {
        const response = await fetch('/api/health');
        const data = await response.json();

        const healthBadge = document.getElementById('healthBadge');
        const statusDot = healthBadge.querySelector('.status-dot');
        const healthText = document.getElementById('healthText');

        if (data.status === 'healthy' && data.model_loaded) {
            statusDot.classList.add('healthy');
            healthText.textContent = `Ready (${data.device.toUpperCase()})`;
        } else {
            statusDot.classList.remove('healthy');
            healthText.textContent = 'Not Ready';
        }
    } catch (error) {
        console.error('Health check failed:', error);
        const statusDot = document.querySelector('.status-dot');
        statusDot.classList.remove('healthy');
        document.getElementById('healthText').textContent = 'Disconnected';
    }
}

// Prevent default drag and drop behavior
document.addEventListener('dragover', (e) => {
    e.preventDefault();
});

document.addEventListener('drop', (e) => {
    e.preventDefault();
});
