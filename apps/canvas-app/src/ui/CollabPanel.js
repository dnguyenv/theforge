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
                <button id="btn-collab-start" class="collab-btn" title="Start collaborative session"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg></button>
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
                    <span class="collab-users" title="Connected artists">${this.collab.userCount}</span>
                    <button id="btn-collab-copy" class="collab-btn-sm" title="Copy invite link"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg></button>
                    <button id="btn-collab-leave" class="collab-btn-sm collab-leave" title="Leave"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
                </div>
            `;

            this.container.querySelector('#btn-collab-copy').addEventListener('click', () => {
                navigator.clipboard.writeText(link).then(() => {
                    const btn = this.container.querySelector('#btn-collab-copy');
                    btn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#60d080" stroke-width="3"><path d="M20 6L9 17l-5-5"/></svg>';
                    setTimeout(() => {
                        btn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>';
                    }, 2000);
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
