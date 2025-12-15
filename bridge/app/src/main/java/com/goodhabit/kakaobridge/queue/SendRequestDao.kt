package com.goodhabit.kakaobridge.queue

import androidx.room.*
import kotlinx.coroutines.flow.Flow

@Dao
interface SendRequestDao {
    @Query("SELECT * FROM send_requests WHERE id = :id LIMIT 1")
    suspend fun getById(id: String): SendRequest?

    @Query("SELECT * FROM send_requests WHERE status IN (:statuses) ORDER BY createdAt ASC")
    fun getRequestsByStatus(statuses: List<SendStatus>): Flow<List<SendRequest>>

    @Query("SELECT * FROM send_requests WHERE roomKey = :roomKey AND status = :status LIMIT 1")
    suspend fun getRequestByRoomKey(roomKey: String, status: SendStatus): SendRequest?

    @Query("SELECT * FROM send_requests WHERE roomKey = :roomKey AND status IN (:statuses) ORDER BY createdAt ASC")
    suspend fun getRequestsByRoomKey(roomKey: String, statuses: List<SendStatus>): List<SendRequest>

    @Query("SELECT * FROM send_requests WHERE status = :status AND (nextRetryAt IS NULL OR nextRetryAt <= :now) ORDER BY createdAt ASC")
    suspend fun getReadyToRetry(status: SendStatus, now: Long): List<SendRequest>

    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun insert(request: SendRequest)

    @Update
    suspend fun update(request: SendRequest)

    @Delete
    suspend fun delete(request: SendRequest)

    @Query("DELETE FROM send_requests WHERE status = :status AND updatedAt < :before")
    suspend fun deleteOldRequests(status: SendStatus, before: Long)

    @Query("SELECT COUNT(*) FROM send_requests WHERE status = :status")
    suspend fun countByStatus(status: SendStatus): Int
}

