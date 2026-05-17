import { BrushTool } from './BrushTool.js';

export class EraserTool extends BrushTool {
    constructor(engine) {
        super(engine);
        this.compositeOp = 'destination-out';
        this.color = '#ffffff';
    }

    activate() {
        this.compositeOp = 'destination-out';
    }
}
