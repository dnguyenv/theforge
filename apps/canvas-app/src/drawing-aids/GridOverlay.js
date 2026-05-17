export class GridOverlay {
    constructor(engine) {
        this.engine = engine;
        this.visible = false;
        this.spacing = 50;
        this.color = 'rgba(255, 255, 255, 0.08)';
    }

    toggle() {
        this.visible = !this.visible;
    }

    setSpacing(px) {
        this.spacing = Math.max(10, Math.min(200, px));
    }

    draw(ctx) {
        if (!this.visible) return;

        const w = this.engine.docWidth;
        const h = this.engine.docHeight;

        ctx.save();
        ctx.strokeStyle = this.color;
        ctx.lineWidth = 0.5;

        for (let x = this.spacing; x < w; x += this.spacing) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, h);
            ctx.stroke();
        }

        for (let y = this.spacing; y < h; y += this.spacing) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(w, y);
            ctx.stroke();
        }

        ctx.restore();
    }
}
