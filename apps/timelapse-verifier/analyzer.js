const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const uploadSection = document.getElementById('upload-section');
const analysisSection = document.getElementById('analysis-section');
const resultsSection = document.getElementById('results-section');
const progressFill = document.getElementById('progress-fill');
const progressText = document.getElementById('progress-text');
const previewVideo = document.getElementById('preview-video');
const analysisCanvas = document.getElementById('analysis-canvas');
const btnReset = document.getElementById('btn-reset');

dropZone.addEventListener('click', () => fileInput.click());
dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
});
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    if (e.dataTransfer.files.length > 0) handleFile(e.dataTransfer.files[0]);
});
fileInput.addEventListener('change', () => {
    if (fileInput.files.length > 0) handleFile(fileInput.files[0]);
});
btnReset.addEventListener('click', reset);

async function handleFile(file) {
    if (!file.type.startsWith('video/')) {
        alert('Please upload a video file (.mp4 or .mov)');
        return;
    }

    uploadSection.hidden = true;
    analysisSection.hidden = false;

    const url = URL.createObjectURL(file);
    previewVideo.src = url;
    await previewVideo.play().catch(() => {});
    previewVideo.pause();

    await analyzeVideo(previewVideo);
}

async function analyzeVideo(video) {
    const canvas = analysisCanvas;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    await new Promise((resolve) => {
        video.currentTime = 0;
        video.onseeked = resolve;
    });

    const width = 320;
    const height = Math.round((video.videoHeight / video.videoWidth) * width);
    canvas.width = width;
    canvas.height = height;

    const duration = video.duration;
    const sampleInterval = Math.max(0.5, duration / 200); // ~200 samples max
    const numSamples = Math.min(200, Math.floor(duration / sampleInterval));

    let prevPixels = null;
    const changeMagnitudes = [];
    const changeTimestamps = [];

    for (let i = 0; i < numSamples; i++) {
        const time = i * sampleInterval;
        video.currentTime = time;
        await new Promise((resolve) => { video.onseeked = resolve; });

        ctx.drawImage(video, 0, 0, width, height);
        const imageData = ctx.getImageData(0, 0, width, height);
        const pixels = imageData.data;

        if (prevPixels) {
            let diff = 0;
            for (let j = 0; j < pixels.length; j += 4) {
                diff += Math.abs(pixels[j] - prevPixels[j]);
                diff += Math.abs(pixels[j + 1] - prevPixels[j + 1]);
                diff += Math.abs(pixels[j + 2] - prevPixels[j + 2]);
            }
            const normalized = diff / (width * height * 3 * 255);
            changeMagnitudes.push(normalized);
            changeTimestamps.push(time);
        }

        prevPixels = new Uint8ClampedArray(pixels);

        const progress = ((i + 1) / numSamples) * 100;
        progressFill.style.width = `${progress}%`;
        progressText.textContent = `Analyzing frame ${i + 1} / ${numSamples}`;
    }

    const report = computePurity(changeMagnitudes, changeTimestamps);
    showResults(report);
}

function computePurity(magnitudes, timestamps) {
    if (magnitudes.length < 5) {
        return { grade: 'Insufficient', score: 0, details: {} };
    }

    // 1. Activity variance — human work has variable change magnitudes
    const meanMag = magnitudes.reduce((a, b) => a + b, 0) / magnitudes.length;
    const magStd = Math.sqrt(
        magnitudes.reduce((sum, m) => sum + (m - meanMag) ** 2, 0) / magnitudes.length
    );
    const activityVariance = Math.min(1, (magStd / (meanMag || 0.001)) * 0.7);

    // 2. Timing pattern — are active periods clustered (human) or uniform (bot)?
    const activeFrames = magnitudes.filter(m => m > meanMag * 0.1);
    const burstRatio = activeFrames.length / magnitudes.length;
    const timingScore = Math.min(1, burstRatio * 1.2);

    // 3. Progress continuity — human work builds gradually, not in one jump
    const cumulative = [];
    let sum = 0;
    for (const m of magnitudes) {
        sum += m;
        cumulative.push(sum);
    }
    const totalChange = sum;
    const midpoint = cumulative.findIndex(c => c >= totalChange * 0.5);
    const midpointRatio = midpoint / magnitudes.length;
    const continuityScore = 1 - Math.abs(midpointRatio - 0.5) * 2;

    // 4. Frame change density — how many frames have meaningful change
    const threshold = meanMag * 0.05;
    const changedFrames = magnitudes.filter(m => m > threshold).length;
    const densityScore = Math.min(1, changedFrames / magnitudes.length * 1.5);

    const score = (
        activityVariance * 0.30 +
        timingScore * 0.25 +
        continuityScore * 0.25 +
        densityScore * 0.20
    );

    let grade;
    if (score >= 0.85) grade = 'Masterwork';
    else if (score >= 0.70) grade = 'Hand-Forged';
    else if (score >= 0.45) grade = 'Assisted';
    else grade = 'Synthetic';

    return {
        grade,
        score,
        details: {
            activityVariance,
            timingScore,
            continuityScore,
            densityScore,
            framesAnalyzed: magnitudes.length,
        }
    };
}

function showResults(report) {
    analysisSection.hidden = true;
    resultsSection.hidden = false;

    const gradeColors = {
        'Masterwork': '#f0c040',
        'Hand-Forged': '#60d080',
        'Assisted': '#f0a040',
        'Synthetic': '#f04040',
        'Insufficient': '#888',
    };

    const gradeBadge = document.getElementById('grade-badge');
    gradeBadge.textContent = report.grade;
    gradeBadge.style.color = gradeColors[report.grade] || '#fff';

    document.getElementById('score-display').textContent =
        `Purity Score: ${(report.score * 100).toFixed(1)}%`;

    const d = report.details;
    document.getElementById('detail-activity').textContent =
        `${(d.activityVariance * 100).toFixed(0)}%`;
    document.getElementById('detail-timing').textContent =
        `${(d.timingScore * 100).toFixed(0)}%`;
    document.getElementById('detail-continuity').textContent =
        `${(d.continuityScore * 100).toFixed(0)}%`;
    document.getElementById('detail-frames').textContent =
        `${d.framesAnalyzed} analyzed`;
}

function reset() {
    resultsSection.hidden = true;
    analysisSection.hidden = true;
    uploadSection.hidden = false;
    progressFill.style.width = '0%';
    fileInput.value = '';
}
