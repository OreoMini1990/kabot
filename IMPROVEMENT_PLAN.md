# 카카오톡 봇 기능 개선 계획서

## 📋 문서 목적

이 문서는 카카오톡 봇의 현재 문제점을 분석하고, 외부 개발자가 이해하기 쉽도록 상세한 개선 계획을 제시합니다.

**작성일**: 2024-12-17  
**대상 시스템**: KakaoTalk Bot (Client-Python, Server-Node.js, Bridge-Android)

---

## 📊 현재 문제점 요약

### 1. 닉네임 표시 문제
- **현상**: 닉네임이 "랩장/AN/서"인데 "랩장"만 표시됨
- **영향**: 무단 홍보 감지, 신고 기능 등에서 잘못된 닉네임 표시
- **원인**: `sender.split('/')[0]`로 첫 번째 부분만 추출

### 2. 신고 기능 작동 안 함
- **현상**: 답장 버튼 + `!신고` 입력 시 "신고 방법 안내" 메시지만 출력
- **원인**: `replyToMessageId`가 전달되지 않음 (attachment 복호화 실패 가능)

### 3. 반응 감지 작동 안 함
- **현상**: 하트(❤️), 좋아요(👍) 등 반응 이모지가 감지되지 않음
- **원인**: attachment 필드 복호화 미실시로 반응 정보 추출 실패

### 4. 이미지 첨부 질문글쓰기 작동 안 함
- **현상**: `!질문` 전에 이미지 전송 후 질문 시 이미지가 첨부되지 않음
- **원인**: 이미지 타입 감지 및 저장 실패 (attachment 복호화 미실시)

### 5. 닉네임 변경 감지 작동 안 함
- **현상**: 닉네임 변경 시 알림이 나오지 않음
- **원인**: `senderId` 전달 문제 또는 사용자 조회 실패

---

## 🔍 핵심 원인: attachment 필드 복호화 누락

### 문제 분석

Iris 원본 코드 (`ObserverHelper.kt`)를 보면 `attachment` 필드도 복호화가 필요합니다:

```kotlin
// Iris ObserverHelper.kt
try {
    if (message.isNotEmpty() && message != "{}") 
        message = KakaoDecrypt.decrypt(enc, message, userId)
} catch (e: Exception) {
    println("failed to decrypt message: $e")
}

try {
    if ((message.contains("선물") && messageType == "71") or (attachment == null)) {
        attachment = "{}"
    } else if (attachment.isNotEmpty() && attachment != "{}") {
        attachment = KakaoDecrypt.decrypt(enc, attachment, userId)
    }
} catch (e: Exception) {
    println("failed to decrypt attachment: $e")
}
```

**현재 코드의 문제점:**
- `client/kakao_poller.py`와 `server/server.js`에서 `attachment` 필드를 복호화하지 않고 JSON 파싱 시도
- 암호화된 `attachment`는 base64 문자열이므로 JSON 파싱 실패
- 결과적으로 반응 정보, 이미지 정보, 답장 메시지 ID 등이 추출되지 않음

---

## 📝 개선 계획 상세

### 단계 1: 닉네임 전체 사용하도록 개선

#### 1.1 문제 상세 분석

**현재 구조:**
```javascript
// server/labbot-node.js
function extractSenderName(sender) {
    const parts = String(sender).split('/');
    if (parts.length > 1) {
        return parts[0].trim();  // ❌ 첫 부분만 반환
    }
    return sender;
}
```

**실제 데이터 형식:**
- 클라이언트에서 전송: `"랩장/AN/서/{user_id}"`
- 서버에서 추출: `parts[0] = "랩장"` (잘못됨)
- 올바른 추출: 마지막 부분이 숫자(user_id)이면 나머지 전체를 닉네임으로 사용

#### 1.2 개선 방안

**파일**: `server/labbot-node.js`

**변경 내용:**

```javascript
/**
 * 발신자 이름 추출 (sender가 user_id만 있으면 처리)
 * @param {string} sender - "닉네임/AN/서/user_id" 형식 또는 "user_id"
 * @returns {string|null} 발신자 이름 또는 null
 */
function extractSenderName(sender) {
    if (!sender) return null;
    
    const senderStr = String(sender);
    const parts = senderStr.split('/');
    
    // 슬래시가 없으면 전체가 닉네임이거나 user_id
    if (parts.length === 1) {
        // 숫자만 있으면 user_id로 판단하여 null 반환
        if (/^\d+$/.test(senderStr.trim())) {
            return null;
        }
        // 그 외는 그대로 반환 (닉네임)
        return senderStr.trim();
    }
    
    // 마지막 부분이 숫자(user_id)인지 확인
    const lastPart = parts[parts.length - 1];
    if (/^\d+$/.test(lastPart.trim())) {
        // 마지막 부분이 user_id이면 나머지 전체를 닉네임으로 사용
        // 예: "랩장/AN/서/123456" -> "랩장/AN/서"
        return parts.slice(0, -1).join('/').trim();
    }
    
    // 마지막 부분이 숫자가 아니면 전체를 닉네임으로 간주
    // (슬래시가 포함된 닉네임일 수 있음)
    return senderStr.trim();
}

/**
 * 발신자 ID 추출
 * @param {string} sender - "닉네임/AN/서/user_id" 형식 또는 "user_id"
 * @returns {string|null} 발신자 ID 또는 null
 */
function extractSenderId(sender) {
    if (!sender) return null;
    
    const senderStr = String(sender);
    const parts = senderStr.split('/');
    
    // 마지막 부분이 숫자(user_id)인지 확인
    const lastPart = parts[parts.length - 1];
    if (/^\d+$/.test(lastPart.trim())) {
        return lastPart.trim();
    }
    
    return null;
}
```

**변경 필요 파일:**
- `server/labbot-node.js`: `extractSenderName`, `extractSenderId` 함수 수정
- `server/server.js`: 모든 `sender.split('/')[0]`, `sender.split('/')[1]` 호출 부분을 함수로 변경

**DB 저장 개선:**

DB에 저장할 때도 전체 닉네임을 저장해야 합니다:

```javascript
// server/server.js
// saveChatMessage 호출 시
await chatLogger.saveChatMessage(
    roomName,
    senderName,  // 전체 닉네임 ("랩장/AN/서")
    senderId,    // user_id만
    messageText,
    ...
);
```

**영향 받는 기능:**
- 무단 홍보 감지 메시지
- 닉네임 변경 감지
- 신고 기능
- 메시지 삭제 경고
- 비속어 경고
- 모든 알림 메시지

---

### 단계 2: attachment 필드 복호화 구현

#### 2.1 클라이언트 측 복호화

**파일**: `client/kakao_poller.py`

**위치**: `poll_messages()` 함수 내부, `attachment` 필드 사용 전

**변경 내용:**

```python
def decrypt_attachment(attachment, enc_type, my_user_id, message_type=None):
    """
    attachment 필드 복호화 (Iris ObserverHelper.kt 방식)
    
    Args:
        attachment: attachment 필드 값 (문자열 또는 None)
        enc_type: 암호화 타입 (enc 값)
        my_user_id: 복호화에 사용할 user_id (MY_USER_ID)
        message_type: 메시지 타입 (선물 메시지는 복호화하지 않음)
    
    Returns:
        복호화된 attachment (문자열) 또는 원본
    """
    if not attachment or attachment == "{}" or attachment == "":
        return attachment
    
    # Iris 방식: 선물 메시지(type 71)는 복호화하지 않음
    if message_type == "71" and "선물" in str(attachment):
        return "{}"
    
    try:
        # JSON 형태가 아니면 복호화 시도 (암호화되어 있을 가능성)
        if isinstance(attachment, str):
            # 이미 JSON 형태인지 확인
            if attachment.strip().startswith('{') or attachment.strip().startswith('['):
                # 이미 복호화된 JSON
                return attachment
            
            # base64 형태인지 확인 (암호화된 것으로 간주)
            if len(attachment) > 10 and not attachment.strip().startswith('{'):
                # 복호화 시도
                if KAKAODECRYPT_AVAILABLE and my_user_id:
                    try:
                        decrypt_user_id_int = int(my_user_id)
                        if decrypt_user_id_int > 0:
                            decrypted = KakaoDecrypt.decrypt(
                                decrypt_user_id_int, 
                                enc_type, 
                                attachment
                            )
                            if decrypted and decrypted != attachment:
                                print(f"[attachment 복호화] ✅ 성공: enc={enc_type}, 길이={len(decrypted)}")
                                return decrypted
                    except Exception as e:
                        print(f"[attachment 복호화] ❌ 실패: enc={enc_type}, 오류={type(e).__name__}: {e}")
    except Exception as e:
        print(f"[attachment 복호화] 예외: {type(e).__name__}: {e}")
    
    # 복호화 실패 시 원본 반환
    return attachment
```

**적용 위치:**

`poll_messages()` 함수 내부에서 `attachment`를 사용하기 전에 복호화:

```python
# 현재 코드 (약 1490줄 근처)
attachment = msg[9]  # 첨부 정보

# 개선: 복호화 추가
attachment = decrypt_attachment(
    attachment, 
    enc_type, 
    MY_USER_ID, 
    msg_type
)

# 이후 attachment 사용 코드는 그대로
```

**영향:**
- 반응 메시지 감지 개선
- 답장 메시지 ID 추출 개선
- 이미지 정보 추출 개선
- Feed 메시지 (강퇴 등) 감지 개선

#### 2.2 서버 측 복호화

**파일**: `server/server.js`

**위치**: `attachment` 필드 사용 전 (약 1180줄 근처, Feed 메시지 처리 부분)

**변경 내용:**

```javascript
/**
 * attachment 필드 복호화 (Iris ObserverHelper.kt 방식)
 * @param {string|object} attachment - attachment 필드 값
 * @param {number} encType - 암호화 타입
 * @param {string} myUserId - 복호화에 사용할 user_id
 * @param {string|number} messageType - 메시지 타입 (선물 메시지는 복호화하지 않음)
 * @returns {object|null} 복호화 및 파싱된 attachment 객체
 */
function decryptAttachment(attachment, encType, myUserId, messageType) {
  if (!attachment || attachment === '{}' || attachment === '') {
    return null;
  }
  
  // 이미 객체인 경우 그대로 반환
  if (typeof attachment === 'object') {
    return attachment;
  }
  
  // 문자열인 경우
  let attachmentStr = String(attachment);
  
  // 이미 JSON 형태인지 확인
  if (attachmentStr.trim().startsWith('{') || attachmentStr.trim().startsWith('[')) {
    try {
      return JSON.parse(attachmentStr);
    } catch (e) {
      // 파싱 실패 시 null 반환
      return null;
    }
  }
  
  // Iris 방식: 선물 메시지(type 71)는 복호화하지 않음
  if (messageType === '71' || messageType === 71) {
    if (attachmentStr.includes('선물')) {
      return null;
    }
  }
  
  // base64 형태인지 확인 (암호화된 것으로 간주)
  if (attachmentStr.length > 10 && !attachmentStr.trim().startsWith('{')) {
    try {
      // 복호화 시도
      const decrypted = decryptKakaoTalkMessage(attachmentStr, String(myUserId), encType || 31);
      if (decrypted && decrypted !== attachmentStr) {
        // 복호화 성공, JSON 파싱 시도
        if (decrypted.trim().startsWith('{') || decrypted.trim().startsWith('[')) {
          try {
            return JSON.parse(decrypted);
          } catch (e) {
            console.error('[attachment 복호화] JSON 파싱 실패:', e.message);
            return null;
          }
        }
      }
    } catch (e) {
      console.error('[attachment 복호화] 복호화 실패:', e.message);
    }
  }
  
  return null;
}
```

**적용 위치:**

1. **Feed 메시지 처리 부분** (약 1180줄):

```javascript
// 기존 코드
const attachment = messageData.json?.attachment;
let feedData = null;
if (attachment) {
  try {
    feedData = typeof attachment === 'string' ? JSON.parse(attachment) : attachment;
  } catch (e) {
    // 파싱 실패는 무시
  }
}

// 개선: 복호화 함수 사용
const attachment = messageData.json?.attachment;
const encType = messageData.json?.encType || messageData.json?.v?.enc || 31;
const myUserId = messageData.json?.myUserId || messageData.json?.userId;
const msgType = messageData.json?.msg_type || messageData.json?.type;

const feedData = decryptAttachment(attachment, encType, myUserId, msgType);
```

2. **반응 메시지 처리 부분** (약 1240줄):

```javascript
// attachment에서 반응 정보 추출 전에 복호화
const attachmentData = decryptAttachment(
  messageData.json?.attachment,
  messageData.json?.encType || 31,
  messageData.json?.myUserId || messageData.json?.userId,
  messageData.json?.msg_type || messageData.json?.type
);
```

3. **이미지 저장 부분** (약 1980줄):

```javascript
// 이미지 타입 확인 전에 복호화
const attachmentData = decryptAttachment(
  json.attachment,
  json.encType || json.v?.enc || 31,
  json.myUserId || json.userId,
  json.msg_type || json.type
);

if (attachmentData) {
  // 이미지 URL 추출
  const imageUrl = attachmentData.url || attachmentData.path || ...;
  // ...
}
```

---

### 단계 3: 신고 기능 개선

#### 3.1 클라이언트 측 개선

**파일**: `client/kakao_poller.py`

**변경 내용:**

`poll_messages()` 함수 내에서 `reply_to_message_id` 추출 시 복호화된 attachment 사용:

```python
# attachment 복호화 후 사용 (이미 단계 2에서 구현)
attachment_decrypted = decrypt_attachment(
    attachment, 
    enc_type, 
    MY_USER_ID, 
    msg_type
)

# 답장 메시지 ID 추출
reply_to_message_id = None

# 1. referer 필드에서 추출
if referer:
    try:
        reply_to_message_id = int(referer) if referer else None
    except (ValueError, TypeError):
        pass

# 2. 복호화된 attachment에서 src_message 추출
if not reply_to_message_id and attachment_decrypted:
    try:
        if isinstance(attachment_decrypted, str):
            attachment_json = json.loads(attachment_decrypted)
        else:
            attachment_json = attachment_decrypted
            
        if isinstance(attachment_json, dict):
            # src_message 또는 logId 확인
            src_message_id = attachment_json.get("src_message") or attachment_json.get("logId")
            if src_message_id:
                try:
                    reply_to_message_id = int(src_message_id)
                except (ValueError, TypeError):
                    pass
    except (json.JSONDecodeError, TypeError, KeyError):
        pass
```

#### 3.2 서버 측 개선

**파일**: `server/db/chatLogger.js`

**변경 내용:**

`saveReport` 함수에서 메시지 검색 로직 개선:

```javascript
async function saveReport(reportedMessageId, reporterName, reporterId, reportReason, reportType = 'general') {
    try {
        console.log(`[신고] saveReport 시작: messageId=${reportedMessageId}, reporter=${reporterName}`);
        
        let message = null;
        
        // 1. DB id로 검색
        if (reportedMessageId) {
            const { data: messageById } = await db.supabase
                .from('chat_messages')
                .select('*')
                .eq('id', reportedMessageId)
                .single();
            
            if (messageById) {
                message = messageById;
            }
        }
        
        // 2. metadata._id로 검색 (KakaoTalk 원본 메시지 ID)
        if (!message && reportedMessageId) {
            const { data: messageByMetadata } = await db.supabase
                .from('chat_messages')
                .select('*')
                .eq('metadata->_id', String(reportedMessageId))
                .single();
            
            if (messageByMetadata) {
                message = messageByMetadata;
            }
        }
        
        // 3. 최근 메시지에서 검색 (시간 기반 추정)
        if (!message) {
            // 최근 5분 이내 메시지 중 신고자와 같은 방의 메시지 검색
            // (신고 대상 추정은 신뢰성이 낮으므로 로깅만)
            console.warn(`[신고] 메시지 ID ${reportedMessageId}를 찾을 수 없음`);
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

---

### 단계 4: 반응 감지 개선

#### 4.1 클라이언트 측 개선

**파일**: `client/kakao_poller.py`

**변경 내용:**

복호화된 attachment에서 반응 정보 추출:

```python
# 반응 메시지 처리 (단계 2의 복호화 함수 사용 후)
is_reaction = False
reaction_type = None
target_message_id = None

if attachment_decrypted:
    try:
        if isinstance(attachment_decrypted, str):
            attachment_json = json.loads(attachment_decrypted)
        else:
            attachment_json = attachment_decrypted
            
        if isinstance(attachment_json, dict):
            # 반응 정보 확인
            if "reaction" in attachment_json or "likeType" in attachment_json or "emoType" in attachment_json:
                is_reaction = True
                
                # 반응 타입 추출
                reaction_type_raw = (attachment_json.get("reaction") or 
                                   attachment_json.get("likeType") or 
                                   attachment_json.get("emoType") or 
                                   attachment_json.get("emoji"))
                
                # 이모지 타입 매핑
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
                target_message_id = (attachment_json.get("message_id") or 
                                   attachment_json.get("target_id") or 
                                   attachment_json.get("logId") or 
                                   attachment_json.get("src_logId"))
                
                print(f"[반응 감지] ✅ 감지: type={reaction_type}, target={target_message_id}")
    except (json.JSONDecodeError, TypeError, KeyError) as e:
        print(f"[반응 감지] 파싱 실패: {e}")
```

**서버로 전송 시:**

```python
# send_to_server 함수 호출 시
json_data = {
    # ... (기존 필드들)
    "type": "reaction" if is_reaction else "message",
    "reaction_type": reaction_type,
    "target_message_id": target_message_id,
    "attachment": attachment_decrypted if isinstance(attachment_decrypted, str) else json.dumps(attachment_decrypted)
}
```

#### 4.2 서버 측 개선

**파일**: `server/server.js`

**변경 내용:**

복호화된 attachment에서 반응 정보 추출 (단계 2의 복호화 함수 사용):

```javascript
// 반응 메시지 처리 (약 1240줄)
if (messageData.type === 'reaction' || messageData.type === 'like' || json?.reaction_type) {
  const { room, sender, json } = messageData;
  const chatLogger = require('./db/chatLogger');
  
  try {
    // attachment 복호화 (단계 2의 함수 사용)
    const attachmentData = decryptAttachment(
      json?.attachment,
      json?.encType || json?.v?.enc || 31,
      json?.myUserId || json?.userId,
      json?.msg_type || json?.type
    );
    
    // 반응 정보 추출
    const targetMessageId = json?.target_message_id || 
                           json?.target_id || 
                           attachmentData?.message_id ||
                           attachmentData?.target_id ||
                           attachmentData?.logId ||
                           null;
    
    const reactionType = json?.reaction_type || 
                        attachmentData?.reaction ||
                        attachmentData?.likeType ||
                        attachmentData?.emoType ||
                        'thumbs_up';
    
    // ... (나머지 저장 로직)
  } catch (err) {
    console.error('[반응 저장] 실패:', err.message);
  }
}
```

---

### 단계 5: 이미지 저장/조회 개선

#### 5.1 클라이언트 측 개선

**파일**: `client/kakao_poller.py`

**변경 내용:**

이미지 타입 감지 및 정보 추출 (단계 2의 복호화 함수 사용):

```python
# 이미지 타입 확인
image_types = [2, 12, 27, "2", "12", "27"]
has_image = False
image_url = None

if msg_type_str in image_types and attachment_decrypted:
    has_image = True
    try:
        if isinstance(attachment_decrypted, str):
            attach_json = json.loads(attachment_decrypted)
        else:
            attach_json = attachment_decrypted
            
        if isinstance(attach_json, dict):
            # 이미지 URL 추출 (다양한 필드명 지원)
            image_url = (attach_json.get("url") or 
                        attach_json.get("path") or 
                        attach_json.get("path_1") or
                        attach_json.get("thumbnailUrl") or
                        attach_json.get("xl") or 
                        attach_json.get("l") or 
                        attach_json.get("m") or 
                        attach_json.get("s"))
            
            print(f"[이미지 감지] ✅ 감지: url={image_url[:50] if image_url else None}...")
    except Exception as e:
        print(f"[이미지 감지] 파싱 실패: {e}")

# 서버로 전송 시 이미지 정보 포함
json_data = {
    # ... (기존 필드들)
    "has_image": has_image,
    "image_url": image_url,
    "attachment": attachment_decrypted if isinstance(attachment_decrypted, str) else json.dumps(attachment_decrypted)
}
```

#### 5.2 서버 측 개선

**파일**: `server/server.js`

**변경 내용:**

이미지 저장 로직 개선 (단계 2의 복호화 함수 사용):

```javascript
// 이미지 첨부 정보 저장 (약 1980줄)
if (savedMessage && json) {
  try {
    const msgType = json.msg_type || json.type;
    const imageTypes = [2, 12, 27, '2', '12', '27'];
    
    if (imageTypes.includes(msgType)) {
      // attachment 복호화 (단계 2의 함수 사용)
      const attachmentData = decryptAttachment(
        json.attachment,
        json.encType || json.v?.enc || 31,
        json.myUserId || json.userId,
        msgType
      );
      
      if (attachmentData && typeof attachmentData === 'object') {
        // 이미지 URL 추출 (다양한 필드명 지원)
        const imageUrl = attachmentData.url || 
                        attachmentData.path || 
                        attachmentData.path_1 ||
                        attachmentData.thumbnailUrl ||
                        attachmentData.xl || 
                        attachmentData.l || 
                        attachmentData.m || 
                        attachmentData.s ||
                        attachmentData.full || 
                        attachmentData.original;
        
        if (imageUrl) {
          await chatLogger.saveAttachment(
            savedMessage.id,
            'image',
            imageUrl,
            attachmentData.name || null,
            attachmentData.size || null,
            attachmentData.mime_type || 'image/jpeg',
            attachmentData.thumbnailUrl || null,
            attachmentData
          );
          console.log(`[이미지 저장] ✅ 성공: message_id=${savedMessage.id}, url=${imageUrl.substring(0, 50)}...`);
        }
      }
    }
  } catch (imgErr) {
    console.error('[이미지 저장] ❌ 실패:', imgErr.message);
  }
}
```

#### 5.3 질문글 이미지 조회 개선

**파일**: `server/labbot-node.js`

**변경 내용:**

이미지 조회 시간 범위 확대 및 조회 로직 개선:

```javascript
// !질문 명령어 처리 부분 (약 1340줄)
if (msgTrimmed.startsWith('!질문')) {
    // ... (기존 코드)
    
    // 최근 이미지 메시지 조회 (5분으로 확대, 2분 → 5분)
    let previousMessageImage = null;
    try {
        const twoMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
        const recentMessages = await chatLogger.getChatMessagesByPeriod(
            room,
            twoMinutesAgo,
            new Date().toISOString(),
            20  // 더 많은 메시지 조회
        );
        
        // 같은 사용자의 이미지 메시지 찾기
        for (const msg of recentMessages) {
            if (msg.sender_id === senderId || msg.sender_name === questionSenderName) {
                // message_attachments에서 이미지 URL 조회
                const { data: attachments } = await db.supabase
                    .from('message_attachments')
                    .select('attachment_url')
                    .eq('message_id', msg.id)
                    .eq('attachment_type', 'image')
                    .limit(1)
                    .single();
                
                if (attachments && attachments.attachment_url) {
                    previousMessageImage = attachments.attachment_url;
                    console.log(`[네이버 카페] 이전 메시지에서 이미지 발견: ${previousMessageImage.substring(0, 50)}...`);
                    break;
                }
                
                // metadata에서 이미지 URL 확인
                if (msg.metadata && typeof msg.metadata === 'object') {
                    const imageUrl = msg.metadata.image_url || 
                                   msg.metadata.attachment_url ||
                                   msg.metadata.thumbnail_url;
                    if (imageUrl) {
                        previousMessageImage = imageUrl;
                        console.log(`[네이버 카페] metadata에서 이미지 발견: ${previousMessageImage.substring(0, 50)}...`);
                        break;
                    }
                }
            }
        }
    } catch (error) {
        console.error('[네이버 카페] 이전 이미지 조회 실패:', error.message);
    }
    
    // ... (나머지 코드)
}
```

---

### 단계 6: 닉네임 변경 감지 개선

#### 6.1 senderId 추출 강화

**파일**: `server/server.js`

**변경 내용:**

senderId 추출 로직 개선 (단계 1의 함수 사용):

```javascript
// 발신자 ID 추출 (단계 1의 함수 사용)
const { extractSenderId } = require('./labbot-node');

// senderName과 senderId 추출
let senderName = null;
let senderId = null;

if (sender) {
  senderName = extractSenderName(sender);
  senderId = extractSenderId(sender);  // 새로운 함수 사용
}

// json에서 추가 확인
if (!senderId) {
  senderId = json?.user_id || json?.userId || json?.sender_id;
}

console.log(`[닉네임 변경] senderName="${senderName}", senderId="${senderId}"`);

// 닉네임 변경 감지
if (senderName || senderId) {
  nicknameChangeNotification = await chatLogger.checkNicknameChange(
    decryptedRoomName || '',
    senderName || sender || '',
    senderId
  );
}
```

#### 6.2 checkNicknameChange 함수 개선

**파일**: `server/db/chatLogger.js`

**변경 내용:**

senderName 기반 검색 추가:

```javascript
async function checkNicknameChange(roomName, senderName, senderId) {
    try {
        let existingUser = null;
        
        // 1. senderId로 조회 (우선)
        if (senderId) {
            const { data: userById } = await db.supabase
                .from('users')
                .select('id, display_name, kakao_user_id')
                .eq('kakao_user_id', senderId)
                .single();
            
            if (userById) {
                existingUser = userById;
            }
        }
        
        // 2. senderId 없으면 senderName으로 최근 사용자 검색
        if (!existingUser && senderName) {
            // 같은 방에서 최근 메시지를 보낸 사용자 중 senderName이 일치하는 사용자 찾기
            const { data: recentMessages } = await db.supabase
                .from('chat_messages')
                .select('sender_id, sender_name, user_id')
                .eq('room_name', roomName)
                .order('created_at', { ascending: false })
                .limit(100);  // 최근 100개 메시지 조회
            
            if (recentMessages && recentMessages.length > 0) {
                // senderName이 다른 메시지를 찾아서 sender_id 추정
                for (const msg of recentMessages) {
                    if (msg.sender_id) {
                        // sender_id로 사용자 조회
                        const { data: userBySenderId } = await db.supabase
                            .from('users')
                            .select('id, display_name, kakao_user_id')
                            .eq('kakao_user_id', msg.sender_id)
                            .single();
                        
                        if (userBySenderId) {
                            existingUser = userBySenderId;
                            break;
                        }
                    }
                }
            }
        }
        
        // 3. 사용자 찾기 실패 시 새 사용자로 간주
        if (!existingUser) {
            console.log('[닉네임 변경] 새 사용자 또는 사용자 찾기 실패');
            return null;
        }
        
        // 4. 이름 변경 확인
        if (existingUser.display_name !== senderName) {
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
        } else {
            console.log('[닉네임 변경] 변경 없음');
            return null;
        }
    } catch (error) {
        console.error('[닉네임 변경] 오류:', error.message);
        return null;
    }
}
```

---

## 📋 구현 체크리스트

### 단계 1: 닉네임 전체 사용
- [ ] `server/labbot-node.js`: `extractSenderName` 함수 수정
- [ ] `server/labbot-node.js`: `extractSenderId` 함수 추가
- [ ] `server/server.js`: 모든 `sender.split('/')[0]` 호출을 `extractSenderName`으로 변경
- [ ] `server/server.js`: 모든 `sender.split('/')[1]` 호출을 `extractSenderId`로 변경
- [ ] DB 저장 시 전체 닉네임 저장 확인
- [ ] 테스트: "랩장/AN/서" 형식 닉네임이 전체 표시되는지 확인

### 단계 2: attachment 복호화
- [ ] `client/kakao_poller.py`: `decrypt_attachment` 함수 추가
- [ ] `client/kakao_poller.py`: `poll_messages`에서 attachment 복호화 적용
- [ ] `server/server.js`: `decryptAttachment` 함수 추가
- [ ] `server/server.js`: Feed 메시지 처리 부분에 복호화 적용
- [ ] `server/server.js`: 반응 메시지 처리 부분에 복호화 적용
- [ ] `server/server.js`: 이미지 저장 부분에 복호화 적용
- [ ] 테스트: 복호화 후 JSON 파싱 성공 확인

### 단계 3: 신고 기능
- [ ] `client/kakao_poller.py`: 복호화된 attachment에서 `src_message` 추출
- [ ] `server/db/chatLogger.js`: `saveReport` 함수 개선 (메시지 검색 로직)
- [ ] 테스트: 답장 버튼 + `!신고` 입력 시 신고 접수 확인

### 단계 4: 반응 감지
- [ ] `client/kakao_poller.py`: 복호화된 attachment에서 반응 정보 추출
- [ ] `server/server.js`: 복호화된 attachment에서 반응 정보 추출
- [ ] 테스트: 하트(❤️), 좋아요(👍) 반응 감지 확인
- [ ] DB 저장 확인: `reaction_logs` 테이블에 반응 기록 저장

### 단계 5: 이미지 저장/조회
- [ ] `client/kakao_poller.py`: 복호화된 attachment에서 이미지 URL 추출
- [ ] `server/server.js`: 복호화된 attachment에서 이미지 저장
- [ ] `server/labbot-node.js`: 이미지 조회 시간 범위 확대 (2분 → 5분)
- [ ] 테스트: 이미지 전송 후 `message_attachments` 테이블에 저장 확인
- [ ] 테스트: `!질문` 전 이미지 전송 시 네이버 카페에 이미지 첨부 확인

### 단계 6: 닉네임 변경 감지
- [ ] `server/server.js`: `extractSenderId` 함수 사용
- [ ] `server/db/chatLogger.js`: `checkNicknameChange` 함수 개선
- [ ] 테스트: 닉네임 변경 시 알림 메시지 출력 확인
- [ ] DB 저장 확인: `user_name_history` 테이블에 변경 이력 저장

---

## 🔧 테스트 방법

### 1. 닉네임 전체 표시 테스트
1. 닉네임이 "랩장/AN/서"인 사용자로 메시지 전송
2. 무단 홍보 링크 전송하여 경고 메시지 확인
3. 메시지에 "랩장/AN/서" 전체가 표시되는지 확인

### 2. attachment 복호화 테스트
1. 클라이언트 로그에서 `[attachment 복호화] ✅ 성공` 메시지 확인
2. 서버 로그에서 복호화된 attachment JSON 파싱 성공 확인

### 3. 신고 기능 테스트
1. 메시지에 답장 버튼 클릭
2. `!신고 사유` 입력
3. "✅ 신고 접수 완료!" 메시지 확인
4. DB에서 `report_logs` 테이블에 기록 확인

### 4. 반응 감지 테스트
1. 메시지에 하트(❤️) 반응 추가
2. 클라이언트 로그에서 `[반응 감지] ✅ 감지` 메시지 확인
3. 서버 로그에서 반응 저장 성공 확인
4. DB에서 `reaction_logs` 테이블에 기록 확인

### 5. 이미지 저장/조회 테스트
1. 이미지 전송
2. DB에서 `message_attachments` 테이블에 이미지 URL 저장 확인
3. 이미지 전송 직후 `!질문 제목,내용` 입력
4. 네이버 카페에 이미지가 첨부된 글 작성 확인

### 6. 닉네임 변경 감지 테스트
1. 카카오톡에서 닉네임 변경
2. 변경 후 메시지 전송
3. "🚨 닉네임 변경 감지!" 알림 메시지 확인
4. DB에서 `user_name_history` 테이블에 변경 이력 저장 확인

---

## 📊 예상 효과

### 단계별 개선 효과

| 단계 | 기능 | 현재 상태 | 개선 후 상태 |
|------|------|----------|------------|
| 1 | 닉네임 표시 | "랩장"만 표시 | "랩장/AN/서" 전체 표시 |
| 2 | attachment 복호화 | 복호화 안 함 | 복호화 후 JSON 파싱 성공 |
| 3 | 신고 기능 | 작동 안 함 | 정상 작동 |
| 4 | 반응 감지 | 작동 안 함 | 정상 작동 |
| 5 | 이미지 첨부 | 작동 안 함 | 정상 작동 |
| 6 | 닉네임 변경 | 작동 안 함 | 정상 작동 |

---

## ⚠️ 주의사항

### 1. 복호화 실패 처리
- 복호화가 실패하면 원본 데이터를 그대로 사용
- 에러 발생 시 서버 동작이 멈추지 않도록 try-catch 필수

### 2. 하위 호환성
- 기존 코드와의 호환성 유지
- 닉네임 형식이 "닉네임/user_id"인 경우도 처리

### 3. 성능
- attachment 복호화는 CPU 집약적 작업
- 필요한 경우에만 복호화 수행 (이미 JSON인 경우 건너뛰기)

### 4. 로깅
- 복호화 성공/실패 로그 출력
- 디버깅을 위한 상세 로그 추가

---

## 📚 참고 자료

- **Iris 원본 코드**: `ref/Iris-main/app/src/main/java/party/qwer/iris/ObserverHelper.kt`
- **문제 분석 문서**: `ISSUE_IMPROVEMENT_PROPOSAL.md`
- **테스트 체크리스트**: `TEST_CHECKLIST.md`
- **DB 스키마**: `server/db/moderation_schema.sql`

---

## 📞 문의

개선 작업 중 문제가 발생하면 다음을 확인하세요:
1. 클라이언트 로그 (`kakao_poller.py` 출력)
2. 서버 로그 (`server.js` 출력)
3. DB 데이터 (Supabase 대시보드)

