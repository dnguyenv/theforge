const DB_NAME = 'forge-gallery';
const DB_VERSION = 1;

export class GalleryDB {
    constructor() {
        this.db = null;
    }

    async open() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);
            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains('projects')) {
                    const store = db.createObjectStore('projects', { keyPath: 'id' });
                    store.createIndex('updatedAt', 'updatedAt');
                }
                if (!db.objectStoreNames.contains('layers')) {
                    const store = db.createObjectStore('layers', { keyPath: 'id' });
                    store.createIndex('projectId', 'projectId');
                }
            };
            request.onsuccess = (e) => {
                this.db = e.target.result;
                resolve();
            };
            request.onerror = () => reject(request.error);
        });
    }

    async saveProject(project) {
        const tx = this.db.transaction('projects', 'readwrite');
        tx.objectStore('projects').put(project);
        return new Promise((resolve, reject) => {
            tx.oncomplete = resolve;
            tx.onerror = () => reject(tx.error);
        });
    }

    async getProject(id) {
        const tx = this.db.transaction('projects', 'readonly');
        const request = tx.objectStore('projects').get(id);
        return new Promise((resolve, reject) => {
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async listProjects() {
        const tx = this.db.transaction('projects', 'readonly');
        const store = tx.objectStore('projects');
        const request = store.index('updatedAt').getAll();
        return new Promise((resolve, reject) => {
            request.onsuccess = () => resolve(request.result.reverse());
            request.onerror = () => reject(request.error);
        });
    }

    async deleteProject(id) {
        const tx = this.db.transaction(['projects', 'layers'], 'readwrite');
        tx.objectStore('projects').delete(id);

        const layerStore = tx.objectStore('layers');
        const index = layerStore.index('projectId');
        const request = index.getAllKeys(IDBKeyRange.only(id));
        request.onsuccess = () => {
            for (const key of request.result) {
                layerStore.delete(key);
            }
        };

        return new Promise((resolve, reject) => {
            tx.oncomplete = resolve;
            tx.onerror = () => reject(tx.error);
        });
    }

    async saveLayer(layerData) {
        const tx = this.db.transaction('layers', 'readwrite');
        tx.objectStore('layers').put(layerData);
        return new Promise((resolve, reject) => {
            tx.oncomplete = resolve;
            tx.onerror = () => reject(tx.error);
        });
    }

    async getLayersForProject(projectId) {
        const tx = this.db.transaction('layers', 'readonly');
        const index = tx.objectStore('layers').index('projectId');
        const request = index.getAll(IDBKeyRange.only(projectId));
        return new Promise((resolve, reject) => {
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }
}

export const gallery = new GalleryDB();
