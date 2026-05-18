import { bus } from '../core/EventBus.js';
import { EVENTS, TOOLS } from '../core/Constants.js';

const TOOL_ICONS = {
    [TOOLS.BRUSH]: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/></svg>`,
    [TOOLS.ERASER]: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 20H7L3 16l10-10 7 7-4 4"/><path d="M6.5 17.5l4-4"/></svg>`,
    [TOOLS.FILL]: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 22l1-4L14.5 6.5l3 3L6 21l-4 1z"/><path d="M19 10l2 6c0 1-1 2-2 2s-2-1-2-2l2-6"/></svg>`,
    [TOOLS.EYEDROPPER]: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 22l4-1 10-10-3-3L3 18l-1 4z"/><circle cx="18" cy="6" r="3"/></svg>`,
    [TOOLS.TRANSFORM]: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 9l-3 3 3 3M9 5l3-3 3 3M15 19l3 3 3-3M19 9l3 3-3 3"/><path d="M2 12h20M12 2v20"/></svg>`,
    [TOOLS.SMUDGE]: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8c-2 0-3.5 1.5-5 3s-3 3-5 3-3-1-3-3 2-4 4-4 3.5 1 5 2.5S17 12 19 12s3-1 3-3-2-1-4-1z"/></svg>`,
};

export class Toolbar {
    constructor(container, toolManager) {
        this.container = container;
        this.toolManager = toolManager;
        this._build();

        bus.on(EVENTS.TOOL_CHANGE, ({ toolId }) => this._highlight(toolId));
    }

    _build() {
        this.container.innerHTML = Object.entries(TOOL_ICONS)
            .map(([id, icon]) => `<button class="tool-btn" data-tool="${id}" title="${id}">${icon}</button>`)
            .join('');

        this.container.querySelectorAll('.tool-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.toolManager.setActive(btn.dataset.tool);
            });
        });

        this._highlight(TOOLS.BRUSH);
    }

    _highlight(toolId) {
        this.container.querySelectorAll('.tool-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tool === toolId);
        });
    }
}
