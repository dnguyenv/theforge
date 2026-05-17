import { bus } from '../core/EventBus.js';
import { EVENTS } from '../core/Constants.js';
import { forge } from '../forge/ForgeIntegration.js';

export class StatusBar {
    constructor(container) {
        this.container = container;
        this._build();
        this._interval = setInterval(() => this._update(), 1000);

        bus.on(EVENTS.FORGE_RECORDED, () => this._update());
    }

    _build() {
        this.container.innerHTML = `
            <div class="status-bar">
                <span class="status-item" id="sb-strikes">0 strikes</span>
                <span class="status-item" id="sb-did"></span>
                <span class="status-item" id="sb-session"></span>
            </div>
        `;
        this.strikesEl = this.container.querySelector('#sb-strikes');
        this.didEl = this.container.querySelector('#sb-did');
        this.sessionEl = this.container.querySelector('#sb-session');
    }

    _update() {
        const count = forge.getStrikeCount();
        this.strikesEl.textContent = `${count} strikes`;
        if (forge.did) {
            this.didEl.textContent = forge.did.slice(0, 24) + '...';
        }
        if (forge.sessionId) {
            this.sessionEl.textContent = `Session: ${forge.sessionId.slice(0, 12)}`;
        }
    }

    destroy() {
        clearInterval(this._interval);
    }
}
