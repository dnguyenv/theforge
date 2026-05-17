import { bus } from '../core/EventBus.js';
import { EVENTS } from '../core/Constants.js';
import { getBrushesByCategory } from '../brush/BrushRegistry.js';

export class BrushLibrary {
    constructor(container) {
        this.container = container;
        this.activeBrushId = 'pencil';
        this._build();
    }

    _build() {
        const categories = getBrushesByCategory();
        let html = '<div class="brush-library"><h3>Brushes</h3>';

        for (const [category, brushes] of Object.entries(categories)) {
            html += `<div class="brush-category"><h4>${category}</h4>`;
            for (const brush of brushes) {
                html += `<button class="brush-item ${brush.id === this.activeBrushId ? 'active' : ''}" data-id="${brush.id}">${brush.name}</button>`;
            }
            html += '</div>';
        }

        html += '</div>';
        this.container.innerHTML = html;

        this.container.querySelectorAll('.brush-item').forEach(btn => {
            btn.addEventListener('click', () => {
                this.activeBrushId = btn.dataset.id;
                this._highlight();
                bus.emit(EVENTS.BRUSH_CHANGE, { brushId: btn.dataset.id });
            });
        });
    }

    _highlight() {
        this.container.querySelectorAll('.brush-item').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.id === this.activeBrushId);
        });
    }
}
