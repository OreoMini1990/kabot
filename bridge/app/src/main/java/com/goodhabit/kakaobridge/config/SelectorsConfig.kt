package com.goodhabit.kakaobridge.config

import android.content.Context
import android.util.Log
import org.json.JSONObject
import java.io.InputStream

/**
 * 카카오톡 UI Selector 설정 관리
 * 
 * selectors.json 파일에서 selector 정보를 로드
 * 카카오톡 업데이트로 selector가 변경되어도 앱 재빌드 없이 업데이트 가능
 */
object SelectorsConfig {
    
    private const val TAG = "SelectorsConfig"
    private const val SELECTORS_FILE = "selectors.json"
    
    // 기본 selector 값 (selectors.json이 없을 때 사용)
    var SEARCH_BUTTON_ID: String = "com.kakao.talk:id/search_icon"
    var SEARCH_INPUT_ID: String = "com.kakao.talk:id/search_edit_text"
    var CHAT_INPUT_ID: String = "com.kakao.talk:id/edittext_chat_input"
    var SEND_BUTTON_ID: String = "com.kakao.talk:id/sendbutton"
    
    /**
     * selectors.json 파일에서 설정 로드
     */
    fun loadFromAssets(context: Context) {
        try {
            val inputStream: InputStream = context.assets.open(SELECTORS_FILE)
            val jsonString = inputStream.bufferedReader().use { it.readText() }
            val json = JSONObject(jsonString)
            
            SEARCH_BUTTON_ID = json.optString("search_button_id", SEARCH_BUTTON_ID)
            SEARCH_INPUT_ID = json.optString("search_input_id", SEARCH_INPUT_ID)
            CHAT_INPUT_ID = json.optString("chat_input_id", CHAT_INPUT_ID)
            SEND_BUTTON_ID = json.optString("send_button_id", SEND_BUTTON_ID)
            
            Log.i(TAG, "Selectors loaded from $SELECTORS_FILE")
            Log.d(TAG, "  search_button_id: $SEARCH_BUTTON_ID")
            Log.d(TAG, "  search_input_id: $SEARCH_INPUT_ID")
            Log.d(TAG, "  chat_input_id: $CHAT_INPUT_ID")
            Log.d(TAG, "  send_button_id: $SEND_BUTTON_ID")
            
        } catch (e: Exception) {
            Log.w(TAG, "Failed to load $SELECTORS_FILE, using defaults", e)
            Log.i(TAG, "Using default selectors:")
            Log.d(TAG, "  search_button_id: $SEARCH_BUTTON_ID")
            Log.d(TAG, "  search_input_id: $SEARCH_INPUT_ID")
            Log.d(TAG, "  chat_input_id: $CHAT_INPUT_ID")
            Log.d(TAG, "  send_button_id: $SEND_BUTTON_ID")
        }
    }
}

