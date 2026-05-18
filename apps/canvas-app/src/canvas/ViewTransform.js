export class ViewTransform {
    constructor() {
        this.scale = 1;
        this.panX = 0;
        this.panY = 0;
    }

    reset() {
        this.scale = 1;
        this.panX = 0;
        this.panY = 0;
    }

    fitToScreen(docWidth, docHeight, viewWidth, viewHeight) {
        const scaleX = viewWidth / docWidth;
        const scaleY = viewHeight / docHeight;
        this.scale = Math.min(scaleX, scaleY) * 0.9;
        this.panX = (viewWidth - docWidth * this.scale) / 2;
        this.panY = (viewHeight - docHeight * this.scale) / 2;
    }

    zoom(factor, centerX, centerY) {
        const newScale = Math.max(0.1, Math.min(20, this.scale * factor));
        // Zoom toward the point under the cursor
        this.panX = centerX - (centerX - this.panX) * (newScale / this.scale);
        this.panY = centerY - (centerY - this.panY) * (newScale / this.scale);
        this.scale = newScale;
    }

    pan(dx, dy) {
        this.panX += dx;
        this.panY += dy;
    }

    applyToContext(ctx) {
        ctx.translate(this.panX, this.panY);
        ctx.scale(this.scale, this.scale);
    }

    screenToCanvas(sx, sy) {
        return {
            x: (sx - this.panX) / this.scale,
            y: (sy - this.panY) / this.scale,
        };
    }

    canvasToScreen(cx, cy) {
        return {
            x: cx * this.scale + this.panX,
            y: cy * this.scale + this.panY,
        };
    }
}
