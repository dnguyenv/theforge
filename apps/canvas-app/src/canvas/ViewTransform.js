export class ViewTransform {
    constructor() {
        this.scale = 1;
        this.rotation = 0;
        this.panX = 0;
        this.panY = 0;
        this.flipX = false;
    }

    reset() {
        this.scale = 1;
        this.rotation = 0;
        this.panX = 0;
        this.panY = 0;
        this.flipX = false;
    }

    fitToScreen(docWidth, docHeight, viewWidth, viewHeight) {
        const scaleX = viewWidth / docWidth;
        const scaleY = viewHeight / docHeight;
        this.scale = Math.min(scaleX, scaleY) * 0.9;
        this.panX = (viewWidth - docWidth * this.scale) / 2;
        this.panY = (viewHeight - docHeight * this.scale) / 2;
        this.rotation = 0;
    }

    zoom(factor, centerX, centerY) {
        const oldScale = this.scale;
        this.scale = Math.max(0.1, Math.min(20, this.scale * factor));
        const ratio = this.scale / oldScale;
        this.panX = centerX - (centerX - this.panX) * ratio;
        this.panY = centerY - (centerY - this.panY) * ratio;
    }

    pan(dx, dy) {
        this.panX += dx;
        this.panY += dy;
    }

    rotate(angle) {
        this.rotation += angle;
    }

    applyToContext(ctx) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.translate(this.panX, this.panY);
        if (this.rotation !== 0) {
            ctx.rotate(this.rotation);
        }
        ctx.scale(this.flipX ? -this.scale : this.scale, this.scale);
    }

    screenToCanvas(sx, sy) {
        const cos = Math.cos(-this.rotation);
        const sin = Math.sin(-this.rotation);
        let x = sx - this.panX;
        let y = sy - this.panY;
        const rx = x * cos - y * sin;
        const ry = x * sin + y * cos;
        return {
            x: (this.flipX ? -rx : rx) / this.scale,
            y: ry / this.scale,
        };
    }

    canvasToScreen(cx, cy) {
        let x = (this.flipX ? -cx : cx) * this.scale;
        let y = cy * this.scale;
        const cos = Math.cos(this.rotation);
        const sin = Math.sin(this.rotation);
        return {
            x: x * cos - y * sin + this.panX,
            y: x * sin + y * cos + this.panY,
        };
    }

    getMatrix() {
        const s = this.scale;
        const cos = Math.cos(this.rotation);
        const sin = Math.sin(this.rotation);
        const fx = this.flipX ? -1 : 1;
        return {
            a: fx * s * cos,
            b: s * sin,
            c: fx * -s * sin,
            d: s * cos,
            e: this.panX,
            f: this.panY,
        };
    }
}
