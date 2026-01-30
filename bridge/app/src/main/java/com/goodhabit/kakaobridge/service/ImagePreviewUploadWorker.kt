package com.goodhabit.kakaobridge.service

import android.content.Context
import android.net.Uri
import android.util.Log
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import androidx.work.workDataOf

/**
 * WorkManager Worker: 이미지 미리보기 업로드 재시도
 */
class ImagePreviewUploadWorker(
    context: Context,
    params: WorkerParameters
) : CoroutineWorker(context, params) {
    
    companion object {
        private const val TAG = "ImagePreviewUploadWorker"
        const val KEY_IMAGE_URI = "image_uri"
        const val KEY_ROOM = "room"
        const val KEY_SENDER_ID = "sender_id"
        const val KEY_SENDER_NAME = "sender_name"
        const val KEY_KAKAO_LOG_ID = "kakao_log_id"
        const val KEY_IS_GROUP = "is_group"
        
        /**
         * WorkManager 요청 생성
         */
        fun createWorkData(
            imageUri: Uri,
            room: String,
            senderId: String?,
            senderName: String?,
            kakaoLogId: String?,
            isGroup: Boolean = false
        ) = workDataOf(
            KEY_IMAGE_URI to imageUri.toString(),
            KEY_ROOM to room,
            KEY_SENDER_ID to (senderId ?: ""),
            KEY_SENDER_NAME to (senderName ?: ""),
            KEY_KAKAO_LOG_ID to (kakaoLogId ?: ""),
            KEY_IS_GROUP to isGroup
        )
    }
    
    override suspend fun doWork(): Result {
        return try {
            Log.i(TAG, "═══════════════════════════════════════════════════════")
            Log.i(TAG, "[WorkManager] 이미지 업로드 재시도 시작")
            
            // 입력 데이터 추출
            val imageUriString = inputData.getString(KEY_IMAGE_URI)
            if (imageUriString.isNullOrBlank()) {
                Log.e(TAG, "❌ image_uri가 없음")
                return Result.failure()
            }
            
            val imageUri = Uri.parse(imageUriString)
            val room = inputData.getString(KEY_ROOM) ?: ""
            val senderId = inputData.getString(KEY_SENDER_ID)
            val senderName = inputData.getString(KEY_SENDER_NAME)
            val kakaoLogId = inputData.getString(KEY_KAKAO_LOG_ID)
            val isGroup = inputData.getBoolean(KEY_IS_GROUP, false)
            
            Log.i(TAG, "  URI: $imageUri")
            Log.i(TAG, "  room: \"$room\"")
            Log.i(TAG, "  senderId: $senderId")
            Log.i(TAG, "  senderName: $senderName")
            Log.i(TAG, "  kakaoLogId: $kakaoLogId")
            Log.i(TAG, "  isGroup: $isGroup")
            
            // 업로드 시도
            val success = ImagePreviewUploader.uploadImage(
                context = applicationContext,
                imageUri = imageUri,
                room = room,
                senderId = senderId,
                senderName = senderName,
                kakaoLogId = kakaoLogId,
                isGroupConversation = isGroup
            )
            
            if (success) {
                Log.i(TAG, "✅ 업로드 성공 (WorkManager)")
                Log.i(TAG, "═══════════════════════════════════════════════════════")
                Result.success()
            } else {
                Log.w(TAG, "⚠️ 업로드 실패 (WorkManager)")
                
                // 재시도 가능 여부 확인
                val runAttemptCount = runAttemptCount
                val maxAttempts = 3
                
                if (runAttemptCount < maxAttempts) {
                    Log.i(TAG, "  재시도 예정: attempt ${runAttemptCount + 1}/$maxAttempts")
                    Log.i(TAG, "═══════════════════════════════════════════════════════")
                    Result.retry()
                } else {
                    Log.e(TAG, "❌ 최대 재시도 횟수 초과 (${maxAttempts}회)")
                    Log.i(TAG, "═══════════════════════════════════════════════════════")
                    Result.failure()
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "❌ Worker 예외 발생", e)
            Result.failure()
        }
    }
}

