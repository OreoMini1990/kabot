# 카카오톡 봇 기능 개선 계획서 (최종 버전)

## 📋 문서 목적

이 문서는 카카오톡 봇의 구조적 문제를 해결하고, 외주 개발자가 실패 확률을 최소화하며 구현할 수 있도록 상세한 개선 계획을 제시합니다.

**작성일**: 2024-12-17  
**대상 시스템**: KakaoTalk Bot (Client-Python, Server-Node.js, Bridge-Android)  
**목표**: 구조적 개선을 통한 안정성 및 유지보수성 향상

---

## 🎯 핵심 설계 원칙

### 1. 복호화 단일화 (Single Source of Truth)
- **복호화는 클라이언트(Python)에서만 수행**
- 서버는 복호화된 JSON만 처리 (신뢰 가능한 데이터)
- **이유**: DB와 암호화 키가 클라이언트에 있으므로 가장 자연스러운 구조

### 2. 데이터 표준화
- `senderName`, `senderId`를 별도 필드로 전송 (파싱 최소화)
- `kakao_log_id` 기준으로 메시지 식별 통일
- 원본(raw) 데이터와 정규화된 데이터 모두 저장

### 3. 성능 최적화
- `msg_type` whitelist 기반으로만 attachment 복호화
- 필요한 경우에만 복호화 수행

### 4. 안정성 우선
- sender_id가 있을 때만 닉네임 변경 감지 확정 처리
- 오탐 방지를 위한 명확한 매칭 규칙

### 5. 관측 가능성 (Observability)
- 성공/실패 뿐만 아니라 실패 이유까지 로깅
- msg_type별 통계 및 샘플 데이터 수집

---

## 📊 현재 문제점 및 구조적 개선 방향

### 문제 1: 닉네임 표시 문제

**현상**: "랩장/AN/서" → "랩장"만 표시

**근본 원인**: 
- 서버에서 `sender.split('/')[0]`로 첫 부분만 추출
- 닉네임에 `/`가 포함될 수 있음을 고려하지 않음

**해결 방향**:
1. 클라이언트에서 `senderName`, `senderId`를 별도 필드로 전송
2. `raw_sender` 원본도 저장하여 추적 가능하게 함
3. 서버는 파싱을 최소화 (클라이언트가 이미 분리해서 보냄)

### 문제 2: 신고/반응/답장 기능 실패

**근본 원인**: 
1. `attachment` 필드 복호화 누락 → JSON 파싱 실패
2. 메시지 ID 기준 불명확 (`referer`, `src_message`, `logId` 등 혼재)

**해결 방향**:
1. 클라이언트에서 attachment 복호화 후 JSON 파싱
2. `kakao_log_id` 기준으로 메시지 식별 통일
3. 각 타입별 키 매핑 테이블 확정

### 문제 3: 이미지 첨부 질문글쓰기 실패

**근본 원인**: 
- 최근 5분 휴리스틱은 오탐 위험 높음 (동시 발화 시 오탐)

**해결 방향**:
- `(room, sender_id)` 키로 `pending_attachment` 캐시 사용
- 이미지 수신 시 캐시 저장, `!질문` 수신 시 캐시에서 조회

### 문제 4: 닉네임 변경 감지 실패

**근본 원인**:
- sender_id가 없을 때 최근 메시지로 추정하는 방식은 오탐 위험

**해결 방향**:
- sender_id가 있을 때만 확정적으로 처리
- sender_id 없으면 로깅만 하고 업데이트하지 않음

---

## 🔧 단계별 개선 계획

## 단계 1: 클라이언트-서버 데이터 구조 표준화

### 1.1 클라이언트 측: senderName/senderId 분리 전송

**파일**: `client/kakao_poller.py`

**변경 내용**:

현재 `send_to_server` 함수에서 WebSocket으로 전송하는 JSON 구조를 변경:

**기존 구조**:
```python
json_data = {
    "user_name": sender_name_decrypted,
    "sender": f"{sender_name_decrypted}/{user_id}",  # 파싱 필요
    # ...
}
```

**새 구조**:
```python
json_data = {
    "sender": f"{sender_name_decrypted}/{user_id}",  # 하위 호환성 유지
    "sender_name": sender_name_decrypted,  # ✅ 새 필드
    "sender_id": str(user_id) if user_id else None,  # ✅ 새 필드
    "raw_sender": sender,  # 원본 저장 (디버깅용)
    # ...
}
```

**구현 위치**: `send_to_server` 함수 내부 (약 1200줄 근처)

```python
def send_to_server(message_data, is_reaction=False):
    # ... (기존 코드)
    
    # 발신자 정보 정리
    sender_name_decrypted = None
    sender_name_encrypted = None
    # ... (기존 복호화 로직)
    
    # sender 필드 (하위 호환성 유지)
    if sender_name_decrypted:
        sender = f"{sender_name_decrypted}/{user_id}" if user_id else sender_name_decrypted
    elif sender_name_encrypted:
        sender = f"{sender_name_encrypted}/{user_id}" if user_id else sender_name_encrypted
    else:
        sender = str(user_id) if user_id else ""
    
    # JSON 데이터 구성
    json_data = {
        "_id": msg_id,  # 카카오톡 원본 logId (중요!)
        "chat_id": chat_id,
        "user_id": valid_user_id,
        "sender": sender,  # 하위 호환성 유지
        "sender_name": sender_name_decrypted,  # ✅ 정규화된 닉네임
        "sender_id": str(user_id) if user_id else None,  # ✅ user_id
        "raw_sender": sender,  # 원본 (디버깅용)
        # ... (나머지 필드)
    }
```

### 1.2 서버 측: senderName/senderId 우선 사용

**파일**: `server/server.js`

**변경 내용**:

`sender` 필드 파싱보다 `sender_name`, `sender_id` 필드를 우선 사용:

```javascript
// 기존 코드 (약 1740줄 근처)
let senderName = null;
let senderId = null;

if (sender && sender.includes('/')) {
  const senderParts = sender.split('/');
  senderName = senderParts[0].trim();
  senderId = senderParts[1] || null;
}

// 개선: json에서 분리된 필드 우선 사용
senderName = json?.sender_name || json?.senderName || null;
senderId = json?.sender_id || json?.senderId || json?.userId || null;

// fallback: sender 파싱 (하위 호환성)
if (!senderName && sender) {
  if (sender.includes('/')) {
    const parts = sender.split('/');
    // 마지막 부분이 숫자면 user_id로 간주
    const lastPart = parts[parts.length - 1];
    if (/^\d+$/.test(lastPart.trim())) {
      senderName = parts.slice(0, -1).join('/').trim();
      senderId = lastPart.trim();
    } else {
      senderName = parts[0].trim();
    }
  } else {
    senderName = sender.trim();
  }
}
```

**유틸리티 함수 개선**:

**파일**: `server/labbot-node.js`

```javascript
/**
 * 발신자 이름 추출 (json.sender_name 우선, fallback으로 sender 파싱)
 * @param {object} json - 메시지 JSON 데이터
 * @param {string} sender - 기존 sender 필드 (하위 호환성)
 * @returns {string|null} 발신자 이름
 */
function extractSenderName(json, sender) {
  // 1. json.sender_name 우선
  if (json?.sender_name || json?.senderName) {
    return json.sender_name || json.senderName;
  }
  
  // 2. fallback: sender 파싱
  if (sender) {
    const senderStr = String(sender);
    const parts = senderStr.split('/');
    
    if (parts.length === 1) {
      return /^\d+$/.test(senderStr.trim()) ? null : senderStr.trim();
    }
    
    // 마지막 부분이 숫자면 나머지 전체를 닉네임으로
    const lastPart = parts[parts.length - 1];
    if (/^\d+$/.test(lastPart.trim())) {
      return parts.slice(0, -1).join('/').trim();
    }
    
    return senderStr.trim();
  }
  
  return null;
}

/**
 * 발신자 ID 추출
 * @param {object} json - 메시지 JSON 데이터
 * @param {string} sender - 기존 sender 필드 (하위 호환성)
 * @returns {string|null} 발신자 ID
 */
function extractSenderId(json, sender) {
  // 1. json.sender_id 우선
  if (json?.sender_id || json?.senderId || json?.userId) {
    return json.sender_id || json.senderId || json.userId;
  }
  
  // 2. fallback: sender 파싱
  if (sender) {
    const parts = String(sender).split('/');
    const lastPart = parts[parts.length - 1];
    if (/^\d+$/.test(lastPart.trim())) {
      return lastPart.trim();
    }
  }
  
  return null;
}
```

### 1.3 DB 저장 시 raw_sender 저장

**파일**: `server/db/chat_logs_schema.sql`

**변경 내용**:

`chat_messages` 테이블에 `raw_sender` 컬럼 추가:

```sql
ALTER TABLE public.chat_messages 
ADD COLUMN IF NOT EXISTS raw_sender VARCHAR(512);  -- 원본 sender 문자열 (디버깅용)

-- 인덱스는 필요시 추가
CREATE INDEX IF NOT EXISTS idx_chat_messages_raw_sender ON public.chat_messages(raw_sender);
```

**파일**: `server/db/chatLogger.js`

```javascript
async function saveChatMessage(roomName, senderName, senderId, messageText, isGroupChat = true, metadata = null, replyToMessageId = null, threadId = null, rawSender = null) {
  // ... (기존 코드)
  
  const { data, error } = await db.supabase
    .from('chat_messages')
    .insert({
      // ... (기존 필드)
      sender_name: senderName,
      sender_id: senderId || null,
      raw_sender: rawSender || null,  // ✅ 원본 저장
      // ...
    })
    // ...
}
```

---

## 단계 2: attachment 복호화 구현 (클라이언트 전용)

### 2.1 복호화 함수 구현

**파일**: `client/kakao_poller.py`

**중요**: 복호화 함수 시그니처 확인
- 실제 시그니처: `KakaoDecrypt.decrypt(user_id, enc, cipher_b64)`
- 인자 순서: `(user_id, enc_type, encrypted_text)`

**구현 내용**:

```python
def decrypt_attachment(attachment, enc_type, my_user_id, message_type=None, message_id=None, debug=False):
    """
    attachment 필드 복호화 (Iris ObserverHelper.kt 방식)
    
    Args:
        attachment: attachment 필드 값 (문자열 또는 None)
        enc_type: 암호화 타입 (enc 값)
        my_user_id: 복호화에 사용할 user_id (MY_USER_ID)
        message_type: 메시지 타입 (선물 메시지는 복호화하지 않음)
        message_id: 메시지 ID (실패 캐시용)
        debug: 디버그 로그 출력 여부
    
    Returns:
        복호화된 attachment (dict 또는 None)
    """
    if not attachment or attachment == "{}" or attachment == "":
        return None
    
    # Iris 방식: 선물 메시지(type 71)는 복호화하지 않음
    if message_type == "71" or message_type == 71:
        if "선물" in str(attachment):
            if debug:
                print(f"[attachment 복호화] 선물 메시지 타입 71, 복호화 스킵")
            return None
    
    # 이미 JSON 형태인지 확인
    if isinstance(attachment, str):
        attachment_str = attachment.strip()
        if attachment_str.startswith('{') or attachment_str.startswith('['):
            # 이미 복호화된 JSON
            try:
                return json.loads(attachment_str)
            except json.JSONDecodeError:
                if debug:
                    print(f"[attachment 복호화] JSON 파싱 실패 (이미 JSON 형태)")
                return None
    
    # 암호화되어 있는지 확인 (base64 형태)
    if isinstance(attachment, str):
        attachment_str = attachment.strip()
        # base64로 보이는지 확인 (길이 > 10, base64 문자만 포함)
        is_base64_like = (
            len(attachment_str) > 10 and
            not attachment_str.startswith('{') and
            all(c in 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=' for c in attachment_str[:100])
        )
        
        if is_base64_like and KAKAODECRYPT_AVAILABLE and my_user_id:
            try:
                decrypt_user_id_int = int(my_user_id)
                if decrypt_user_id_int > 0:
                    # KakaoDecrypt.decrypt(user_id, enc, cipher_b64)
                    decrypted = KakaoDecrypt.decrypt(decrypt_user_id_int, enc_type, attachment_str)
                    
                    if decrypted and decrypted != attachment_str:
                        # 복호화 성공, JSON 파싱 시도
                        try:
                            result = json.loads(decrypted)
                            if debug:
                                print(f"[attachment 복호화] ✅ 성공: msg_id={message_id}, enc={enc_type}, 길이={len(decrypted)}")
                            return result
                        except json.JSONDecodeError as e:
                            if debug:
                                print(f"[attachment 복호화] ❌ JSON 파싱 실패: msg_id={message_id}, 오류={e}")
                            return None
                    else:
                        if debug:
                            print(f"[attachment 복호화] ❌ 복호화 실패: msg_id={message_id}, enc={enc_type}")
            except Exception as e:
                if debug:
                    print(f"[attachment 복호화] ❌ 예외: msg_id={message_id}, 오류={type(e).__name__}: {e}")
    
    # 복호화할 수 없거나 실패
    return None
```

### 2.2 msg_type whitelist 기반 복호화

**파일**: `client/kakao_poller.py`

**변경 내용**:

필요한 경우에만 attachment 복호화:

```python
# msg_type whitelist: attachment 복호화가 필요한 타입들
ATTACHMENT_DECRYPT_WHITELIST = {
    "26",  # 답장 메시지
    "70", "71", "72", "73", "74", "75", "76", "77", "78", "79",  # 반응 메시지
    "2", "12", "27",  # 이미지 메시지
    "12",  # Feed 메시지 (강퇴 등)
}

# poll_messages() 함수 내부 (약 1490줄)
attachment = msg[9]  # 첨부 정보

# attachment 복호화 (whitelist 기반)
attachment_decrypted = None
if msg_type_str in ATTACHMENT_DECRYPT_WHITELIST or msg_type in ATTACHMENT_DECRYPT_WHITELIST:
    attachment_decrypted = decrypt_attachment(
        attachment,
        enc_type,
        MY_USER_ID,
        msg_type_str,
        msg_id,
        debug=True
    )
```

### 2.3 복호화된 attachment에서 정보 추출

**파일**: `client/kakao_poller.py`

**변경 내용**:

복호화된 attachment에서 필요한 정보 추출:

```python
# 답장 메시지 ID 추출
reply_to_message_id = None
if referer:
    try:
        reply_to_message_id = int(referer) if referer else None
    except (ValueError, TypeError):
        pass

# 복호화된 attachment에서 src_message 추출
if not reply_to_message_id and attachment_decrypted:
    if isinstance(attachment_decrypted, dict):
        src_message_id = (attachment_decrypted.get("src_message") or 
                         attachment_decrypted.get("logId") or
                         attachment_decrypted.get("src_logId"))
        if src_message_id:
            try:
                reply_to_message_id = int(src_message_id)
            except (ValueError, TypeError):
                pass

# 반응 정보 추출
is_reaction = False
reaction_type = None
target_message_id = None

if attachment_decrypted and isinstance(attachment_decrypted, dict):
    # 반응 정보 확인
    if ("reaction" in attachment_decrypted or 
        "likeType" in attachment_decrypted or 
        "emoType" in attachment_decrypted):
        is_reaction = True
        
        # 반응 타입 추출 및 매핑
        reaction_type_raw = (attachment_decrypted.get("reaction") or 
                           attachment_decrypted.get("likeType") or 
                           attachment_decrypted.get("emoType"))
        
        emoji_map = {
            0: "heart",      # ❤️
            1: "thumbs_up",  # 👍
            2: "check",      # ✅
            3: "surprised",  # 😱
            4: "sad"         # 😢
        }
        
        if isinstance(reaction_type_raw, int) and reaction_type_raw in emoji_map:
            reaction_type = emoji_map[reaction_type_raw]
        elif isinstance(reaction_type_raw, str):
            reaction_type = reaction_type_raw
        
        # 대상 메시지 ID 추출
        target_message_id = (attachment_decrypted.get("message_id") or 
                           attachment_decrypted.get("target_id") or 
                           attachment_decrypted.get("logId") or 
                           attachment_decrypted.get("src_logId"))

# 이미지 정보 추출
has_image = False
image_url = None
if msg_type_str in ["2", "12", "27"] and attachment_decrypted:
    has_image = True
    if isinstance(attachment_decrypted, dict):
        image_url = (attachment_decrypted.get("url") or 
                    attachment_decrypted.get("path") or 
                    attachment_decrypted.get("path_1") or
                    attachment_decrypted.get("thumbnailUrl") or
                    attachment_decrypted.get("xl") or 
                    attachment_decrypted.get("l") or 
                    attachment_decrypted.get("m") or 
                    attachment_decrypted.get("s"))
```

### 2.4 서버로 전송 시 복호화된 attachment 포함

**파일**: `client/kakao_poller.py`

**변경 내용**:

복호화된 attachment를 JSON으로 직렬화하여 서버로 전송:

```python
# send_to_server 함수 내부
json_data = {
    # ... (기존 필드)
    "attachment": json.dumps(attachment_decrypted) if attachment_decrypted else attachment,  # 복호화된 것 우선
    "attachment_decrypted": attachment_decrypted,  # dict 형태 (서버에서 사용)
    "reply_to_message_id": reply_to_message_id,
    "reaction_type": reaction_type,
    "target_message_id": target_message_id,
    "has_image": has_image,
    "image_url": image_url,
    # ...
}
```

**중요**: 서버는 복호화된 attachment만 받으므로, 서버 측 복호화 로직은 제거하거나 fallback only로 축소

---

## 단계 3: kakao_log_id 기준 메시지 식별 통일

### 3.1 DB 스키마 확정

**파일**: `server/db/chat_logs_schema.sql`

**변경 내용**:

`chat_messages` 테이블에 `kakao_log_id` 컬럼 추가 및 인덱스 생성:

```sql
-- kakao_log_id 컬럼 추가 (카카오톡 원본 메시지 logId)
ALTER TABLE public.chat_messages 
ADD COLUMN IF NOT EXISTS kakao_log_id BIGINT;

-- 인덱스 생성 (신고/반응 등에서 조회 성능 향상)
CREATE INDEX IF NOT EXISTS idx_chat_messages_kakao_log_id ON public.chat_messages(kakao_log_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_room_kakao_log_id ON public.chat_messages(room_name, kakao_log_id);

-- metadata에서도 kakao_log_id 저장 (이중화)
-- metadata JSONB 필드에 "_id" 키로 저장됨 (기존 로직 유지)
```

### 3.2 클라이언트에서 kakao_log_id 전송

**파일**: `client/kakao_poller.py`

**변경 내용**:

`_id` 필드를 `kakao_log_id`로도 명시적으로 전송:

```python
json_data = {
    "_id": msg_id,  # 카카오톡 원본 logId
    "kakao_log_id": msg_id,  # ✅ 명시적 필드명
    # ...
}
```

### 3.3 서버에서 kakao_log_id 저장

**파일**: `server/db/chatLogger.js`

**변경 내용**:

`saveChatMessage` 함수에서 `kakao_log_id` 저장:

```javascript
async function saveChatMessage(roomName, senderName, senderId, messageText, isGroupChat = true, metadata = null, replyToMessageId = null, threadId = null, rawSender = null, kakaoLogId = null) {
  // ... (기존 코드)
  
  const { data, error } = await db.supabase
    .from('chat_messages')
    .insert({
      // ... (기존 필드)
      kakao_log_id: kakaoLogId || metadata?._id || null,  // ✅ kakao_log_id 저장
      metadata: {
        ...metadata,
        _id: kakaoLogId || metadata?._id,  // metadata에도 저장 (이중화)
      },
      // ...
    })
    // ...
}
```

**파일**: `server/server.js`

```javascript
// saveChatMessage 호출 시 kakao_log_id 전달
const savedMessage = await chatLogger.saveChatMessage(
  decryptedRoomName || '',
  senderName || '',
  senderId,
  messageText,
  true,
  {
    ...json,
    _id: json._id || json.kakao_log_id,  // metadata에 저장
  },
  replyToMessageId,
  threadId,
  sender,  // raw_sender
  json._id || json.kakao_log_id  // ✅ kakao_log_id
);
```

### 3.4 신고 기능에서 kakao_log_id 기준 검색

**파일**: `server/db/chatLogger.js`

**변경 내용**:

`saveReport` 함수에서 `kakao_log_id` 기준으로 메시지 검색:

```javascript
async function saveReport(reportedMessageId, reporterName, reporterId, reportReason, reportType = 'general') {
  try {
    console.log(`[신고] saveReport 시작: kakao_log_id=${reportedMessageId}, reporter=${reporterName}`);
    
    let message = null;
    
    // 1. kakao_log_id로 직접 검색 (우선)
    if (reportedMessageId) {
      const { data: messageByLogId } = await db.supabase
        .from('chat_messages')
        .select('*')
        .eq('kakao_log_id', reportedMessageId)
        .single();
      
      if (messageByLogId) {
        message = messageByLogId;
        console.log(`[신고] ✅ kakao_log_id로 찾음: id=${message.id}`);
      }
    }
    
    // 2. fallback: metadata._id로 검색
    if (!message && reportedMessageId) {
      const { data: messageByMetadata } = await db.supabase
        .from('chat_messages')
        .select('*')
        .eq('metadata->>_id', String(reportedMessageId))
        .single();
      
      if (messageByMetadata) {
        message = messageByMetadata;
        console.log(`[신고] ✅ metadata._id로 찾음: id=${message.id}`);
      }
    }
    
    // 3. fallback: DB id로 검색 (숫자인 경우)
    if (!message && reportedMessageId && /^\d+$/.test(String(reportedMessageId))) {
      const { data: messageById } = await db.supabase
        .from('chat_messages')
        .select('*')
        .eq('id', reportedMessageId)
        .single();
      
      if (messageById) {
        message = messageById;
        console.log(`[신고] ✅ DB id로 찾음: id=${message.id}`);
      }
    }
    
    // 메시지 찾기 실패해도 신고 기록은 저장
    const reportedMessageText = message?.message_text || '메시지를 찾을 수 없음';
    const reportedUserName = message?.sender_name || '알 수 없음';
    const reportedUserId = message?.sender_id || null;
    
    // ... (나머지 저장 로직)
  } catch (error) {
    console.error('[신고] saveReport 오류:', error.message);
    return null;
  }
}
```

### 3.5 attachment 키 매핑 테이블 문서화

**파일**: `ATTACHMENT_KEY_MAPPING.md` (새 파일)

**내용**:

각 메시지 타입별 attachment 키 매핑:

```markdown
# Attachment 키 매핑 테이블

## 답장 메시지 (type 26)

| 키 | 설명 | 예시 |
|---|---|---|
| `src_message` | 원본 메시지 logId | `1234567890` |
| `logId` | 원본 메시지 logId (별칭) | `1234567890` |

## 반응 메시지 (type 70-79)

| 키 | 설명 | 예시 |
|---|---|---|
| `reaction` | 반응 타입 (숫자) | `0` (heart), `1` (thumbs_up) |
| `likeType` | 좋아요 타입 (별칭) | `0` |
| `emoType` | 이모지 타입 (별칭) | `0` |
| `message_id` | 대상 메시지 logId | `1234567890` |
| `target_id` | 대상 메시지 logId (별칭) | `1234567890` |
| `logId` | 대상 메시지 logId (별칭) | `1234567890` |

## 이미지 메시지 (type 2, 12, 27)

| 키 | 설명 | 예시 |
|---|---|---|
| `url` | 이미지 URL | `https://...` |
| `path` | 이미지 경로 | `/path/to/image.jpg` |
| `path_1` | 이미지 경로 (별칭) | `/path/to/image.jpg` |
| `thumbnailUrl` | 썸네일 URL | `https://...` |
| `xl`, `l`, `m`, `s` | 다양한 크기 URL | `https://...` |

## Feed 메시지 (type 12)

| 키 | 설명 | 예시 |
|---|---|---|
| `feedType` | Feed 타입 | `6` (강퇴), `2` (퇴장) |
| `member` | 멤버 정보 | `{nickName: "...", userId: "..."}` |
| `kicker` | 강퇴한 사람 정보 | `{nickName: "...", userId: "..."}` |
```

---

## 단계 4: 이미지-질문 연결 개선 (캐시 사용)

### 4.1 서버 측 pending_attachment 캐시 구현

**파일**: `server/labbot-node.js`

**변경 내용**:

메모리 캐시로 `(room, sender_id)` 키로 이미지 URL 저장:

```javascript
// pending_attachment 캐시 (메모리)
// 구조: { "room_name|sender_id": { imageUrl: "...", timestamp: ... } }
const PENDING_ATTACHMENT_CACHE = new Map();
const ATTACHMENT_CACHE_TTL = 10 * 60 * 1000;  // 10분

/**
 * pending attachment 캐시에 이미지 저장
 * @param {string} roomName - 채팅방 이름
 * @param {string} senderId - 발신자 ID
 * @param {string} imageUrl - 이미지 URL
 */
function setPendingAttachment(roomName, senderId, imageUrl) {
  if (!roomName || !senderId || !imageUrl) {
    return;
  }
  
  const key = `${roomName}|${senderId}`;
  PENDING_ATTACHMENT_CACHE.set(key, {
    imageUrl: imageUrl,
    timestamp: Date.now()
  });
  
  console.log(`[이미지 캐시] 저장: key=${key}, url=${imageUrl.substring(0, 50)}...`);
  
  // TTL 체크용 타이머는 별도로 관리하지 않고, 조회 시 체크
}

/**
 * pending attachment 캐시에서 이미지 조회 및 삭제
 * @param {string} roomName - 채팅방 이름
 * @param {string} senderId - 발신자 ID
 * @returns {string|null} 이미지 URL 또는 null
 */
function getAndClearPendingAttachment(roomName, senderId) {
  if (!roomName || !senderId) {
    return null;
  }
  
  const key = `${roomName}|${senderId}`;
  const cached = PENDING_ATTACHMENT_CACHE.get(key);
  
  if (!cached) {
    return null;
  }
  
  // TTL 체크
  const age = Date.now() - cached.timestamp;
  if (age > ATTACHMENT_CACHE_TTL) {
    PENDING_ATTACHMENT_CACHE.delete(key);
    console.log(`[이미지 캐시] 만료됨: key=${key}, age=${age}ms`);
    return null;
  }
  
  // 조회 후 삭제
  PENDING_ATTACHMENT_CACHE.delete(key);
  console.log(`[이미지 캐시] 조회 및 삭제: key=${key}, url=${cached.imageUrl.substring(0, 50)}...`);
  
  return cached.imageUrl;
}

/**
 * 오래된 캐시 항목 정리 (주기적으로 호출)
 */
function cleanupPendingAttachmentCache() {
  const now = Date.now();
  let cleaned = 0;
  
  for (const [key, cached] of PENDING_ATTACHMENT_CACHE.entries()) {
    const age = now - cached.timestamp;
    if (age > ATTACHMENT_CACHE_TTL) {
      PENDING_ATTACHMENT_CACHE.delete(key);
      cleaned++;
    }
  }
  
  if (cleaned > 0) {
    console.log(`[이미지 캐시] 정리 완료: ${cleaned}개 항목 삭제`);
  }
}

// 주기적으로 캐시 정리 (5분마다)
setInterval(cleanupPendingAttachmentCache, 5 * 60 * 1000);
```

### 4.2 이미지 메시지 수신 시 캐시 저장

**파일**: `server/server.js`

**변경 내용**:

이미지 메시지 저장 시 캐시에도 저장:

```javascript
// 이미지 첨부 정보 저장 부분 (약 1980줄)
if (savedMessage && json) {
  try {
    const msgType = json.msg_type || json.type;
    const imageTypes = [2, 12, 27, '2', '12', '27'];
    
    if (imageTypes.includes(msgType)) {
      const attachmentDecrypted = json.attachment_decrypted;
      
      if (attachmentDecrypted && typeof attachmentDecrypted === 'object') {
        const imageUrl = attachmentDecrypted.url || attachmentDecrypted.path || ...;
        
        if (imageUrl) {
          // DB에 저장
          await chatLogger.saveAttachment(...);
          
          // 캐시에 저장
          const { setPendingAttachment } = require('./labbot-node');
          setPendingAttachment(
            decryptedRoomName || '',
            senderId,
            imageUrl
          );
        }
      }
    }
  } catch (imgErr) {
    console.error('[이미지 저장] ❌ 실패:', imgErr.message);
  }
}
```

### 4.3 질문 명령어 처리 시 캐시 조회

**파일**: `server/labbot-node.js`

**변경 내용**:

`!질문` 명령어 처리 시 캐시에서 이미지 조회:

```javascript
// !질문 명령어 처리 부분 (약 1340줄)
if (msgTrimmed.startsWith('!질문')) {
  // ... (기존 코드)
  
  // 캐시에서 이미지 조회 (우선)
  let previousMessageImage = getAndClearPendingAttachment(room, senderId || questionSenderId);
  
  // 캐시에서 못 찾으면 DB 조회 (fallback)
  if (!previousMessageImage) {
    try {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      const recentMessages = await chatLogger.getChatMessagesByPeriod(
        room,
        fiveMinutesAgo,
        new Date().toISOString(),
        20
      );
      
      for (const msg of recentMessages) {
        if (msg.sender_id === senderId || msg.sender_name === questionSenderName) {
          const { data: attachments } = await db.supabase
            .from('message_attachments')
            .select('attachment_url')
            .eq('message_id', msg.id)
            .eq('attachment_type', 'image')
            .limit(1)
            .single();
          
          if (attachments && attachments.attachment_url) {
            previousMessageImage = attachments.attachment_url;
            break;
          }
        }
      }
    } catch (error) {
      console.error('[네이버 카페] 이전 이미지 조회 실패:', error.message);
    }
  }
  
  // ... (나머지 코드)
}
```

---

## 단계 5: 닉네임 변경 감지 개선 (sender_id 필수)

### 5.1 checkNicknameChange 함수 개선

**파일**: `server/db/chatLogger.js`

**변경 내용**:

sender_id가 있을 때만 확정적으로 처리:

```javascript
async function checkNicknameChange(roomName, senderName, senderId) {
  try {
    // sender_id가 없으면 감지 불가 (안전하게 처리)
    if (!senderId) {
      console.log('[닉네임 변경] sender_id 없음, 감지 불가:', {
        room_name: roomName,
        sender_name: senderName
      });
      return null;  // 확정 불가, 로깅만
    }
    
    // senderName도 없으면 처리 불가
    if (!senderName) {
      console.log('[닉네임 변경] sender_name 없음, 감지 불가:', {
        room_name: roomName,
        sender_id: senderId
      });
      return null;
    }
    
    // sender_id로 사용자 조회
    const { data: existingUser } = await db.supabase
      .from('users')
      .select('id, display_name, kakao_user_id')
      .eq('kakao_user_id', senderId)
      .single();
    
    if (!existingUser) {
      // 새 사용자이므로 변경 없음
      console.log('[닉네임 변경] 새 사용자:', {
        sender_id: senderId,
        sender_name: senderName
      });
      return null;
    }
    
    // 이름 변경 확인
    if (existingUser.display_name === senderName) {
      // 이름이 같으면 변경 없음
      return null;
    }
    
    // 이름이 변경된 경우
    console.log('[닉네임 변경] ✅ 변경 감지:', {
      user_id: existingUser.id,
      kakao_user_id: existingUser.kakao_user_id,
      old_name: existingUser.display_name,
      new_name: senderName,
      room_name: roomName
    });
    
    // 이름 변경 이력 저장
    const { error: historyError } = await db.supabase
      .from('user_name_history')
      .insert({
        user_id: existingUser.id,
        old_name: existingUser.display_name,
        new_name: senderName,
        changed_at: new Date().toISOString()
      });
    
    if (historyError) {
      console.error('[닉네임 변경] 이력 저장 실패:', historyError.message);
    }
    
    // 전체 변경 이력 조회 및 알림 생성
    const { data: allHistory } = await db.supabase
      .from('user_name_history')
      .select('*')
      .eq('user_id', existingUser.id)
      .order('changed_at', { ascending: true });
    
    if (allHistory && allHistory.length > 0) {
      const historyLines = allHistory.map(h => {
        const date = new Date(h.changed_at).toISOString().split('T')[0];
        return `\t- ${date} : ${h.old_name} → ${h.new_name}`;
      });
      
      const currentDate = new Date().toISOString().split('T')[0];
      historyLines.push(`\t- ${currentDate} : ${existingUser.display_name} → ${senderName}`);
      
      const notification = `🚨 닉네임 변경 감지!\n\n닉네임 변경 되셨습니다. 닉네임변경이력 채팅로그에 변경이력 기록\n\n[닉네임 변경 이력]\n${historyLines.join('\n')}`;
      return notification;
    } else {
      const notification = `🚨 닉네임 변경 감지!\n\n닉네임 변경 되셨습니다. 닉네임변경이력 채팅로그에 변경이력 기록\n\n${existingUser.display_name} → ${senderName}`;
      return notification;
    }
  } catch (error) {
    console.error('[닉네임 변경] 오류:', error.message);
    return null;
  }
}
```

---

## 단계 6: 로깅 및 관측 가능성 강화

### 6.1 복호화 성공/실패 로깅

**파일**: `client/kakao_poller.py`

**변경 내용**:

복호화 실패 이유를 코드로 분류하여 로깅:

```python
# 복호화 실패 코드
DECRYPT_FAIL_REASON = {
    "EMPTY": "empty_attachment",
    "ALREADY_JSON": "already_json",
    "NOT_BASE64": "not_base64",
    "DECRYPT_API_FAIL": "decrypt_api_failed",
    "JSON_PARSE_FAIL": "json_parse_failed",
    "UNKNOWN": "unknown_error"
}

def decrypt_attachment(attachment, enc_type, my_user_id, message_type=None, message_id=None, debug=False):
    # ... (기존 코드)
    
    # 실패 이유 추적
    fail_reason = None
    
    if not attachment or attachment == "{}" or attachment == "":
        fail_reason = DECRYPT_FAIL_REASON["EMPTY"]
        if debug:
            print(f"[attachment 복호화] ❌ {fail_reason}: msg_id={message_id}")
        return None
    
    # ... (복호화 로직)
    
    # 실패 시 로깅
    if fail_reason:
        print(f"[attachment 복호화] ❌ 실패: msg_id={message_id}, reason={fail_reason}, enc={enc_type}")
    
    return None
```

### 6.2 msg_type별 통계 수집

**파일**: `server/server.js`

**변경 내용**:

msg_type별 처리 통계 수집 (간단한 로깅):

```javascript
// 통계 수집 (메모리)
const MSG_TYPE_STATS = {
  total: 0,
  byType: {},
  decryptSuccess: 0,
  decryptFail: 0
};

// 메시지 처리 시 통계 업데이트
function updateMsgTypeStats(msgType, decryptSuccess = null) {
  MSG_TYPE_STATS.total++;
  
  const typeStr = String(msgType || 'unknown');
  if (!MSG_TYPE_STATS.byType[typeStr]) {
    MSG_TYPE_STATS.byType[typeStr] = { count: 0, decryptSuccess: 0, decryptFail: 0 };
  }
  MSG_TYPE_STATS.byType[typeStr].count++;
  
  if (decryptSuccess === true) {
    MSG_TYPE_STATS.decryptSuccess++;
    MSG_TYPE_STATS.byType[typeStr].decryptSuccess++;
  } else if (decryptSuccess === false) {
    MSG_TYPE_STATS.decryptFail++;
    MSG_TYPE_STATS.byType[typeStr].decryptFail++;
  }
}

// 주기적으로 통계 출력 (10분마다)
setInterval(() => {
  console.log('[통계] msg_type별 처리:', JSON.stringify(MSG_TYPE_STATS, null, 2));
}, 10 * 60 * 1000);
```

---

## 단계 7: 테스트 샘플 데이터 준비

### 7.1 샘플 데이터 구조

**파일**: `tests/sample_data/` (새 디렉토리)

각 메시지 타입별 샘플 데이터:

```
tests/sample_data/
├── message_type_0.json      # 일반 텍스트 메시지
├── message_type_2.json      # 이미지 메시지
├── message_type_26.json     # 답장 메시지
├── message_type_70.json     # 반응 메시지 (하트)
├── message_type_71.json     # 반응 메시지 (좋아요)
├── feed_type_6.json         # 강퇴 Feed
└── README.md                # 샘플 데이터 설명
```

**예시**: `message_type_26.json`

```json
{
  "description": "답장 메시지 샘플",
  "db_row": {
    "_id": 1234567890,
    "chat_id": 987654321,
    "user_id": 111222333,
    "message": "답장 메시지 내용",
    "attachment": "암호화된_attachment_base64...",
    "type": "26",
    "v": "{\"enc\":31,\"origin\":\"MSG\"}"
  },
  "decrypted": {
    "message": "답장 메시지 내용",
    "attachment": {
      "src_message": 1234567889,
      "logId": 1234567889
    }
  },
  "server_payload": {
    "type": "message",
    "_id": 1234567890,
    "kakao_log_id": 1234567890,
    "chat_id": "987654321",
    "sender_name": "사용자닉네임",
    "sender_id": "111222333",
    "message": "답장 메시지 내용",
    "attachment_decrypted": {
      "src_message": 1234567889,
      "logId": 1234567889
    },
    "reply_to_message_id": 1234567889
  }
}
```

---

## 📋 구현 체크리스트 (우선순위 순)

### Phase 1: 구조 개선 (필수)

- [ ] **1.1** 클라이언트: `sender_name`, `sender_id` 별도 필드 전송
- [ ] **1.2** 서버: `extractSenderName`, `extractSenderId` 함수 구현 및 적용
- [ ] **1.3** DB: `raw_sender`, `kakao_log_id` 컬럼 추가 및 저장

### Phase 2: 복호화 구현 (필수)

- [ ] **2.1** 클라이언트: `decrypt_attachment` 함수 구현
- [ ] **2.2** 클라이언트: msg_type whitelist 기반 복호화 적용
- [ ] **2.3** 클라이언트: 복호화된 attachment에서 정보 추출
- [ ] **2.4** 클라이언트: 서버로 복호화된 attachment 전송

### Phase 3: 메시지 식별 통일 (필수)

- [ ] **3.1** 클라이언트: `kakao_log_id` 필드 전송
- [ ] **3.2** 서버: `kakao_log_id` 저장
- [ ] **3.3** 서버: 신고 기능에서 `kakao_log_id` 기준 검색
- [ ] **3.4** 문서: `ATTACHMENT_KEY_MAPPING.md` 작성

### Phase 4: 이미지-질문 연결 (중요)

- [ ] **4.1** 서버: `pending_attachment` 캐시 구현
- [ ] **4.2** 서버: 이미지 메시지 수신 시 캐시 저장
- [ ] **4.3** 서버: 질문 명령어 처리 시 캐시 조회

### Phase 5: 닉네임 변경 감지 (중요)

- [ ] **5.1** 서버: `checkNicknameChange` 함수 개선 (sender_id 필수)

### Phase 6: 로깅/관측 (권장)

- [ ] **6.1** 클라이언트: 복호화 실패 이유 로깅
- [ ] **6.2** 서버: msg_type별 통계 수집

### Phase 7: 테스트 샘플 (권장)

- [ ] **7.1** 샘플 데이터 수집 및 문서화

---

## ⚠️ 주의사항

### 1. 하위 호환성 유지
- `sender` 필드는 계속 전송 (기존 코드 호환성)
- 서버는 `sender_name`, `sender_id` 우선 사용, `sender`는 fallback

### 2. 복호화 실패 처리
- 복호화 실패 시 원본 데이터 반환
- 에러 발생 시 서버 동작 중단하지 않도록 try-catch 필수

### 3. 성능
- attachment 복호화는 whitelist 기반으로만 수행
- 캐시 TTL 관리로 메모리 누수 방지

### 4. 롤백 전략
- Feature flag 사용 고려 (환경변수로 기능 on/off)
- 단계별 배포 권장 (Phase 1 → 2 → 3 순서)

---

## 📚 참고 자료

- **Iris 원본 코드**: `ref/Iris-main/app/src/main/java/party/qwer/iris/ObserverHelper.kt`
- **복호화 모듈**: `client/kakaodecrypt.py` (시그니처: `decrypt(user_id, enc, cipher_b64)`)
- **문제 분석 문서**: `ISSUE_IMPROVEMENT_PROPOSAL.md`
- **테스트 체크리스트**: `TEST_CHECKLIST.md`

---

## 📞 문의

개선 작업 중 문제가 발생하면 다음을 확인하세요:
1. 클라이언트 로그 (복호화 성공/실패 로그)
2. 서버 로그 (msg_type별 통계)
3. DB 데이터 (kakao_log_id 저장 여부)
4. 샘플 데이터와 비교

