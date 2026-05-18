import { bus } from '../core/EventBus.js';
import { EVENTS } from '../core/Constants.js';

const CURSOR_COLORS = [
    '#ff6b6b', '#feca57', '#48dbfb', '#ff9ff3',
    '#54a0ff', '#5f27cd', '#01a3a4', '#ee5253',
];

export class PresenceCursor {
    constructor(viewportEl, viewTransform) {
        this.viewport = viewportEl;
        this.view = viewTransform;
        this.cursors = new Map();

        this.overlay = document.createElement('div');
        this.overlay.className = 'presence-overlay';
        this.viewport.appendChild(this.overlay);

        bus.on(EVENTS.VIEW_CHANGE, () => this._repositionAll());
        bus.on(EVENTS.COLLAB_USER_LEFT, ({ userId }) => this.removeCursor(userId));
    }

    updateCursor(userId, userName, canvasX, canvasY) {
        let cursor = this.cursors.get(userId);

        if (!cursor) {
            cursor = this._createCursorEl(userId, userName);
            this.cursors.set(userId, cursor);
            this.overlay.appendChild(cursor.el);
        }

        cursor.canvasX = canvasX;
        cursor.canvasY = canvasY;
        this._positionCursor(cursor);
    }

    removeCursor(userId) {
        const cursor = this.cursors.get(userId);
        if (cursor) {
            cursor.el.remove();
            this.cursors.delete(userId);
        }
    }

    _createCursorEl(userId, userName) {
        const colorIdx = hashCode(userId) % CURSOR_COLORS.length;
        const color = CURSOR_COLORS[colorIdx];

        const el = document.createElement('div');
        el.className = 'presence-cursor';
        el.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 16 16">
                <path d="M0 0 L12 9 L5 9 L7 15 L5 15 L3 9 L0 12 Z" fill="${color}" stroke="#000" stroke-width="0.5"/>
            </svg>
            <span class="presence-label" style="background:${color}">${userName || userId.slice(0, 4)}</span>
        `;

        return { el, canvasX: 0, canvasY: 0, color };
    }

    _positionCursor(cursor) {
        const screen = this.view.canvasToScreen(cursor.canvasX, cursor.canvasY);
        cursor.el.style.transform = `translate(${screen.x}px, ${screen.y}px)`;
    }

    _repositionAll() {
        for (const cursor of this.cursors.values()) {
            this._positionCursor(cursor);
        }
    }

    destroy() {
        this.overlay.remove();
    }
}

function hashCode(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash) + str.charCodeAt(i);
        hash |= 0;
    }
    return Math.abs(hash);
}
