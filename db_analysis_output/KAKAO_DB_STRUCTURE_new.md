# 카카오톡 DB 구조 분석 문서

**생성 일시**: 2025-12-20 23:07:46

---

## 1. 데이터베이스 개요

카카오톡은 두 개의 SQLite 데이터베이스 파일을 사용합니다:

- **KakaoTalk.db**: 메인 데이터베이스 (메시지, 채팅방 정보)
- **KakaoTalk2.db**: 보조 데이터베이스 (친구 목록, 오픈채팅 멤버 등)

---

## 2. 주요 테이블 구조

### 2.1 KakaoTalk.db

#### android_metadata

- **레코드 수**: 1개

**컬럼 구조**:

| 컬럼명 | 타입 | NOT NULL | 기본값 | PK |
|--------|------|----------|--------|-----|
| `locale` | `TEXT` |  | `` |  |

**샘플 데이터**:

**샘플 1**:
```json
{
  "locale": "ko_KR"
}
```

---

#### chat_logs

- **레코드 수**: 1,752개

**컬럼 구조**:

| 컬럼명 | 타입 | NOT NULL | 기본값 | PK |
|--------|------|----------|--------|-----|
| `_id` | `INTEGER` |  | `` | ✓ |
| `id` | `INTEGER` | ✓ | `` |  |
| `type` | `INTEGER` |  | `` |  |
| `chat_id` | `INTEGER` | ✓ | `` |  |
| `thread_id` | `INTEGER` |  | `` |  |
| `scope` | `INTEGER` |  | `` |  |
| `user_id` | `INTEGER` |  | `` |  |
| `message` | `TEXT` |  | `` |  |
| `attachment` | `TEXT` |  | `` |  |
| `created_at` | `INTEGER` |  | `` |  |
| `deleted_at` | `INTEGER` |  | `` |  |
| `client_message_id` | `INTEGER` |  | `` |  |
| `prev_id` | `INTEGER` |  | `` |  |
| `referer` | `INTEGER` |  | `` |  |
| `supplement` | `TEXT` |  | `` |  |
| `v` | `TEXT` |  | `` |  |

**샘플 데이터**:

**샘플 1**:
```json
{
  "_id": 1,
  "id": 3607650857048612864,
  "type": 18,
  "chat_id": 440387067254143,
  "thread_id": null,
  "scope": 1,
  "user_id": 429744344,
  "message": "E4FAfCpdH79fJatpnaNdwmUAUCRZCQmtIJj95KxDhgc=",
  "attachment": "ZEGX0Z7zarttIPSyeHkGLd82zUZVYJcNMmLhIsLlM4GrpKzZFH0UUB7m8Ebp3ykXBcVUVoGFS01yzae6WhSRe/tu7RKiDKlFvU0vcN4RXODZDAfwo6lMaeie57kCLIiyZeKR/79Xhq5oqEz9juS07AWYSud9CcDpHJBWURLAeVLp/LD6rAw+/9Rh+3BMRNxyWTobOoxmzPeiuf/B5/lYC2zjN/AQkdujLA/m4twBxGhb4VxPFVDS1ORxATaLiDxdw1HImevHzKBWseL/fndiGy71Kjjn9l/+l1sdGbBr0YWZkEJG/U+Rb1MdGnxWO4slX1h0Xt1uhKn3ebega8mv+6RL+x+zPsm+1Tn9ZxUExukDjrLwM7GCR20hADXKwi8G3876jlQEtczG7QAxkYu1IfFfm24TxosQBfLN5kD9SO+Lwl2BBa+N8a3NqGBg9yD69WExRIcxWZ97OJ4KsCruX3sdLn3pg9ZglT2ddiyoos6jQCWCbG0mez2QnyBpXsgtIOYRn4AePf/QnbSPAjPaOA==",
  "created_at": 1751002695,
  "deleted_at": 0,
  "client_message_id": null,
  "prev_id": 0,
  "referer": 0,
  "supplement": null,
  "v": {
    "enc": 31,
    "modifyRevision": 0,
    "isMine": true
  }
}
```

**샘플 2**:
```json
{
  "_id": 2,
  "id": 3607734238661277696,
  "type": 72,
  "chat_id": 4943996873286908,
  "thread_id": null,
  "scope": 1,
  "user_id": 338657515,
  "message": "1g8S64Km2hzRZLWoMFsoF4jRurk/cq+4/14zCjkVfxxwYdGifbzU8xS0/bfRuus/u9cRPsGbjqi/ILV/IspbSfBKMo0mtPsyU8GDKeskuEDel1VFILzcnQqfSh7i4G+69KgbJ2zmPh4JLqEotqLisWoAG4heS47Mp9OYJct/LUvVug2XTHJMPFv5NJ7i26Hht6WdYi46cC0L5Z04vGzseFdvevxiYnnZs791xO/UbdsiShPjxQIy5j2RhtCXpqEJvNJrWKPssZVdwF99dwSKSKaEHx+9rC8JhJe0umhg/p/OsrnqbrT4sIAaLjCUTsKbSDDxaZxa1BhtneZt09gPwJehavprKZdO7FdG1AmMa5IVriySVgJa7T1VKSAzLCyoynmCAWS5l1Zkg5KkppgA6IWRoP4/yKrP0a1wESFaT52qRldpRpClDOy2rAYgpnSIeC4tHdEc2nibXSXLlrjcNK1db919yZeg2ePApq5G7+mOFZUMRcO1VDzCTQf7oJPIkgqACyVT6MFAqcKZFFRWFUM2C5jhOBmrByILB7NIC9Br+b1aOv5F5xfULygUKgEe",
  "attachment": "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",
  "created_at": 1751012635,
  "deleted_at": 0,
  "client_message_id": null,
  "prev_id": 0,
  "referer": 3,
  "supplement": "",
  "v": {
    "enc": 31,
    "modifyRevision": 0,
    "isMine": false
  }
}
```

---

#### chat_rooms

- **레코드 수**: 33개

**컬럼 구조**:

| 컬럼명 | 타입 | NOT NULL | 기본값 | PK |
|--------|------|----------|--------|-----|
| `_id` | `INTEGER` |  | `` | ✓ |
| `id` | `INTEGER` | ✓ | `` |  |
| `type` | `TEXT` |  | `` |  |
| `members` | `TEXT` |  | `` |  |
| `active_member_ids` | `TEXT` |  | `` |  |
| `last_log_id` | `INTEGER` |  | `` |  |
| `last_message` | `TEXT` |  | `` |  |
| `last_updated_at` | `INTEGER` |  | `` |  |
| `unread_count` | `INTEGER` |  | `` |  |
| `watermarks` | `TEXT` |  | `` |  |
| `temporary_message` | `TEXT` |  | `` |  |
| `v` | `TEXT` |  | `` |  |
| `ext` | `TEXT` |  | `` |  |
| `last_read_log_id` | `INTEGER` |  | `` |  |
| `last_update_seen_id` | `INTEGER` |  | `` |  |
| `active_members_count` | `INTEGER` |  | `` |  |
| `meta` | `TEXT` |  | `` |  |
| `is_hint` | `INTEGER` |  | `` |  |
| `private_meta` | `TEXT` |  | `` |  |
| `last_chat_log_type` | `INTEGER` |  | `` |  |
| `schat_token` | `INTEGER` |  | `` |  |
| `last_skey_token` | `INTEGER` |  | `` |  |
| `last_pk_tokens` | `TEXT` |  | `` |  |
| `link_id` | `INTEGER` |  | `` |  |
| `moim_meta` | `TEXT` |  | `` |  |
| `invite_info` | `TEXT` |  | `` |  |
| `blinded_member_ids` | `TEXT` |  | `` |  |
| `mute_until_at` | `INTEGER` |  | `` |  |
| `last_joined_log_id` | `INTEGER` |  | `` |  |

**샘플 데이터**:

**샘플 1**:
```json
{
  "_id": 1,
  "id": 440387067254143,
  "type": "DirectChat",
  "members": null,
  "active_member_ids": "[73808891]",
  "last_log_id": 3724348518903689216,
  "last_message": "YSkS5/zpduMru6sKBlWcm6Z1tvLK1d3unmJ9hheCCUQ=",
  "last_updated_at": 1764914141,
  "unread_count": 0,
  "watermarks": null,
  "temporary_message": null,
  "v": {
    "pushAlert": true,
    "chat_referer_type": 0,
    "enc": 31
  },
  "ext": null,
  "last_read_log_id": 3724348518903689216,
  "last_update_seen_id": 3724348518903689216,
  "active_members_count": 2,
  "meta": null,
  "is_hint": null,
  "private_meta": null,
  "last_chat_log_type": 2,
  "schat_token": 0,
  "last_skey_token": 0,
  "last_pk_tokens": null,
  "link_id": -1,
  "moim_meta": null,
  "invite_info": null,
  "blinded_member_ids": null,
  "mute_until_at": -1,
  "last_joined_log_id": -1
}
```

**샘플 2**:
```json
{
  "_id": 2,
  "id": 442874471149677,
  "type": "DirectChat",
  "members": null,
  "active_member_ids": "[185081014]",
  "last_log_id": 3629998846263345153,
  "last_message": "NX+1U8cSzIkTVyE/2Pm5jfv7uL4dRW9o98haL/e+BvIw1OkjxJEXOJypKOZIE17AiedBxw/Skr4W5etzogQ7HUVA3VXmmzzEYj+q3sVNvA8mVu5YpsSyjb1kOuOS2pGHa1eQlMvRXh/PiuVfFCAXSwOMyuzkMYP/Yigv57e/F90fZrIv/+9vonf49J6S+HGyc/GsSTAQwvnHN1t4k/YcI12HxJjTeo/xuq2iFWUFIzdhcH6eoDny+M1YdjeHqTxqOLXMpDswB3a3QPpmPkq9XmnizTvVkPBSCZCO4gZ1/2DDkluTHroW3eyZfxqxF/agzyaWiNCjo93j7pFkTj1on0OzIwrCMp9GYxHnwiZHAiXPgN12sPDUksGE8/8lm/5JiKKkbetQXAVoDBdtdbLv2ZmgJXmbQXIUhAJ+6DmedfJeSs8aW/gJjDTHzEe6IEII",
  "last_updated_at": 1753666783,
  "unread_count": 0,
  "watermarks": null,
  "temporary_message": null,
  "v": {
    "pushAlert": true,
    "chat_referer_type": 0,
    "enc": 31,
    "display_user_ids": ""
  },
  "ext": null,
  "last_read_log_id": 3629998846263345153,
  "last_update_seen_id": 3629998846263345153,
  "active_members_count": 2,
  "meta": null,
  "is_hint": null,
  "private_meta": null,
  "last_chat_log_type": 1,
  "schat_token": 0,
  "last_skey_token": 0,
  "last_pk_tokens": null,
  "link_id": -1,
  "moim_meta": null,
  "invite_info": null,
  "blinded_member_ids": null,
  "mute_until_at": -1,
  "last_joined_log_id": -1
}
```

---

#### chat_sending_logs

- **레코드 수**: 0개

**컬럼 구조**:

| 컬럼명 | 타입 | NOT NULL | 기본값 | PK |
|--------|------|----------|--------|-----|
| `_id` | `INTEGER` |  | `` | ✓ |
| `type` | `INTEGER` |  | `` |  |
| `chat_id` | `INTEGER` | ✓ | `` |  |
| `thread_id` | `INTEGER` |  | `` |  |
| `scope` | `INTEGER` |  | `` |  |
| `message` | `TEXT` |  | `` |  |
| `attachment` | `TEXT` |  | `` |  |
| `created_at` | `INTEGER` |  | `` |  |
| `client_message_id` | `INTEGER` |  | `` |  |
| `supplement` | `TEXT` |  | `` |  |
| `v` | `TEXT` |  | `` |  |
| `is_silence` | `INTEGER` | ✓ | `` |  |

---

#### chat_threads

- **레코드 수**: 0개

**컬럼 구조**:

| 컬럼명 | 타입 | NOT NULL | 기본값 | PK |
|--------|------|----------|--------|-----|
| `chat_id` | `INTEGER` | ✓ | `` | ✓ |
| `thread_id` | `INTEGER` | ✓ | `` | ✓ |
| `last_chat_log_id` | `INTEGER` | ✓ | `` |  |
| `last_read_log_id` | `INTEGER` | ✓ | `` |  |
| `last_display_log_id` | `INTEGER` | ✓ | `` |  |
| `mentioned_chat_log_id` | `INTEGER` |  | `` |  |
| `new_chat_log_id` | `INTEGER` |  | `` |  |
| `has_mention` | `INTEGER` | ✓ | `` |  |
| `has_new` | `INTEGER` | ✓ | `` |  |
| `is_participating` | `INTEGER` | ✓ | `` |  |
| `count` | `INTEGER` | ✓ | `` |  |
| `v` | `TEXT` |  | `` |  |

---

#### public_key_info

- **레코드 수**: 0개

**컬럼 구조**:

| 컬럼명 | 타입 | NOT NULL | 기본값 | PK |
|--------|------|----------|--------|-----|
| `_id` | `INTEGER` |  | `` | ✓ |
| `user_id` | `INTEGER` | ✓ | `` |  |
| `pub_key_token` | `INTEGER` | ✓ | `` |  |
| `encrypt_key` | `TEXT` |  | `` |  |
| `sign_key` | `TEXT` |  | `` |  |
| `chain_sign` | `TEXT` |  | `` |  |
| `create_at` | `INTEGER` |  | `` |  |
| `pk_set_token` | `INTEGER` | ✓ | `` |  |

---

#### room_master_table

- **레코드 수**: 1개

**컬럼 구조**:

| 컬럼명 | 타입 | NOT NULL | 기본값 | PK |
|--------|------|----------|--------|-----|
| `id` | `INTEGER` |  | `` | ✓ |
| `identity_hash` | `TEXT` |  | `` |  |

**샘플 데이터**:

**샘플 1**:
```json
{
  "id": 42,
  "identity_hash": "98073cb80d7b2c582f16973d8096c1f6"
}
```

---

#### secret_key_info

- **레코드 수**: 0개

**컬럼 구조**:

| 컬럼명 | 타입 | NOT NULL | 기본값 | PK |
|--------|------|----------|--------|-----|
| `_id` | `INTEGER` |  | `` | ✓ |
| `chat_id` | `INTEGER` | ✓ | `` |  |
| `secret_key_token` | `INTEGER` | ✓ | `` |  |
| `secret_key` | `TEXT` |  | `` |  |
| `create_at` | `INTEGER` |  | `` |  |

---

#### sqlite_sequence

- **레코드 수**: 3개

**컬럼 구조**:

| 컬럼명 | 타입 | NOT NULL | 기본값 | PK |
|--------|------|----------|--------|-----|
| `name` | `` |  | `` |  |
| `seq` | `` |  | `` |  |

**샘플 데이터**:

**샘플 1**:
```json
{
  "name": "chat_rooms",
  "seq": 36
}
```

**샘플 2**:
```json
{
  "name": "chat_logs",
  "seq": 9742
}
```

---

#### warehouse_info

- **레코드 수**: 0개

**컬럼 구조**:

| 컬럼명 | 타입 | NOT NULL | 기본값 | PK |
|--------|------|----------|--------|-----|
| `_id` | `INTEGER` |  | `` | ✓ |
| `chat_id` | `INTEGER` | ✓ | `` |  |
| `name` | `TEXT` | ✓ | `` |  |
| `description` | `TEXT` |  | `` |  |
| `profile_url` | `TEXT` |  | `` |  |
| `host_id` | `TEXT` | ✓ | `` |  |
| `accessible_pre_chat` | `INTEGER` | ✓ | `` |  |
| `members_invitable` | `INTEGER` | ✓ | `` |  |
| `status` | `TEXT` | ✓ | `` |  |
| `revision` | `INTEGER` | ✓ | `` |  |
| `is_show_welcome` | `INTEGER` | ✓ | `` |  |
| `accessible_log_id` | `INTEGER` | ✓ | `` |  |
| `user_delete_all_id` | `INTEGER` | ✓ | `` |  |
| `create_at` | `INTEGER` | ✓ | `` |  |
| `warehouse_backup_status` | `TEXT` | ✓ | `` |  |
| `ai_chat_bot_management_role` | `TEXT` | ✓ | `` |  |
| `permission` | `TEXT` | ✓ | `` |  |
| `staff` | `TEXT` | ✓ | `` |  |
| `pinCode` | `TEXT` | ✓ | `` |  |
| `pinCode_expired_at` | `INTEGER` | ✓ | `` |  |
| `restrictions` | `TEXT` |  | `` |  |

---

### 2.2 KakaoTalk2.db

#### android_metadata

- **레코드 수**: 1개

**컬럼 구조**:

| 컬럼명 | 타입 | NOT NULL | 기본값 | PK |
|--------|------|----------|--------|-----|
| `locale` | `TEXT` |  | `` |  |

---

#### call_log

- **레코드 수**: 0개

**컬럼 구조**:

| 컬럼명 | 타입 | NOT NULL | 기본값 | PK |
|--------|------|----------|--------|-----|
| `call_log_id` | `INTEGER` | ✓ | `` | ✓ |
| `chat_room_id` | `INTEGER` | ✓ | `` |  |
| `call_nested_count` | `INTEGER` | ✓ | `` |  |
| `last_call_type` | `TEXT` | ✓ | `` |  |
| `is_my_chat_log` | `INTEGER` | ✓ | `` |  |
| `last_call_time` | `INTEGER` | ✓ | `` |  |

---

#### chat_log_bookmarks

- **레코드 수**: 0개

**컬럼 구조**:

| 컬럼명 | 타입 | NOT NULL | 기본값 | PK |
|--------|------|----------|--------|-----|
| `bookmark_id` | `INTEGER` | ✓ | `` | ✓ |
| `chat_id` | `INTEGER` | ✓ | `` |  |
| `chat_log_id` | `INTEGER` | ✓ | `` |  |
| `chat_message_type` | `INTEGER` | ✓ | `` |  |
| `bookmark_memo` | `TEXT` |  | `` |  |

---

#### chat_log_meta

- **레코드 수**: 45개

**컬럼 구조**:

| 컬럼명 | 타입 | NOT NULL | 기본값 | PK |
|--------|------|----------|--------|-----|
| `log_id` | `INTEGER` | ✓ | `` | ✓ |
| `chat_id` | `INTEGER` | ✓ | `` |  |
| `link_id` | `INTEGER` | ✓ | `` |  |
| `content` | `TEXT` | ✓ | `` |  |
| `revision` | `INTEGER` | ✓ | `` |  |

---

#### emoticon_instant_keyword

- **레코드 수**: 0개

**컬럼 구조**:

| 컬럼명 | 타입 | NOT NULL | 기본값 | PK |
|--------|------|----------|--------|-----|
| `_id` | `INTEGER` |  | `` | ✓ |
| `kid` | `INTEGER` | ✓ | `` |  |
| `last_used_at` | `INTEGER` | ✓ | `` |  |
| `use_count` | `INTEGER` | ✓ | `` |  |
| `v` | `TEXT` |  | `` |  |

---

#### emoticon_keyword_dictionary

- **레코드 수**: 4,211개

**컬럼 구조**:

| 컬럼명 | 타입 | NOT NULL | 기본값 | PK |
|--------|------|----------|--------|-----|
| `keyword_id` | `INTEGER` | ✓ | `` | ✓ |
| `keyword` | `TEXT` | ✓ | `` |  |
| `matching_texts` | `TEXT` | ✓ | `` |  |
| `hint_icon` | `TEXT` |  | `` |  |
| `related_ids` | `TEXT` | ✓ | `` |  |
| `v` | `TEXT` |  | `` |  |

---

#### expiring_media_alarm_log_chat_log_mapper

- **레코드 수**: 0개

**컬럼 구조**:

| 컬럼명 | 타입 | NOT NULL | 기본값 | PK |
|--------|------|----------|--------|-----|
| `alarm_log_id` | `INTEGER` | ✓ | `` | ✓ |
| `chat_log_id` | `INTEGER` | ✓ | `` | ✓ |
| `kage_token` | `TEXT` | ✓ | `` | ✓ |
| `type` | `TEXT` | ✓ | `` |  |
| `chat_log_created_at` | `INTEGER` | ✓ | `` |  |

---

#### expiring_media_alarm_logs

- **레코드 수**: 0개

**컬럼 구조**:

| 컬럼명 | 타입 | NOT NULL | 기본값 | PK |
|--------|------|----------|--------|-----|
| `_id` | `INTEGER` | ✓ | `` | ✓ |
| `control_policy_n` | `INTEGER` | ✓ | `` |  |
| `control_policy_d` | `INTEGER` | ✓ | `` |  |
| `control_policy_e` | `INTEGER` | ✓ | `` |  |
| `control_policy_h` | `INTEGER` | ✓ | `` |  |
| `control_policy_m` | `INTEGER` | ✓ | `` |  |
| `created_at` | `INTEGER` | ✓ | `` |  |
| `is_read` | `INTEGER` | ✓ | `0` |  |

---

#### favorite_emoticons

- **레코드 수**: 0개

**컬럼 구조**:

| 컬럼명 | 타입 | NOT NULL | 기본값 | PK |
|--------|------|----------|--------|-----|
| `item_id` | `TEXT` | ✓ | `` | ✓ |
| `emot_idx` | `INTEGER` | ✓ | `` | ✓ |
| `item_resource` | `TEXT` |  | `` |  |
| `v` | `TEXT` |  | `` |  |

---

#### file_path

- **레코드 수**: 0개

**컬럼 구조**:

| 컬럼명 | 타입 | NOT NULL | 기본값 | PK |
|--------|------|----------|--------|-----|
| `token` | `TEXT` | ✓ | `` | ✓ |
| `name` | `TEXT` | ✓ | `` |  |
| `path` | `TEXT` | ✓ | `` |  |
| `v` | `TEXT` |  | `` |  |

---

#### friends

- **레코드 수**: 22개

**컬럼 구조**:

| 컬럼명 | 타입 | NOT NULL | 기본값 | PK |
|--------|------|----------|--------|-----|
| `_id` | `INTEGER` |  | `` | ✓ |
| `contact_id` | `INTEGER` |  | `` |  |
| `id` | `INTEGER` |  | `` |  |
| `type` | `INTEGER` | ✓ | `` |  |
| `uuid` | `TEXT` |  | `` |  |
| `phone_number` | `TEXT` | ✓ | `` |  |
| `raw_phone_number` | `TEXT` |  | `` |  |
| `name` | `TEXT` | ✓ | `` |  |
| `phonetic_name` | `TEXT` |  | `` |  |
| `profile_image_url` | `TEXT` |  | `` |  |
| `full_profile_image_url` | `TEXT` |  | `` |  |
| `original_profile_image_url` | `TEXT` |  | `` |  |
| `status_message` | `TEXT` |  | `` |  |
| `chat_id` | `INTEGER` | ✓ | `` |  |
| `brand_new` | `INTEGER` | ✓ | `` |  |
| `blocked` | `INTEGER` | ✓ | `` |  |
| `favorite` | `INTEGER` | ✓ | `` |  |
| `position` | `INTEGER` | ✓ | `` |  |
| `v` | `TEXT` |  | `` |  |
| `board_v` | `TEXT` |  | `` |  |
| `ext` | `TEXT` |  | `` |  |
| `nick_name` | `TEXT` |  | `` |  |
| `user_type` | `INTEGER` | ✓ | `` |  |
| `story_user_id` | `INTEGER` |  | `` |  |
| `account_id` | `INTEGER` |  | `` |  |
| `linked_services` | `TEXT` |  | `` |  |
| `hidden` | `INTEGER` | ✓ | `` |  |
| `purged` | `INTEGER` | ✓ | `` |  |
| `suspended` | `INTEGER` | ✓ | `` |  |
| `member_type` | `INTEGER` | ✓ | `` |  |
| `involved_chat_ids` | `TEXT` |  | `` |  |
| `contact_name` | `TEXT` |  | `` |  |
| `enc` | `INTEGER` |  | `` |  |
| `created_at` | `INTEGER` |  | `` |  |
| `new_badge_updated_at` | `INTEGER` |  | `` |  |
| `new_badge_seen_at` | `INTEGER` |  | `` |  |
| `status_action_token` | `INTEGER` |  | `` |  |
| `access_permit` | `TEXT` |  | `` |  |
| `suspected_impostor` | `INTEGER` | ✓ | `` |  |

---

#### geo_location_log

- **레코드 수**: 0개

**컬럼 구조**:

| 컬럼명 | 타입 | NOT NULL | 기본값 | PK |
|--------|------|----------|--------|-----|
| `_id` | `INTEGER` | ✓ | `` | ✓ |
| `usedAt` | `INTEGER` | ✓ | `` |  |
| `osVersion` | `TEXT` | ✓ | `` |  |
| `purpose` | `TEXT` | ✓ | `` |  |

---

#### inapp_browser_url

- **레코드 수**: 0개

**컬럼 구조**:

| 컬럼명 | 타입 | NOT NULL | 기본값 | PK |
|--------|------|----------|--------|-----|
| `_id` | `INTEGER` |  | `` | ✓ |
| `title` | `TEXT` |  | `` |  |
| `url` | `TEXT` | ✓ | `` |  |
| `created_at` | `INTEGER` |  | `` |  |
| `v` | `TEXT` |  | `` |  |

---

#### item

- **레코드 수**: 6개

**컬럼 구조**:

| 컬럼명 | 타입 | NOT NULL | 기본값 | PK |
|--------|------|----------|--------|-----|
| `id` | `TEXT` | ✓ | `` | ✓ |
| `category` | `INTEGER` | ✓ | `` |  |
| `set_order` | `INTEGER` |  | `` |  |
| `enc` | `INTEGER` |  | `` |  |
| `v` | `TEXT` |  | `` |  |

---

#### item_resource

- **레코드 수**: 310개

**컬럼 구조**:

| 컬럼명 | 타입 | NOT NULL | 기본값 | PK |
|--------|------|----------|--------|-----|
| `_id` | `INTEGER` |  | `` | ✓ |
| `item_category` | `INTEGER` | ✓ | `` |  |
| `item_id` | `TEXT` | ✓ | `` |  |
| `enc` | `INTEGER` |  | `` |  |
| `v` | `TEXT` |  | `` |  |

---

#### music_history

- **레코드 수**: 0개

**컬럼 구조**:

| 컬럼명 | 타입 | NOT NULL | 기본값 | PK |
|--------|------|----------|--------|-----|
| `song_id` | `TEXT` | ✓ | `` | ✓ |
| `song_name` | `TEXT` |  | `` |  |
| `song_url` | `TEXT` |  | `` |  |
| `duration` | `INTEGER` |  | `` |  |
| `album_id` | `TEXT` |  | `` |  |
| `album_name` | `TEXT` |  | `` |  |
| `album_url` | `TEXT` |  | `` |  |
| `album_thumbnail_url` | `TEXT` |  | `` |  |
| `artist_id` | `TEXT` |  | `` |  |
| `artist_name` | `TEXT` |  | `` |  |
| `adult` | `INTEGER` |  | `` |  |
| `song_cache` | `TEXT` |  | `` |  |
| `song_file_length` | `INTEGER` |  | `` |  |
| `song_order` | `INTEGER` | ✓ | `` |  |
| `create_at` | `INTEGER` | ✓ | `` |  |
| `play_count` | `INTEGER` |  | `` |  |
| `menu_id` | `TEXT` |  | `` |  |
| `v` | `TEXT` |  | `` |  |
| `_id` | `INTEGER` |  | `` |  |

---

#### music_playlist

- **레코드 수**: 0개

**컬럼 구조**:

| 컬럼명 | 타입 | NOT NULL | 기본값 | PK |
|--------|------|----------|--------|-----|
| `_id` | `INTEGER` |  | `` | ✓ |
| `song_id` | `TEXT` | ✓ | `` |  |
| `song_name` | `TEXT` |  | `` |  |
| `song_url` | `TEXT` |  | `` |  |
| `duration` | `INTEGER` |  | `` |  |
| `album_id` | `TEXT` |  | `` |  |
| `album_name` | `TEXT` |  | `` |  |
| `album_url` | `TEXT` |  | `` |  |
| `album_thumbnail_url` | `TEXT` |  | `` |  |
| `artist_id` | `TEXT` |  | `` |  |
| `artist_name` | `TEXT` |  | `` |  |
| `adult` | `INTEGER` |  | `` |  |
| `song_cache` | `TEXT` |  | `` |  |
| `song_file_length` | `INTEGER` |  | `` |  |
| `song_order` | `INTEGER` | ✓ | `` |  |
| `create_at` | `INTEGER` | ✓ | `` |  |
| `play_count` | `INTEGER` |  | `` |  |
| `menu_id` | `TEXT` |  | `` |  |
| `v` | `TEXT` |  | `` |  |

---

#### music_recent_playlist

- **레코드 수**: 0개

**컬럼 구조**:

| 컬럼명 | 타입 | NOT NULL | 기본값 | PK |
|--------|------|----------|--------|-----|
| `_id` | `INTEGER` | ✓ | `` | ✓ |
| `title` | `TEXT` | ✓ | `` |  |
| `writer` | `TEXT` | ✓ | `` |  |
| `thumbnails` | `TEXT` | ✓ | `` |  |
| `song_count` | `INTEGER` | ✓ | `` |  |
| `song_ids` | `TEXT` | ✓ | `` |  |
| `created_at` | `INTEGER` | ✓ | `` |  |

---

#### open_chat_member

- **레코드 수**: 2개

**컬럼 구조**:

| 컬럼명 | 타입 | NOT NULL | 기본값 | PK |
|--------|------|----------|--------|-----|
| `_id` | `INTEGER` |  | `` | ✓ |
| `link_id` | `INTEGER` | ✓ | `` |  |
| `user_id` | `INTEGER` | ✓ | `` |  |
| `type` | `INTEGER` | ✓ | `` |  |
| `profile_type` | `INTEGER` |  | `` |  |
| `link_member_type` | `INTEGER` | ✓ | `` |  |
| `nickname` | `TEXT` |  | `` |  |
| `profile_image_url` | `TEXT` |  | `` |  |
| `full_profile_image_url` | `TEXT` |  | `` |  |
| `original_profile_image_url` | `TEXT` |  | `` |  |
| `involved_chat_id` | `INTEGER` | ✓ | `` |  |
| `profile_link_id` | `INTEGER` |  | `` |  |
| `privilege` | `INTEGER` |  | `` |  |
| `report` | `INTEGER` | ✓ | `` |  |
| `enc` | `INTEGER` | ✓ | `` |  |

---

#### open_link

- **레코드 수**: 1개

**컬럼 구조**:

| 컬럼명 | 타입 | NOT NULL | 기본값 | PK |
|--------|------|----------|--------|-----|
| `id` | `INTEGER` |  | `` | ✓ |
| `user_id` | `INTEGER` | ✓ | `` |  |
| `token` | `INTEGER` |  | `` |  |
| `name` | `TEXT` |  | `` |  |
| `url` | `TEXT` |  | `` |  |
| `image_url` | `TEXT` |  | `` |  |
| `type` | `INTEGER` |  | `` |  |
| `member_limit` | `INTEGER` |  | `` |  |
| `direct_chat_limit` | `INTEGER` |  | `` |  |
| `active` | `INTEGER` |  | `` |  |
| `expired` | `INTEGER` |  | `` |  |
| `created_at` | `INTEGER` |  | `` |  |
| `view_type` | `INTEGER` |  | `` |  |
| `push_alert` | `INTEGER` |  | `` |  |
| `icon_url` | `TEXT` |  | `` |  |
| `v` | `TEXT` |  | `` |  |
| `searchable` | `INTEGER` |  | `` |  |
| `description` | `TEXT` |  | `` |  |

---

#### open_profile

- **레코드 수**: 1개

**컬럼 구조**:

| 컬럼명 | 타입 | NOT NULL | 기본값 | PK |
|--------|------|----------|--------|-----|
| `link_id` | `INTEGER` |  | `` | ✓ |
| `user_id` | `INTEGER` | ✓ | `` |  |
| `profile_type` | `INTEGER` | ✓ | `` |  |
| `link_member_type` | `INTEGER` | ✓ | `` |  |
| `nickname` | `TEXT` |  | `` |  |
| `profile_image_url` | `TEXT` |  | `` |  |
| `f_profile_image_url` | `TEXT` |  | `` |  |
| `o_profile_image_url` | `TEXT` |  | `` |  |
| `token` | `INTEGER` |  | `` |  |
| `profile_link_id` | `INTEGER` |  | `` |  |
| `privilege` | `INTEGER` |  | `` |  |
| `v` | `TEXT` |  | `` |  |

---

#### openchat_bot_command

- **레코드 수**: 0개

**컬럼 구조**:

| 컬럼명 | 타입 | NOT NULL | 기본값 | PK |
|--------|------|----------|--------|-----|
| `id` | `TEXT` | ✓ | `` | ✓ |
| `bot_id` | `INTEGER` | ✓ | `` |  |
| `chat_id` | `INTEGER` | ✓ | `` |  |
| `link_id` | `INTEGER` | ✓ | `` |  |
| `name` | `TEXT` | ✓ | `` |  |
| `description` | `TEXT` |  | `` |  |
| `revision` | `INTEGER` | ✓ | `` |  |
| `updated_at` | `INTEGER` | ✓ | `` |  |

---

#### plusfriend_add_info

- **레코드 수**: 0개

**컬럼 구조**:

| 컬럼명 | 타입 | NOT NULL | 기본값 | PK |
|--------|------|----------|--------|-----|
| `uuid` | `TEXT` | ✓ | `` | ✓ |
| `profile_id` | `TEXT` |  | `` |  |
| `click_id` | `TEXT` |  | `` |  |
| `ad_service_id` | `TEXT` |  | `` |  |
| `time_stamp` | `INTEGER` | ✓ | `` |  |
| `v` | `TEXT` |  | `` |  |
| `track_id` | `TEXT` |  | `` |  |

---

#### quick_view

- **레코드 수**: 0개

**컬럼 구조**:

| 컬럼명 | 타입 | NOT NULL | 기본값 | PK |
|--------|------|----------|--------|-----|
| `id` | `INTEGER` | ✓ | `` | ✓ |
| `chat_room_id` | `INTEGER` | ✓ | `` |  |
| `created_at` | `INTEGER` | ✓ | `` |  |
| `deleted_at` | `INTEGER` | ✓ | `` |  |
| `read_at` | `INTEGER` | ✓ | `` |  |
| `is_all_deleted` | `INTEGER` | ✓ | `` |  |

---

#### recent_sent_file

- **레코드 수**: 0개

**컬럼 구조**:

| 컬럼명 | 타입 | NOT NULL | 기본값 | PK |
|--------|------|----------|--------|-----|
| `messageId` | `INTEGER` | ✓ | `` | ✓ |
| `chat_log__id` | `INTEGER` |  | `` |  |
| `chat_log_id` | `INTEGER` | ✓ | `` |  |
| `chat_log_type` | `INTEGER` |  | `` |  |
| `chat_log_chat_id` | `INTEGER` | ✓ | `` |  |
| `chat_log_user_id` | `INTEGER` |  | `` |  |
| `chat_log_message` | `TEXT` |  | `` |  |
| `chat_log_attachment` | `TEXT` |  | `` |  |
| `chat_log_created_at` | `INTEGER` |  | `` |  |
| `chat_log_deleted_at` | `INTEGER` |  | `` |  |
| `chat_log_client_message_id` | `INTEGER` |  | `` |  |
| `chat_log_prev_id` | `INTEGER` |  | `` |  |
| `chat_log_referer` | `INTEGER` |  | `` |  |
| `chat_log_supplement` | `TEXT` |  | `` |  |
| `chat_log_v` | `TEXT` |  | `` |  |

---

#### recently_emoticons

- **레코드 수**: 0개

**컬럼 구조**:

| 컬럼명 | 타입 | NOT NULL | 기본값 | PK |
|--------|------|----------|--------|-----|
| `emoticon_id` | `INTEGER` |  | `` | ✓ |
| `last_used_at` | `INTEGER` |  | `` |  |
| `count_used` | `INTEGER` |  | `` |  |
| `v` | `TEXT` |  | `` |  |
| `item_id` | `TEXT` |  | `` |  |
| `item_category` | `INTEGER` | ✓ | `` |  |

---

#### recommended_friends

- **레코드 수**: 100개

**컬럼 구조**:

| 컬럼명 | 타입 | NOT NULL | 기본값 | PK |
|--------|------|----------|--------|-----|
| `_id` | `INTEGER` |  | `` | ✓ |
| `user_id` | `INTEGER` | ✓ | `` |  |
| `nick_name` | `TEXT` |  | `` |  |
| `profile_image_url` | `TEXT` |  | `` |  |
| `full_profile_image_url` | `TEXT` |  | `` |  |
| `original_profile_image_url` | `TEXT` |  | `` |  |
| `type` | `INTEGER` | ✓ | `` |  |
| `phone_number` | `TEXT` |  | `` |  |
| `status_message` | `TEXT` |  | `` |  |
| `uuid` | `TEXT` |  | `` |  |
| `account_id` | `INTEGER` |  | `` |  |
| `user_type` | `INTEGER` | ✓ | `` |  |
| `ext` | `TEXT` |  | `` |  |
| `screen_token` | `INTEGER` | ✓ | `` |  |
| `suspended` | `INTEGER` |  | `` |  |
| `direct_chat_id` | `INTEGER` | ✓ | `` |  |
| `access_permit` | `TEXT` |  | `` |  |
| `verified_creator` | `INTEGER` | ✓ | `` |  |
| `hidden` | `INTEGER` |  | `` |  |
| `suspected_impostor` | `INTEGER` | ✓ | `` |  |
| `enc` | `INTEGER` |  | `` |  |

---

#### room_master_table

- **레코드 수**: 1개

**컬럼 구조**:

| 컬럼명 | 타입 | NOT NULL | 기본값 | PK |
|--------|------|----------|--------|-----|
| `id` | `INTEGER` |  | `` | ✓ |
| `identity_hash` | `TEXT` |  | `` |  |

---

#### s2_events

- **레코드 수**: 0개

**컬럼 구조**:

| 컬럼명 | 타입 | NOT NULL | 기본값 | PK |
|--------|------|----------|--------|-----|
| `_id` | `INTEGER` |  | `` | ✓ |
| `date` | `TEXT` |  | `` |  |
| `page_id` | `TEXT` |  | `` |  |
| `action_id` | `INTEGER` |  | `` |  |
| `metadata` | `TEXT` |  | `` |  |
| `time_stamp` | `INTEGER` | ✓ | `` |  |

---

#### sqlite_sequence

- **레코드 수**: 4개

**컬럼 구조**:

| 컬럼명 | 타입 | NOT NULL | 기본값 | PK |
|--------|------|----------|--------|-----|
| `name` | `` |  | `` |  |
| `seq` | `` |  | `` |  |

---

#### tch_chat_log_meta

- **레코드 수**: 0개

**컬럼 구조**:

| 컬럼명 | 타입 | NOT NULL | 기본값 | PK |
|--------|------|----------|--------|-----|
| `chat_log_id` | `INTEGER` | ✓ | `0` | ✓ |
| `type` | `TEXT` | ✓ | `''` |  |
| `service_id` | `TEXT` | ✓ | `''` |  |
| `message_id` | `INTEGER` | ✓ | `0` |  |
| `need_refresh` | `INTEGER` | ✓ | `1` |  |
| `value` | `TEXT` | ✓ | `` |  |

---

#### tch_chat_log_side

- **레코드 수**: 0개

**컬럼 구조**:

| 컬럼명 | 타입 | NOT NULL | 기본값 | PK |
|--------|------|----------|--------|-----|
| `chat_id` | `INTEGER` | ✓ | `` | ✓ |
| `chat_log_id` | `INTEGER` | ✓ | `` | ✓ |
| `type` | `TEXT` | ✓ | `` | ✓ |
| `is_adult` | `INTEGER` | ✓ | `0` |  |
| `seq` | `INTEGER` | ✓ | `0` | ✓ |
| `contents` | `TEXT` | ✓ | `` |  |
| `major_version` | `INTEGER` | ✓ | `0` |  |
| `minor_version` | `INTEGER` | ✓ | `0` |  |
| `patch_version` | `INTEGER` | ✓ | `0` |  |
| `created_at` | `INTEGER` | ✓ | `` |  |

---

#### url_log

- **레코드 수**: 104개

**컬럼 구조**:

| 컬럼명 | 타입 | NOT NULL | 기본값 | PK |
|--------|------|----------|--------|-----|
| `chat_id` | `INTEGER` |  | `` | ✓ |
| `chat_room_id` | `INTEGER` |  | `` |  |
| `type` | `INTEGER` |  | `` |  |
| `url` | `TEXT` |  | `` |  |
| `title` | `TEXT` |  | `` |  |
| `description` | `TEXT` |  | `` |  |
| `image_url` | `TEXT` |  | `` |  |
| `created_at` | `INTEGER` |  | `` |  |
| `suspected` | `INTEGER` |  | `` |  |
| `user_id` | `INTEGER` |  | `` |  |
| `scrap_status` | `INTEGER` |  | `` |  |

---

## 3. 반응(Reaction) 데이터 분석

### 3.1 `v` 필드 구조

`chat_logs` 테이블의 `v` 필드는 메시지의 메타데이터를 JSON 형식으로 저장합니다.

**주요 키**:

- `notDecoded`: bool
- `origin`: str
- `c`: str
- `modifyRevision`: int
- `isSingleDefaultEmoticon`: bool
- `defaultEmoticonsCount`: int
- `isMine`: bool
- `enc`: int

**반응 관련 키**:

- `defaultEmoticonsCount`: 반응 개수 (정수)

### 3.2 `supplement` 필드 구조

`chat_logs` 테이블의 `supplement` 필드는 메시지의 추가 정보를 JSON 형식으로 저장합니다.
반응의 상세 정보는 여기에 포함됩니다.

### 3.3 반응 통계

- **v 필드가 있는 메시지 수**: 1,752개
- **반응이 있는 메시지 수**: 2개
- **총 반응 개수**: 2개

### 3.4 반응 데이터 샘플

**샘플 1** (msg_id: 8490):

```json
{
  "msg_id": 8490,
  "reaction_count": 1,
  "v": {
    "notDecoded": false,
    "origin": "MSG",
    "c": "12-15 23:31:23",
    "modifyRevision": 0,
    "isSingleDefaultEmoticon": false,
    "defaultEmoticonsCount": 1,
    "isMine": false,
    "enc": 31
  },
  "supplement": null
}
```

**샘플 2** (msg_id: 8489):

```json
{
  "msg_id": 8489,
  "reaction_count": 1,
  "v": {
    "notDecoded": false,
    "origin": "MSG",
    "c": "12-15 23:31:16",
    "modifyRevision": 0,
    "isSingleDefaultEmoticon": true,
    "defaultEmoticonsCount": 1,
    "isMine": false,
    "enc": 31
  },
  "supplement": null
}
```

---

## 4. 반응 감지 구현 가이드

### 4.1 반응 감지 방법

반응은 다음 두 가지 방법으로 감지할 수 있습니다:

#### 방법 1: `v` 필드의 `defaultEmoticonsCount` 확인

```python
# v 필드 파싱
v_data = json.loads(v_field) if isinstance(v_field, str) else v_field
reaction_count = v_data.get('defaultEmoticonsCount', 0)

if reaction_count > 0:
    print(f'반응 {reaction_count}개 발견')
```

#### 방법 2: `supplement` 필드의 `reactions` 배열 확인

```python
# supplement 필드 파싱
supplement_data = json.loads(supplement) if isinstance(supplement, str) else supplement
reactions = supplement_data.get('reactions', [])

if reactions:
    for reaction in reactions:
        reaction_type = reaction.get('type')
        reactor_id = reaction.get('userId')
        print(f'반응 타입: {reaction_type}, 반응자: {reactor_id}')
```

### 4.2 반응 감지 SQL 쿼리

```sql
-- 반응이 있는 메시지 조회
SELECT _id, v, supplement, type, message, created_at
FROM chat_logs
WHERE v IS NOT NULL AND v != ''
  AND json_extract(v, '$.defaultEmoticonsCount') > 0
ORDER BY created_at DESC
LIMIT 100;
```

### 4.3 반응 업데이트 감지

반응은 실시간으로 업데이트되므로, 주기적으로 `v` 필드를 폴링하여 변경사항을 감지해야 합니다:

```python
# 마지막 확인한 반응 개수 캐시
reaction_cache = {}  # msg_id -> {'count': int, 'last_check': float}

# 반응 업데이트 확인
def check_reaction_updates(msg_id, v_field):
    v_data = json.loads(v_field) if isinstance(v_field, str) else v_field
    current_count = v_data.get('defaultEmoticonsCount', 0)
    
    if msg_id in reaction_cache:
        cached_count = reaction_cache[msg_id]['count']
        if current_count != cached_count:
            # 반응 개수 변경 감지
            print(f'반응 개수 변경: {cached_count} -> {current_count}')
            reaction_cache[msg_id]['count'] = current_count
            return True
    else:
        reaction_cache[msg_id] = {'count': current_count, 'last_check': time.time()}
    
    return False
```

---

## 5. 참고 자료

- 기존 구현: `client/kakao_poller.py` (주석 처리된 반응 감지 로직 참고)
- 반응 문서: `REACTION_LOGIC_DOCUMENTATION.md`
