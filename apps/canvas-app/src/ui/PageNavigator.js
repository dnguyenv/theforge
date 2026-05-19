import { bus } from '../core/EventBus.js';
import { EVENTS } from '../core/Constants.js';

export class PageNavigator {
    constructor(container, pageManager) {
        this.container = container;
        this.pageManager = pageManager;
        this._build();

        bus.on(EVENTS.PAGE_ADD, () => this.render());
        bus.on(EVENTS.PAGE_REMOVE, () => this.render());
        bus.on(EVENTS.PAGE_SWITCH_COMPLETE, () => this.render());
    }

    _build() {
        this.container.innerHTML = `
            <div class="page-navigator">
                <button class="page-nav-btn page-prev" title="Previous Page"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg></button>
                <div class="page-thumbnails-strip"></div>
                <button class="page-nav-btn page-next" title="Next Page"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg></button>
                <button class="page-nav-btn page-add" title="Add Page"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg></button>
                <span class="page-counter"></span>
            </div>
        `;

        this.strip = this.container.querySelector('.page-thumbnails-strip');
        this.counter = this.container.querySelector('.page-counter');

        this.container.querySelector('.page-prev').addEventListener('click', () => {
            this.pageManager.prevPage();
        });
        this.container.querySelector('.page-next').addEventListener('click', () => {
            this.pageManager.nextPage();
        });
        this.container.querySelector('.page-add').addEventListener('click', () => {
            this.pageManager.addPage();
            const lastIdx = this.pageManager.pageCount - 1;
            this.pageManager.switchToPage(lastIdx);
        });

        this.render();
    }

    render() {
        const pages = this.pageManager.pages;
        const activeIdx = this.pageManager.activePageIndex;

        this.counter.textContent = `${activeIdx + 1} / ${pages.length}`;

        this.strip.innerHTML = pages.map((page, i) => `
            <div class="page-thumb ${i === activeIdx ? 'active' : ''}" data-index="${i}">
                <canvas class="page-thumb-canvas" width="64" height="36"></canvas>
                <span class="page-thumb-label">${i + 1}</span>
            </div>
        `).join('');

        this.strip.querySelectorAll('.page-thumb').forEach((el) => {
            const idx = parseInt(el.dataset.index);

            // Draw thumbnail if available
            const canvas = el.querySelector('.page-thumb-canvas');
            const ctx = canvas.getContext('2d');
            const page = pages[idx];
            if (page.thumbnailSmall) {
                ctx.drawImage(page.thumbnailSmall, 0, 0, 64, 36);
            } else if (page.thumbnail) {
                ctx.drawImage(page.thumbnail, 0, 0, 64, 36);
            } else {
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, 64, 36);
            }

            el.addEventListener('click', () => {
                if (idx !== activeIdx) {
                    this.pageManager.switchToPage(idx);
                }
            });
        });

        // Scroll active into view
        const activeEl = this.strip.querySelector('.page-thumb.active');
        if (activeEl) activeEl.scrollIntoView({ behavior: 'smooth', inline: 'center' });
    }
}
