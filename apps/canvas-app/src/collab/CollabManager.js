import { bus } from '../core/EventBus.js';
import { EVENTS } from '../core/Constants.js';

const BATCH_INTERVAL = 50;
const CURSOR_THROTTLE = 100;
const RECONNECT_BASE = 1000;
const RECONNECT_MAX = 10000;

export class CollabManager {
    constructor(engine, options = {}) {
        this.engine = engine;
        this.serverUrl = options.serverUrl || 'ws://localhost:8080';
        this.sessionId = null;
        this.userId = crypto.randomUUID();
        this.userName = `Artist-${this.userId.slice(0, 4)}`;
        this.isOwner = false;
        this.userCount = 0;
        this.users = new Map();
        this._ws = null;
        this._connected = false;
        this._pointBatch = [];
        this._batchLayerId = null;
        this._batchTool = null;
        this._batchInterval = null;
        this._cursorLast = 0;
        this._reconnectDelay = RECONNECT_BASE;
        this._shouldReconnect = false;
        this.onStateSync = null;
        this.onRemoteStroke = null;
        this.onRemoteStrokeEnd = null;
        this.onRemoteCursor = null;
        this.onRemoteLayerOp = null;
    }

    get isConnected() { return this._connected; }

    createSession() {
        this.sessionId = generateSessionId();
        this._connect();
        return this.sessionId;
    }

    joinSession(sessionId) {
        this.sessionId = sessionId;
        this._connect();
    }

    leaveSession() {
        this._shouldReconnect = false;
        if (this._ws) {
            this._ws.close();
            this._ws = null;
        }
        this._connected = false;
        this.sessionId = null;
        this._stopBatching();
        bus.emit(EVENTS.COLLAB_LEFT, {});
    }

    sendStrokeStart(layerId, tool) {
        this._batchLayerId = layerId;
        this._batchTool = tool;
        this._pointBatch = [];
        this._startBatching();
        this._send({ type: 'stroke_start', layerId, tool });
    }

    sendStrokePoint(point) {
        this._pointBatch.push(point);
    }

    sendStrokeEnd(layerId) {
        this._flushBatch();
        this._stopBatching();
        this._send({ type: 'stroke_end', layerId });
    }

    sendLayerOp(op, params) {
        this._send({ type: 'layer_op', op, ...params });
    }

    sendCursor(x, y) {
        const now = performance.now();
        if (now - this._cursorLast < CURSOR_THROTTLE) return;
        this._cursorLast = now;
        this._send({ type: 'cursor', x, y });
    }

    async handleStateRequest(requesterId) {
        const layers = this.engine.layers.layers;
        const layerData = [];

        for (const layer of layers) {
            const blob = await layer.toBlob();
            const base64 = await blobToBase64(blob);
            layerData.push({
                id: layer.id,
                name: layer.name,
                visible: layer.visible,
                opacity: layer.opacity,
                blendMode: layer.blendMode,
                pngBase64: base64,
            });
        }

        this._send({ type: 'state_response', requesterId, layers: layerData });
    }

    _connect() {
        this._shouldReconnect = true;
        try {
            this._ws = new WebSocket(this.serverUrl);
        } catch (e) {
            this._scheduleReconnect();
            return;
        }

        this._ws.onopen = () => {
            this._connected = true;
            this._reconnectDelay = RECONNECT_BASE;
            this._send({
                type: 'join',
                sessionId: this.sessionId,
                userId: this.userId,
                userName: this.userName,
            });
        };

        this._ws.onmessage = (event) => {
            let msg;
            try { msg = JSON.parse(event.data); } catch { return; }
            this._handleMessage(msg);
        };

        this._ws.onclose = () => {
            this._connected = false;
            if (this._shouldReconnect) this._scheduleReconnect();
        };

        this._ws.onerror = () => {};
    }

    _scheduleReconnect() {
        setTimeout(() => {
            if (this._shouldReconnect && !this._connected) {
                this._reconnectDelay = Math.min(this._reconnectDelay * 2, RECONNECT_MAX);
                this._connect();
            }
        }, this._reconnectDelay);
    }

    _handleMessage(msg) {
        switch (msg.type) {
            case 'joined':
                this.isOwner = msg.isOwner;
                this.userCount = msg.userCount;
                bus.emit(EVENTS.COLLAB_JOINED, { sessionId: this.sessionId, isOwner: this.isOwner });
                break;

            case 'user_joined':
                this.userCount = msg.userCount;
                this.users.set(msg.userId, msg.userName);
                bus.emit(EVENTS.COLLAB_USER_JOINED, { userId: msg.userId, userName: msg.userName, userCount: msg.userCount });
                break;

            case 'user_left':
                this.userCount = msg.userCount;
                this.users.delete(msg.userId);
                bus.emit(EVENTS.COLLAB_USER_LEFT, { userId: msg.userId, userCount: msg.userCount });
                break;

            case 'promoted_owner':
                this.isOwner = true;
                break;

            case 'state_request':
                if (this.isOwner) {
                    this.handleStateRequest(msg.requesterId);
                }
                break;

            case 'state_response':
                if (this.onStateSync) this.onStateSync(msg.layers);
                bus.emit(EVENTS.COLLAB_STATE_SYNCED, {});
                break;

            case 'stroke_start':
                if (this.onRemoteStroke) {
                    this.onRemoteStroke(msg.userId, msg.layerId, [], msg.tool, true);
                }
                break;

            case 'stroke_points':
                if (this.onRemoteStroke) {
                    this.onRemoteStroke(msg.userId, msg.layerId, msg.points, null, false);
                }
                break;

            case 'stroke_end':
                if (this.onRemoteStrokeEnd) {
                    this.onRemoteStrokeEnd(msg.userId, msg.layerId);
                }
                break;

            case 'layer_op':
                if (this.onRemoteLayerOp) {
                    this.onRemoteLayerOp(msg.userId, msg.op, msg);
                }
                break;

            case 'cursor':
                if (this.onRemoteCursor) {
                    this.onRemoteCursor(msg.userId, msg.x, msg.y);
                }
                bus.emit(EVENTS.COLLAB_CURSOR_MOVE, { userId: msg.userId, x: msg.x, y: msg.y });
                break;

            case 'error':
                console.warn('Collab error:', msg.message);
                break;
        }
    }

    _send(msg) {
        if (this._ws && this._ws.readyState === WebSocket.OPEN) {
            this._ws.send(JSON.stringify(msg));
        }
    }

    _startBatching() {
        if (this._batchInterval) return;
        this._batchInterval = setInterval(() => this._flushBatch(), BATCH_INTERVAL);
    }

    _stopBatching() {
        if (this._batchInterval) {
            clearInterval(this._batchInterval);
            this._batchInterval = null;
        }
    }

    _flushBatch() {
        if (this._pointBatch.length === 0) return;
        this._send({
            type: 'stroke_points',
            layerId: this._batchLayerId,
            points: this._pointBatch,
        });
        this._pointBatch = [];
    }
}

function generateSessionId() {
    const chars = 'abcdefghijkmnpqrstuvwxyz23456789';
    let id = '';
    for (let i = 0; i < 8; i++) {
        id += chars[Math.floor(Math.random() * chars.length)];
    }
    return id;
}

async function blobToBase64(blob) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.readAsDataURL(blob);
    });
}
