import { bus } from '../core/EventBus.js';
import { EVENTS } from '../core/Constants.js';
import { LayerStack } from './LayerStack.js';
import { ViewTransform } from './ViewTransform.js';

export class CanvasEngine {
    constructor(displayCanvas, width, height) {
        this.displayCanvas = displayCanvas;
        this.displayCtx = displayCanvas.getContext('2d');
        this.docWidth = width;
        this.docHeight = height;
        this.layers = new LayerStack(width, height);
        this.view = new ViewTransform();
        this._dirty = true;
        this._rafId = null;
        this._belowCache = null;
        this._belowCacheDirty = true;

        this._setupDisplay();
        this._startRenderLoop();
        this._bindEvents();
    }

    _setupDisplay() {
        const dpr = window.devicePixelRatio || 1;
        const rect = this.displayCanvas.getBoundingClientRect();
        this.displayCanvas.width = rect.width * dpr;
        this.displayCanvas.height = rect.height * dpr;
        this.displayCtx.scale(dpr, dpr);
        this.viewWidth = rect.width;
        this.viewHeight = rect.height;
        this.view.fitToScreen(this.docWidth, this.docHeight, this.viewWidth, this.viewHeight);
    }

    _bindEvents() {
        bus.on(EVENTS.CANVAS_DIRTY, () => this.markDirty());
        bus.on(EVENTS.LAYER_ADD, () => this._invalidateBelowCache());
        bus.on(EVENTS.LAYER_REMOVE, () => this._invalidateBelowCache());
        bus.on(EVENTS.LAYER_REORDER, () => this._invalidateBelowCache());
        bus.on(EVENTS.LAYER_UPDATE, () => this._invalidateBelowCache());
        bus.on(EVENTS.VIEW_CHANGE, () => this.markDirty());

        new ResizeObserver(() => {
            this._setupDisplay();
            this.markDirty();
        }).observe(this.displayCanvas);
    }

    _startRenderLoop() {
        const loop = () => {
            if (this._dirty) {
                this._composite();
                this._dirty = false;
            }
            this._rafId = requestAnimationFrame(loop);
        };
        this._rafId = requestAnimationFrame(loop);
    }

    markDirty() {
        this._dirty = true;
    }

    _invalidateBelowCache() {
        this._belowCacheDirty = true;
        this.markDirty();
    }

    _buildBelowCache() {
        const activeIdx = this.layers.activeIndex;
        if (!this._belowCache) {
            this._belowCache = new OffscreenCanvas(this.docWidth, this.docHeight);
        }
        const ctx = this._belowCache.getContext('2d');
        ctx.clearRect(0, 0, this.docWidth, this.docHeight);

        for (let i = 0; i < activeIdx; i++) {
            const layer = this.layers.layers[i];
            if (!layer.visible) continue;
            ctx.globalAlpha = layer.opacity;
            ctx.globalCompositeOperation = layer.blendMode;
            ctx.drawImage(layer.canvas, 0, 0);
        }
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
        this._belowCacheDirty = false;
    }

    _composite() {
        const ctx = this.displayCtx;
        const dpr = window.devicePixelRatio || 1;

        ctx.save();
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, this.viewWidth, this.viewHeight);

        // Draw checkerboard background for transparency
        this._drawCheckerboard(ctx);

        this.view.applyToContext(ctx);

        if (this._belowCacheDirty) {
            this._buildBelowCache();
        }

        // Draw below-cache
        const activeIdx = this.layers.activeIndex;
        if (activeIdx > 0 && this._belowCache) {
            ctx.drawImage(this._belowCache, 0, 0);
        }

        // Draw active layer and above
        for (let i = activeIdx; i < this.layers.count; i++) {
            const layer = this.layers.layers[i];
            if (!layer.visible) continue;
            ctx.globalAlpha = layer.opacity;
            ctx.globalCompositeOperation = layer.blendMode;
            ctx.drawImage(layer.canvas, 0, 0);
        }

        ctx.restore();
    }

    _drawCheckerboard(ctx) {
        const size = 12;
        const cols = Math.ceil(this.viewWidth / size);
        const rows = Math.ceil(this.viewHeight / size);
        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                ctx.fillStyle = (row + col) % 2 === 0 ? '#2a2a2a' : '#222222';
                ctx.fillRect(col * size, row * size, size, size);
            }
        }
    }

    screenToCanvas(sx, sy) {
        const rect = this.displayCanvas.getBoundingClientRect();
        const localX = sx - rect.left;
        const localY = sy - rect.top;
        return this.view.screenToCanvas(localX, localY);
    }

    getCompositeImageData() {
        const canvas = new OffscreenCanvas(this.docWidth, this.docHeight);
        const ctx = canvas.getContext('2d');
        for (const layer of this.layers.layers) {
            if (!layer.visible) continue;
            ctx.globalAlpha = layer.opacity;
            ctx.globalCompositeOperation = layer.blendMode;
            ctx.drawImage(layer.canvas, 0, 0);
        }
        return ctx.getImageData(0, 0, this.docWidth, this.docHeight);
    }

    getPixelAt(x, y) {
        const data = this.getCompositeImageData();
        const ix = Math.floor(x);
        const iy = Math.floor(y);
        if (ix < 0 || ix >= this.docWidth || iy < 0 || iy >= this.docHeight) {
            return [0, 0, 0, 0];
        }
        const offset = (iy * this.docWidth + ix) * 4;
        return [data.data[offset], data.data[offset + 1], data.data[offset + 2], data.data[offset + 3]];
    }

    destroy() {
        if (this._rafId) cancelAnimationFrame(this._rafId);
    }
}
