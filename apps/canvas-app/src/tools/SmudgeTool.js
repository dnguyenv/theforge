import { bus } from '../core/EventBus.js';
import { EVENTS } from '../core/Constants.js';
import { forge } from '../forge/ForgeIntegration.js';

export class SmudgeTool {
    constructor(engine) {
        this.engine = engine;
        this.strength = 0.5;
        this.size = 20;
        this.isDrawing = false;
        this.lastX = 0;
        this.lastY = 0;
    }

    activate() {}
    deactivate() { this.isDrawing = false; }

    onPointerDown(e) {
        const layer = this.engine.layers.activeLayer;
        if (!layer || layer.locked) return;

        this.isDrawing = true;
        const pos = this.engine.screenToCanvas(e.clientX, e.clientY);
        this.lastX = pos.x;
        this.lastY = pos.y;

        bus.emit(EVENTS.STROKE_START, {});
        forge.recordStroke(layer.id, e.pressure || 0.5, 0, pos.x, pos.y, 0);
    }

    onPointerMove(e) {
        if (!this.isDrawing) return;
        const layer = this.engine.layers.activeLayer;
        if (!layer) return;

        const pos = this.engine.screenToCanvas(e.clientX, e.clientY);
        const pressure = e.pressure || 0.5;

        this._smudge(layer, this.lastX, this.lastY, pos.x, pos.y, pressure);

        const velocity = Math.sqrt((pos.x - this.lastX) ** 2 + (pos.y - this.lastY) ** 2) * 100;
        forge.recordStroke(layer.id, pressure, velocity, pos.x, pos.y, 8);

        this.lastX = pos.x;
        this.lastY = pos.y;
        this.engine.markDirty();
    }

    onPointerUp() {
        this.isDrawing = false;
        const layer = this.engine.layers.activeLayer;
        if (layer) layer.markDirty();
        this.engine._invalidateBelowCache();
        bus.emit(EVENTS.STROKE_END, {});
    }

    _smudge(layer, fromX, fromY, toX, toY, pressure) {
        const ctx = layer.ctx;
        const halfSize = this.size / 2;
        const strength = this.strength * pressure;

        const sx = Math.max(0, Math.floor(fromX - halfSize));
        const sy = Math.max(0, Math.floor(fromY - halfSize));
        const sw = Math.min(layer.width - sx, Math.ceil(this.size));
        const sh = Math.min(layer.height - sy, Math.ceil(this.size));

        if (sw <= 0 || sh <= 0) return;

        const sourceData = ctx.getImageData(sx, sy, sw, sh);
        const dx = Math.floor(toX - halfSize);
        const dy = Math.floor(toY - halfSize);

        const destX = Math.max(0, dx);
        const destY = Math.max(0, dy);
        const destW = Math.min(layer.width - destX, sw);
        const destH = Math.min(layer.height - destY, sh);

        if (destW <= 0 || destH <= 0) return;

        const destData = ctx.getImageData(destX, destY, destW, destH);

        for (let i = 0; i < destData.data.length; i += 4) {
            if (i < sourceData.data.length) {
                destData.data[i] = destData.data[i] * (1 - strength) + sourceData.data[i] * strength;
                destData.data[i + 1] = destData.data[i + 1] * (1 - strength) + sourceData.data[i + 1] * strength;
                destData.data[i + 2] = destData.data[i + 2] * (1 - strength) + sourceData.data[i + 2] * strength;
                destData.data[i + 3] = destData.data[i + 3] * (1 - strength) + sourceData.data[i + 3] * strength;
            }
        }

        ctx.putImageData(destData, destX, destY);
    }
}
