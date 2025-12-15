package com.goodhabit.kakaobridge.websocket

import android.util.Log
import okhttp3.*
import okio.ByteString
import java.util.concurrent.TimeUnit

/**
 * WebSocket 클라이언트 (OkHttp 기반)
 */
class BridgeWebSocketClient(
    private val url: String,
    private val onMessage: (String) -> Unit,
    private val onError: (Throwable) -> Unit,
    private val onClose: () -> Unit
) {
    companion object {
        private const val TAG = "BridgeWebSocketClient"
    }

    private var webSocket: WebSocket? = null
    private val client = OkHttpClient.Builder()
        .pingInterval(30, TimeUnit.SECONDS)
        .build()

    private val listener = object : WebSocketListener() {
        override fun onOpen(webSocket: WebSocket, response: Response) {
            Log.i(TAG, "✓✓✓ WebSocket OPENED: $url")
            Log.d(TAG, "Response: ${response.code} ${response.message}")
            this@BridgeWebSocketClient.webSocket = webSocket
        }

        override fun onMessage(webSocket: WebSocket, text: String) {
            Log.i(TAG, "✓✓✓ WebSocket MESSAGE RECEIVED: ${text.take(200)}${if (text.length > 200) "..." else ""}")
            try {
                onMessage(text)
            } catch (e: Exception) {
                Log.e(TAG, "Error in onMessage callback", e)
            }
        }

        override fun onMessage(webSocket: WebSocket, bytes: ByteString) {
            Log.i(TAG, "✓✓✓ WebSocket BINARY MESSAGE RECEIVED: ${bytes.size} bytes")
            try {
                onMessage(bytes.utf8())
            } catch (e: Exception) {
                Log.e(TAG, "Error in onMessage callback (binary)", e)
            }
        }

        override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
            Log.w(TAG, "⚠ WebSocket CLOSING: code=$code, reason=$reason")
            webSocket.close(1000, null)
        }

        override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
            Log.w(TAG, "⚠ WebSocket CLOSED: code=$code, reason=$reason")
            this@BridgeWebSocketClient.webSocket = null
            onClose()
        }

        override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
            Log.e(TAG, "✗✗✗ WebSocket FAILURE", t)
            Log.e(TAG, "Response: ${response?.code} ${response?.message}")
            this@BridgeWebSocketClient.webSocket = null
            onError(t)
            onClose()
        }
    }

    /**
     * WebSocket 연결
     */
    fun connect() {
        if (webSocket != null) {
            Log.w(TAG, "WebSocket already connected")
            return
        }

        val request = Request.Builder()
            .url(url)
            .build()

        webSocket = client.newWebSocket(request, listener)
    }

    /**
     * 메시지 전송
     */
    fun send(text: String): Boolean {
        val ws = webSocket
        return if (ws != null) {
            val result = ws.send(text)
            if (!result) {
                Log.w(TAG, "Failed to send message")
            }
            result
        } else {
            Log.w(TAG, "WebSocket not connected")
            false
        }
    }

    /**
     * 연결 종료
     */
    fun close() {
        webSocket?.close(1000, "Normal closure")
        webSocket = null
    }
}

