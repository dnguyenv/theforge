const FlipState = {
    IDLE: 'idle',
    DRAGGING: 'dragging',
    COMPLETING: 'completing',
    CANCELLING: 'cancelling',
};

export class PageFlipEngine {
    constructor(pageWidth, pageHeight) {
        this.pageWidth = pageWidth;
        this.pageHeight = pageHeight;
        this._state = FlipState.IDLE;
        this._progress = 0;
        this._velocity = 0;
        this._direction = 'forward';
        this._dragCornerY = pageHeight;
        this.onComplete = null;
        this.onCancel = null;
        this.onProgress = null;
    }

    get state() { return this._state; }
    get progress() { return this._progress; }
    get isAnimating() { return this._state !== FlipState.IDLE; }

    setPageSize(w, h) {
        this.pageWidth = w;
        this.pageHeight = h;
    }

    startDrag(x, y, edge) {
        if (this._state !== FlipState.IDLE) return;
        this._state = FlipState.DRAGGING;
        this._direction = edge === 'right' ? 'forward' : 'backward';
        this._progress = 0;
        this._velocity = 0;
        this._dragCornerY = y;
    }

    updateDrag(x, y) {
        if (this._state !== FlipState.DRAGGING) return;
        const W = this.pageWidth;
        this._dragCornerY = y;
        if (this._direction === 'forward') {
            this._progress = Math.max(0, Math.min(1, (W - x) / W));
        } else {
            this._progress = Math.max(0, Math.min(1, x / W));
        }
    }

    endDrag(velocityX) {
        if (this._state !== FlipState.DRAGGING) return;
        const VELOCITY_THRESHOLD = 500;
        const shouldComplete =
            Math.abs(velocityX) > VELOCITY_THRESHOLD
                ? (this._direction === 'forward' ? velocityX < 0 : velocityX > 0)
                : this._progress > 0.4;

        this._velocity = velocityX / this.pageWidth * 0.5;
        this._state = shouldComplete ? FlipState.COMPLETING : FlipState.CANCELLING;
    }

    startFlip(direction) {
        if (this._state !== FlipState.IDLE) return false;
        this._direction = direction;
        this._progress = 0.01;
        this._velocity = 0;
        this._dragCornerY = this.pageHeight * 0.85;
        this._state = FlipState.COMPLETING;
        return true;
    }

    cancel() {
        if (this._state === FlipState.DRAGGING || this._state === FlipState.COMPLETING) {
            this._state = FlipState.CANCELLING;
        }
    }

    update(dt) {
        if (this._state === FlipState.IDLE) return null;

        if (this._state !== FlipState.DRAGGING) {
            this._updatePhysics(dt);
        }

        const corner = this._progressToCorner(this._progress);
        const frame = this._computeGeometry(corner.x, corner.y);

        if (this.onProgress) this.onProgress(this._progress);

        return frame;
    }

    _updatePhysics(dt) {
        const target = this._state === FlipState.COMPLETING ? 1.0 : 0.0;
        const stiffness = 300;
        const damping = 25;

        const displacement = target - this._progress;
        const springForce = stiffness * displacement;
        const dampingForce = -damping * this._velocity;
        const acceleration = springForce + dampingForce;

        this._velocity += acceleration * dt;
        this._progress += this._velocity * dt;
        this._progress = Math.max(0, Math.min(1, this._progress));

        if (Math.abs(displacement) < 0.002 && Math.abs(this._velocity) < 0.05) {
            this._progress = target;
            this._velocity = 0;
            this._onDone();
        }
    }

    _onDone() {
        const wasCompleting = this._state === FlipState.COMPLETING;
        this._state = FlipState.IDLE;
        this._progress = 0;
        if (wasCompleting && this.onComplete) this.onComplete();
        if (!wasCompleting && this.onCancel) this.onCancel();
    }

    _progressToCorner(progress) {
        const W = this.pageWidth;
        const H = this.pageHeight;
        const x = this._direction === 'forward'
            ? W * (1 - progress)
            : W * progress;
        const arcY = Math.sin(progress * Math.PI) * H * 0.04;
        const y = this._dragCornerY - arcY;
        return { x: Math.max(0, Math.min(W, x)), y: Math.max(0, Math.min(H, y)) };
    }

    _computeGeometry(cx, cy) {
        const W = this.pageWidth;
        const H = this.pageHeight;

        const restX = this._direction === 'forward' ? W : 0;
        const midX = (cx + restX) / 2;
        const midY = cy;

        const dx = restX - cx;
        const dy = 0;
        const len = Math.abs(dx) || 1;

        const perpX = 0;
        const perpY = 1;

        const foldX = midX;
        const curlIntensity = Math.min(1, this._progress * 1.5);
        const cpOffset = curlIntensity * W * 0.06;

        const foldTop = { x: foldX + cpOffset * 0.3, y: 0 };
        const foldBottom = { x: foldX - cpOffset * 0.3, y: H };
        const cpX = foldX + (this._direction === 'forward' ? -cpOffset : cpOffset);

        const curlPath = new Path2D();
        curlPath.moveTo(foldTop.x, foldTop.y);
        curlPath.quadraticCurveTo(cpX, H / 2, foldBottom.x, foldBottom.y);

        const frontClipPath = new Path2D();
        const backClipPath = new Path2D();

        if (this._direction === 'forward') {
            frontClipPath.moveTo(0, 0);
            frontClipPath.lineTo(foldTop.x, 0);
            frontClipPath.quadraticCurveTo(cpX, H / 2, foldBottom.x, H);
            frontClipPath.lineTo(0, H);
            frontClipPath.closePath();

            backClipPath.moveTo(foldTop.x, 0);
            backClipPath.lineTo(W, 0);
            backClipPath.lineTo(W, H);
            backClipPath.lineTo(foldBottom.x, H);
            backClipPath.quadraticCurveTo(cpX, H / 2, foldTop.x, 0);
            backClipPath.closePath();
        } else {
            frontClipPath.moveTo(W, 0);
            frontClipPath.lineTo(foldTop.x, 0);
            frontClipPath.quadraticCurveTo(cpX, H / 2, foldBottom.x, H);
            frontClipPath.lineTo(W, H);
            frontClipPath.closePath();

            backClipPath.moveTo(foldTop.x, 0);
            backClipPath.lineTo(0, 0);
            backClipPath.lineTo(0, H);
            backClipPath.lineTo(foldBottom.x, H);
            backClipPath.quadraticCurveTo(cpX, H / 2, foldTop.x, 0);
            backClipPath.closePath();
        }

        const shadowWidth = Math.max(10, 50 * this._progress);
        const shadowGradient = {
            x0: foldX - shadowWidth, y0: 0,
            x1: foldX + shadowWidth, y1: 0,
            stops: [
                [0, 'rgba(0,0,0,0)'],
                [0.35, `rgba(0,0,0,${0.25 * this._progress})`],
                [0.5, `rgba(0,0,0,${0.45 * this._progress})`],
                [0.65, `rgba(0,0,0,${0.25 * this._progress})`],
                [1, 'rgba(0,0,0,0)'],
            ],
        };

        const reflectX = foldX;

        return {
            progress: this._progress,
            direction: this._direction,
            curlPath,
            frontClipPath,
            backClipPath,
            shadowGradient,
            reflectX,
            cornerPos: { x: cx, y: cy },
            foldTop,
            foldBottom,
        };
    }
}
