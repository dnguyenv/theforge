import { bus } from '../core/EventBus.js';
import { EVENTS, LIMITS } from '../core/Constants.js';

export class PointerHandler {
    constructor(canvas, toolManager, gestureDetector, viewTransform) {
        this.canvas = canvas;
        this.toolManager = toolManager;
        this.gestureDetector = gestureDetector;
        this.view = viewTransform;
        this._lastTime = 0;
        this._pointers = new Map();

        canvas.addEventListener('pointerdown', (e) => this._onDown(e));
        canvas.addEventListener('pointermove', (e) => this._onMove(e));
        canvas.addEventListener('pointerup', (e) => this._onUp(e));
        canvas.addEventListener('pointerleave', (e) => this._onUp(e));
        canvas.addEventListener('pointercancel', (e) => this._onUp(e));
        canvas.addEventListener('wheel', (e) => this._onWheel(e), { passive: false });
        canvas.style.touchAction = 'none';
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
