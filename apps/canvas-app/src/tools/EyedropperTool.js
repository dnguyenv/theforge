import { bus } from '../core/EventBus.js';
import { EVENTS } from '../core/Constants.js';

export class EyedropperTool {
    constructor(engine) {
        this.engine = engine;
    }

    activate() {}
    deactivate() {}

    onPointerDown(e) {
        this._sample(e);
    }

    onPointerMove(e) {
        if (e.buttons > 0) {
            this._sample(e);
        }
    }

    onPointerUp() {}

    _sample(e) {
        const pos = this.engine.screenToCanvas(e.clientX, e.clientY);
        const [r, g, b, a] = this.engine.getPixelAt(pos.x, pos.y);
        if (a === 0) return;

        const hex = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
        bus.emit(EVENTS.COLOR_CHANGE, { color: hex });
    }
}
