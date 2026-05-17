import { BLEND_MODES, LIMITS } from '../core/Constants.js';

let nextId = 1;

export class Layer {
    constructor(width, height, name = null) {
        this.id = `layer-${nextId++}`;
        this.name = name || `Layer ${nextId - 1}`;
        this.width = width;
        this.height = height;
        this.visible = true;
        this.opacity = 1.0;
        this.blendMode = BLEND_MODES.NORMAL;
        this.locked = false;
        this.alphaLock = false;
        this.canvas = new OffscreenCanvas(width, height);
        this.ctx = this.canvas.getContext('2d');
        this.thumbnail = null;
        this._thumbnailDirty = true;
        this._dirty = false;
    }

    clear() {
        this.ctx.clearRect(0, 0, this.width, this.height);
        this.markDirty();
    }

    getImageData(x = 0, y = 0, w = this.width, h = this.height) {
        return this.ctx.getImageData(x, y, w, h);
    }

    putImageData(imageData, x = 0, y = 0) {
        this.ctx.putImageData(imageData, x, y);
        this.markDirty();
    }

    markDirty() {
        this._dirty = true;
        this._thumbnailDirty = true;
    }

    isDirty() {
        return this._dirty;
    }

    clearDirty() {
        this._dirty = false;
    }

    async updateThumbnail() {
        if (!this._thumbnailDirty) return this.thumbnail;

        const size = LIMITS.THUMBNAIL_SIZE;
        const thumb = new OffscreenCanvas(size, size);
        const ctx = thumb.getContext('2d');
        ctx.clearRect(0, 0, size, size);

        const scale = Math.min(size / this.width, size / this.height);
        const w = this.width * scale;
        const h = this.height * scale;
        const x = (size - w) / 2;
        const y = (size - h) / 2;

        ctx.drawImage(this.canvas, x, y, w, h);
        this.thumbnail = await createImageBitmap(thumb);
        this._thumbnailDirty = false;
        return this.thumbnail;
    }

    clone() {
        const copy = new Layer(this.width, this.height, `${this.name} Copy`);
        copy.visible = this.visible;
        copy.opacity = this.opacity;
        copy.blendMode = this.blendMode;
        copy.locked = this.locked;
        copy.alphaLock = this.alphaLock;
        copy.ctx.drawImage(this.canvas, 0, 0);
        return copy;
    }

    toBlob() {
        return this.canvas.convertToBlob({ type: 'image/png' });
    }

    async fromBlob(blob) {
        const bitmap = await createImageBitmap(blob);
        this.ctx.clearRect(0, 0, this.width, this.height);
        this.ctx.drawImage(bitmap, 0, 0);
        bitmap.close();
        this.markDirty();
    }
}
