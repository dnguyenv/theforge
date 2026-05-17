import { bus } from '../core/EventBus.js';
import { EVENTS } from '../core/Constants.js';

export class SymmetryGuide {
    constructor(engine) {
        this.engine = engine;
        this.mode = 'none'; // none, vertical, horizontal, quadrant, radial
        this.segments = 8;
    }

    setMode(mode) {
        this.mode = mode;
    }

    getMirrorPoints(x, y) {
        const cx = this.engine.docWidth / 2;
        const cy = this.engine.docHeight / 2;

        switch (this.mode) {
            case 'vertical':
                return [{ x, y }, { x: cx * 2 - x, y }];
            case 'horizontal':
                return [{ x, y }, { x, y: cy * 2 - y }];
            case 'quadrant':
                return [
                    { x, y },
                    { x: cx * 2 - x, y },
                    { x, y: cy * 2 - y },
                    { x: cx * 2 - x, y: cy * 2 - y },
                ];
            case 'radial': {
                const points = [];
                const dx = x - cx;
                const dy = y - cy;
                for (let i = 0; i < this.segments; i++) {
                    const angle = (i * 2 * Math.PI) / this.segments;
                    const cos = Math.cos(angle);
                    const sin = Math.sin(angle);
                    points.push({
                        x: cx + dx * cos - dy * sin,
                        y: cy + dx * sin + dy * cos,
                    });
                }
                return points;
            }
            default:
                return [{ x, y }];
        }
    }

    drawGuide(ctx) {
        if (this.mode === 'none') return;

        const w = this.engine.docWidth;
        const h = this.engine.docHeight;
        const cx = w / 2;
        const cy = h / 2;

        ctx.save();
        ctx.strokeStyle = 'rgba(240, 192, 64, 0.3)';
        ctx.lineWidth = 1;
        ctx.setLineDash([8, 4]);

        switch (this.mode) {
            case 'vertical':
                ctx.beginPath();
                ctx.moveTo(cx, 0);
                ctx.lineTo(cx, h);
                ctx.stroke();
                break;
            case 'horizontal':
                ctx.beginPath();
                ctx.moveTo(0, cy);
                ctx.lineTo(w, cy);
                ctx.stroke();
                break;
            case 'quadrant':
                ctx.beginPath();
                ctx.moveTo(cx, 0); ctx.lineTo(cx, h);
                ctx.moveTo(0, cy); ctx.lineTo(w, cy);
                ctx.stroke();
                break;
            case 'radial':
                for (let i = 0; i < this.segments; i++) {
                    const angle = (i * Math.PI) / this.segments;
                    ctx.beginPath();
                    ctx.moveTo(cx + Math.cos(angle) * w, cy + Math.sin(angle) * h);
                    ctx.lineTo(cx - Math.cos(angle) * w, cy - Math.sin(angle) * h);
                    ctx.stroke();
                }
                break;
        }

        ctx.restore();
    }
}
