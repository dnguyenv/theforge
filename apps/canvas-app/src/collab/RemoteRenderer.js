import { BrushEngine } from '../brush/BrushEngine.js';
import { getBrushById } from '../brush/BrushRegistry.js';

export class RemoteRenderer {
    constructor(engine) {
        this.engine = engine;
        this._remoteStrokes = new Map();
        this._applyingSnapshot = false;
    }

    get isApplyingSnapshot() {
        return this._applyingSnapshot;
    }

    renderRemoteStroke(userId, layerIndex, points, tool, isStart) {
        const layer = this.engine.layers.layers[layerIndex];
        if (!layer) return;

        if (isStart && tool) {
            const brushEngine = new BrushEngine();
            brushEngine.configure(getBrushById(tool.brushId) || getBrushById('pencil'));
            brushEngine.beginStroke();
            this._remoteStrokes.set(userId, {
                brushEngine,
                lastPoint: null,
                tool,
                layerIndex,
            });
            return;
        }

        const state = this._remoteStrokes.get(userId);
        if (!state || points.length === 0) return;

        const targetLayer = this.engine.layers.layers[state.layerIndex];
        if (!targetLayer) return;

        const ctx = targetLayer.ctx;
        const { brushEngine, tool: t } = state;
        ctx.globalCompositeOperation = t.compositeOp || 'source-over';

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
            }
            // Always update lastPoint so next segment can render
            if (smoothed) {
                state.lastPoint = smoothed;
            } else {
                state.lastPoint = point;
            }
        }

        ctx.globalCompositeOperation = 'source-over';
        this.engine.markDirty();
    }

    endRemoteStroke(userId) {
        const state = this._remoteStrokes.get(userId);
        if (state) {
            const layer = this.engine.layers.layers[state.layerIndex];
            if (layer) {
                layer.markDirty();
                this.engine._invalidateBelowCache();
            }
        }
        this._remoteStrokes.delete(userId);
    }

    async applyStateSnapshot(layersData) {
        if (!layersData || layersData.length === 0) return;

        this._applyingSnapshot = true;

        const stack = this.engine.layers;
        // Clear all existing layers
        stack.layers = [];
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
        this._applyingSnapshot = false;
    }

    applyLayerOp(userId, op, params) {
        this._applyingSnapshot = true;
        const stack = this.engine.layers;

        switch (op) {
            case 'add':
                stack.addLayer(params.name || null);
                break;
            case 'remove': {
                const idx = params.index;
                if (idx >= 0 && idx < stack.layers.length) {
                    stack.removeLayer(idx);
                }
                break;
            }
            case 'reorder':
                if (params.fromIndex !== undefined && params.toIndex !== undefined) {
                    stack.moveLayer(params.fromIndex, params.toIndex);
                }
                break;
            case 'clear': {
                const idx = params.index;
                if (idx >= 0 && idx < stack.layers.length) {
                    stack.layers[idx].clear();
                }
                break;
            }
        }

        this.engine._invalidateBelowCache();
        this.engine.markDirty();
        this._applyingSnapshot = false;
    }
}
