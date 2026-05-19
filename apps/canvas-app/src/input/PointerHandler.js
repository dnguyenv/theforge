import { bus } from '../core/EventBus.js';
import { EVENTS, LIMITS } from '../core/Constants.js';

const LONG_PRESS_MS = 400;
const LONG_PRESS_MOVE_TOLERANCE = 8;

export class PointerHandler {
    constructor(canvas, toolManager, gestureDetector, viewTransform, engine) {
        this.canvas = canvas;
        this.toolManager = toolManager;
        this.gestureDetector = gestureDetector;
        this.view = viewTransform;
        this.engine = engine;
        this._lastTime = 0;
        this._pointers = new Map();
        this._isPanning = false;
        this._panLastX = 0;
        this._panLastY = 0;
        this._spaceHeld = false;
        this._disabled = false;

        // Long-press eyedropper state
        this._longPressTimer = null;
        this._longPressStartX = 0;
        this._longPressStartY = 0;
        this._isLongPressActive = false;
        this._longPressLoupe = null;
        this._longPressCachedData = null;
        this._strokeStarted = false;

        canvas.addEventListener('pointerdown', (e) => this._onDown(e));
        canvas.addEventListener('pointermove', (e) => this._onMove(e));
        canvas.addEventListener('pointerup', (e) => this._onUp(e));
        canvas.addEventListener('pointerleave', (e) => this._onUp(e));
        canvas.addEventListener('pointercancel', (e) => this._onUp(e));
        canvas.addEventListener('wheel', (e) => this._onWheel(e), { passive: false });
        canvas.style.touchAction = 'none';

        // Suppress iOS long-press native callout/selection on canvas
        canvas.addEventListener('contextmenu', (e) => e.preventDefault());
        canvas.addEventListener('touchstart', (e) => {
            if (e.target === canvas) e.preventDefault();
        }, { passive: false });

        document.addEventListener('keydown', (e) => {
            if (e.code === 'Space' && !e.repeat) {
                this._spaceHeld = true;
                canvas.style.cursor = 'grab';
            }
        });
        document.addEventListener('keyup', (e) => {
            if (e.code === 'Space') {
                this._spaceHeld = false;
                canvas.style.cursor = 'crosshair';
            }
        });
    }

    _onWheel(e) {
        e.preventDefault();
        const factor = e.deltaY < 0 ? 1.1 : 0.9;
        const rect = this.canvas.getBoundingClientRect();
        const cx = e.clientX - rect.left;
        const cy = e.clientY - rect.top;
        this.view.zoom(factor, cx, cy);
        bus.emit(EVENTS.VIEW_CHANGE, {});
    }

    disable() { this._disabled = true; }
    enable() { this._disabled = false; }

    _onDown(e) {
        if (this._disabled) return;
        this._pointers.set(e.pointerId, e);

        // Middle mouse button (button=1) or Space+click = pan
        if (e.button === 1 || this._spaceHeld) {
            this._cancelLongPress();
            this._isPanning = true;
            this._panLastX = e.clientX;
            this._panLastY = e.clientY;
            this.canvas.style.cursor = 'grabbing';
            e.preventDefault();
            return;
        }

        if (this._pointers.size > 1) {
            this._cancelLongPress();
            this.toolManager.onPointerUp(e);
            this.gestureDetector.onMultiDown([...this._pointers.values()]);
            return;
        }

        // Start long-press detection
        this._longPressStartX = e.clientX;
        this._longPressStartY = e.clientY;
        this._strokeStarted = false;

        this._longPressTimer = setTimeout(() => {
            this._activateLongPressEyedropper(e);
        }, LONG_PRESS_MS);

        this.toolManager.onPointerDown(e);
        this._strokeStarted = true;
    }

    _onMove(e) {
        if (this._disabled) return;
        this._pointers.set(e.pointerId, e);

        // If long-press eyedropper is active, feed it moves
        if (this._isLongPressActive) {
            this._longPressSample(e);
            return;
        }

        // Check if movement exceeds tolerance — cancel long-press timer
        if (this._longPressTimer) {
            const dx = e.clientX - this._longPressStartX;
            const dy = e.clientY - this._longPressStartY;
            if (Math.sqrt(dx * dx + dy * dy) > LONG_PRESS_MOVE_TOLERANCE) {
                this._cancelLongPress();
            }
        }

        if (this._isPanning) {
            const dx = e.clientX - this._panLastX;
            const dy = e.clientY - this._panLastY;
            this._panLastX = e.clientX;
            this._panLastY = e.clientY;
            this.view.pan(dx, dy);
            bus.emit(EVENTS.VIEW_CHANGE, {});
            return;
        }

        if (this._pointers.size > 1) {
            this.gestureDetector.onMultiMove([...this._pointers.values()]);
            return;
        }

        const now = performance.now();
        if (now - this._lastTime < LIMITS.POINTER_THROTTLE_MS) return;
        this._lastTime = now;

        this.toolManager.onPointerMove(e);
    }

    _onUp(e) {
        this._pointers.delete(e.pointerId);
        this._cancelLongPress();

        // If long-press eyedropper was active, finalize color pick
        if (this._isLongPressActive) {
            this._deactivateLongPressEyedropper(e);
            return;
        }

        if (this._isPanning) {
            this._isPanning = false;
            this.canvas.style.cursor = this._spaceHeld ? 'grab' : 'crosshair';
            return;
        }

        if (this._pointers.size > 0) {
            this.gestureDetector.onMultiUp([...this._pointers.values()]);
            return;
        }

        this.gestureDetector.reset();
        this.toolManager.onPointerUp(e);
    }

    // --- Long-Press Eyedropper ---

    _cancelLongPress() {
        if (this._longPressTimer) {
            clearTimeout(this._longPressTimer);
            this._longPressTimer = null;
        }
    }

    _activateLongPressEyedropper(e) {
        this._longPressTimer = null;
        this._isLongPressActive = true;

        // Cancel any in-progress stroke from the active tool
        if (this._strokeStarted) {
            this.toolManager.onPointerUp(e);
            this._strokeStarted = false;
        }

        // Cache composite image data once
        this._longPressCachedData = this.engine.getCompositeImageData();

        // Create loupe
        this._createLongPressLoupe();
        this._longPressSample(e);

        // Haptic feedback on supported devices
        if (navigator.vibrate) navigator.vibrate(30);
    }

    _deactivateLongPressEyedropper(e) {
        this._isLongPressActive = false;
        this._destroyLongPressLoupe();
        this._longPressCachedData = null;

        // Final color pick
        this._longPressFinalPick(e);
    }

    _longPressSample(e) {
        if (!this._longPressCachedData) return;

        const pos = this.engine.screenToCanvas(e.clientX, e.clientY);
        const ix = Math.floor(pos.x);
        const iy = Math.floor(pos.y);
        const w = this._longPressCachedData.width;
        const h = this._longPressCachedData.height;

        let hex = null;
        if (ix >= 0 && ix < w && iy >= 0 && iy < h) {
            const offset = (iy * w + ix) * 4;
            const d = this._longPressCachedData.data;
            if (d[offset + 3] > 0) {
                const r = d[offset], g = d[offset + 1], b = d[offset + 2];
                hex = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
            }
        }

        this._renderLongPressLoupe(e.clientX, e.clientY, pos.x, pos.y, hex);
    }

    _longPressFinalPick(e) {
        const pos = this.engine.screenToCanvas(e.clientX, e.clientY);
        const ix = Math.floor(pos.x);
        const iy = Math.floor(pos.y);

        if (!this._longPressCachedData) return;
        const w = this._longPressCachedData.width;
        const h = this._longPressCachedData.height;

        if (ix >= 0 && ix < w && iy >= 0 && iy < h) {
            const offset = (iy * w + ix) * 4;
            const d = this._longPressCachedData.data;
            if (d[offset + 3] > 0) {
                const r = d[offset], g = d[offset + 1], b = d[offset + 2];
                const hex = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
                bus.emit(EVENTS.COLOR_CHANGE, { color: hex });
            }
        }
    }

    // --- Long-Press Loupe DOM ---

    _createLongPressLoupe() {
        if (this._longPressLoupe) return;

        const el = document.createElement('div');
        el.className = 'eyedropper-loupe';
        el.style.display = 'block';

        const canvas = document.createElement('canvas');
        canvas.width = 120;
        canvas.height = 120;
        el.appendChild(canvas);

        const label = document.createElement('div');
        label.className = 'eyedropper-loupe-color';
        el.appendChild(label);

        document.body.appendChild(el);

        this._longPressLoupe = { el, canvas, ctx: canvas.getContext('2d'), label };
    }

    _destroyLongPressLoupe() {
        if (this._longPressLoupe) {
            this._longPressLoupe.el.remove();
            this._longPressLoupe = null;
        }
    }

    _renderLongPressLoupe(screenX, screenY, canvasX, canvasY, hex) {
        if (!this._longPressLoupe || !this._longPressCachedData) return;

        const { el, canvas, ctx, label } = this._longPressLoupe;
        const SIZE = 120;
        const PIXELS = 13;
        const PX = SIZE / PIXELS;
        const half = Math.floor(PIXELS / 2);
        const data = this._longPressCachedData;
        const w = data.width;
        const h = data.height;

        // Position loupe above finger
        const lx = screenX - SIZE / 2;
        const ly = screenY - 80 - SIZE / 2;
        el.style.transform = `translate(${lx}px, ${ly}px)`;

        ctx.clearRect(0, 0, SIZE, SIZE);

        const startX = Math.floor(canvasX) - half;
        const startY = Math.floor(canvasY) - half;

        for (let py = 0; py < PIXELS; py++) {
            for (let px = 0; px < PIXELS; px++) {
                const sx = startX + px;
                const sy = startY + py;

                if (sx >= 0 && sx < w && sy >= 0 && sy < h) {
                    const offset = (sy * w + sx) * 4;
                    const r = data.data[offset];
                    const g = data.data[offset + 1];
                    const b = data.data[offset + 2];
                    const a = data.data[offset + 3];
                    ctx.fillStyle = a > 0
                        ? `rgba(${r},${g},${b},${a / 255})`
                        : ((px + py) % 2 === 0 ? '#fff' : '#e0e0e0');
                } else {
                    ctx.fillStyle = '#333';
                }
                ctx.fillRect(px * PX, py * PX, PX, PX);
            }
        }

        // Grid
        ctx.strokeStyle = 'rgba(255,255,255,0.12)';
        ctx.lineWidth = 0.5;
        for (let i = 1; i < PIXELS; i++) {
            const p = i * PX;
            ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, SIZE); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(SIZE, p); ctx.stroke();
        }

        // Crosshair
        const cx = half * PX, cy = half * PX;
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.strokeRect(cx + 1, cy + 1, PX - 2, PX - 2);
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1;
        ctx.strokeRect(cx, cy, PX, PX);

        // Color label
        if (hex) {
            label.textContent = hex;
            label.style.backgroundColor = hex;
            label.style.color = this._isLight(hex) ? '#000' : '#fff';
            label.style.display = '';
        } else {
            label.style.display = 'none';
        }
    }

    _isLight(hex) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return (r * 299 + g * 587 + b * 114) / 1000 > 128;
    }
}
