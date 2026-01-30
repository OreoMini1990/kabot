package com.goodhabit.kakaobridge.service

import android.content.Context
import android.net.Uri
import android.util.Log
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.asRequestBody
import java.io.File
import java.io.FileOutputStream
import java.io.InputStream

/**
 * Bridge 이미지 미리보기 업로더
 * 알림 미리보기 Content URI에서 이미지를 읽어 서버로 업로드
 */
object ImagePreviewUploader {
    private const val TAG = "ImagePreviewUploader"
    private const val UPLOAD_ENDPOINT = "/bridge/preview-image"
    private const val MAX_RETRY_COUNT = 3
    private const val RETRY_DELAY_MS = 2000L
    
    /**
     * 서버 URL 가져오기 (환경변수 또는 기본값)
     */
    private fun getServerUrl(context: Context): String {
        // SharedPreferences 또는 BuildConfig에서 가져올 수 있음
        // 일단 기본값 사용
        val prefs = context.getSharedPreferences("bridge_config", Context.MODE_PRIVATE)
        val serverUrl = prefs.getString("server_url", "http://192.168.0.15:5002")
        return serverUrl ?: "http://192.168.0.15:5002"
    }
    
    /**
     * Bridge API Key 가져오기
     */
    private fun getBridgeApiKey(context: Context): String? {
        val prefs = context.getSharedPreferences("bridge_config", Context.MODE_PRIVATE)
        return prefs.getString("bridge_api_key", null)
    }
    
    /**
     * Content URI에서 이미지 바이트 읽기
     */
    private suspend fun readImageBytes(context: Context, uri: Uri): ByteArray? {
        return withContext(Dispatchers.IO) {
            var inputStream: InputStream? = null
            try {
                inputStream = context.contentResolver.openInputStream(uri)
                if (inputStream == null) {
                    Log.e(TAG, "Failed to open input stream for URI: $uri")
                    return@withContext null
                }
                
                // 버퍼 스트리밍으로 읽기 (큰 파일 대비)
                val buffer = mutableListOf<Byte>()
                val tempBuffer = ByteArray(8192) // 8KB 버퍼
                
                var bytesRead: Int
                while (inputStream.read(tempBuffer).also { bytesRead = it } != -1) {
                    buffer.addAll(tempBuffer.sliceArray(0 until bytesRead).toList())
                }
                
                val imageBytes = buffer.toByteArray()
                Log.i(TAG, "Image bytes read: ${imageBytes.size} bytes from URI: $uri")
                return@withContext imageBytes
            } catch (e: Exception) {
                Log.e(TAG, "Failed to read image bytes from URI: $uri", e)
                null
            } finally {
                try {
                    inputStream?.close()
                } catch (e: Exception) {
                    Log.w(TAG, "Failed to close input stream", e)
                }
            }
        }
    }
    
    /**
     * 이미지를 임시 파일로 저장
     */
    private suspend fun saveImageToTempFile(context: Context, imageBytes: ByteArray, mimeType: String): File? {
        return withContext(Dispatchers.IO) {
            try {
                val cacheDir = File(context.cacheDir, "preview_images")
                if (!cacheDir.exists()) {
                    cacheDir.mkdirs()
                }
                
                // 확장자 결정
                val extension = when {
                    mimeType.contains("jpeg") || mimeType.contains("jpg") -> "jpg"
                    mimeType.contains("png") -> "png"
                    mimeType.contains("gif") -> "gif"
                    mimeType.contains("webp") -> "webp"
                    else -> "jpg"
                }
                
                val tempFile = File(cacheDir, "preview_${System.currentTimeMillis()}.$extension")
                FileOutputStream(tempFile).use { out ->
                    out.write(imageBytes)
                }
                
                Log.i(TAG, "Image saved to temp file: ${tempFile.absolutePath} (${imageBytes.size} bytes)")
                return@withContext tempFile
            } catch (e: Exception) {
                Log.e(TAG, "Failed to save image to temp file", e)
                null
            }
        }
    }
    
    /**
     * 이미지 업로드 (동기)
     * @return 업로드 성공 여부
     */
    suspend fun uploadImage(
        context: Context,
        imageUri: Uri,
        room: String,
        senderId: String?,
        senderName: String?,
        kakaoLogId: String?,
        isGroupConversation: Boolean = false
    ): Boolean {
        return withContext(Dispatchers.IO) {
            try {
                Log.i(TAG, "═══════════════════════════════════════════════════════")
                Log.i(TAG, "[이미지 업로드] 시작")
                Log.i(TAG, "  URI: $imageUri")
                Log.i(TAG, "  room: \"$room\"")
                Log.i(TAG, "  senderId: $senderId")
                Log.i(TAG, "  senderName: $senderName")
                Log.i(TAG, "  kakaoLogId: $kakaoLogId")
                
                // 1. MIME 타입 확인
                val mimeType = context.contentResolver.getType(imageUri) ?: "image/jpeg"
                Log.i(TAG, "  MIME type: $mimeType")
                
                // 2. 이미지 바이트 읽기
                val imageBytes = readImageBytes(context, imageUri)
                if (imageBytes == null || imageBytes.isEmpty()) {
                    Log.e(TAG, "Failed to read image bytes or image is empty")
                    return@withContext false
                }
                
                Log.i(TAG, "  Image bytes: ${imageBytes.size} bytes")
                
                // 3. 임시 파일로 저장 (multipart 업로드용)
                val tempFile = saveImageToTempFile(context, imageBytes, mimeType)
                if (tempFile == null) {
                    Log.e(TAG, "Failed to save image to temp file")
                    return@withContext false
                }
                
                // 4. 서버로 업로드
                val serverUrl = getServerUrl(context)
                val apiKey = getBridgeApiKey(context)
                
                if (apiKey.isNullOrBlank()) {
                    Log.w(TAG, "⚠️ Bridge API Key가 설정되지 않음 - 인증 없이 시도")
                }
                
                val uploadUrl = "$serverUrl$UPLOAD_ENDPOINT"
                Log.i(TAG, "  Upload URL: $uploadUrl")
                
                val client = OkHttpClient.Builder()
                    .connectTimeout(30, java.util.concurrent.TimeUnit.SECONDS)
                    .readTimeout(30, java.util.concurrent.TimeUnit.SECONDS)
                    .writeTimeout(30, java.util.concurrent.TimeUnit.SECONDS)
                    .build()
                
                // Multipart 요청 생성
                val requestBody = MultipartBody.Builder()
                    .setType(MultipartBody.FORM)
                    .addFormDataPart("room", room)
                    .apply {
                        senderId?.let { addFormDataPart("senderId", it) }
                        senderName?.let { addFormDataPart("senderName", it) }
                        kakaoLogId?.let { addFormDataPart("kakaoLogId", it) }
                        addFormDataPart("clientTs", System.currentTimeMillis().toString())
                        addFormDataPart("mime", mimeType)
                        addFormDataPart("isGroupConversation", isGroupConversation.toString())
                    }
                    .addFormDataPart(
                        "image",
                        tempFile.name,
                        tempFile.asRequestBody(mimeType.toMediaType())
                    )
                    .build()
                
                val requestBuilder = Request.Builder()
                    .url(uploadUrl)
                    .post(requestBody)
                
                // API Key 헤더 추가
                if (!apiKey.isNullOrBlank()) {
                    requestBuilder.addHeader("X-Bridge-Key", apiKey)
                }
                
                val request = requestBuilder.build()
                
                // 업로드 실행
                var retryCount = 0
                var lastException: Exception? = null
                
                while (retryCount <= MAX_RETRY_COUNT) {
                    try {
                        Log.i(TAG, "  업로드 시도 ${retryCount + 1}/${MAX_RETRY_COUNT + 1}")
                        
                        val response = client.newCall(request).execute()
                        val responseBody = response.body?.string()
                        
                        if (response.isSuccessful) {
                            Log.i(TAG, "✅ 업로드 성공: ${response.code}")
                            Log.i(TAG, "  Response: ${responseBody?.substring(0, minOf(200, responseBody.length))}")
                            
                            // 임시 파일 삭제
                            try {
                                tempFile.delete()
                            } catch (e: Exception) {
                                Log.w(TAG, "Failed to delete temp file", e)
                            }
                            
                            Log.i(TAG, "═══════════════════════════════════════════════════════")
                            return@withContext true
                        } else {
                            Log.w(TAG, "⚠️ 업로드 실패: ${response.code}")
                            Log.w(TAG, "  Response: ${responseBody?.substring(0, minOf(200, responseBody.length))}")
                            
                            if (response.code == 401) {
                                Log.e(TAG, "❌ 인증 실패 (401) - API Key 확인 필요")
                                // 인증 실패는 재시도 불가
                                break
                            }
                            
                            lastException = Exception("HTTP ${response.code}: $responseBody")
                        }
                    } catch (e: Exception) {
                        Log.e(TAG, "업로드 예외 발생", e)
                        lastException = e
                    }
                    
                    retryCount++
                    if (retryCount <= MAX_RETRY_COUNT) {
                        Log.i(TAG, "  재시도 대기: ${RETRY_DELAY_MS}ms")
                        Thread.sleep(RETRY_DELAY_MS)
                    }
                }
                
                // 모든 재시도 실패
                Log.e(TAG, "❌ 업로드 최종 실패 (${retryCount}회 시도)")
                lastException?.let { Log.e(TAG, "  마지막 오류: ${it.message}", it) }
                
                // 임시 파일은 유지 (WorkManager 재시도용)
                Log.i(TAG, "  임시 파일 유지: ${tempFile.absolutePath}")
                
                Log.i(TAG, "═══════════════════════════════════════════════════════")
                return@withContext false
            } catch (e: Exception) {
                Log.e(TAG, "이미지 업로드 중 예외 발생", e)
                return@withContext false
            }
        }
    }
    
    /**
     * 임시 파일 정리
     */
    fun cleanupTempFiles(context: Context, maxAgeMs: Long = 3600000) { // 1시간
        try {
            val cacheDir = File(context.cacheDir, "preview_images")
            if (!cacheDir.exists()) {
                return
            }
            
            val now = System.currentTimeMillis()
            var deletedCount = 0
            
            cacheDir.listFiles()?.forEach { file ->
                if (file.isFile && file.name.startsWith("preview_")) {
                    val age = now - file.lastModified()
                    if (age > maxAgeMs) {
                        if (file.delete()) {
                            deletedCount++
                        }
                    }
                }
            }
            
            if (deletedCount > 0) {
                Log.d(TAG, "Cleaned up $deletedCount old preview image files")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to cleanup temp files", e)
        }
    }
}

