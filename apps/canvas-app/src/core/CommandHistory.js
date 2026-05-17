import { bus } from './EventBus.js';
import { EVENTS, LIMITS } from './Constants.js';

export class CommandHistory {
    constructor() {
        this._undoStack = [];
        this._redoStack = [];
        this._memoryUsed = 0;

        bus.on(EVENTS.UNDO, () => this.undo());
        bus.on(EVENTS.REDO, () => this.redo());
    }

    push(command) {
        this._undoStack.push(command);
        this._redoStack = [];
        this._memoryUsed += command.memorySize || 0;

        while (this._memoryUsed > LIMITS.MAX_UNDO_MEMORY_MB * 1024 * 1024 && this._undoStack.length > 1) {
            const dropped = this._undoStack.shift();
            this._memoryUsed -= dropped.memorySize || 0;
        }

        while (this._undoStack.length > LIMITS.MAX_UNDO_STEPS) {
            const dropped = this._undoStack.shift();
            this._memoryUsed -= dropped.memorySize || 0;
        }
    }

    undo() {
        const cmd = this._undoStack.pop();
        if (!cmd) return;
        cmd.undo();
        this._redoStack.push(cmd);
        bus.emit(EVENTS.CANVAS_DIRTY, {});
    }

    redo() {
        const cmd = this._redoStack.pop();
        if (!cmd) return;
        cmd.execute();
        this._undoStack.push(cmd);
        bus.emit(EVENTS.CANVAS_DIRTY, {});
    }

    get canUndo() {
        return this._undoStack.length > 0;
    }

    get canRedo() {
        return this._redoStack.length > 0;
    }

    get undoCount() {
        return this._undoStack.length;
    }

    clear() {
        this._undoStack = [];
        this._redoStack = [];
        this._memoryUsed = 0;
    }
}

export class DrawCommand {
    constructor(layer, beforeData, afterData, bounds) {
        this.layer = layer;
        this.beforeData = beforeData;
        this.afterData = afterData;
        this.bounds = bounds;
        this.memorySize = (beforeData.data.length + afterData.data.length);
    }

    execute() {
        this.layer.putImageData(this.afterData, this.bounds.x, this.bounds.y);
    }

    undo() {
        this.layer.putImageData(this.beforeData, this.bounds.x, this.bounds.y);
    }
}
