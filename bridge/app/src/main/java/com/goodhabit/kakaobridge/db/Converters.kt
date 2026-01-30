package com.goodhabit.kakaobridge.db

import androidx.room.TypeConverter
import com.goodhabit.kakaobridge.queue.SendStatus

class Converters {
    @TypeConverter
    fun fromStatus(status: SendStatus): String {
        return status.name
    }

    @TypeConverter
    fun toStatus(status: String): SendStatus {
        return SendStatus.valueOf(status)
    }
}





