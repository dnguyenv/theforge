import { bus } from '../core/EventBus.js';
import { EVENTS, TOOLS } from '../core/Constants.js';

const TOOL_ICONS = {
    [TOOLS.BRUSH]: '✏️',
    [TOOLS.ERASER]: '🧹',
    [TOOLS.FILL]: '🪣',
    [TOOLS.EYEDROPPER]: '💧',
    [TOOLS.TRANSFORM]: '↔️',
    [TOOLS.SMUDGE]: '👆',
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
