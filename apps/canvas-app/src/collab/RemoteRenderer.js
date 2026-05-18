import { BrushEngine } from '../brush/BrushEngine.js';
import { getBrushById } from '../brush/BrushRegistry.js';

export class RemoteRenderer {
    constructor(engine) {
        this.engine = engine;
        this._remoteStrokes = new Map();
    }

    renderRemoteStroke(userId, layerId, points, tool, isStart) {
        const layer = this.engine.layers.getLayerById(layerId);
        if (!layer) return;

        if (isStart && tool) {
            const brushEngine = new BrushEngine();
            brushEngine.configure(getBrushById(tool.brushId) || getBrushById('pencil'));
            brushEngine.beginStroke();
            this._remoteStrokes.set(userId, {
                brushEngine,
                lastPoint: null,
                tool,
            });
            return;
        }

        const state = this._remoteStrokes.get(userId);
        if (!state || points.length === 0) return;

        const ctx = layer.ctx;
        const { brushEngine, tool: t } = state;
        const compositeOp = t.compositeOp || 'source-over';
        ctx.globalCompositeOperation = compositeOp;

        for (const point of points) {
            const smoothed = brushEngine.addPoint(point);
            if (smoothed && state.lastPoint) {
                brushEngine.renderSegment(
                    ctx,
                    state.lastPoint,
                    smoothed,
                    getBrushById(t.brushId) || getBrushById('pencil'),
                    t.size || 8,
                    t.opacity || 1.0,
                    t.color || '#000000'
                );
                state.lastPoint = smoothed;
            } else if (smoothed) {
                state.lastPoint = smoothed;
            } else {
                state.lastPoint = point;
            }
        }

        ctx.globalCompositeOperation = 'source-over';
        this.engine.markDirty();
    }

    endRemoteStroke(userId, layerId) {
        this._remoteStrokes.delete(userId);
        const layer = this.engine.layers.getLayerById(layerId);
        if (layer) {
            layer.markDirty();
            this.engine._invalidateBelowCache();
        }
    }

    async applyStateSnapshot(layersData) {
        if (!layersData || layersData.length === 0) return;

        const stack = this.engine.layers;
        // Remove all existing layers before applying snapshot
        while (stack.layers.length > 0) {
            stack.layers.pop();
        }
        stack.activeIndex = 0;

        for (const data of layersData) {
            const layer = stack.addLayer(data.name);
            if (!layer) break;

            layer.visible = data.visible;
            layer.opacity = data.opacity;
            layer.blendMode = data.blendMode;

            if (data.pngBase64) {
                const binary = atob(data.pngBase64);
                const bytes = new Uint8Array(binary.length);
                for (let i = 0; i < binary.length; i++) {
                    bytes[i] = binary.charCodeAt(i);
                }
                const blob = new Blob([bytes], { type: 'image/png' });
                await layer.fromBlob(blob);
            }
        }

        stack.activeIndex = 0;
        this.engine._invalidateBelowCache();
        this.engine.markDirty();
    }

    applyLayerOp(userId, op, params) {
        const stack = this.engine.layers;

        switch (op) {
            case 'add':
                stack.addLayer(params.name || null);
                break;
            case 'remove': {
                const idx = stack.getIndexById(params.layerId);
                if (idx >= 0) stack.removeLayer(idx);
                break;
            }
            case 'reorder':
                if (params.fromIndex !== undefined && params.toIndex !== undefined) {
                    stack.moveLayer(params.fromIndex, params.toIndex);
                }
                break;
            case 'clear': {
                const layer = stack.getLayerById(params.layerId);
                if (layer) layer.clear();
                break;
            }
        }

        this.engine._invalidateBelowCache();
        this.engine.markDirty();
    }
}
