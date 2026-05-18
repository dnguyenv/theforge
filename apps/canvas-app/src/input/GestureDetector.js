import { bus } from '../core/EventBus.js';
import { EVENTS } from '../core/Constants.js';

export class GestureDetector {
    constructor(viewTransform) {
        this.view = viewTransform;
        this._prevDist = 0;
        this._prevAngle = 0;
        this._prevCenter = { x: 0, y: 0 };
        this._gestureActive = false;
        this._totalMovement = 0;
        this._downTime = 0;
        this._fingerCount = 0;
    }

    onMultiDown(pointers) {
        this._fingerCount = pointers.length;
        this._downTime = performance.now();
        this._totalMovement = 0;

        if (pointers.length >= 2) {
            const [a, b] = pointers;
            this._prevDist = this._distance(a, b);
            this._prevAngle = this._angle(a, b);
            this._prevCenter = this._center(a, b);
            this._gestureActive = true;
        }
    }

    onMultiMove(pointers) {
        if (pointers.length < 2 || !this._gestureActive) return;

        const [a, b] = pointers;
        const dist = this._distance(a, b);
        const angle = this._angle(a, b);
        const center = this._center(a, b);

        // Incremental zoom (ratio of current distance to previous frame's distance)
        if (this._prevDist > 10) {
            const zoomFactor = dist / this._prevDist;
            if (zoomFactor !== 1) {
                this.view.zoom(zoomFactor, center.x, center.y);
            }
        }

        // Incremental rotation (delta from previous frame)
        const deltaAngle = angle - this._prevAngle;
        // Avoid jumps when angle wraps around ±PI
        if (Math.abs(deltaAngle) < Math.PI * 0.5) {
            this.view.rotate(deltaAngle, center.x, center.y);
        }

        // Incremental pan
        const dx = center.x - this._prevCenter.x;
        const dy = center.y - this._prevCenter.y;
        this.view.pan(dx, dy);

        this._totalMovement += Math.abs(dx) + Math.abs(dy) + Math.abs(dist - this._prevDist);

        // Update previous state for next frame
        this._prevDist = dist;
        this._prevAngle = angle;
        this._prevCenter = center;

        bus.emit(EVENTS.VIEW_CHANGE, {});
    }

    onMultiUp(remaining) {
        if (remaining.length < 2) {
            this._gestureActive = false;
            this._checkTap();
        }
    }

    reset() {
        this._gestureActive = false;
    }

    _checkTap() {
        const elapsed = performance.now() - this._downTime;
        if (elapsed > 300 || this._totalMovement > 20) return;

        if (this._fingerCount === 2) {
            bus.emit(EVENTS.UNDO, {});
        } else if (this._fingerCount === 3) {
            bus.emit(EVENTS.REDO, {});
        }
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
