# 문제 분석 및 개선안 제시

## 📋 문제 요약

1. **신고 작동 안 함**: 답장 버튼 + `!신고` 입력 시 "신고 방법 안내" 메시지만 나옴
2. **반응 작동 안 함**: 하트(❤️) 같은 반응 이모지가 감지되지 않음
3. **이미지 첨부 질문글쓰기 작동 안 함**: `!질문` 전에 이미지 전송 후 질문 시 이미지가 첨부되지 않음
4. **닉네임 변경 작동 안 함**: 닉네임 변경 시 알림이 나오지 않음

---

## 🔍 문제 1: 신고 작동 안 함

### 원인 분석

**현재 동작:**
- `replyToMessageId`가 없으면 "신고 방법 안내" 메시지 출력
- 그림1을 보면 사용자가 답장 버튼을 눌렀는데도 `replyToMessageId`가 없는 상태

**가능한 원인:**

1. **알림 답장의 경우 `referer` 필드가 다름**
   - Iris `Replier.kt` 참고: 알림 답장은 `putExtra("noti_referer", referer)`로 전달
   - 하지만 `chat_logs` 테이블의 `referer` 컬럼과는 다를 수 있음
   - 알림에서 온 답장은 새로운 메시지로 저장되면서 referer 정보가 다르게 저장될 수 있음

2. **Bridge APK에서 전달하는 referer 정보 부족**
   - Bridge APK가 알림에서 메시지를 보낼 때 원본 메시지 ID를 전달하지 않을 수 있음
   - `KakaoNotificationListenerService.kt`를 보면 알림에서 직접 답장하는 경우 원본 메시지 정보 추출 필요

3. **`attachment.src_message`가 복호화되지 않음**
   - `attachment` 필드가 암호화되어 있을 수 있음 (Iris `ObserverHelper.kt` 참고)
   - 복호화하지 않고 파싱하면 JSON 파싱 실패

### 개선안

#### 방법 1: Bridge APK에서 referer 정보 전달 (권장)

**파일**: `bridge/app/src/main/java/com/goodhabit/kakaobridge/service/KakaoNotificationListenerService.kt`

**개선 내용:**
1. 알림에서 `PendingIntent`의 `Intent`에서 `noti_referer` 추출
2. WebSocket 메시지에 `reply_to_message_id` 필드로 포함
3. 또는 알림 제목/내용에서 원본 메시지 ID 추출

```kotlin
// 알림 Intent에서 referer 추출
val referer = notification.extras.getString("noti_referer")
// 또는
val intent = action.actionIntent?.intent
val referer = intent?.getStringExtra("noti_referer")

// WebSocket 메시지에 포함
wsMessage.put("reply_to_message_id", referer)
```

#### 방법 2: 클라이언트에서 attachment 복호화 후 파싱

**파일**: `client/kakao_poller.py`

**개선 내용:**
1. `attachment` 필드가 암호화되어 있으면 복호화 시도
2. Iris 방식: `messageType == "71"`이 아니면 복호화 (ObserverHelper.kt 참고)

```python
# attachment 복호화 (Iris 방식)
if attachment and attachment != "{}" and attachment != "":
    try:
        # 암호화되어 있는지 확인 (base64 형태)
        if len(attachment) > 10 and attachment[0] not in ['{', '[']:
            # 복호화 시도
            decrypted_attachment = KakaoDecrypt.decrypt(int(MY_USER_ID), enc_type, attachment)
            if decrypted_attachment:
                attachment = decrypted_attachment
    except:
        pass

# 복호화된 attachment에서 src_message 추출
if attachment:
    try:
        attachment_json = json.loads(attachment)
        src_message_id = attachment_json.get("src_message") or attachment_json.get("logId")
        if src_message_id:
            reply_to_message_id = int(src_message_id)
    except:
        pass
```

#### 방법 3: 서버에서 메시지 검색 로직 개선

**파일**: `server/db/chatLogger.js`

**개선 내용:**
- `reportedMessageId`가 없어도 신고 기록 저장 (메시지 없이도 신고 가능)
- 최근 메시지에서 신고 대상 추정 (시간 기반, 같은 사용자)

---

## 🔍 문제 2: 반응(이모지) 작동 안 함

### 원인 분석

**현재 동작:**
- `type 70-79` 범위를 반응으로 감지
- `attachment` 필드에서 `reaction`, `like`, `thumbs` 키 확인
- 그림2를 보면 하트(❤️) 반응이 있지만 감지되지 않음

**가능한 원인:**

1. **카카오톡 반응은 별도 테이블에 저장**
   - `chat_logs`가 아닌 별도 반응 테이블 (`reaction_logs`, `chat_reactions` 등)
   - 반응은 메시지가 아닌 "이벤트"로 처리될 수 있음

2. **반응 타입이 다름**
   - DBManager 참고: 반응은 Feed 타입으로 올 수 있음
   - 또는 별도 이벤트로 처리

3. **attachment 복호화 필요**
   - Iris `ObserverHelper.kt` 참고: `attachment`도 복호화 필요
   - 복호화하지 않으면 JSON 파싱 실패

### 개선안

#### 방법 1: 별도 반응 테이블 조회 (DBManager 방식)

**참고**: DBManager는 반응을 별도 이벤트로 처리하는 것으로 보임

**개선 내용:**
1. 카카오톡 DB에서 반응 관련 테이블 직접 조회
2. `chat_reactions` 테이블이 있다면 직접 조회
3. 또는 최근 메시지와 함께 반응 정보 조회

```python
# 반응 테이블 조회 (가능하다면)
try:
    cursor.execute("SELECT * FROM chat_reactions WHERE message_id > ? ORDER BY _id ASC LIMIT 10", (last_reaction_id,))
    reactions = cursor.fetchall()
    for reaction in reactions:
        # 반응 처리
        target_message_id = reaction[1]  # message_id
        reaction_type = reaction[2]  # reaction_type
        reactor_id = reaction[3]  # reactor_id
except:
    pass  # 테이블이 없으면 기존 방식 사용
```

#### 방법 2: attachment 복호화 후 반응 감지

**파일**: `client/kakao_poller.py`

**개선 내용:**
1. `attachment` 필드 복호화 (Iris 방식)
2. 복호화된 JSON에서 반응 정보 확인

```python
# attachment 복호화 (Iris ObserverHelper.kt 참고)
if attachment and attachment != "{}" and attachment != "":
    try:
        # 암호화 확인 및 복호화
        if not attachment.strip().startswith('{'):
            # 복호화 시도
            decrypted_attachment = KakaoDecrypt.decrypt(int(MY_USER_ID), enc_type, attachment)
            if decrypted_attachment:
                attachment = decrypted_attachment
    except:
        pass

# 복호화된 attachment 파싱
if attachment:
    try:
        attach_json = json.loads(attachment)
        # 반응 정보 확인
        if "reaction" in attach_json or "likeType" in attach_json or "emoType" in attach_json:
            is_reaction = True
            # reaction 타입 추출
            reaction_type = attach_json.get("reaction") or attach_json.get("likeType") or attach_json.get("emoType")
            # 이모지 타입 매핑
            emoji_map = {
                0: "heart",  # ❤️
                1: "thumbs_up",  # 👍
                2: "check",  # ✅
                3: "surprised",  # 😱
                4: "sad"  # 😢
            }
            if isinstance(reaction_type, int) and reaction_type in emoji_map:
                reaction_type = emoji_map[reaction_type]
    except:
        pass
```

#### 방법 3: 메시지 타입별 반응 감지 개선

**개선 내용:**
- 실제 카카오톡에서 반응 메시지의 `type` 값 확인 필요
- 로그를 통해 실제 반응 메시지의 `type` 값 파악
- `type` 값에 따라 다른 처리 로직 적용

---

## 🔍 문제 3: 이미지 첨부 질문글쓰기 작동 안 함

### 원인 분석

**현재 동작:**
- `!질문` 전 2분 이내 같은 사용자의 이미지 메시지 조회
- `message_attachments` 테이블에서 `attachment_type='image'` 조회
- 그림3을 보면 이미지가 있는데 "참고: 사진이 첨부되어 있지 않다면..." 메시지 출력

**가능한 원인:**

1. **이미지가 `message_attachments` 테이블에 저장되지 않음**
   - 이미지 타입 감지 로직이 작동하지 않음
   - `type=2` (사진) 메시지가 감지되지 않음
   - `attachment` 필드 복호화 필요

2. **이미지 URL 추출 실패**
   - `attachment` 필드의 구조가 예상과 다름
   - 복호화되지 않은 상태로 파싱 시도

3. **시간 범위 문제**
   - 2분 이내 조회인데, 이미지 메시지가 먼저 저장되지 않음
   - 메시지 저장 순서 문제

### 개선안

#### 방법 1: 이미지 타입 감지 및 저장 로직 개선

**파일**: `server/server.js`

**개선 내용:**
1. `attachment` 필드 복호화 후 파싱
2. 이미지 타입 감지 범위 확대
3. 이미지 URL 추출 로직 개선

```javascript
// attachment 복호화 (Iris 방식)
let attachmentData = json.attachment;
if (attachmentData && typeof attachmentData === 'string' && attachmentData !== '{}') {
  try {
    // 암호화되어 있는지 확인
    if (!attachmentData.trim().startsWith('{')) {
      // 복호화 시도
      const myUserId = json.myUserId || json.userId;
      if (myUserId) {
        attachmentData = decryptKakaoTalkMessage(attachmentData, String(myUserId), json.encType || 31);
      }
    }
    // JSON 파싱
    if (attachmentData && attachmentData.trim().startsWith('{')) {
      attachmentData = JSON.parse(attachmentData);
    }
  } catch (e) {
    console.error('[이미지] attachment 복호화/파싱 실패:', e.message);
  }
}

// 이미지 타입 확인 (더 많은 타입 지원)
const imageTypes = [2, 12, 27, '2', '12', '27'];
const msgType = json.msg_type || json.type;

if (imageTypes.includes(msgType) && attachmentData) {
  // 이미지 URL 추출 (더 많은 필드 확인)
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
    await chatLogger.saveAttachment(...);
  }
}
```

#### 방법 2: 이미지 조회 로직 개선

**파일**: `server/labbot-node.js`

**개선 내용:**
1. 최근 메시지 조회 시 이미지 타입 메시지 우선 조회
2. `metadata` 필드에서 이미지 정보 확인
3. 시간 범위 확대 (2분 → 5분)

```javascript
// 최근 이미지 메시지 조회 개선
const recentMessages = await chatLogger.getChatMessagesByPeriod(
    room,
    new Date(Date.now() - 5 * 60 * 1000).toISOString(), // 5분으로 확대
    new Date().toISOString(),
    20  // 더 많은 메시지 조회
);

// 같은 사용자의 이미지 메시지 찾기
for (const msg of recentMessages) {
    if (msg.user_id === senderId && msg.message_type === 'image') {
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
            break;
        }
    }
}
```

#### 방법 3: 메타데이터에서 이미지 정보 확인

**개선 내용:**
- `chat_messages.metadata` 필드에 이미지 정보가 저장되어 있을 수 있음
- 메타데이터에서 직접 이미지 URL 추출

```javascript
if (msg.metadata && typeof msg.metadata === 'object') {
    const imageUrl = msg.metadata.image_url || 
                     msg.metadata.attachment_url ||
                     msg.metadata.thumbnail_url;
    if (imageUrl) {
        previousMessageImage = imageUrl;
        break;
    }
}
```

---

## 🔍 문제 4: 닉네임 변경 작동 안 함

### 원인 분석

**현재 동작:**
- `checkNicknameChange()` 함수에서 `senderId`로 기존 사용자 조회
- `display_name`과 현재 `senderName` 비교
- 변경 시 알림 생성

**가능한 원인:**

1. **senderId가 제대로 전달되지 않음**
   - 복호화 실패로 `senderId`가 None이 됨
   - `senderId` 추출 로직이 작동하지 않음

2. **복호화된 이름과 DB의 이름 비교 문제**
   - DB에 저장된 이름이 암호화된 상태일 수 있음
   - 복호화된 이름과 암호화된 이름을 비교하는 문제

3. **사용자 조회 실패**
   - `kakao_user_id`로 조회하는데, DB에 저장된 값과 다름
   - `getOrCreateUser`에서 사용자가 생성되지 않음

### 개선안

#### 방법 1: senderId 추출 및 전달 강화

**파일**: `server/server.js`

**개선 내용:**
1. `senderId` 추출 로직 강화 (여러 소스에서 확인)
2. `checkNicknameChange` 호출 전 `senderId` 확인

```javascript
// senderId 추출 강화
let senderId = null;

// 1. sender에서 추출
if (sender && sender.includes('/')) {
    senderId = sender.split('/')[1];
}

// 2. json에서 추출
if (!senderId) {
    senderId = json?.user_id || json?.userId || json?.sender_id;
}

// 3. senderName이 암호화된 경우 senderId 없이도 처리
// (getOrCreateUser에서 internal_user_id로 식별)

console.log(`[닉네임 변경] senderId 추출: "${senderId}", senderName="${senderName}"`);

if (senderId || senderName) {
    nicknameChangeNotification = await chatLogger.checkNicknameChange(
        decryptedRoomName || '',
        senderName || sender || '',
        senderId
    );
}
```

#### 방법 2: checkNicknameChange 함수 개선

**파일**: `server/db/chatLogger.js`

**개선 내용:**
1. `senderId`가 없어도 `senderName`으로 사용자 검색
2. `internal_user_id` 또는 `display_name`으로 사용자 식별

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
                .select('sender_id, sender_name')
                .eq('room_name', roomName)
                .eq('sender_name', senderName)
                .order('created_at', { ascending: false })
                .limit(1)
                .single();
            
            if (recentMessages && recentMessages.sender_id) {
                // sender_id로 사용자 조회
                const { data: userBySenderId } = await db.supabase
                    .from('users')
                    .select('id, display_name, kakao_user_id')
                    .eq('kakao_user_id', recentMessages.sender_id)
                    .single();
                
                if (userBySenderId) {
                    existingUser = userBySenderId;
                }
            }
        }
        
        // 3. 사용자 찾기 실패 시 새 사용자로 간주
        if (!existingUser) {
            return null;
        }
        
        // 4. 이름 변경 확인
        if (existingUser.display_name !== senderName) {
            // 변경 감지 및 알림 생성
            // ... (기존 로직)
        }
    } catch (error) {
        console.error('[닉네임 변경] 오류:', error.message);
        return null;
    }
}
```

#### 방법 3: getOrCreateUser에서 변경 감지 강화

**파일**: `server/db/chatLogger.js`

**개선 내용:**
- `getOrCreateUser` 함수에서 이름 변경 시 즉시 알림 생성
- `checkNicknameChange`와 중복되지만, 더 확실한 감지

```javascript
// getOrCreateUser 함수 내부
if (existingUser) {
    if (existingUser.display_name !== senderName) {
        // 이름 변경 감지
        console.log('[닉네임 변경] getOrCreateUser에서 감지:', {
            old: existingUser.display_name,
            new: senderName
        });
        
        // 이름 변경 이력 저장
        // ... (기존 로직)
        
        // 즉시 알림 생성 (checkNicknameChange와 별도)
        // 또는 checkNicknameChange 호출
    }
}
```

---

## 📊 개선안 우선순위

| 문제 | 개선안 | 우선순위 | 난이도 | 예상 효과 |
|------|--------|---------|--------|----------|
| 1. 신고 | Bridge APK에서 referer 전달 | ⭐⭐⭐⭐⭐ | 중 | 높음 |
| 1. 신고 | attachment 복호화 | ⭐⭐⭐⭐ | 중 | 중간 |
| 2. 반응 | attachment 복호화 후 감지 | ⭐⭐⭐⭐⭐ | 중 | 높음 |
| 2. 반응 | 별도 반응 테이블 조회 | ⭐⭐⭐ | 상 | 미확정 |
| 3. 이미지 | attachment 복호화 후 저장 | ⭐⭐⭐⭐⭐ | 중 | 높음 |
| 3. 이미지 | 이미지 조회 로직 개선 | ⭐⭐⭐⭐ | 하 | 중간 |
| 4. 닉네임 | senderId 추출 강화 | ⭐⭐⭐⭐ | 하 | 중간 |
| 4. 닉네임 | checkNicknameChange 개선 | ⭐⭐⭐⭐⭐ | 중 | 높음 |

---

## 🎯 핵심 개선 포인트

### 공통 개선사항

1. **attachment 필드 복호화 필수**
   - Iris `ObserverHelper.kt` 참고: `attachment`도 복호화 필요
   - 복호화하지 않으면 JSON 파싱 실패로 정보 추출 불가
   - 모든 attachment 사용 시 복호화 로직 추가

2. **로깅 강화**
   - 각 단계에서 상세 로그 출력
   - 복호화 전/후 값 출력
   - 파싱 성공/실패 로그

3. **에러 처리 강화**
   - 복호화 실패 시 원본 사용
   - 파싱 실패 시 fallback 로직

### 권장 구현 순서

1. **1단계: attachment 복호화 구현** (모든 문제 해결에 필수)
   - `client/kakao_poller.py`: attachment 복호화 로직 추가
   - `server/server.js`: attachment 복호화 로직 추가

2. **2단계: 신고 기능 개선**
   - Bridge APK에서 referer 전달 (가능하다면)
   - attachment 복호화 후 src_message 추출

3. **3단계: 반응 감지 개선**
   - 복호화된 attachment에서 반응 정보 추출
   - 반응 타입 매핑 개선

4. **4단계: 이미지 저장/조회 개선**
   - 복호화된 attachment에서 이미지 URL 추출
   - 이미지 조회 로직 개선

5. **5단계: 닉네임 변경 감지 개선**
   - senderId 추출 강화
   - checkNicknameChange 로직 개선

---

## 📝 참고 문서

- **Iris ObserverHelper.kt**: attachment 복호화 방법
- **Iris Replier.kt**: 알림 답장 referer 전달 방법
- **DBManager feed_type.d.ts**: Feed 타입 구조
- **FEATURE_ANALYSIS_REPORT.md**: 기능 분석 보고서

