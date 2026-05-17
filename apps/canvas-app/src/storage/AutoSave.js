import { bus } from '../core/EventBus.js';
import { EVENTS, LIMITS } from '../core/Constants.js';
import { gallery } from './GalleryDB.js';

export class AutoSave {
    constructor(engine, projectId) {
        this.engine = engine;
        this.projectId = projectId;
        this._timer = null;
        this._dirty = false;

        bus.on(EVENTS.STROKE_END, () => this._scheduleSave());
        bus.on(EVENTS.LAYER_ADD, () => this._scheduleSave());
        bus.on(EVENTS.LAYER_REMOVE, () => this._scheduleSave());
        bus.on(EVENTS.LAYER_REORDER, () => this._scheduleSave());
    }

    _scheduleSave() {
        this._dirty = true;
        if (this._timer) return;
        this._timer = setTimeout(() => {
            this._timer = null;
            if (this._dirty) {
                this.save();
                this._dirty = false;
            }
        }, LIMITS.AUTOSAVE_DEBOUNCE_MS);
    }

    async save() {
        if (!gallery.db) await gallery.open();

        const layers = this.engine.layers.layers;
        const now = Date.now();

        // Save project metadata
        await gallery.saveProject({
            id: this.projectId,
            name: `Untitled-${this.projectId.slice(0, 6)}`,
            width: this.engine.docWidth,
            height: this.engine.docHeight,
            layerCount: layers.length,
            activeIndex: this.engine.layers.activeIndex,
            updatedAt: now,
            createdAt: now,
        });

        // Save each layer
        for (let i = 0; i < layers.length; i++) {
            const layer = layers[i];
            const blob = await layer.toBlob();
            await gallery.saveLayer({
                id: `${this.projectId}-layer-${i}`,
                projectId: this.projectId,
                index: i,
                name: layer.name,
                visible: layer.visible,
                opacity: layer.opacity,
                blendMode: layer.blendMode,
                locked: layer.locked,
                alphaLock: layer.alphaLock,
                imageBlob: blob,
            });
        }
    }

    async load() {
        if (!gallery.db) await gallery.open();

        const project = await gallery.getProject(this.projectId);
        if (!project) return false;

        const layerData = await gallery.getLayersForProject(this.projectId);
        if (layerData.length === 0) return false;

        layerData.sort((a, b) => a.index - b.index);

        // Clear existing layers
        this.engine.layers.layers = [];

        for (const data of layerData) {
            const layer = this.engine.layers.addLayer(data.name);
            if (!layer) break;
            layer.visible = data.visible;
            layer.opacity = data.opacity;
            layer.blendMode = data.blendMode;
            layer.locked = data.locked;
            layer.alphaLock = data.alphaLock;
            if (data.imageBlob) {
                await layer.fromBlob(data.imageBlob);
            }
        }

        this.engine.layers.activeIndex = project.activeIndex || 0;
        this.engine.markDirty();
        return true;
    }
}
