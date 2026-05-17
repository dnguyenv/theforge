import { BrushDynamics } from './BrushDynamics.js';

export class BrushEngine {
    constructor() {
        this.spacing = 0.25;
        this.dynamics = new BrushDynamics();
        this._remainder = 0;
        this._smoothBuffer = [];
        this._smoothWindow = 4;
    }

    configure(brushDef) {
        this.spacing = brushDef.spacing ?? 0.25;
        this.dynamics = new BrushDynamics(brushDef.dynamics ?? {});
        this._smoothWindow = Math.round((brushDef.smoothing ?? 0.5) * 8);
    }

    beginStroke() {
        this._remainder = 0;
        this._smoothBuffer = [];
    }

    addPoint(point) {
        this._smoothBuffer.push(point);
        if (this._smoothBuffer.length > this._smoothWindow) {
            this._smoothBuffer.shift();
        }
        return this._getSmoothedPoint();
    }

    renderSegment(ctx, from, to, brushDef, baseSize, baseOpacity, color) {
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < 0.5) return;

        const stepSize = Math.max(1, baseSize * this.spacing);
        let traveled = this._remainder;

        while (traveled < dist) {
            const t = traveled / dist;
            const x = from.x + dx * t;
            const y = from.y + dy * t;
            const pressure = from.pressure + (to.pressure - from.pressure) * t;
            const velocity = from.velocity + (to.velocity - from.velocity) * t;

            const size = this.dynamics.computeSize(baseSize, pressure, velocity);
            const opacity = this.dynamics.computeOpacity(baseOpacity, pressure);

            this._renderStamp(ctx, x, y, size, opacity, color, brushDef);
            traveled += stepSize;
        }

        this._remainder = traveled - dist;
    }

    _renderStamp(ctx, x, y, size, opacity, color, brushDef) {
        ctx.save();
        ctx.globalAlpha = opacity;

        const halfSize = size / 2;
        const type = brushDef.tipType ?? 'round-soft';

        switch (type) {
            case 'round-hard':
                ctx.beginPath();
                ctx.arc(x, y, halfSize, 0, Math.PI * 2);
                ctx.fillStyle = color;
                ctx.fill();
                break;

            case 'round-soft': {
                const gradient = ctx.createRadialGradient(x, y, 0, x, y, halfSize);
                gradient.addColorStop(0, color);
                gradient.addColorStop(0.7, color);
                gradient.addColorStop(1, 'transparent');
                ctx.beginPath();
                ctx.arc(x, y, halfSize, 0, Math.PI * 2);
                ctx.fillStyle = gradient;
                ctx.fill();
                break;
            }

            case 'flat': {
                const angle = brushDef.angle ?? 0;
                ctx.translate(x, y);
                ctx.rotate(angle);
                ctx.fillStyle = color;
                ctx.fillRect(-halfSize, -halfSize * 0.3, size, size * 0.3);
                break;
            }

            case 'noise': {
                ctx.beginPath();
                ctx.arc(x, y, halfSize, 0, Math.PI * 2);
                ctx.fillStyle = color;
                ctx.fill();
                // Scatter small dots around for texture
                for (let i = 0; i < 3; i++) {
                    const ox = (Math.random() - 0.5) * size * 0.8;
                    const oy = (Math.random() - 0.5) * size * 0.8;
                    const r = halfSize * 0.2 * Math.random();
                    ctx.beginPath();
                    ctx.arc(x + ox, y + oy, r, 0, Math.PI * 2);
                    ctx.fill();
                }
                break;
            }

            default:
                ctx.beginPath();
                ctx.arc(x, y, halfSize, 0, Math.PI * 2);
                ctx.fillStyle = color;
                ctx.fill();
        }

        ctx.restore();
    }

    _getSmoothedPoint() {
        if (this._smoothBuffer.length === 0) return null;
        if (this._smoothBuffer.length === 1) return { ...this._smoothBuffer[0] };

        const n = this._smoothBuffer.length;
        let x = 0, y = 0, pressure = 0, velocity = 0;
        let totalWeight = 0;

        for (let i = 0; i < n; i++) {
            const weight = (i + 1) / n;
            const p = this._smoothBuffer[i];
            x += p.x * weight;
            y += p.y * weight;
            pressure += p.pressure * weight;
            velocity += p.velocity * weight;
            totalWeight += weight;
        }

        return {
            x: x / totalWeight,
            y: y / totalWeight,
            pressure: pressure / totalWeight,
            velocity: velocity / totalWeight,
        };
    }
}
