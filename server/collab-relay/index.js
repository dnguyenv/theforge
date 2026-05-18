const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 8080;
const MAX_ROOM_SIZE = 8;

const rooms = new Map();

const wss = new WebSocketServer({ port: PORT });

wss.on('connection', (ws) => {
    ws.isAlive = true;
    ws.userId = null;
    ws.sessionId = null;

    ws.on('pong', () => { ws.isAlive = true; });

    ws.on('message', (raw) => {
        let msg;
        try {
            msg = JSON.parse(raw);
        } catch {
            return;
        }

        switch (msg.type) {
            case 'join':
                handleJoin(ws, msg);
                break;
            case 'state_response':
                handleStateResponse(ws, msg);
                break;
            default:
                relay(ws, msg);
                break;
        }
    });

    ws.on('close', () => handleDisconnect(ws));
    ws.on('error', () => handleDisconnect(ws));
});

function handleJoin(ws, msg) {
    const { sessionId, userId, userName } = msg;
    if (!sessionId || !userId) return;

    let room = rooms.get(sessionId);
    if (!room) {
        room = { users: new Map(), owner: null };
        rooms.set(sessionId, room);
    }

    if (room.users.size >= MAX_ROOM_SIZE) {
        ws.send(JSON.stringify({ type: 'error', message: 'Room is full' }));
        return;
    }

    ws.userId = userId;
    ws.userName = userName || `User-${userId.slice(0, 4)}`;
    ws.sessionId = sessionId;
    room.users.set(ws, { userId, userName: ws.userName });

    const isOwner = room.owner === null;
    if (isOwner) room.owner = ws;

    ws.send(JSON.stringify({
        type: 'joined',
        userId,
        sessionId,
        isOwner,
        userCount: room.users.size,
    }));

    broadcast(room, ws, {
        type: 'user_joined',
        userId,
        userName: ws.userName,
        userCount: room.users.size,
    });

    if (!isOwner && room.owner && room.owner.readyState === 1) {
        room.owner.send(JSON.stringify({
            type: 'state_request',
            requesterId: userId,
        }));
    }
}

function handleStateResponse(ws, msg) {
    const room = rooms.get(ws.sessionId);
    if (!room) return;

    const { requesterId, layers } = msg;
    for (const [client] of room.users) {
        if (client.userId === requesterId && client.readyState === 1) {
            client.send(JSON.stringify({ type: 'state_response', layers }));
            break;
        }
    }
}

function relay(ws, msg) {
    const room = rooms.get(ws.sessionId);
    if (!room) return;

    msg.userId = ws.userId;
    broadcast(room, ws, msg);
}

function broadcast(room, sender, msg) {
    const data = JSON.stringify(msg);
    for (const [client] of room.users) {
        if (client !== sender && client.readyState === 1) {
            client.send(data);
        }
    }
}

function handleDisconnect(ws) {
    if (!ws.sessionId) return;

    const room = rooms.get(ws.sessionId);
    if (!room) return;

    room.users.delete(ws);

    if (room.users.size === 0) {
        rooms.delete(ws.sessionId);
        return;
    }

    if (room.owner === ws) {
        room.owner = room.users.keys().next().value;
        if (room.owner && room.owner.readyState === 1) {
            room.owner.send(JSON.stringify({ type: 'promoted_owner' }));
        }
    }

    broadcast(room, ws, {
        type: 'user_left',
        userId: ws.userId,
        userCount: room.users.size,
    });
}

// Heartbeat to detect stale connections
const heartbeat = setInterval(() => {
    wss.clients.forEach((ws) => {
        if (!ws.isAlive) { ws.terminate(); return; }
        ws.isAlive = false;
        ws.ping();
    });
}, 30000);

wss.on('close', () => clearInterval(heartbeat));

console.log(`Forge Collab Relay listening on port ${PORT}`);
