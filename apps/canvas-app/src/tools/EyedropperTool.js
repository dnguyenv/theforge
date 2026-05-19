import { bus } from '../core/EventBus.js';
import { EVENTS } from '../core/Constants.js';

const LOUPE_SIZE = 120;
const LOUPE_PIXELS = 13;
const PIXEL_SIZE = LOUPE_SIZE / LOUPE_PIXELS;
const LOUPE_OFFSET_Y = -80;

export class EyedropperTool {
    constructor(engine) {
        this.engine = engine;
        this._cachedImageData = null;
        this._loupeEl = null;
        this._loupeCanvas = null;
        this._loupeCtx = null;
        this._loupeColorEl = null;
        this._active = false;
        this._nativeMode = false;
    }

    activate() {
        if (window.EyeDropper && !('ontouchstart' in window)) {
            this._nativeMode = true;
            this._useNativeEyeDropper();
            return;
        }
        this._nativeMode = false;
        this._cacheComposite();
        this._createLoupe();
    }

    deactivate() {
        this._destroyLoupe();
        this._cachedImageData = null;
        this._active = false;
    }

    onPointerDown(e) {
        if (this._nativeMode) return;
        this._active = true;
        this._cacheComposite();
        this._showLoupe(e);
        this._sample(e);
    }

    onPointerMove(e) {
        if (this._nativeMode || !this._active) return;
        this._moveLoupe(e);
        this._sample(e);
    }

    onPointerUp(e) {
        if (this._nativeMode) return;
        this._sample(e);
        this._hideLoupe();
        this._active = false;
    }

    async _useNativeEyeDropper() {
        try {
            const dropper = new EyeDropper();
            const result = await dropper.open();
            if (result && result.sRGBHex) {
                bus.emit(EVENTS.COLOR_CHANGE, { color: result.sRGBHex });
            }
        } catch {
            // User cancelled or API error
        }
    }

    _cacheComposite() {
        this._cachedImageData = this.engine.getCompositeImageData();
    }

    _sample(e) {
        const pos = this.engine.screenToCanvas(e.clientX, e.clientY);
        const color = this._getPixelFromCache(pos.x, pos.y);
        if (!color) return;

        const hex = `#${color.r.toString(16).padStart(2, '0')}${color.g.toString(16).padStart(2, '0')}${color.b.toString(16).padStart(2, '0')}`;
        bus.emit(EVENTS.COLOR_CHANGE, { color: hex });
        this._renderLoupe(pos.x, pos.y, hex);
    }

    _getPixelFromCache(x, y) {
        if (!this._cachedImageData) return null;
        const ix = Math.floor(x);
        const iy = Math.floor(y);
        const w = this._cachedImageData.width;
        const h = this._cachedImageData.height;
        if (ix < 0 || ix >= w || iy < 0 || iy >= h) return null;

        const offset = (iy * w + ix) * 4;
        const d = this._cachedImageData.data;
        if (d[offset + 3] === 0) return null;
        return { r: d[offset], g: d[offset + 1], b: d[offset + 2], a: d[offset + 3] };
    }

    _createLoupe() {
        if (this._loupeEl) return;

        this._loupeEl = document.createElement('div');
        this._loupeEl.className = 'eyedropper-loupe';

        this._loupeCanvas = document.createElement('canvas');
        this._loupeCanvas.width = LOUPE_SIZE;
        this._loupeCanvas.height = LOUPE_SIZE;
        this._loupeCtx = this._loupeCanvas.getContext('2d');
        this._loupeEl.appendChild(this._loupeCanvas);

        this._loupeColorEl = document.createElement('div');
        this._loupeColorEl.className = 'eyedropper-loupe-color';
        this._loupeEl.appendChild(this._loupeColorEl);

        document.body.appendChild(this._loupeEl);
    }

    _destroyLoupe() {
        if (this._loupeEl) {
            this._loupeEl.remove();
            this._loupeEl = null;
            this._loupeCanvas = null;
            this._loupeCtx = null;
            this._loupeColorEl = null;
        }
    }

    _showLoupe(e) {
        if (!this._loupeEl) this._createLoupe();
        this._loupeEl.style.display = 'block';
        this._positionLoupe(e.clientX, e.clientY);
    }

    _moveLoupe(e) {
        this._positionLoupe(e.clientX, e.clientY);
    }

    _hideLoupe() {
        if (this._loupeEl) {
            this._loupeEl.style.display = 'none';
        }
    }

    _positionLoupe(screenX, screenY) {
        if (!this._loupeEl) return;

        const OFFSET_ABOVE = 110;
        const MARGIN = 10;
        const vw = window.innerWidth;
        const vh = window.innerHeight;

        let lx = screenX - LOUPE_SIZE / 2;
        let ly = screenY - OFFSET_ABOVE - LOUPE_SIZE / 2;

        // Top edge: flip below finger
        if (ly < MARGIN) {
            ly = screenY + 60;
        }
        if (ly + LOUPE_SIZE > vh - MARGIN) {
            ly = vh - MARGIN - LOUPE_SIZE;
        }
        if (lx < MARGIN) {
            lx = MARGIN;
        }
        if (lx + LOUPE_SIZE > vw - MARGIN) {
            lx = vw - MARGIN - LOUPE_SIZE;
        }

        this._loupeEl.style.transform = `translate3d(${Math.round(lx)}px, ${Math.round(ly)}px, 0)`;
    }

    _renderLoupe(canvasX, canvasY, hexColor) {
        if (!this._loupeCtx || !this._cachedImageData) return;

        const ctx = this._loupeCtx;
        const data = this._cachedImageData;
        const w = data.width;
        const h = data.height;
        const half = Math.floor(LOUPE_PIXELS / 2);

        ctx.clearRect(0, 0, LOUPE_SIZE, LOUPE_SIZE);

        // Draw magnified pixels
        const startX = Math.floor(canvasX) - half;
        const startY = Math.floor(canvasY) - half;

        for (let py = 0; py < LOUPE_PIXELS; py++) {
            for (let px = 0; px < LOUPE_PIXELS; px++) {
                const sx = startX + px;
                const sy = startY + py;

                if (sx >= 0 && sx < w && sy >= 0 && sy < h) {
                    const offset = (sy * w + sx) * 4;
                    const r = data.data[offset];
                    const g = data.data[offset + 1];
                    const b = data.data[offset + 2];
                    const a = data.data[offset + 3];

                    if (a > 0) {
                        ctx.fillStyle = `rgba(${r},${g},${b},${a / 255})`;
                    } else {
                        // Checkerboard for transparent
                        ctx.fillStyle = (px + py) % 2 === 0 ? '#ffffff' : '#e0e0e0';
                    }
                } else {
                    ctx.fillStyle = '#333333';
                }

                ctx.fillRect(px * PIXEL_SIZE, py * PIXEL_SIZE, PIXEL_SIZE, PIXEL_SIZE);
            }
        }

        // Grid lines
        ctx.strokeStyle = 'rgba(255,255,255,0.15)';
        ctx.lineWidth = 0.5;
        for (let i = 1; i < LOUPE_PIXELS; i++) {
            const pos = i * PIXEL_SIZE;
            ctx.beginPath();
            ctx.moveTo(pos, 0);
            ctx.lineTo(pos, LOUPE_SIZE);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(0, pos);
            ctx.lineTo(LOUPE_SIZE, pos);
            ctx.stroke();
        }

        // Center crosshair
        const cx = half * PIXEL_SIZE;
        const cy = half * PIXEL_SIZE;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.strokeRect(cx + 1, cy + 1, PIXEL_SIZE - 2, PIXEL_SIZE - 2);
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 1;
        ctx.strokeRect(cx, cy, PIXEL_SIZE, PIXEL_SIZE);

        // Color label
        if (this._loupeColorEl) {
            this._loupeColorEl.textContent = hexColor;
            this._loupeColorEl.style.backgroundColor = hexColor;
            this._loupeColorEl.style.color = this._isLight(hexColor) ? '#000' : '#fff';
        }
    }

    _isLight(hex) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return (r * 299 + g * 587 + b * 114) / 1000 > 128;
    }
}
