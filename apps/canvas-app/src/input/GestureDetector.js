import { bus } from '../core/EventBus.js';
import { EVENTS } from '../core/Constants.js';

export class GestureDetector {
    constructor(viewTransform) {
        this.view = viewTransform;
        this._startDist = 0;
        this._startAngle = 0;
        this._startCenter = { x: 0, y: 0 };
        this._lastCenter = { x: 0, y: 0 };
        this._gestureActive = false;
        this._tapTimers = new Map();
    }

    onMultiDown(pointers) {
        if (pointers.length === 2) {
            const [a, b] = pointers;
            this._startDist = this._distance(a, b);
            this._startAngle = this._angle(a, b);
            this._startCenter = this._center(a, b);
            this._lastCenter = { ...this._startCenter };
            this._gestureActive = true;

            this._tapTimers.set('twoFinger', {
                time: performance.now(),
                moved: false,
            });
        }

        if (pointers.length === 3) {
            this._tapTimers.set('threeFinger', {
                time: performance.now(),
                moved: false,
            });
        }
    }

    onMultiMove(pointers) {
        if (pointers.length === 2 && this._gestureActive) {
            const [a, b] = pointers;
            const dist = this._distance(a, b);
            const angle = this._angle(a, b);
            const center = this._center(a, b);

            // Zoom
            const scale = dist / this._startDist;
            if (Math.abs(scale - 1) > 0.01) {
                this.view.zoom(scale / (this._lastScale || 1), center.x, center.y);
                this._lastScale = scale;
            }

            // Rotate
            const angleDiff = angle - this._startAngle;
            if (Math.abs(angleDiff) > 0.01) {
                this.view.rotate(angleDiff - (this._lastAngleDiff || 0));
                this._lastAngleDiff = angleDiff;
            }

            // Pan
            const dx = center.x - this._lastCenter.x;
            const dy = center.y - this._lastCenter.y;
            if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
                this.view.pan(dx, dy);
                this._lastCenter = center;

                for (const timer of this._tapTimers.values()) {
                    timer.moved = true;
                }
            }

            bus.emit(EVENTS.VIEW_CHANGE, {});
        }
    }

    onMultiUp(remaining) {
        if (remaining.length < 2) {
            this._gestureActive = false;
            this._lastScale = null;
            this._lastAngleDiff = null;
            this._checkTaps();
        }
    }

    reset() {
        this._gestureActive = false;
        this._lastScale = null;
        this._lastAngleDiff = null;
        this._tapTimers.clear();
    }

    _checkTaps() {
        const now = performance.now();

        const twoFinger = this._tapTimers.get('twoFinger');
        if (twoFinger && !twoFinger.moved && now - twoFinger.time < 300) {
            bus.emit(EVENTS.UNDO, {});
        }

        const threeFinger = this._tapTimers.get('threeFinger');
        if (threeFinger && !threeFinger.moved && now - threeFinger.time < 300) {
            bus.emit(EVENTS.REDO, {});
        }

        this._tapTimers.clear();
    }

    _distance(a, b) {
        const dx = a.clientX - b.clientX;
        const dy = a.clientY - b.clientY;
        return Math.sqrt(dx * dx + dy * dy);
    }

    _angle(a, b) {
        return Math.atan2(b.clientY - a.clientY, b.clientX - a.clientX);
    }

    _center(a, b) {
        return {
            x: (a.clientX + b.clientX) / 2,
            y: (a.clientY + b.clientY) / 2,
        };
    }
}
