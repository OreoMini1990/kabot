package com.goodhabit.kakaobridge.accessibility.util

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.util.Log
import androidx.core.content.FileProvider
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL

object ImageHelper {
    private const val TAG = "ImageHelper"
    private const val IMAGE_CACHE_DIR = "images"
    
    suspend fun downloadAndSaveToClipboard(context: Context, imageUrl: String): Boolean {
        return withContext(Dispatchers.IO) {
            try {
                Log.i(TAG, "Downloading image from: $imageUrl")
                
                val bitmap = downloadImage(imageUrl) ?: run {
                    Log.e(TAG, "Failed to download image")
                    return@withContext false
                }
                
                Log.i(TAG, "Image downloaded: ${bitmap.width}x${bitmap.height}")
                
                val cacheDir = File(context.cacheDir, IMAGE_CACHE_DIR)
                if (!cacheDir.exists()) {
                    cacheDir.mkdirs()
                }
                
                val fileExtension = getFileExtensionFromUrl(imageUrl) ?: "png"
                val tempFile = File(cacheDir, "clipboard_image_${System.currentTimeMillis()}.$fileExtension")
                
                try {
                    FileOutputStream(tempFile).use { out ->
                        val format = when (fileExtension.lowercase()) {
                            "jpg", "jpeg" -> Bitmap.CompressFormat.JPEG
                            "webp" -> Bitmap.CompressFormat.WEBP
                            else -> Bitmap.CompressFormat.PNG
                        }
                        bitmap.compress(format, 95, out)
                    }
                    Log.i(TAG, "Image saved to: ${tempFile.absolutePath}")
                } catch (e: Exception) {
                    Log.e(TAG, "Failed to save image to file", e)
                    return@withContext false
                }
                
                val uri = try {
                    val authority = "${context.packageName}.fileprovider"
                    FileProvider.getUriForFile(context, authority, tempFile)
                } catch (e: Exception) {
                    Log.e(TAG, "FileProvider failed: ${e.message}", e)
                    return@withContext false
                }
                
                Log.i(TAG, "FileProvider URI created: $uri")
                
                val mimeType = when (fileExtension.lowercase()) {
                    "jpg", "jpeg" -> "image/jpeg"
                    "png" -> "image/png"
                    "webp" -> "image/webp"
                    "gif" -> "image/gif"
                    else -> "image/*"
                }
                
                val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                val clip = ClipData.newUri(context.contentResolver, "image", uri)
                clipboard.setPrimaryClip(clip)
                
                Log.i(TAG, "Image saved to clipboard with URI: $uri, MIME: $mimeType")
                true
            } catch (e: Exception) {
                Log.e(TAG, "Failed to download and save image to clipboard", e)
                false
            }
        }
    }
    
    private fun getFileExtensionFromUrl(url: String): String? {
        return try {
            val urlObj = URL(url)
            val path = urlObj.path
            val lastDot = path.lastIndexOf('.')
            if (lastDot >= 0 && lastDot < path.length - 1) {
                path.substring(lastDot + 1).lowercase()
            } else {
                null
            }
        } catch (e: Exception) {
            null
        }
    }
    
    private suspend fun downloadImage(imageUrl: String): Bitmap? {
        return withContext(Dispatchers.IO) {
            var connection: HttpURLConnection? = null
            var inputStream: java.io.InputStream? = null
            
            try {
                val url = URL(imageUrl)
                connection = url.openConnection() as HttpURLConnection
                connection.connectTimeout = 15000
                connection.readTimeout = 15000
                connection.doInput = true
                connection.instanceFollowRedirects = true
                connection.setRequestProperty("User-Agent", "KakaoBridge/1.0")
                connection.connect()
                
                val responseCode = connection.responseCode
                if (responseCode != HttpURLConnection.HTTP_OK) {
                    Log.e(TAG, "HTTP error: $responseCode")
                    return@withContext null
                }
                
                inputStream = connection.inputStream
                val bitmap = BitmapFactory.decodeStream(inputStream)
                
                if (bitmap == null) {
                    Log.e(TAG, "Failed to decode bitmap from stream")
                    return@withContext null
                }
                
                Log.d(TAG, "Bitmap decoded: ${bitmap.width}x${bitmap.height}")
                bitmap
            } catch (e: Exception) {
                Log.e(TAG, "Failed to download image", e)
                null
            } finally {
                try {
                    inputStream?.close()
                } catch (e: Exception) {
                }
                try {
                    connection?.disconnect()
                } catch (e: Exception) {
                }
            }
        }
    }
    
    fun cleanupOldImages(context: Context, maxAgeMs: Long = 3600000) {
        try {
            val cacheDir = File(context.cacheDir, IMAGE_CACHE_DIR)
            if (!cacheDir.exists()) {
                return
            }
            
            val now = System.currentTimeMillis()
            var deletedCount = 0
            
            cacheDir.listFiles()?.forEach { file ->
                if (file.isFile && file.name.startsWith("clipboard_image_")) {
                    val age = now - file.lastModified()
                    if (age > maxAgeMs) {
                        if (file.delete()) {
                            deletedCount++
                        }
                    }
                }
            }
            
            if (deletedCount > 0) {
                Log.d(TAG, "Cleaned up $deletedCount old image files")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to cleanup old images", e)
        }
    }
}

