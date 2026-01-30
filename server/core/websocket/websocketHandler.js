// ============================================
// WebSocket 핸들러 모듈
// ============================================

const WebSocket = require('ws');

let wss = null;

function initializeWebSocket(server) {
    wss = new WebSocket.Server({
        server,
        path: '/ws',
        perMessageDeflate: false
    });
    
    return wss;
}

function broadcastMessage(payload) {
    if (!wss) {
        console.error(`[${new Date().toISOString()}] WebSocket server not initialized`);
        return 0;
    }
    
    const messagePayload = {
        msg: payload.msg,
        room: payload.room,
        sender: payload.sender,
        json: payload.raw || payload.json || {}
    };
    
    const messageStr = JSON.stringify(messagePayload);
    let pushed = 0;
    wss.clients.forEach((c) => {
        if (c.readyState === WebSocket.OPEN) {
            c.send(messageStr);
            pushed++;
        }
    });
    
    return pushed;
}

function sendToClient(message) {
    if (!wss) return 0;
    
    let sent = 0;
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            try {
                client.send(JSON.stringify(message));
                sent++;
            } catch (err) {
                console.error(`[WebSocket] 전송 오류:`, err.message);
            }
        }
    });
    
    return sent;
}

function getWebSocketServer() {
    return wss;
}

module.exports = {
    initializeWebSocket,
    broadcastMessage,
    sendToClient,
    getWebSocketServer
};







