import { bus } from '../core/EventBus.js';
import { EVENTS } from '../core/Constants.js';
import { PageFlipEngine } from './PageFlipEngine.js';

const EDGE_THRESHOLD = 50;

export class PageFlipOverlay {
    constructor(viewportEl, engine, pageManager) {
        this.viewport = viewportEl;
        this.engine = engine;
        this.pageManager = pageManager;
        this.flipEngine = new PageFlipEngine(engine.docWidth, engine.docHeight);
        this._canvas = null;
        this._ctx = null;
        this._fromBitmap = null;
        this._toBitmap = null;
        this._rafId = null;
        this._lastTime = 0;
        this._dragStartX = 0;
        this._dragLastX = 0;
        this._active = false;

        this.flipEngine.onComplete = () => this._onFlipDone(true);
        this.flipEngine.onCancel = () => this._onFlipDone(false);
    }

    mount() {
        this._canvas = document.createElement('canvas');
        this._canvas.className = 'page-flip-overlay';
        this._canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:12;';
        this.viewport.appendChild(this._canvas);
        this._ctx = this._canvas.getContext('2d');
        this._resize();

        new ResizeObserver(() => this._resize()).observe(this.viewport);

        this._canvas.addEventListener('pointerdown', (e) => this._onPointerDown(e));
        this._canvas.addEventListener('pointermove', (e) => this._onPointerMove(e));
        this._canvas.addEventListener('pointerup', (e) => this._onPointerUp(e));
        this._canvas.addEventListener('pointerleave', (e) => this._onPointerUp(e));

        bus.on(EVENTS.PAGE_SWITCH_START, (data) => this._onSwitchStart(data));
    }

    _resize() {
        const dpr = window.devicePixelRatio || 1;
        const rect = this.viewport.getBoundingClientRect();
        this._canvas.width = rect.width * dpr;
        this._canvas.height = rect.height * dpr;
        this._viewWidth = rect.width;
        this._viewHeight = rect.height;
    }

    _onSwitchStart({ fromBitmap, toBitmap, direction }) {
        this._fromBitmap = fromBitmap;
        this._toBitmap = toBitmap;

        if (!this.flipEngine.isAnimating) {
            this.flipEngine.setPageSize(this.engine.docWidth, this.engine.docHeight);
            this.flipEngine.startFlip(direction);
        }

        this._active = true;
        this._canvas.style.pointerEvents = 'auto';
        this._startLoop();
    }

    _onFlipDone(completed) {
        this._active = false;
        this._canvas.style.pointerEvents = 'none';
        this._stopLoop();
        this._clear();

        if (completed) {
            this.pageManager.flipAnimationDone();
        } else {
            this.pageManager.flipAnimationDone();
        }
    }

    _startLoop() {
        this._lastTime = performance.now();
        const loop = (now) => {
            if (!this._active && !this.flipEngine.isAnimating) return;
            const dt = Math.min((now - this._lastTime) / 1000, 0.05);
            this._lastTime = now;

            const frame = this.flipEngine.update(dt);
            if (frame) {
                this._renderFrame(frame);
                bus.emit(EVENTS.PAGE_FLIP_PROGRESS, { progress: frame.progress });
            }

            this._rafId = requestAnimationFrame(loop);
        };
        this._rafId = requestAnimationFrame(loop);
    }

    _stopLoop() {
        if (this._rafId) {
            cancelAnimationFrame(this._rafId);
            this._rafId = null;
        }
    }

    _clear() {
        this._ctx.clearRect(0, 0, this._canvas.width, this._canvas.height);
    }

    _renderFrame(frame) {
        const ctx = this._ctx;
        const dpr = window.devicePixelRatio || 1;
        const W = this.engine.docWidth;
        const H = this.engine.docHeight;

        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, this._canvas.width, this._canvas.height);

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        this.engine.view.applyToContext(ctx);

        // 1. Draw revealed page clipped to exposed area
        if (this._toBitmap) {
            ctx.save();
            ctx.clip(frame.frontClipPath);
            ctx.drawImage(this._toBitmap, 0, 0, W, H);
            ctx.fillStyle = `rgba(0,0,0,${0.08 * (1 - frame.progress)})`;
            ctx.fillRect(0, 0, W, H);
            ctx.restore();
        }

        // 2. Draw back of turning page (reflected)
        if (this._fromBitmap) {
            ctx.save();
            ctx.clip(frame.backClipPath);
            const rx = frame.reflectX;
            ctx.translate(rx, 0);
            ctx.scale(-1, 1);
            ctx.translate(-rx, 0);
            ctx.drawImage(this._fromBitmap, 0, 0, W, H);
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            this.engine.view.applyToContext(ctx);
            ctx.clip(frame.backClipPath);
            ctx.fillStyle = 'rgba(0,0,0,0.12)';
            ctx.fillRect(0, 0, W, H);
            ctx.restore();
        }

        // 3. Fold shadow
        ctx.save();
        const sg = frame.shadowGradient;
        const grad = ctx.createLinearGradient(sg.x0, sg.y0, sg.x1, sg.y1);
        for (const [offset, color] of sg.stops) {
            grad.addColorStop(offset, color);
        }
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, H);
        ctx.restore();

        // 4. Curl highlight
        ctx.save();
        ctx.strokeStyle = `rgba(255,255,255,${0.25 * frame.progress})`;
        ctx.lineWidth = 1.5;
        ctx.stroke(frame.curlPath);
        ctx.restore();
    }

    // --- Edge-drag gesture handling ---

    _onPointerDown(e) {
        if (this.flipEngine.isAnimating) return;

        const rect = this._canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const edge = this._detectEdge(x);

        if (!edge) return;

        e.preventDefault();
        this._canvas.setPointerCapture(e.pointerId);
        this._active = true;
        this._canvas.style.pointerEvents = 'auto';
        this._dragStartX = x;
        this._dragLastX = x;

        const canvasPos = this.engine.screenToCanvas(e.clientX, e.clientY);
        this.flipEngine.setPageSize(this.engine.docWidth, this.engine.docHeight);
        this.flipEngine.startDrag(canvasPos.x, canvasPos.y, edge);

        // Determine bitmaps for this drag
        if (edge === 'right' && this.pageManager.canGoNext()) {
            this._prepareBitmapsForDrag('forward');
        } else if (edge === 'left' && this.pageManager.canGoPrev()) {
            this._prepareBitmapsForDrag('backward');
        }

        this._startLoop();
        bus.emit(EVENTS.PAGE_SWITCH_START, { direction: edge === 'right' ? 'forward' : 'backward' });
    }

    _onPointerMove(e) {
        if (this.flipEngine.state !== 'dragging') {
            this._updateCursor(e);
            return;
        }

        const canvasPos = this.engine.screenToCanvas(e.clientX, e.clientY);
        this.flipEngine.updateDrag(canvasPos.x, canvasPos.y);
        this._dragLastX = e.clientX;
    }

    _onPointerUp(e) {
        if (this.flipEngine.state !== 'dragging') return;

        const velocityX = (e.clientX - this._dragStartX) * 5;
        this.flipEngine.endDrag(velocityX);
    }

    async _prepareBitmapsForDrag(direction) {
        const current = this.pageManager.activePage;
        await this.pageManager._updateThumbnail(current);
        this._fromBitmap = current.thumbnail;

        const targetIdx = direction === 'forward'
            ? this.pageManager.activePageIndex + 1
            : this.pageManager.activePageIndex - 1;
        const target = this.pageManager.pages[targetIdx];

        if (target && !target.thumbnail) {
            await this.pageManager._buildThumbnailFromBlobs(target);
        }
        this._toBitmap = target?.thumbnail || null;
    }

    _detectEdge(x) {
        if (x > this._viewWidth - EDGE_THRESHOLD && this.pageManager.canGoNext()) return 'right';
        if (x < EDGE_THRESHOLD && this.pageManager.canGoPrev()) return 'left';
        return null;
    }

    _updateCursor(e) {
        const rect = this._canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const edge = this._detectEdge(x);

        if (edge && !this.flipEngine.isAnimating) {
            this._canvas.style.pointerEvents = 'auto';
            this._canvas.style.cursor = 'grab';
        } else if (!this.flipEngine.isAnimating) {
            this._canvas.style.pointerEvents = 'none';
            this._canvas.style.cursor = '';
        }
    }

    destroy() {
        this._stopLoop();
        if (this._canvas) this._canvas.remove();
    }
}
