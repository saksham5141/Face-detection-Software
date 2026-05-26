const video = document.getElementById('video');
const loaderOverlay = document.getElementById('loader-overlay');
const loaderText = document.getElementById('loader-text');

// Status Elements
const modelStatusIndicator = document.getElementById('model-status-indicator');
const modelStatusText = document.getElementById('model-status-text');
const camStatusIndicator = document.getElementById('cam-status-indicator');
const camStatusText = document.getElementById('cam-status-text');

// Metric Elements
const fpsCounter = document.getElementById('fps-counter');
const faceCount = document.getElementById('face-count');

// Toggles
const toggleBoxes = document.getElementById('detect-boxes');
const toggleLandmarks = document.getElementById('detect-landmarks');
const toggleExpressions = document.getElementById('detect-expressions');
const toggleAgeGender = document.getElementById('detect-age-gender');
const toggleRecognition = document.getElementById('detect-recognition');

// Identity Elements
const registerNameInput = document.getElementById('register-name');
const registerBtn = document.getElementById('register-btn');
const registerStatus = document.getElementById('register-status');

let lastFrameTime = performance.now();
let canvas;
let labeledFaceDescriptors = [];
let faceMatcher = null;

// Load identities from local storage
function loadIdentities() {
    const saved = localStorage.getItem('nexus_identities');
    if (saved) {
        try {
            const data = JSON.parse(saved);
            labeledFaceDescriptors = data.map(x => new faceapi.LabeledFaceDescriptors(
                x.label,
                x.descriptors.map(d => new Float32Array(d))
            ));
            if (labeledFaceDescriptors.length > 0) {
                faceMatcher = new faceapi.FaceMatcher(labeledFaceDescriptors, 0.6);
            }
        } catch(e) {
            console.error("Error loading identities:", e);
        }
    }
}

function saveIdentity(label, descriptor) {
    let existing = labeledFaceDescriptors.find(lfd => lfd.label === label);
    if (existing) {
        existing.descriptors.push(descriptor);
    } else {
        labeledFaceDescriptors.push(new faceapi.LabeledFaceDescriptors(label, [descriptor]));
    }
    
    faceMatcher = new faceapi.FaceMatcher(labeledFaceDescriptors, 0.6);
    
    const dataToSave = labeledFaceDescriptors.map(lfd => ({
        label: lfd.label,
        descriptors: lfd.descriptors.map(d => Array.from(d))
    }));
    localStorage.setItem('nexus_identities', JSON.stringify(dataToSave));
}

// Setup Face-API.js Models
async function loadModels() {
    try {
        modelStatusIndicator.className = 'status-indicator loading';
        modelStatusText.innerText = 'Loading Models...';
        
        // Use Tiny Face Detector for faster performance
        await Promise.all([
            faceapi.nets.tinyFaceDetector.loadFromUri('./models'),
            faceapi.nets.faceLandmark68Net.loadFromUri('./models'),
            faceapi.nets.faceExpressionNet.loadFromUri('./models'),
            faceapi.nets.ageGenderNet.loadFromUri('./models'),
            faceapi.nets.faceRecognitionNet.loadFromUri('./models')
        ]);
        
        loadIdentities();
        
        modelStatusIndicator.className = 'status-indicator ready';
        modelStatusText.innerText = 'Models Ready';
        loaderText.innerText = 'Initializing Camera...';
        
        startVideo();
    } catch (err) {
        console.error("Error loading models:", err);
        modelStatusIndicator.className = 'status-indicator error';
        modelStatusText.innerText = 'Model Load Failed';
        loaderText.innerText = 'Error loading models. Check console.';
    }
}

// Start Camera
function startVideo() {
    camStatusIndicator.className = 'status-indicator loading';
    camStatusText.innerText = 'Requesting Camera...';
    
    navigator.mediaDevices.getUserMedia({ video: { width: 720, height: 560 } })
        .then(stream => {
            video.srcObject = stream;
            camStatusIndicator.className = 'status-indicator ready';
            camStatusText.innerText = 'Camera Active';
        })
        .catch(err => {
            console.error("Error accessing webcam:", err);
            camStatusIndicator.className = 'status-indicator error';
            camStatusText.innerText = 'Camera Access Denied';
            loaderText.innerText = 'Please allow camera access.';
        });
}

// Register Face Logic
registerBtn.addEventListener('click', async () => {
    const name = registerNameInput.value.trim();
    if (!name) {
        registerStatus.innerText = 'Please enter a name first!';
        registerStatus.style.color = 'var(--warning)';
        return;
    }
    
    registerStatus.innerText = 'Scanning face...';
    registerStatus.style.color = 'var(--text-primary)';
    
    const options = new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 });
    const detection = await faceapi.detectSingleFace(video, options).withFaceLandmarks().withFaceDescriptor();
    
    if (detection) {
        saveIdentity(name, detection.descriptor);
        registerStatus.innerText = `Registered: ${name}!`;
        registerStatus.style.color = 'var(--success)';
        registerNameInput.value = '';
        setTimeout(() => registerStatus.innerText = '', 3000);
    } else {
        registerStatus.innerText = 'No face detected. Look at the camera.';
        registerStatus.style.color = 'var(--error)';
    }
});

// Main Detection Loop
video.addEventListener('play', () => {
    // Hide loader
    loaderOverlay.style.opacity = '0';
    setTimeout(() => loaderOverlay.style.display = 'none', 500);
    
    // Setup Canvas
    canvas = faceapi.createCanvasFromMedia(video);
    document.querySelector('.video-wrapper').append(canvas);
    
    const displaySize = { width: video.width, height: video.height };
    faceapi.matchDimensions(canvas, displaySize);
    
    // Start Loop
    const runDetection = async () => {
        if(video.paused || video.ended) return;
        
        const now = performance.now();
        const fps = Math.round(1000 / (now - lastFrameTime));
        lastFrameTime = now;
        fpsCounter.innerText = fps;
        
        try {
            // Options for TinyFaceDetector
            const options = new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 });
            
            // Build query based on toggles
            let currentQuery = faceapi.detectAllFaces(video, options);
            
            let needsDescriptors = toggleRecognition && toggleRecognition.checked;
            let needsLandmarks = toggleLandmarks.checked || toggleExpressions.checked || toggleAgeGender.checked || needsDescriptors;
            
            let detections;
            
            if (needsLandmarks) {
                currentQuery = currentQuery.withFaceLandmarks();
                if (toggleExpressions.checked) currentQuery = currentQuery.withFaceExpressions();
                if (toggleAgeGender.checked) currentQuery = currentQuery.withAgeAndGender();
                if (needsDescriptors) currentQuery = currentQuery.withFaceDescriptors();
                detections = await currentQuery;
            } else {
                detections = await currentQuery;
            }
            
            faceCount.innerText = detections.length;
            
            const resizedDetections = faceapi.resizeResults(detections, displaySize);
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            
            // Apply transform to match mirrored video for boxes and landmarks
            ctx.save();
            ctx.translate(canvas.width, 0);
            ctx.scale(-1, 1);
            
            // Custom drawing settings
            const boxColor = '#3b82f6';
            const drawOptions = {
                lineWidth: 2,
                boxColor: boxColor
            };
            
            if (toggleBoxes.checked) {
                faceapi.draw.drawDetections(canvas, resizedDetections, drawOptions);
            }
            
            if (toggleLandmarks.checked && needsLandmarks) {
                faceapi.draw.drawFaceLandmarks(canvas, resizedDetections, {
                    drawLines: true,
                    drawPoints: true,
                    lineWidth: 1,
                    color: '#8b5cf6'
                });
            }
            
            // Restore context so text is NOT mirrored
            ctx.restore();
            
            // Draw Expressions and Age/Gender manually so text isn't backwards
            resizedDetections.forEach(result => {
                const box = result.detection ? result.detection.box : result.box;
                if (!box) return;
                
                // Calculate mirrored X position
                const mirroredX = canvas.width - box.x - box.width;
                const text = [];
                
                // Add recognized name if available
                if (needsDescriptors && result.descriptor) {
                    if (faceMatcher) {
                        const match = faceMatcher.findBestMatch(result.descriptor);
                        text.push(`Name: ${match.label} (${Math.round((1 - match.distance) * 100)}%)`);
                    } else {
                        text.push(`Name: Unknown`);
                    }
                }
                
                if (toggleExpressions.checked && result.expressions) {
                    const expressions = result.expressions;
                    const maxExpression = Object.keys(expressions).reduce((a, b) => expressions[a] > expressions[b] ? a : b);
                    text.push(`Feeling: ${maxExpression}`);
                }
                
                if (toggleAgeGender.checked && result.age) {
                    text.push(`Age: ${Math.round(result.age)} yrs`);
                    text.push(`Gender: ${result.gender}`);
                }
                
                if (text.length > 0) {
                    const drawTextField = new faceapi.draw.DrawTextField(text, { x: mirroredX, y: box.y + box.height }, {
                        fontColor: '#fff',
                        backgroundColor: 'rgba(59, 130, 246, 0.8)',
                        padding: 8
                    });
                    drawTextField.draw(canvas);
                }
            });
            
        } catch (err) {
            console.error("Detection loop error", err);
        }
        
        // Loop again on next animation frame
        requestAnimationFrame(runDetection);
    };
    
    // Start loop
    runDetection();
});

// Init
window.addEventListener('load', loadModels);
