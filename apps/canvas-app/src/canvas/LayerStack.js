import { bus } from '../core/EventBus.js';
import { EVENTS, LIMITS } from '../core/Constants.js';
import { Layer } from './Layer.js';

export class LayerStack {
    constructor(width, height) {
        this.width = width;
        this.height = height;
        this.layers = [];
        this.activeIndex = 0;
    }

    get activeLayer() {
        return this.layers[this.activeIndex] || null;
    }

    get count() {
        return this.layers.length;
    }

    addLayer(name = null, index = null) {
        if (this.layers.length >= LIMITS.MAX_LAYERS) {
            return null;
        }
        const layer = new Layer(this.width, this.height, name);
        if (index === null) {
            this.layers.push(layer);
            this.activeIndex = this.layers.length - 1;
        } else {
            this.layers.splice(index, 0, layer);
            this.activeIndex = index;
        }
        bus.emit(EVENTS.LAYER_ADD, { layer, index: this.activeIndex });
        return layer;
    }

    removeLayer(index) {
        if (this.layers.length <= 1) return null;
        const [removed] = this.layers.splice(index, 1);
        if (this.activeIndex >= this.layers.length) {
            this.activeIndex = this.layers.length - 1;
        }
        bus.emit(EVENTS.LAYER_REMOVE, { layer: removed, index });
        return removed;
    }

    selectLayer(index) {
        if (index >= 0 && index < this.layers.length) {
            this.activeIndex = index;
            bus.emit(EVENTS.LAYER_SELECT, { index });
        }
    }

    moveLayer(fromIndex, toIndex) {
        if (fromIndex === toIndex) return;
        const [layer] = this.layers.splice(fromIndex, 1);
        this.layers.splice(toIndex, 0, layer);
        if (this.activeIndex === fromIndex) {
            this.activeIndex = toIndex;
        }
        bus.emit(EVENTS.LAYER_REORDER, { fromIndex, toIndex });
    }

    duplicateLayer(index) {
        if (this.layers.length >= LIMITS.MAX_LAYERS) return null;
        const original = this.layers[index];
        const copy = original.clone();
        this.layers.splice(index + 1, 0, copy);
        this.activeIndex = index + 1;
        bus.emit(EVENTS.LAYER_ADD, { layer: copy, index: index + 1 });
        return copy;
    }

    mergeLayers(topIndex, bottomIndex) {
        if (topIndex <= bottomIndex) return;
        const top = this.layers[topIndex];
        const bottom = this.layers[bottomIndex];

        bottom.ctx.globalAlpha = top.opacity;
        bottom.ctx.globalCompositeOperation = top.blendMode;
        bottom.ctx.drawImage(top.canvas, 0, 0);
        bottom.ctx.globalAlpha = 1;
        bottom.ctx.globalCompositeOperation = 'source-over';
        bottom.markDirty();

        this.layers.splice(topIndex, 1);
        if (this.activeIndex >= topIndex) {
            this.activeIndex = Math.max(0, this.activeIndex - 1);
        }
        bus.emit(EVENTS.LAYER_REMOVE, { layer: top, index: topIndex });
        return bottom;
    }

    flattenAll() {
        if (this.layers.length <= 1) return;
        const result = new Layer(this.width, this.height, 'Background');
        const tempCanvas = new OffscreenCanvas(this.width, this.height);
        const tempCtx = tempCanvas.getContext('2d');

        for (const layer of this.layers) {
            if (!layer.visible) continue;
            tempCtx.globalAlpha = layer.opacity;
            tempCtx.globalCompositeOperation = layer.blendMode;
            tempCtx.drawImage(layer.canvas, 0, 0);
        }

        result.ctx.drawImage(tempCanvas, 0, 0);
        this.layers = [result];
        this.activeIndex = 0;
    }

    getLayerById(id) {
        return this.layers.find(l => l.id === id);
    }

    getIndexById(id) {
        return this.layers.findIndex(l => l.id === id);
    }
}
