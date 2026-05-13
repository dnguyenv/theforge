import init, {
    forge_init,
    forge_get_did,
    forge_record_stroke,
    forge_get_strike_count,
    forge_analyze,
    forge_export,
    forge_reset,
} from './pkg/forge_wasm_bridge.js';

let sessionId = null;
let sequenceId = 0;
let isDrawing = false;
let lastX = 0;
let lastY = 0;
let lastTime = 0;

const canvas = document.getElementById('forge-canvas');
const ctx = canvas.getContext('2d');

const btnStart = document.getElementById('btn-start');
const btnExport = document.getElementById('btn-export');
const btnAnalyze = document.getElementById('btn-analyze');
const btnClear = document.getElementById('btn-clear');
const sessionBadge = document.getElementById('session-badge');
const strokeCount = document.getElementById('stroke-count');
const didDisplay = document.getElementById('did-display');
const brushSize = document.getElementById('brush-size');
const brushColor = document.getElementById('brush-color');
const resultsSection = document.getElementById('results');
const exportSection = document.getElementById('export-result');

async function start() {
    await init();

    btnStart.addEventListener('click', startSession);
    btnExport.addEventListener('click', exportBeskar);
    btnAnalyze.addEventListener('click', analyzePurity);
    btnClear.addEventListener('click', clearCanvas);

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointerleave', onPointerUp);

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
}

function startSession() {
    forge_reset();
    sequenceId = 0;

    sessionId = forge_init();
    const did = forge_get_did();

    sessionBadge.textContent = 'Forging';
    sessionBadge.classList.add('active');
    didDisplay.textContent = did.slice(0, 20) + '...';
    btnStart.textContent = 'Restart Session';
    btnExport.disabled = false;
    btnAnalyze.disabled = false;
    resultsSection.hidden = true;
    exportSection.hidden = true;
    updateCount();
}

function onPointerDown(e) {
    if (!sessionId) return;
    isDrawing = true;
    lastX = e.offsetX;
    lastY = e.offsetY;
    lastTime = performance.now();
    ctx.beginPath();
    ctx.moveTo(lastX, lastY);
}

function onPointerMove(e) {
    if (!isDrawing || !sessionId) return;

    const x = e.offsetX;
    const y = e.offsetY;
    const now = performance.now();
    const dt = now - lastTime;

    if (dt < 8) return; // throttle to ~120hz max

    const pressure = e.pressure || 0.5;
    const dx = x - lastX;
    const dy = y - lastY;
    const velocity = Math.sqrt(dx * dx + dy * dy) / (dt || 1) * 1000;

    // Draw on canvas
    const size = parseInt(brushSize.value);
    ctx.strokeStyle = brushColor.value;
    ctx.lineWidth = size * pressure;
    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y);

    // Record strike
    sequenceId++;
    const timestampMs = Math.floor(performance.timeOrigin + now);
    const result = forge_record_stroke(
        sessionId,
        sequenceId,
        timestampMs,
        pressure,
        velocity,
        x,
        y,
        Math.floor(dt),
    );

    if (result.startsWith('ERROR:')) {
        console.error('Strike rejected:', result);
        sequenceId--; // rollback
    }

    lastX = x;
    lastY = y;
    lastTime = now;
    updateCount();
}

function onPointerUp() {
    isDrawing = false;
}

function updateCount() {
    if (!sessionId) return;
    const count = forge_get_strike_count(sessionId);
    strokeCount.textContent = `${count} strikes`;
}

function analyzePurity() {
    const json = forge_analyze();
    const report = JSON.parse(json);

    resultsSection.hidden = false;

    if (report.error) {
        document.getElementById('purity-grade').textContent = 'Insufficient Data';
        document.getElementById('purity-score').textContent = report.error;
        document.getElementById('purity-details').textContent = '';
        return;
    }

    const gradeColors = {
        Masterwork: '#f0c040',
        HandForged: '#60d080',
        Assisted: '#f0a040',
        Synthetic: '#f04040',
    };

    const grade = document.getElementById('purity-grade');
    grade.textContent = report.grade;
    grade.style.color = gradeColors[report.grade] || '#fff';

    document.getElementById('purity-score').textContent =
        `Score: ${(report.score * 100).toFixed(1)}% | Confidence: ${(report.confidence * 100).toFixed(0)}%`;

    document.getElementById('purity-details').textContent =
        JSON.stringify(report.features, null, 2);
}

function exportBeskar() {
    const json = forge_export(sessionId);
    const manifest = JSON.parse(json);

    if (manifest.error) {
        alert('Export failed: ' + manifest.error);
        return;
    }

    const blob = new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    exportSection.hidden = false;
    const link = document.getElementById('download-link');
    link.href = url;
    link.download = `beskar-${sessionId.slice(0, 8)}.json`;
}

function clearCanvas() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
}

start();
