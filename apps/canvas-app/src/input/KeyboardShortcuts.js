import { bus } from '../core/EventBus.js';
import { EVENTS, HOTKEYS, TOOLS } from '../core/Constants.js';

export class KeyboardShortcuts {
    constructor(toolManager) {
        this.toolManager = toolManager;

        document.addEventListener('keydown', (e) => this._onKey(e));
    }

    _onKey(e) {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

        const ctrl = e.ctrlKey || e.metaKey;
        const shift = e.shiftKey;

        if (ctrl && e.key.toLowerCase() === 'z') {
            e.preventDefault();
            if (shift) {
                bus.emit(EVENTS.REDO, {});
            } else {
                bus.emit(EVENTS.UNDO, {});
            }
            return;
        }

        if (ctrl) return;

        switch (e.key.toLowerCase()) {
            case 'b':
                this.toolManager.setActive(TOOLS.BRUSH);
                break;
            case 'e':
                this.toolManager.setActive(TOOLS.ERASER);
                break;
            case 'i':
                this.toolManager.setActive(TOOLS.EYEDROPPER);
                break;
            case 'g':
                this.toolManager.setActive(TOOLS.FILL);
                break;
            case 'v':
                this.toolManager.setActive(TOOLS.TRANSFORM);
                break;
            case 'r':
                this.toolManager.setActive(TOOLS.SMUDGE);
                break;
            case '[':
                bus.emit(EVENTS.BRUSH_CHANGE, { sizeStep: -5 });
                break;
            case ']':
                bus.emit(EVENTS.BRUSH_CHANGE, { sizeStep: 5 });
                break;
        }
    }
}
