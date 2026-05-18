import { bus } from '../core/EventBus.js';
import { EVENTS } from '../core/Constants.js';
import { BrushEngine } from '../brush/BrushEngine.js';
import { getBrushById } from '../brush/BrushRegistry.js';
import { forge } from '../forge/ForgeIntegration.js';

export class BrushTool {
    constructor(engine) {
        this.engine = engine;
        this.brushEngine = new BrushEngine();
        this.brushId = 'pencil';
        this.size = 8;
        this.opacity = 1.0;
        this.color = '#1a1a2e';
        this.isDrawing = false;
        this.lastPoint = null;
        this.compositeOp = 'source-over';

        bus.on(EVENTS.BRUSH_CHANGE, ({ brushId, size, opacity }) => {
            if (brushId) this.brushId = brushId;
            if (size !== undefined) this.size = size;
            if (opacity !== undefined) this.opacity = opacity;
            this.brushEngine.configure(getBrushById(this.brushId));
        });

        bus.on(EVENTS.COLOR_CHANGE, ({ color }) => {
            this.color = color;
        });

        this.brushEngine.configure(getBrushById(this.brushId));
    }

    activate() {}
    deactivate() {
        this.isDrawing = false;
    }

    onPointerDown(e) {
        const layer = this.engine.layers.activeLayer;
        if (!layer || layer.locked) return;

        this.isDrawing = true;
        this.brushEngine.beginStroke();

        const pos = this.engine.screenToCanvas(e.clientX, e.clientY);
        const pressure = e.pressure || 0.5;

        this.lastPoint = {
            x: pos.x,
            y: pos.y,
            pressure,
            velocity: 0,
        };

        const smoothed = this.brushEngine.addPoint(this.lastPoint);
        if (smoothed) {
            this._stamp(layer, smoothed, smoothed);
        }

        try {
            forge.recordStroke(layer.id, pressure, 0, pos.x, pos.y, 0);
        } catch (e) {
            // Don't let forge errors interrupt drawing
        }
    }

    onPointerMove(e) {
        if (!this.isDrawing) return;
        const layer = this.engine.layers.activeLayer;
        if (!layer) return;

        const pos = this.engine.screenToCanvas(e.clientX, e.clientY);
        const pressure = e.pressure || 0.5;
        const dx = pos.x - this.lastPoint.x;
        const dy = pos.y - this.lastPoint.y;
        const dt = 8; // approximate at throttle rate
        const velocity = Math.sqrt(dx * dx + dy * dy) / dt * 1000;

        const point = { x: pos.x, y: pos.y, pressure, velocity };
        const smoothed = this.brushEngine.addPoint(point);

        if (smoothed && this.lastPoint) {
            this._stamp(layer, this.lastPoint, smoothed);
            this.lastPoint = smoothed;
        } else {
            this.lastPoint = point;
        }

        this.engine.markDirty();

        try {
            forge.recordStroke(layer.id, pressure, velocity, pos.x, pos.y, dt);
        } catch (e) {
            // Don't let forge errors interrupt drawing
        }
    }

    onPointerUp(e) {
        this.isDrawing = false;
        this.lastPoint = null;
        const layer = this.engine.layers.activeLayer;
        if (layer) layer.markDirty();
        this.engine._invalidateBelowCache();
        bus.emit(EVENTS.STROKE_END, {});
    }

    _stamp(layer, from, to) {
        const ctx = layer.ctx;
        ctx.globalCompositeOperation = this.compositeOp;
        this.brushEngine.renderSegment(
            ctx,
            from,
            to,
            getBrushById(this.brushId),
            this.size,
            this.opacity,
            this.color
        );
        ctx.globalCompositeOperation = 'source-over';
    }
}
