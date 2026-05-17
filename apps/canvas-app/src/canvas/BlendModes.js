import { BLEND_MODES, BLEND_MODE_NAMES } from '../core/Constants.js';

export function getBlendModeList() {
    return Object.entries(BLEND_MODE_NAMES).map(([value, label]) => ({
        value,
        label,
    }));
}

export function applyBlendMode(ctx, mode) {
    ctx.globalCompositeOperation = mode;
}

export function isNativeBlendMode(mode) {
    return Object.values(BLEND_MODES).includes(mode);
}
