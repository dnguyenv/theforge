import { bus } from '../core/EventBus.js';
import { EVENTS } from '../core/Constants.js';

export class ForgeIntegration {
    constructor() {
        this.wasm = null;
        this.sessionId = null;
        this.did = null;
        this.sequenceId = 0;
        this.layerProvenance = new Map();
    }

    async init(wasmModule) {
        this.wasm = wasmModule;
    }

    startSession() {
        if (this.wasm) {
            this.wasm.forge_reset();
        }
        this.sequenceId = 0;
        this.layerProvenance.clear();
        this.sessionId = this.wasm ? this.wasm.forge_init() : `local-${Date.now()}`;
        this.did = this.wasm ? this.wasm.forge_get_did() : 'did:forge:local';
        return this.sessionId;
    }

    recordStroke(layerId, pressure, velocity, x, y, durationMs) {
        this.sequenceId++;
        const timestampMs = Math.floor(performance.timeOrigin + performance.now());

        if (!this.layerProvenance.has(layerId)) {
            this.layerProvenance.set(layerId, new Set());
        }
        this.layerProvenance.get(layerId).add(this.sequenceId);

        if (!this.wasm) return null;

        const result = this.wasm.forge_record_stroke(
            this.sessionId,
            this.sequenceId,
            timestampMs,
            pressure,
            velocity,
            x,
            y,
            durationMs
        );

        if (result.startsWith('ERROR:')) {
            this.sequenceId--;
            return null;
        }

        bus.emit(EVENTS.FORGE_RECORDED, {
            sequenceId: this.sequenceId,
            hash: result,
        });

        return result;
    }

    getStrikeCount() {
        if (!this.wasm || !this.sessionId) return 0;
        return Number(this.wasm.forge_get_strike_count(this.sessionId));
    }

    analyze() {
        if (!this.wasm) return null;
        const json = this.wasm.forge_analyze();
        try {
            return JSON.parse(json);
        } catch {
            return { error: json };
        }
    }

    export() {
        if (!this.wasm || !this.sessionId) return null;
        const json = this.wasm.forge_export(this.sessionId);
        try {
            const manifest = JSON.parse(json);
            manifest.provenance = {};
            for (const [layerId, seqIds] of this.layerProvenance) {
                manifest.provenance[layerId] = [...seqIds];
            }
            return manifest;
        } catch {
            return { error: json };
        }
    }
}

export const forge = new ForgeIntegration();
