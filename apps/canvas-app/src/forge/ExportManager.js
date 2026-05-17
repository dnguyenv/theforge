import { forge } from './ForgeIntegration.js';

export class ExportManager {
    constructor(engine) {
        this.engine = engine;
    }

    exportPNG(includeBackground = true) {
        const canvas = new OffscreenCanvas(this.engine.docWidth, this.engine.docHeight);
        const ctx = canvas.getContext('2d');

        if (includeBackground) {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, this.engine.docWidth, this.engine.docHeight);
        }

        for (const layer of this.engine.layers.layers) {
            if (!layer.visible) continue;
            ctx.globalAlpha = layer.opacity;
            ctx.globalCompositeOperation = layer.blendMode;
            ctx.drawImage(layer.canvas, 0, 0);
        }

        return canvas.convertToBlob({ type: 'image/png' });
    }

    exportJPEG(quality = 0.9) {
        const canvas = new OffscreenCanvas(this.engine.docWidth, this.engine.docHeight);
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, this.engine.docWidth, this.engine.docHeight);

        for (const layer of this.engine.layers.layers) {
            if (!layer.visible) continue;
            ctx.globalAlpha = layer.opacity;
            ctx.globalCompositeOperation = layer.blendMode;
            ctx.drawImage(layer.canvas, 0, 0);
        }

        return canvas.convertToBlob({ type: 'image/jpeg', quality });
    }

    exportManifest() {
        return forge.export();
    }

    async exportBundle() {
        const [pngBlob, manifest] = await Promise.all([
            this.exportPNG(true),
            Promise.resolve(this.exportManifest()),
        ]);

        return { pngBlob, manifest };
    }

    async downloadPNG(filename = 'artwork.png') {
        const blob = await this.exportPNG(true);
        this._downloadBlob(blob, filename);
    }

    downloadManifest(filename = 'beskar-manifest.json') {
        const manifest = this.exportManifest();
        const json = JSON.stringify(manifest, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        this._downloadBlob(blob, filename);
    }

    _downloadBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
    }
}
