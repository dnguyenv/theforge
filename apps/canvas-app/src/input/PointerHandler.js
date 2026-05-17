import { LIMITS } from '../core/Constants.js';

export class PointerHandler {
    constructor(canvas, toolManager, gestureDetector) {
        this.canvas = canvas;
        this.toolManager = toolManager;
        this.gestureDetector = gestureDetector;
        this._lastTime = 0;
        this._pointers = new Map();

        canvas.addEventListener('pointerdown', (e) => this._onDown(e));
        canvas.addEventListener('pointermove', (e) => this._onMove(e));
        canvas.addEventListener('pointerup', (e) => this._onUp(e));
        canvas.addEventListener('pointerleave', (e) => this._onUp(e));
        canvas.addEventListener('pointercancel', (e) => this._onUp(e));
        canvas.style.touchAction = 'none';
    }

    _onDown(e) {
        this._pointers.set(e.pointerId, e);

        if (this._pointers.size > 1) {
            this.toolManager.onPointerUp(e);
            this.gestureDetector.onMultiDown([...this._pointers.values()]);
            return;
        }

        this.toolManager.onPointerDown(e);
    }

    _onMove(e) {
        this._pointers.set(e.pointerId, e);

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

        if (this._pointers.size > 0) {
            this.gestureDetector.onMultiUp([...this._pointers.values()]);
            return;
        }

        this.gestureDetector.reset();
        this.toolManager.onPointerUp(e);
    }
}
