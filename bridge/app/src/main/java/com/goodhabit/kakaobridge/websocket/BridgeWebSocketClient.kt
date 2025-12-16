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
            Log.i(TAG, "═══════════════════════════════════════════════════════")
            Log.i(TAG, "✓✓✓✓✓ WebSocket OPENED ✓✓✓✓✓")
            Log.i(TAG, "  URL: $url")
            Log.i(TAG, "  Response: ${response.code} ${response.message}")
            Log.i(TAG, "  Headers: ${response.headers}")
            Log.i(TAG, "═══════════════════════════════════════════════════════")
            this@BridgeWebSocketClient.webSocket = webSocket
            
            // 서버에 Bridge APK 식별 메시지 전송
            try {
                val identifyMessage = org.json.JSONObject().apply {
                    put("type", "bridge_connect")
                    put("client", "bridge_apk")
                }
                val sent = webSocket.send(identifyMessage.toString())
                if (sent) {
                    Log.i(TAG, "✓ Bridge APK 식별 메시지 전송 성공: type=bridge_connect")
                } else {
                    Log.w(TAG, "⚠ Bridge APK 식별 메시지 전송 실패")
                }
            } catch (e: Exception) {
                Log.e(TAG, "✗ Bridge APK 식별 메시지 전송 중 오류", e)
            }
        }

        override fun onMessage(webSocket: WebSocket, text: String) {
            Log.i(TAG, "═══════════════════════════════════════════════════════")
            Log.i(TAG, "✓✓✓✓✓ WebSocket MESSAGE RECEIVED ✓✓✓✓✓")
            Log.i(TAG, "  Message length: ${text.length}")
            Log.i(TAG, "  Message preview: ${text.take(200)}${if (text.length > 200) "..." else ""}")
            Log.i(TAG, "  Calling onMessage callback...")
            Log.i(TAG, "═══════════════════════════════════════════════════════")
            try {
                onMessage(text)
                Log.i(TAG, "✓ onMessage callback completed successfully")
            } catch (e: Exception) {
                Log.e(TAG, "═══════════════════════════════════════════════════════")
                Log.e(TAG, "✗✗✗ Error in onMessage callback ✗✗✗")
                Log.e(TAG, "  오류: ${e.message}")
                Log.e(TAG, "  스택 트레이스:", e)
                Log.e(TAG, "═══════════════════════════════════════════════════════")
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
        Log.i(TAG, "═══════════════════════════════════════════════════════")
        Log.i(TAG, "🔌🔌🔌 WebSocket connect() 호출됨 🔌🔌🔌")
        Log.i(TAG, "  URL: $url")
        
        if (webSocket != null) {
            Log.w(TAG, "⚠ WebSocket already connected, skipping")
            return
        }

        val request = Request.Builder()
            .url(url)
            .build()

        Log.i(TAG, "  Request URL: ${request.url}")
        Log.i(TAG, "  Calling client.newWebSocket()...")
        
        webSocket = client.newWebSocket(request, listener)
        
        Log.i(TAG, "  ✓ client.newWebSocket() called")
        Log.i(TAG, "  webSocket != null: ${webSocket != null}")
        Log.i(TAG, "═══════════════════════════════════════════════════════")
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

