export class ViewTransform {
    constructor() {
        this.scale = 1;
        this.rotation = 0;
        // panX/panY = screen-space position of the document's top-left corner (at rotation=0)
        this.panX = 0;
        this.panY = 0;
        // Store doc dimensions for rotation pivot
        this._docW = 0;
        this._docH = 0;
    }

    setDocSize(w, h) {
        this._docW = w;
        this._docH = h;
    }

    reset() {
        this.scale = 1;
        this.rotation = 0;
        this.panX = 0;
        this.panY = 0;
    }

    fitToScreen(docWidth, docHeight, viewWidth, viewHeight) {
        this._docW = docWidth;
        this._docH = docHeight;
        const scaleX = viewWidth / docWidth;
        const scaleY = viewHeight / docHeight;
        this.scale = Math.min(scaleX, scaleY) * 0.9;
        this.rotation = 0;
        this.panX = (viewWidth - docWidth * this.scale) / 2;
        this.panY = (viewHeight - docHeight * this.scale) / 2;
    }

    zoom(factor, cx, cy) {
        const newScale = Math.max(0.05, Math.min(30, this.scale * factor));
        const ratio = newScale / this.scale;
        // Keep the point (cx, cy) stationary
        this.panX = cx - (cx - this.panX) * ratio;
        this.panY = cy - (cy - this.panY) * ratio;
        this.scale = newScale;
    }

    rotate(deltaAngle, cx, cy) {
        // Rotate the pan offset around the gesture center
        const cos = Math.cos(deltaAngle);
        const sin = Math.sin(deltaAngle);
        const dx = this.panX - cx;
        const dy = this.panY - cy;
        this.panX = cx + dx * cos - dy * sin;
        this.panY = cy + dx * sin + dy * cos;
        this.rotation += deltaAngle;
    }

    pan(dx, dy) {
        this.panX += dx;
        this.panY += dy;
    }

    applyToContext(ctx) {
        // Transform: move to panX/panY, rotate around that point, then scale
        ctx.translate(this.panX, this.panY);
        ctx.rotate(this.rotation);
        ctx.scale(this.scale, this.scale);
    }

    screenToCanvas(sx, sy) {
        // Reverse: un-translate, un-rotate, un-scale
        const dx = sx - this.panX;
        const dy = sy - this.panY;
        const cos = Math.cos(-this.rotation);
        const sin = Math.sin(-this.rotation);
        const rx = dx * cos - dy * sin;
        const ry = dx * sin + dy * cos;
        return {
            x: rx / this.scale,
            y: ry / this.scale,
        };
    }

    canvasToScreen(cx, cy) {
        const x = cx * this.scale;
        const y = cy * this.scale;
        const cos = Math.cos(this.rotation);
        const sin = Math.sin(this.rotation);
        return {
            x: x * cos - y * sin + this.panX,
            y: x * sin + y * cos + this.panY,
        };
    }
}
