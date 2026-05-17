import { bus } from '../core/EventBus.js';
import { EVENTS, BLEND_MODE_NAMES } from '../core/Constants.js';

export class LayersPanel {
    constructor(container, layerStack) {
        this.container = container;
        this.layers = layerStack;
        this._build();

        bus.on(EVENTS.LAYER_ADD, () => this.render());
        bus.on(EVENTS.LAYER_REMOVE, () => this.render());
        bus.on(EVENTS.LAYER_SELECT, () => this.render());
        bus.on(EVENTS.LAYER_REORDER, () => this.render());
    }

    _build() {
        this.container.innerHTML = `
            <div class="layers-header">
                <h3>Layers</h3>
                <div class="layer-actions">
                    <button id="btn-add-layer" title="Add Layer">+</button>
                    <button id="btn-del-layer" title="Delete Layer">−</button>
                    <button id="btn-dup-layer" title="Duplicate">⧉</button>
                    <button id="btn-merge-layer" title="Merge Down">⤓</button>
                </div>
            </div>
            <div class="layers-list"></div>
        `;

        this.listEl = this.container.querySelector('.layers-list');

        this.container.querySelector('#btn-add-layer').addEventListener('click', () => {
            this.layers.addLayer();
            bus.emit(EVENTS.CANVAS_DIRTY, {});
        });
        this.container.querySelector('#btn-del-layer').addEventListener('click', () => {
            this.layers.removeLayer(this.layers.activeIndex);
            bus.emit(EVENTS.CANVAS_DIRTY, {});
        });
        this.container.querySelector('#btn-dup-layer').addEventListener('click', () => {
            this.layers.duplicateLayer(this.layers.activeIndex);
            bus.emit(EVENTS.CANVAS_DIRTY, {});
        });
        this.container.querySelector('#btn-merge-layer').addEventListener('click', () => {
            const idx = this.layers.activeIndex;
            if (idx > 0) {
                this.layers.mergeLayers(idx, idx - 1);
                bus.emit(EVENTS.CANVAS_DIRTY, {});
            }
        });

        this.render();
    }

    render() {
        const layers = this.layers.layers;
        this.listEl.innerHTML = layers
            .map((layer, i) => `
                <div class="layer-item ${i === this.layers.activeIndex ? 'active' : ''}" data-index="${i}">
                    <button class="layer-vis ${layer.visible ? 'on' : ''}" data-index="${i}">
                        ${layer.visible ? '👁' : '○'}
                    </button>
                    <span class="layer-name">${layer.name}</span>
                    <span class="layer-opacity">${Math.round(layer.opacity * 100)}%</span>
                </div>
            `)
            .reverse()
            .join('');

        this.listEl.querySelectorAll('.layer-item').forEach(el => {
            el.addEventListener('click', (e) => {
                if (e.target.classList.contains('layer-vis')) return;
                const idx = parseInt(el.dataset.index);
                this.layers.selectLayer(idx);
                this.render();
            });
        });

        this.listEl.querySelectorAll('.layer-vis').forEach(btn => {
            btn.addEventListener('click', () => {
                const idx = parseInt(btn.dataset.index);
                const layer = layers[idx];
                layer.visible = !layer.visible;
                bus.emit(EVENTS.LAYER_UPDATE, { index: idx });
                bus.emit(EVENTS.CANVAS_DIRTY, {});
                this.render();
            });
        });
    }
}
