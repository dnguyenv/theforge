import { bus } from '../core/EventBus.js';
import { EVENTS } from '../core/Constants.js';

export class CollabPanel {
    constructor(container, collabManager) {
        this.container = container;
        this.collab = collabManager;
        this._render();

        bus.on(EVENTS.COLLAB_JOINED, () => this._render());
        bus.on(EVENTS.COLLAB_LEFT, () => this._render());
        bus.on(EVENTS.COLLAB_USER_JOINED, () => this._render());
        bus.on(EVENTS.COLLAB_USER_LEFT, () => this._render());
    }

    _promptName() {
        const stored = localStorage.getItem('forge-artist-name');
        if (stored) return stored;

        const name = prompt('Enter your artist name:', '') || '';
        if (name.trim()) {
            localStorage.setItem('forge-artist-name', name.trim());
            return name.trim();
        }
        return null;
    }

    _render() {
        if (!this.collab.isConnected) {
            this.container.innerHTML = `
                <button id="btn-collab-start" class="collab-btn" title="Start collaborative session">👥 Collab</button>
            `;
            this.container.querySelector('#btn-collab-start').addEventListener('click', () => {
                const name = this._promptName();
                if (name) this.collab.userName = name;
                const sessionId = this.collab.createSession();
                const url = new URL(window.location);
                url.searchParams.set('session', sessionId);
                window.history.replaceState(null, '', url);
                this._render();
            });
        } else {
            const url = new URL(window.location);
            url.searchParams.set('session', this.collab.sessionId);
            const link = url.toString();

            this.container.innerHTML = `
                <div class="collab-connected">
                    <span class="collab-users" title="Connected artists">👥 ${this.collab.userCount}</span>
                    <button id="btn-collab-copy" class="collab-btn-sm" title="Copy invite link">📋</button>
                    <button id="btn-collab-leave" class="collab-btn-sm collab-leave" title="Leave">✕</button>
                </div>
            `;

            this.container.querySelector('#btn-collab-copy').addEventListener('click', () => {
                navigator.clipboard.writeText(link).then(() => {
                    const btn = this.container.querySelector('#btn-collab-copy');
                    btn.textContent = '✓';
                    setTimeout(() => { btn.textContent = '📋'; }, 2000);
                });
            });

            this.container.querySelector('#btn-collab-leave').addEventListener('click', () => {
                this.collab.leaveSession();
                const url = new URL(window.location);
                url.searchParams.delete('session');
                window.history.replaceState(null, '', url);
            });
        }
    }
}
