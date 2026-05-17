import { bus } from '../core/EventBus.js';
import { EVENTS } from '../core/Constants.js';
import { forge } from '../forge/ForgeIntegration.js';

export class TransformTool {
    constructor(engine) {
        this.engine = engine;
        this.isDragging = false;
        this.startX = 0;
        this.startY = 0;
        this.offsetX = 0;
        this.offsetY = 0;
        this._tempCanvas = null;
    }

    activate() {}
    deactivate() {
        this._apply();
    }

    onPointerDown(e) {
        const layer = this.engine.layers.activeLayer;
        if (!layer || layer.locked) return;

        const pos = this.engine.screenToCanvas(e.clientX, e.clientY);
        this.isDragging = true;
        this.startX = pos.x;
        this.startY = pos.y;
        this.offsetX = 0;
        this.offsetY = 0;

        // Capture current layer state
        this._tempCanvas = new OffscreenCanvas(layer.width, layer.height);
        this._tempCanvas.getContext('2d').drawImage(layer.canvas, 0, 0);

        bus.emit(EVENTS.STROKE_START, {});
        forge.recordStroke(layer.id, 1, 0, pos.x, pos.y, 0);
    }

    onPointerMove(e) {
        if (!this.isDragging) return;
        const layer = this.engine.layers.activeLayer;
        if (!layer || !this._tempCanvas) return;

        const pos = this.engine.screenToCanvas(e.clientX, e.clientY);
        this.offsetX = pos.x - this.startX;
        this.offsetY = pos.y - this.startY;

        layer.ctx.clearRect(0, 0, layer.width, layer.height);
        layer.ctx.drawImage(this._tempCanvas, this.offsetX, this.offsetY);
        this.engine.markDirty();
    }

    onPointerUp(e) {
        if (!this.isDragging) return;
        this.isDragging = false;

        const layer = this.engine.layers.activeLayer;
        if (layer) {
            const pos = this.engine.screenToCanvas(e.clientX, e.clientY);
            forge.recordStroke(layer.id, 1, 0, pos.x, pos.y, 0);
            layer.markDirty();
        }

        this._tempCanvas = null;
        this.engine._invalidateBelowCache();
        bus.emit(EVENTS.STROKE_END, {});
    }

    _apply() {
        this._tempCanvas = null;
        this.isDragging = false;
    }
}
