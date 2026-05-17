import { bus } from '../core/EventBus.js';
import { EVENTS } from '../core/Constants.js';
import { forge } from '../forge/ForgeIntegration.js';

export class FillTool {
    constructor(engine) {
        this.engine = engine;
        this.tolerance = 32;
        this.color = '#1a1a2e';

        bus.on(EVENTS.COLOR_CHANGE, ({ color }) => {
            this.color = color;
        });
    }

    activate() {}
    deactivate() {}

    onPointerDown(e) {
        const layer = this.engine.layers.activeLayer;
        if (!layer || layer.locked) return;

        const pos = this.engine.screenToCanvas(e.clientX, e.clientY);
        const x = Math.floor(pos.x);
        const y = Math.floor(pos.y);

        if (x < 0 || x >= layer.width || y < 0 || y >= layer.height) return;

        const start = performance.now();
        this._floodFill(layer, x, y);
        const duration = Math.floor(performance.now() - start);

        layer.markDirty();
        this.engine.markDirty();
        this.engine._invalidateBelowCache();

        forge.recordStroke(layer.id, 1.0, 0, pos.x, pos.y, duration);
        bus.emit(EVENTS.STROKE_END, {});
    }

    onPointerMove() {}
    onPointerUp() {}

    _floodFill(layer, startX, startY) {
        const imageData = layer.getImageData();
        const { data, width, height } = imageData;

        const targetOffset = (startY * width + startX) * 4;
        const targetR = data[targetOffset];
        const targetG = data[targetOffset + 1];
        const targetB = data[targetOffset + 2];
        const targetA = data[targetOffset + 3];

        const fillColor = this._parseColor(this.color);
        if (this._colorsMatch(targetR, targetG, targetB, targetA, fillColor.r, fillColor.g, fillColor.b, 255)) {
            return;
        }

        const stack = [[startX, startY]];
        const visited = new Uint8Array(width * height);

        while (stack.length > 0) {
            const [x, y] = stack.pop();
            const idx = y * width + x;

            if (visited[idx]) continue;
            visited[idx] = 1;

            const offset = idx * 4;
            if (!this._withinTolerance(data, offset, targetR, targetG, targetB, targetA)) {
                continue;
            }

            data[offset] = fillColor.r;
            data[offset + 1] = fillColor.g;
            data[offset + 2] = fillColor.b;
            data[offset + 3] = 255;

            if (x > 0) stack.push([x - 1, y]);
            if (x < width - 1) stack.push([x + 1, y]);
            if (y > 0) stack.push([x, y - 1]);
            if (y < height - 1) stack.push([x, y + 1]);
        }

        layer.putImageData(imageData);
    }

    _withinTolerance(data, offset, tr, tg, tb, ta) {
        const dr = Math.abs(data[offset] - tr);
        const dg = Math.abs(data[offset + 1] - tg);
        const db = Math.abs(data[offset + 2] - tb);
        const da = Math.abs(data[offset + 3] - ta);
        return (dr + dg + db + da) / 4 <= this.tolerance;
    }

    _colorsMatch(r1, g1, b1, a1, r2, g2, b2, a2) {
        return r1 === r2 && g1 === g2 && b1 === b2 && a1 === a2;
    }

    _parseColor(hex) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return { r, g, b };
    }
}
