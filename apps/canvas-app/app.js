import init from './pkg/forge_wasm_bridge.js';
import * as wasm from './pkg/forge_wasm_bridge.js';

import { bus } from './src/core/EventBus.js';
import { EVENTS, TOOLS } from './src/core/Constants.js';
import { CommandHistory, DrawCommand } from './src/core/CommandHistory.js';
import { CanvasEngine } from './src/canvas/CanvasEngine.js';
import { ViewTransform } from './src/canvas/ViewTransform.js';
import { ToolManager } from './src/tools/ToolManager.js';
import { BrushTool } from './src/tools/BrushTool.js';
import { EraserTool } from './src/tools/EraserTool.js';
import { EyedropperTool } from './src/tools/EyedropperTool.js';
import { FillTool } from './src/tools/FillTool.js';
import { PointerHandler } from './src/input/PointerHandler.js';
import { GestureDetector } from './src/input/GestureDetector.js';
import { KeyboardShortcuts } from './src/input/KeyboardShortcuts.js';
import { ColorPicker } from './src/color/ColorPicker.js';
import { Toolbar } from './src/ui/Toolbar.js';
import { LayersPanel } from './src/ui/LayersPanel.js';
import { BrushLibrary } from './src/ui/BrushLibrary.js';
import { StatusBar } from './src/ui/StatusBar.js';
import { forge } from './src/forge/ForgeIntegration.js';

const DOC_WIDTH = 1920;
const DOC_HEIGHT = 1080;

async function start() {
    await init();
    await forge.init(wasm);

    const canvas = document.getElementById('forge-canvas');
    const engine = new CanvasEngine(canvas, DOC_WIDTH, DOC_HEIGHT);

    // Add initial layer
    engine.layers.addLayer('Background');

    // Start Forge session
    forge.startSession();

    // Tools
    const toolManager = new ToolManager();
    toolManager.register(TOOLS.BRUSH, new BrushTool(engine));
    toolManager.register(TOOLS.ERASER, new EraserTool(engine));
    toolManager.register(TOOLS.EYEDROPPER, new EyedropperTool(engine));
    toolManager.register(TOOLS.FILL, new FillTool(engine));
    toolManager.setActive(TOOLS.BRUSH);

    // Input
    const gestureDetector = new GestureDetector(engine.view);
    const pointerHandler = new PointerHandler(canvas, toolManager, gestureDetector);
    const shortcuts = new KeyboardShortcuts(toolManager);

    // Undo
    const history = new CommandHistory();

    // Capture before-state on stroke start for undo
    let strokeBefore = null;
    bus.on(EVENTS.STROKE_START, () => {
        const layer = engine.layers.activeLayer;
        if (layer) {
            strokeBefore = layer.getImageData();
        }
    });

    // Push undo command on stroke end
    bus.on(EVENTS.STROKE_END, () => {
        const layer = engine.layers.activeLayer;
        if (layer && strokeBefore) {
            const afterData = layer.getImageData();
            history.push(new DrawCommand(
                layer,
                strokeBefore,
                afterData,
                { x: 0, y: 0 }
            ));
            strokeBefore = null;
        }
    });

    // Wire stroke start event from pointer down
    const origBrushDown = BrushTool.prototype.onPointerDown;
    const wrappedDown = function(e) {
        bus.emit(EVENTS.STROKE_START, {});
        origBrushDown.call(this, e);
    };
    toolManager.tools.get(TOOLS.BRUSH).onPointerDown = wrappedDown;
    toolManager.tools.get(TOOLS.ERASER).onPointerDown = function(e) {
        bus.emit(EVENTS.STROKE_START, {});
        origBrushDown.call(this, e);
    };

    // UI
    new Toolbar(document.getElementById('tool-buttons'), toolManager);
    new LayersPanel(document.getElementById('layers-panel'), engine.layers);
    new BrushLibrary(document.getElementById('brush-library'));
    new ColorPicker(document.getElementById('color-picker-container'));
    new StatusBar(document.getElementById('status-bar-container'));

    // Brush size/opacity sliders
    const sizeSlider = document.getElementById('brush-size');
    const sizeValue = document.getElementById('size-value');
    const opacitySlider = document.getElementById('brush-opacity');
    const opacityValue = document.getElementById('opacity-value');

    sizeSlider.addEventListener('input', () => {
        const size = parseInt(sizeSlider.value);
        sizeValue.textContent = size;
        bus.emit(EVENTS.BRUSH_CHANGE, { size });
    });

    opacitySlider.addEventListener('input', () => {
        const opacity = parseInt(opacitySlider.value) / 100;
        opacityValue.textContent = `${Math.round(opacity * 100)}%`;
        bus.emit(EVENTS.BRUSH_CHANGE, { opacity });
    });

    bus.on(EVENTS.BRUSH_CHANGE, ({ sizeStep }) => {
        if (sizeStep) {
            const newSize = Math.max(1, Math.min(200, parseInt(sizeSlider.value) + sizeStep));
            sizeSlider.value = newSize;
            sizeValue.textContent = newSize;
        }
    });

    // Undo/Redo buttons
    document.getElementById('btn-undo').addEventListener('click', () => bus.emit(EVENTS.UNDO, {}));
    document.getElementById('btn-redo').addEventListener('click', () => bus.emit(EVENTS.REDO, {}));

    // Fullscreen
    document.getElementById('btn-fullscreen').addEventListener('click', () => {
        document.body.classList.toggle('fullscreen');
        setTimeout(() => engine.markDirty(), 100);
    });

    // Analyze
    document.getElementById('btn-analyze').addEventListener('click', () => {
        const report = forge.analyze();
        showModal(renderPurityReport(report));
    });

    // Export
    document.getElementById('btn-export').addEventListener('click', () => {
        const manifest = forge.export();
        showModal(renderExport(manifest));
    });

    // Color change updates slider appearance
    bus.on(EVENTS.COLOR_CHANGE, ({ color }) => {
        document.documentElement.style.setProperty('--current-color', color);
    });
}

function showModal(html) {
    const overlay = document.getElementById('modal-overlay');
    const body = document.getElementById('modal-body');
    body.innerHTML = html;
    overlay.hidden = false;
    document.getElementById('modal-close').onclick = () => { overlay.hidden = true; };
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) overlay.hidden = true;
    });
}

function renderPurityReport(report) {
    if (!report || report.error) {
        return `<h2>Purity Analysis</h2><p>${report?.error || 'No data available. Draw at least 20 strokes.'}</p>`;
    }

    const gradeColors = {
        Masterwork: '#f0c040',
        HandForged: '#60d080',
        Assisted: '#f0a040',
        Synthetic: '#f06060',
    };

    return `
        <h2 style="text-align:center;margin-bottom:8px">Purity Analysis</h2>
        <div class="purity-grade" style="color:${gradeColors[report.grade] || '#fff'}">${report.grade}</div>
        <div class="purity-score">Score: ${(report.score * 100).toFixed(1)}% | Confidence: ${(report.confidence * 100).toFixed(0)}%</div>
        <div class="purity-features">${JSON.stringify(report.features, null, 2)}</div>
    `;
}

function renderExport(manifest) {
    if (!manifest || manifest.error) {
        return `<h2>Export</h2><p>Error: ${manifest?.error || 'No session data'}</p>`;
    }

    const json = JSON.stringify(manifest, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    return `
        <h2 style="text-align:center;margin-bottom:12px">Beskar Manifest</h2>
        <p style="text-align:center;color:var(--text-secondary);margin-bottom:16px">
            Your creative process has been sealed with a cryptographic proof.
        </p>
        <div class="export-actions">
            <a href="${url}" download="beskar-manifest.json" class="btn-primary">Download Manifest</a>
        </div>
        <div class="purity-features" style="margin-top:16px;max-height:300px;overflow:auto">${json}</div>
    `;
}

start();
