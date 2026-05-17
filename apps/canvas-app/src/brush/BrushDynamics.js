export class BrushDynamics {
    constructor(config = {}) {
        this.pressureToSize = config.pressureToSize ?? 1.0;
        this.pressureToOpacity = config.pressureToOpacity ?? 0.5;
        this.velocityToSize = config.velocityToSize ?? 0.0;
        this.minSize = config.minSize ?? 0.1;
        this.minOpacity = config.minOpacity ?? 0.05;
        this.smoothing = config.smoothing ?? 0.5;
    }

    computeSize(baseSize, pressure, velocity) {
        let size = baseSize;
        if (this.pressureToSize > 0) {
            const factor = this.minSize + (1 - this.minSize) * Math.pow(pressure, 1 / this.pressureToSize);
            size *= factor;
        }
        if (this.velocityToSize > 0) {
            const velNorm = Math.min(velocity / 1000, 1);
            size *= 1 - velNorm * this.velocityToSize * 0.5;
        }
        return Math.max(1, size);
    }

    computeOpacity(baseOpacity, pressure) {
        if (this.pressureToOpacity <= 0) return baseOpacity;
        const factor = this.minOpacity + (1 - this.minOpacity) * Math.pow(pressure, 1 / this.pressureToOpacity);
        return baseOpacity * factor;
    }
}
