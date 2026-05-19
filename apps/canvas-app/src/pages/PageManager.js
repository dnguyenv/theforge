import { bus } from '../core/EventBus.js';
import { EVENTS } from '../core/Constants.js';
import { LayerStack } from '../canvas/LayerStack.js';

let pageIdCounter = 1;

class Page {
    constructor(name, width, height) {
        this.id = `page-${pageIdCounter++}`;
        this.name = name;
        this.width = width;
        this.height = height;
        this.layerStack = null;
        this.serializedLayers = null;
        this.thumbnail = null;
        this.thumbnailSmall = null;
    }
}

export class PageManager {
    constructor(engine, width, height) {
        this.engine = engine;
        this.width = width;
        this.height = height;
        this.pages = [];
        this._activeIndex = 0;
        this._switching = false;
        this._flipResolve = null;
    }

    get pageCount() { return this.pages.length; }
    get activePageIndex() { return this._activeIndex; }
    get activePage() { return this.pages[this._activeIndex]; }
    canGoNext() { return this._activeIndex < this.pages.length - 1; }
    canGoPrev() { return this._activeIndex > 0; }

    addPage(name, insertAt) {
        const page = new Page(name || `Page ${this.pages.length + 1}`, this.width, this.height);
        page.layerStack = new LayerStack(this.width, this.height);
        page.layerStack.addLayer('Background');

        const idx = insertAt !== undefined ? insertAt : this.pages.length;
        this.pages.splice(idx, 0, page);
        bus.emit(EVENTS.PAGE_ADD, { page, index: idx });
        return page;
    }

    initFromEngine() {
        const page = new Page('Page 1', this.width, this.height);
        page.layerStack = this.engine.layers;
        this.pages.push(page);
        this._activeIndex = 0;
    }

    removePage(index) {
        if (this.pages.length <= 1) return;
        if (index === this._activeIndex) return;
        this.pages.splice(index, 1);
        if (this._activeIndex > index) this._activeIndex--;
        bus.emit(EVENTS.PAGE_REMOVE, { index });
    }

    async switchToPage(targetIndex, animated = true) {
        if (this._switching) return;
        if (targetIndex === this._activeIndex) return;
        if (targetIndex < 0 || targetIndex >= this.pages.length) return;

        this._switching = true;
        const direction = targetIndex > this._activeIndex ? 'forward' : 'backward';
        const currentPage = this.pages[this._activeIndex];
        const targetPage = this.pages[targetIndex];

        await this._updateThumbnail(currentPage);
        if (targetPage.serializedLayers && !targetPage.thumbnail) {
            await this._buildThumbnailFromBlobs(targetPage);
        }

        bus.emit(EVENTS.PAGE_SWITCH_START, {
            fromIndex: this._activeIndex,
            toIndex: targetIndex,
            direction,
            fromBitmap: currentPage.thumbnail,
            toBitmap: targetPage.thumbnail,
        });

        if (animated) {
            await new Promise(resolve => { this._flipResolve = resolve; });
        }

        await this._serializePage(currentPage);
        currentPage.layerStack = null;

        await this._deserializePage(targetPage);
        this.engine.layers = targetPage.layerStack;
        this.engine._invalidateBelowCache();
        this.engine.markDirty();

        this._activeIndex = targetIndex;
        this._switching = false;

        bus.emit(EVENTS.PAGE_SWITCH_COMPLETE, { pageIndex: targetIndex });
    }

    flipAnimationDone() {
        if (this._flipResolve) {
            this._flipResolve();
            this._flipResolve = null;
        }
    }

    async nextPage() {
        if (this.canGoNext()) await this.switchToPage(this._activeIndex + 1);
    }

    async prevPage() {
        if (this.canGoPrev()) await this.switchToPage(this._activeIndex - 1);
    }

    async _updateThumbnail(page) {
        const stack = page.layerStack;
        if (!stack) return;

        const canvas = new OffscreenCanvas(this.width, this.height);
        const ctx = canvas.getContext('2d');
        for (const layer of stack.layers) {
            if (!layer.visible) continue;
            ctx.globalAlpha = layer.opacity;
            ctx.globalCompositeOperation = layer.blendMode;
            ctx.drawImage(layer.canvas, 0, 0);
        }
        page.thumbnail = await createImageBitmap(canvas);

        const small = new OffscreenCanvas(256, 144);
        const sctx = small.getContext('2d');
        sctx.drawImage(canvas, 0, 0, 256, 144);
        page.thumbnailSmall = await createImageBitmap(small);
    }

    async _serializePage(page) {
        if (!page.layerStack) return;
        const layers = page.layerStack.layers;
        page.serializedLayers = [];
        for (const layer of layers) {
            const blob = await layer.toBlob();
            page.serializedLayers.push({
                name: layer.name,
                visible: layer.visible,
                opacity: layer.opacity,
                blendMode: layer.blendMode,
                locked: layer.locked,
                alphaLock: layer.alphaLock,
                blob,
            });
        }
    }

    async _deserializePage(page) {
        if (page.layerStack) return;
        const stack = new LayerStack(this.width, this.height);

        if (page.serializedLayers) {
            for (const data of page.serializedLayers) {
                const layer = stack.addLayer(data.name);
                if (!layer) break;
                layer.visible = data.visible;
                layer.opacity = data.opacity;
                layer.blendMode = data.blendMode;
                layer.locked = data.locked;
                layer.alphaLock = data.alphaLock;
                if (data.blob) await layer.fromBlob(data.blob);
            }
        } else {
            stack.addLayer('Background');
        }

        page.layerStack = stack;
    }

    async _buildThumbnailFromBlobs(page) {
        if (!page.serializedLayers) return;
        const canvas = new OffscreenCanvas(this.width, this.height);
        const ctx = canvas.getContext('2d');
        for (const data of page.serializedLayers) {
            if (!data.visible || !data.blob) continue;
            const bitmap = await createImageBitmap(data.blob);
            ctx.globalAlpha = data.opacity;
            ctx.globalCompositeOperation = data.blendMode;
            ctx.drawImage(bitmap, 0, 0);
            bitmap.close();
        }
        page.thumbnail = await createImageBitmap(canvas);
    }
}
