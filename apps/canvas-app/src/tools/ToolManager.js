import { bus } from '../core/EventBus.js';
import { EVENTS, TOOLS } from '../core/Constants.js';

export class ToolManager {
    constructor() {
        this.tools = new Map();
        this.activeTool = null;
        this.activeToolId = null;
    }

    register(id, tool) {
        this.tools.set(id, tool);
    }

    setActive(id) {
        if (this.activeTool && this.activeTool.deactivate) {
            this.activeTool.deactivate();
        }
        this.activeToolId = id;
        this.activeTool = this.tools.get(id) || null;
        if (this.activeTool && this.activeTool.activate) {
            this.activeTool.activate();
        }
        bus.emit(EVENTS.TOOL_CHANGE, { toolId: id });
    }

    getActive() {
        return this.activeTool;
    }

    onPointerDown(e) {
        if (this.activeTool && this.activeTool.onPointerDown) {
            this.activeTool.onPointerDown(e);
        }
    }

    onPointerMove(e) {
        if (this.activeTool && this.activeTool.onPointerMove) {
            this.activeTool.onPointerMove(e);
        }
    }

    onPointerUp(e) {
        if (this.activeTool && this.activeTool.onPointerUp) {
            this.activeTool.onPointerUp(e);
        }
    }
}
