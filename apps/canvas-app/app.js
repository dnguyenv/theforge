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
import { SmudgeTool } from './src/tools/SmudgeTool.js';
import { TransformTool } from './src/tools/TransformTool.js';
import { PointerHandler } from './src/input/PointerHandler.js';
import { GestureDetector } from './src/input/GestureDetector.js';
import { KeyboardShortcuts } from './src/input/KeyboardShortcuts.js';
import { ColorPicker } from './src/color/ColorPicker.js';
import { Toolbar } from './src/ui/Toolbar.js';
import { LayersPanel } from './src/ui/LayersPanel.js';
import { BrushLibrary } from './src/ui/BrushLibrary.js';
import { StatusBar } from './src/ui/StatusBar.js';
import { CollabPanel } from './src/ui/CollabPanel.js';
import { CollabManager } from './src/collab/CollabManager.js';
import { RemoteRenderer } from './src/collab/RemoteRenderer.js';
import { PresenceCursor } from './src/collab/PresenceCursor.js';
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
    toolManager.register(TOOLS.SMUDGE, new SmudgeTool(engine));
    toolManager.register(TOOLS.TRANSFORM, new TransformTool(engine));
    toolManager.setActive(TOOLS.BRUSH);

    // Input
    const gestureDetector = new GestureDetector(engine.view);
    const pointerHandler = new PointerHandler(canvas, toolManager, gestureDetector, engine.view);
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

    // Zoom controls
    document.getElementById('btn-zoom-in').addEventListener('click', () => {
        engine.view.zoom(1.25, engine.viewWidth / 2, engine.viewHeight / 2);
        bus.emit(EVENTS.VIEW_CHANGE, {});
    });
    document.getElementById('btn-zoom-out').addEventListener('click', () => {
        engine.view.zoom(0.8, engine.viewWidth / 2, engine.viewHeight / 2);
        bus.emit(EVENTS.VIEW_CHANGE, {});
    });
    document.getElementById('btn-fit').addEventListener('click', () => {
        engine.view.fitToScreen(engine.docWidth, engine.docHeight, engine.viewWidth, engine.viewHeight);
        bus.emit(EVENTS.VIEW_CHANGE, {});
    });

    // Canvas background color
    const bgColorInput = document.getElementById('canvas-bg-color');
    bgColorInput.addEventListener('input', () => {
        engine.backgroundColor = bgColorInput.value;
        engine.markDirty();
    });
    engine.backgroundColor = '#ffffff';

    // Fullscreen
    const toggleFullscreen = () => {
        document.body.classList.toggle('fullscreen');
        setTimeout(() => engine.markDirty(), 100);
    };
    document.getElementById('btn-fullscreen').addEventListener('click', toggleFullscreen);
    document.getElementById('btn-exit-fullscreen').addEventListener('click', toggleFullscreen);

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

    // --- Collaboration ---
    const relayUrl = new URLSearchParams(window.location.search).get('relay') || 'wss://theforge-val4.onrender.com';
    const collabManager = new CollabManager(engine, { serverUrl: relayUrl });
    const remoteRenderer = new RemoteRenderer(engine);
    const presenceCursor = new PresenceCursor(
        document.getElementById('canvas-viewport'),
        engine.view
    );

    collabManager.onRemoteStroke = (userId, layerId, points, tool, isStart) => {
        remoteRenderer.renderRemoteStroke(userId, layerId, points, tool, isStart);
    };
    collabManager.onRemoteStrokeEnd = (userId, layerId) => {
        remoteRenderer.endRemoteStroke(userId, layerId);
    };
    collabManager.onStateSync = (layers) => {
        remoteRenderer.applyStateSnapshot(layers);
    };
    collabManager.onRemoteLayerOp = (userId, op, params) => {
        remoteRenderer.applyLayerOp(userId, op, params);
    };
    collabManager.onRemoteCursor = (userId, x, y) => {
        const userName = collabManager.users.get(userId) || userId.slice(0, 6);
        presenceCursor.updateCursor(userId, userName, x, y);
    };

    // Send local stroke data to collab
    bus.on(EVENTS.STROKE_START, () => {
        if (!collabManager.isConnected) return;
        const tool = toolManager.tools.get(toolManager.activeToolId);
        collabManager.sendStrokeStart(engine.layers.activeLayer?.id, {
            brushId: tool.brushId || 'pencil',
            size: tool.size || 12,
            opacity: tool.opacity || 1,
            color: tool.color || '#000000',
            compositeOp: tool.compositeOp || 'source-over',
        });
    });

    bus.on(EVENTS.STROKE_MOVE, ({ layerId, point }) => {
        if (!collabManager.isConnected) return;
        collabManager.sendStrokePoint(point);
        collabManager.sendCursor(point.x, point.y);
    });

    bus.on(EVENTS.STROKE_END, () => {
        if (!collabManager.isConnected) return;
        collabManager.sendStrokeEnd(engine.layers.activeLayer?.id);
    });

    // Broadcast layer operations
    bus.on(EVENTS.LAYER_ADD, ({ layer, index }) => {
        if (!collabManager.isConnected) return;
        collabManager.sendLayerOp('add', { layerId: layer.id, name: layer.name, index });
    });
    bus.on(EVENTS.LAYER_REMOVE, ({ layer, index }) => {
        if (!collabManager.isConnected) return;
        collabManager.sendLayerOp('remove', { layerId: layer.id, index });
    });
    bus.on(EVENTS.LAYER_REORDER, ({ fromIndex, toIndex }) => {
        if (!collabManager.isConnected) return;
        collabManager.sendLayerOp('reorder', { fromIndex, toIndex });
    });

    // Collab UI panel
    new CollabPanel(document.getElementById('collab-panel-container'), collabManager);

    // Auto-join if URL has session param
    const sessionParam = new URLSearchParams(window.location.search).get('session');
    if (sessionParam) {
        collabManager.joinSession(sessionParam);
    }
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
