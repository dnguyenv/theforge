export class StrokeAssist {
    constructor() {
        this.lineSnapEnabled = true;
        this.shapeDetectEnabled = true;
        this.snapThreshold = 300; // ms hold at end triggers snap
    }

    detectLine(points) {
        if (points.length < 5) return null;

        const first = points[0];
        const last = points[points.length - 1];
        const dx = last.x - first.x;
        const dy = last.y - first.y;
        const length = Math.sqrt(dx * dx + dy * dy);

        if (length < 20) return null;

        // Check if points are roughly collinear
        let maxDeviation = 0;
        for (const p of points) {
            const t = ((p.x - first.x) * dx + (p.y - first.y) * dy) / (length * length);
            const projX = first.x + t * dx;
            const projY = first.y + t * dy;
            const dist = Math.sqrt((p.x - projX) ** 2 + (p.y - projY) ** 2);
            maxDeviation = Math.max(maxDeviation, dist);
        }

        if (maxDeviation < length * 0.05) {
            return { type: 'line', start: first, end: last };
        }

        return null;
    }

    detectShape(points) {
        if (points.length < 10) return null;

        const first = points[0];
        const last = points[points.length - 1];
        const closeDist = Math.sqrt((last.x - first.x) ** 2 + (last.y - first.y) ** 2);

        // Check if stroke is closed (start ≈ end)
        const bbox = this._boundingBox(points);
        const diagonal = Math.sqrt(bbox.width ** 2 + bbox.height ** 2);

        if (closeDist > diagonal * 0.15) return null;

        // Check circularity
        const cx = bbox.x + bbox.width / 2;
        const cy = bbox.y + bbox.height / 2;
        const avgRadius = (bbox.width + bbox.height) / 4;

        let radiusVariance = 0;
        for (const p of points) {
            const r = Math.sqrt((p.x - cx) ** 2 + (p.y - cy) ** 2);
            radiusVariance += (r - avgRadius) ** 2;
        }
        radiusVariance /= points.length;
        const radiusCV = Math.sqrt(radiusVariance) / avgRadius;

        if (radiusCV < 0.15) {
            return {
                type: 'ellipse',
                cx, cy,
                rx: bbox.width / 2,
                ry: bbox.height / 2,
            };
        }

        // Check if roughly rectangular (4 corners)
        const aspectRatio = bbox.width / bbox.height;
        if (aspectRatio > 0.5 && aspectRatio < 2.0) {
            return {
                type: 'rectangle',
                x: bbox.x, y: bbox.y,
                width: bbox.width, height: bbox.height,
            };
        }

        return null;
    }

    _boundingBox(points) {
        let minX = Infinity, minY = Infinity;
        let maxX = -Infinity, maxY = -Infinity;
        for (const p of points) {
            minX = Math.min(minX, p.x);
            minY = Math.min(minY, p.y);
            maxX = Math.max(maxX, p.x);
            maxY = Math.max(maxY, p.y);
        }
        return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
    }
}
