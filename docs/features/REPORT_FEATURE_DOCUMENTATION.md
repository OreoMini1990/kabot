# 신고 기능 상세 문서 (Report Feature Documentation)

## 📋 목차
1. [개요](#개요)
2. [파일 구조](#파일-구조)
3. [데이터 흐름](#데이터-흐름)
4. [주요 함수 및 로직](#주요-함수-및-로직)
5. [DB 스키마](#db-스키마)
6. [사용 방법](#사용-방법)
7. [문제 해결 가이드](#문제-해결-가이드)
8. [참조 파일 목록](#참조-파일-목록)

---

## 개요

### 목적
사용자가 부적절한 메시지를 신고할 수 있는 기능을 제공합니다. 신고된 메시지는 관리자가 검토할 수 있도록 DB에 저장됩니다.

### 핵심 요구사항
- **답장 버튼 필수**: 신고하려는 메시지에 답장 버튼을 눌러야 함
- **명령어 형식**: `!신고` 또는 `!신고 [사유]`
- **자동 메시지 매칭**: `replyToMessageId`를 통해 신고 대상 메시지 자동 식별
- **DB 저장**: `reports` 테이블에 신고 정보 저장

---

## 파일 구조

### 1. 핵심 로직 파일

#### `server/labbot-node.js` (약 2298-2395줄)
- **역할**: 신고 명령어 감지 및 처리
- **주요 함수**: `handleMessage()` 내부의 신고 처리 로직
- **위치**: `handleMessage()` 함수 시작 부분 (다른 명령어 처리 전)

#### `server/db/chatLogger.js` (약 1284-1446줄)
- **역할**: 신고 정보 DB 저장
- **주요 함수**: `saveReport()`
- **의존성**: `moderationLogger.js` (메시지 찾기 실패 시 fallback)

#### `server/db/moderationLogger.js` (약 69-115줄)
- **역할**: 신고 로그 저장 (fallback)
- **주요 함수**: `saveReportLog()`
- **사용 시점**: 신고 대상 메시지를 찾을 수 없을 때

### 2. DB 스키마 파일

#### `server/db/reports_schema.sql`
- **역할**: `reports` 테이블 생성
- **의존성**: `chat_logs_schema.sql` 먼저 실행 필요 (chat_messages 테이블 필요)

### 3. 유틸리티 파일

#### `server/db/utils/attachmentExtractor.js`
- **역할**: attachment 필드에서 답장 대상 메시지 ID 추출
- **주요 함수**: `extractReplyTarget()`
- **사용**: `server.js`에서 `reply_to_kakao_log_id` 추출 시 사용

#### `server/server.js` (약 3004-3094줄)
- **역할**: 메시지 수신 시 `replyToMessageId` 추출 및 전달
- **주요 로직**: 
  - `json.reply_to_message_id` 추출
  - `attachment`에서 `reply_to_kakao_log_id` 추출
  - `kakao_log_id` → DB `id` 변환
  - `handleMessage()`에 `replyToMessageId` 전달

---

## 데이터 흐름

### 1. 사용자 액션
```
사용자 → 카카오톡에서 메시지에 답장 버튼 클릭 → "!신고 부적절한 내용" 입력
```

### 2. 클라이언트 → 서버 전송
```javascript
{
  type: 'message',
  room: '채팅방명',
  sender: '신고자/신고자ID',
  message: '!신고 부적절한 내용',
  json: {
    reply_to_message_id: 3607650857048612864,  // kakao_log_id (카카오톡 원본 ID)
    // 또는
    reply_to: 3607650857048612864,
    // 또는
    parent_message_id: 3607650857048612864,
    // attachment에서도 추출 가능
    attachment: {
      src_message: 3607650857048612864  // 답장 메시지인 경우
    }
  }
}
```

### 3. 서버 처리 (`server/server.js`)

#### 3-1. `replyToMessageId` 추출 (약 3004-3094줄)
```javascript
// 클라이언트에서 보내는 reply_to_message_id는 실제로 kakao_log_id
const replyToKakaoLogIdRaw = json?.reply_to_message_id || json?.reply_to || json?.parent_message_id || null;

// attachment에서도 추출 시도
const replyToKakaoLogIdFromAttachment = extractReplyTarget(
    json?.attachment_decrypted || json?.attachment,
    null,
    json?.msg_type || json?.type
);

// 최종 reply_to_kakao_log_id
const replyToKakaoLogId = replyToKakaoLogIdRaw || replyToKakaoLogIdFromAttachment;

// kakao_log_id를 DB id로 변환 시도
let replyToMessageId = null;
if (replyToKakaoLogId) {
    const numericLogId = parseInt(replyToKakaoLogId);
    const { data: replyToMessage } = await db.supabase
        .from('chat_messages')
        .select('id')
        .eq('kakao_log_id', numericLogId)
        .eq('room_name', decryptedRoomName)
        .maybeSingle();
    
    if (replyToMessage && replyToMessage.id) {
        replyToMessageId = replyToMessage.id;  // DB id
    }
}
```

#### 3-2. `handleMessage()` 호출 (약 3654-3662줄)
```javascript
replies = await handleMessage(
    decryptedRoomName || '',
    decryptedMessage || '',
    senderForHandleMessage,
    isGroupChat !== undefined ? isGroupChat : true,
    replyToMessageId  // DB id 전달
);
```

### 4. 신고 명령어 감지 (`server/labbot-node.js`)

#### 4-1. 명령어 감지 (약 2300-2304줄)
```javascript
// !신고 또는 ! 신고 (공백 포함) 모두 처리
const hasReportCommand = /![\s]*신고/.test(msgTrimmed) || msgLower.includes('!신고');

if (hasReportCommand) {
    // 신고 처리 시작
}
```

#### 4-2. `replyToMessageId` 검증 (약 2313-2327줄)
```javascript
// replyToMessageId가 필수 (답장 버튼을 눌러야 함)
if (!replyToMessageId || 
    replyToMessageId === 'null' || 
    replyToMessageId === 'undefined' || 
    String(replyToMessageId).trim() === '') {
    // 안내 메시지 반환
    const helpMessage = `📋 신고 방법 안내\n\n` +
        `신고하려는 메시지에 답장 버튼을 누르고\n` +
        `!신고 또는 !신고 [사유] 를 입력하세요\n\n` +
        `예시: !신고 부적절한 내용입니다\n\n` +
        `⚠️ 현재 replyToMessageId: ${replyToMessageId} (타입: ${typeof replyToMessageId})`;
    replies.push(helpMessage);
    return replies;
}
```

#### 4-3. 신고 사유 추출 (약 2329-2339줄)
```javascript
let reportReason = '신고 사유 없음';
const reportMatch = msgTrimmed.match(/![\s]*신고[\s]*(.*)/i);
if (reportMatch && reportMatch[1]) {
    const afterReport = reportMatch[1].trim();
    // 멘션 제거 (@랩봇 등)
    const cleanedReason = afterReport.replace(/@\w+/g, '').trim();
    if (cleanedReason) {
        reportReason = cleanedReason;
    }
}
```

#### 4-4. `saveReport()` 호출 (약 2364-2370줄)
```javascript
const reportResult = await chatLogger.saveReport(
    targetMessageId,  // replyToMessageId (DB id 또는 kakao_log_id)
    reporterName || sender,  // 신고자 이름
    reporterId,  // 신고자 ID
    reportReason,  // 신고 사유
    'general'  // 신고 타입
);
```

### 5. DB 저장 (`server/db/chatLogger.js`)

#### 5-1. 신고 대상 메시지 조회 (약 1291-1347줄)
```javascript
let message = null;

// 1. kakao_log_id로 직접 검색 (우선)
if (reportedMessageId) {
    const numericLogId = parseInt(reportedMessageId);
    if (!isNaN(numericLogId)) {
        const { data: messageByLogId } = await db.supabase
            .from('chat_messages')
            .select('*')
            .eq('kakao_log_id', numericLogId)
            .single();
        
        if (messageByLogId) {
            message = messageByLogId;
        }
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
    }
}

// 3. fallback: DB id로 검색 (숫자인 경우)
if (!message && reportedMessageId && /^\d+$/.test(String(reportedMessageId))) {
    const { data: messageById } = await db.supabase
        .from('chat_messages')
        .select('*')
        .eq('id', parseInt(reportedMessageId))
        .single();
    
    if (messageById) {
        message = messageById;
    }
}
```

#### 5-2. 메시지 찾기 실패 시 Fallback (약 1349-1377줄)
```javascript
if (!message) {
    // 메시지 없이도 신고 저장 시도 (report_logs 테이블 사용)
    const moderationLogger = require('./moderationLogger');
    const result = await moderationLogger.saveReportLog({
        roomName: '',
        reporterName: reporterName,
        reporterId: reporterId,
        reportedMessageId: String(reportedMessageId),
        reportedMessageText: null,
        reportedUserName: null,
        reportedUserId: null,
        reportReason: reportReason,
        reportType: reportType
    });
    
    return result;
}
```

#### 5-3. 신고 정보 저장 (약 1408-1424줄)
```javascript
const { data, error } = await db.supabase
    .from('reports')
    .insert({
        reported_message_id: reportedMessageId,  // DB id 또는 kakao_log_id
        reporter_user_id: reporterUser?.id || null,
        reporter_name: reporterName,
        reported_user_id: reportedUserId,
        reported_user_name: reportedUserName,
        original_message_text: message.message_text,
        original_message_time: message.created_at,
        report_reason: reportReason,
        report_type: reportType,
        status: 'pending'
    })
    .select()
    .single();
```

### 6. 응답 메시지 반환 (약 2374-2385줄)
```javascript
if (reportResult) {
    const successMessage = `✅ 신고 접수 완료!\n\n` +
        `📝 신고 내용이 관리자에게 전달되었습니다.\n` +
        `🔍 검토 후 적절한 조치가 이루어집니다.\n\n` +
        `감사합니다. 🙏`;
    replies.push(successMessage);
} else {
    const errorMessage = `❌ 신고 접수 실패\n\n` +
        `죄송합니다. 신고 접수 중 오류가 발생했습니다.\n` +
        `잠시 후 다시 시도해주세요.`;
    replies.push(errorMessage);
}
```

---

## 주요 함수 및 로직

### 1. `handleMessage()` - 신고 명령어 감지 (`server/labbot-node.js`)

#### 함수 시그니처
```javascript
async function handleMessage(room, msg, sender, isGroupChat, replyToMessageId = null)
```

#### 신고 처리 로직 (약 2298-2395줄)
```javascript
// 1. 명령어 감지
const hasReportCommand = /![\s]*신고/.test(msgTrimmed) || msgLower.includes('!신고');

// 2. replyToMessageId 검증
if (!replyToMessageId || replyToMessageId === 'null' || ...) {
    // 안내 메시지 반환
}

// 3. 신고 사유 추출
const reportMatch = msgTrimmed.match(/![\s]*신고[\s]*(.*)/i);
let reportReason = reportMatch && reportMatch[1] ? reportMatch[1].trim() : '신고 사유 없음';

// 4. saveReport() 호출
const reportResult = await chatLogger.saveReport(
    targetMessageId,
    reporterName,
    reporterId,
    reportReason,
    'general'
);

// 5. 응답 메시지 반환
```

### 2. `saveReport()` - 신고 저장 (`server/db/chatLogger.js`)

#### 함수 시그니처
```javascript
async function saveReport(reportedMessageId, reporterName, reporterId, reportReason, reportType = 'general')
```

#### 파라미터
- `reportedMessageId`: 신고 대상 메시지 ID (kakao_log_id 또는 DB id)
- `reporterName`: 신고자 이름
- `reporterId`: 신고자 ID (선택)
- `reportReason`: 신고 사유
- `reportType`: 신고 타입 (기본값: 'general')

#### 처리 단계
1. **메시지 조회** (3단계 fallback):
   - `kakao_log_id`로 검색 (우선)
   - `metadata._id`로 검색 (fallback)
   - DB `id`로 검색 (fallback)

2. **메시지 찾기 실패 시**:
   - `moderationLogger.saveReportLog()` 호출
   - `report_logs` 테이블에 저장 (메시지 정보 없이)

3. **사용자 조회/생성**:
   - 신고자: `getOrCreateUser()` 호출
   - 피신고자: `users` 테이블에서 조회

4. **신고 정보 저장**:
   - `reports` 테이블에 INSERT
   - `status: 'pending'`으로 저장

#### 반환값
- 성공: `{ id, reported_message_id, reporter_name, ... }` (저장된 레코드)
- 실패: `null`

### 3. `extractReplyTarget()` - 답장 대상 메시지 ID 추출 (`server/db/utils/attachmentExtractor.js`)

#### 함수 시그니처
```javascript
function extractReplyTarget(attachment, referer, msgType = null)
```

#### 파라미터
- `attachment`: attachment JSON 객체 또는 문자열
- `referer`: referer 필드 값 (우선순위 1, 하지만 현재는 클라이언트에서 이미 추출해서 보냄)
- `msgType`: 메시지 타입 (예: 26 = 답장)

#### 처리 로직
1. **referer 필드 확인** (우선순위 1)
2. **attachment에서 추출** (우선순위 2):
   - `attachment.src_message`
   - `attachment.logId`
   - `attachment.src_logId`

#### 반환값
- 성공: `number` (kakao_log_id)
- 실패: `null`

---

## DB 스키마

### `reports` 테이블 (`server/db/reports_schema.sql`)

```sql
CREATE TABLE IF NOT EXISTS public.reports (
  id BIGSERIAL PRIMARY KEY,
  reported_message_id BIGINT NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  reporter_user_id BIGINT REFERENCES public.users(id) ON DELETE SET NULL,
  reporter_name VARCHAR(255) NOT NULL,
  reported_user_id BIGINT REFERENCES public.users(id) ON DELETE SET NULL,
  reported_user_name VARCHAR(255),
  original_message_text TEXT,
  original_message_time TIMESTAMPTZ,
  report_reason TEXT,
  report_type VARCHAR(50) DEFAULT 'general',
  status VARCHAR(50) DEFAULT 'pending',
  reviewed_by_user_id BIGINT REFERENCES public.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  resolution_note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### 주요 필드 설명
- `reported_message_id`: 신고 대상 메시지 ID (chat_messages.id FK)
- `reporter_user_id`: 신고자 user_id (users.id FK)
- `reporter_name`: 신고자 이름
- `reported_user_id`: 피신고자 user_id (users.id FK)
- `reported_user_name`: 피신고자 닉네임 (하위 호환성)
- `original_message_text`: 원문 내용
- `original_message_time`: 원문 작성 시간
- `report_reason`: 신고 사유 (사용자가 입력한 내용)
- `report_type`: 신고 타입 ('spam', 'abuse', 'inappropriate', 'other', 'general')
- `status`: 처리 상태 ('pending', 'reviewed', 'resolved', 'dismissed')

#### 인덱스
- `idx_reports_message_id`: `reported_message_id`
- `idx_reports_reporter_user_id`: `reporter_user_id`
- `idx_reports_reported_user_id`: `reported_user_id`
- `idx_reports_status`: `status`
- `idx_reports_created_at`: `created_at`

### `report_logs` 테이블 (Fallback용, `moderationLogger.js`에서 사용)

메시지를 찾을 수 없을 때 사용하는 로그 테이블입니다. `moderationLogger.saveReportLog()`에서 사용합니다.

---

## 사용 방법

### 정상 사용 시나리오

1. **카카오톡에서 메시지에 답장 버튼 클릭**
2. **`!신고` 또는 `!신고 [사유]` 입력**
   - 예: `!신고`
   - 예: `!신고 부적절한 내용입니다`
3. **봇이 신고 접수 확인 메시지 전송**
   ```
   ✅ 신고 접수 완료!
   
   📝 신고 내용이 관리자에게 전달되었습니다.
   🔍 검토 후 적절한 조치가 이루어집니다.
   
   감사합니다. 🙏
   ```

### 잘못된 사용 시나리오

1. **답장 버튼 없이 `!신고` 입력**
   - 결과: "📋 신고 방법 안내" 메시지 표시
   - 이유: `replyToMessageId`가 없음

2. **답장 버튼을 눌렀지만 `replyToMessageId`가 전달되지 않음**
   - 결과: "📋 신고 방법 안내" 메시지 표시
   - 원인: 클라이언트에서 `reply_to_message_id` 추출 실패

---

## 문제 해결 가이드

### 문제 1: "신고 방법 안내" 메시지만 나옴

#### 증상
- 답장 버튼을 눌렀는데도 "📋 신고 방법 안내" 메시지가 표시됨
- `replyToMessageId`가 `null` 또는 `undefined`

#### 원인 분석
1. **클라이언트에서 `reply_to_message_id` 추출 실패**
   - `json.reply_to_message_id`가 없음
   - `json.reply_to`가 없음
   - `json.parent_message_id`가 없음
   - `attachment`에서 추출 실패

2. **`kakao_log_id` → DB `id` 변환 실패**
   - `chat_messages` 테이블에 해당 `kakao_log_id`가 없음
   - `room_name` 매칭 실패

#### 해결 방법

##### 방법 1: 로그 확인
```javascript
// server/server.js에서 다음 로그 확인
console.log(`[답장 링크] 클라이언트에서 받은 값: reply_to_message_id=${json?.reply_to_message_id}, ...`);
console.log(`[답장 링크] 최종 reply_to_kakao_log_id: ${replyToKakaoLogId}`);
console.log(`[답장 링크] DB 조회 결과: ${replyToMessage ? `id=${replyToMessage.id}` : 'not found'}`);
console.log(`[handleMessage 호출] replyToMessageId 전달: ${replyToMessageId}, 타입: ${typeof replyToMessageId}`);

// server/labbot-node.js에서 다음 로그 확인
console.log('[신고] ✅ 신고 요청 감지:', { 
    replyToMessageId, 
    replyToMessageIdType: typeof replyToMessageId,
    replyToMessageIdValue: String(replyToMessageId),
    ...
});
```

##### 방법 2: 클라이언트 코드 확인
- `client/kakao_poller.py`에서 `reply_to_message_id` 추출 로직 확인
- `attachment` 필드에서 `src_message` 추출 로직 확인

##### 방법 3: DB 확인
```sql
-- 신고 대상 메시지가 DB에 있는지 확인
SELECT id, kakao_log_id, room_name, sender_name, message_text
FROM chat_messages
WHERE kakao_log_id = 3607650857048612864;  -- 실제 kakao_log_id로 변경

-- reply_to_kakao_log_id가 제대로 저장되었는지 확인
SELECT id, kakao_log_id, reply_to_kakao_log_id, reply_to_message_id
FROM chat_messages
WHERE reply_to_kakao_log_id IS NOT NULL
ORDER BY created_at DESC
LIMIT 10;
```

### 문제 2: 신고 저장 실패

#### 증상
- "❌ 신고 접수 실패" 메시지 표시
- `saveReport()`가 `null` 반환

#### 원인 분석
1. **메시지 찾기 실패**
   - `kakao_log_id`로 검색 실패
   - `metadata._id`로 검색 실패
   - DB `id`로 검색 실패

2. **DB 저장 실패**
   - `reports` 테이블이 없음
   - FK 제약 조건 위반
   - 필수 필드 누락

#### 해결 방법

##### 방법 1: 로그 확인
```javascript
// server/db/chatLogger.js에서 다음 로그 확인
console.log(`[신고] 1. kakao_log_id로 검색: ${reportedMessageId}`);
console.log(`[신고] ✅ kakao_log_id로 찾음: id=${message.id}`);
console.log(`[신고] 1 실패: ${err1?.message || 'not found'}`);
console.log(`[신고] 2. metadata._id로 검색: ${reportedMessageId}`);
console.log(`[신고] 3. DB id로 검색: ${reportedMessageId}`);
console.error('[채팅 로그] 신고 저장 실패:', error.message);
```

##### 방법 2: DB 확인
```sql
-- reports 테이블 존재 확인
SELECT * FROM information_schema.tables 
WHERE table_schema = 'public' AND table_name = 'reports';

-- 최근 신고 내역 확인
SELECT * FROM reports 
ORDER BY created_at DESC 
LIMIT 10;

-- FK 제약 조건 확인
SELECT 
    tc.constraint_name, 
    tc.table_name, 
    kcu.column_name,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
    ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY' 
    AND tc.table_name = 'reports';
```

### 문제 3: `replyToMessageId` 타입 불일치

#### 증상
- `replyToMessageId`가 문자열로 전달됨
- 숫자로 변환 필요

#### 해결 방법
```javascript
// server/labbot-node.js에서 타입 변환
const targetMessageId = replyToMessageId ? parseInt(replyToMessageId, 10) : null;
if (isNaN(targetMessageId)) {
    // 오류 처리
}
```

---

## 참조 파일 목록

### 핵심 파일
1. **`server/labbot-node.js`** (약 2298-2395줄)
   - 신고 명령어 감지 및 처리
   - `handleMessage()` 함수 내부

2. **`server/db/chatLogger.js`** (약 1284-1446줄)
   - `saveReport()` 함수
   - 신고 대상 메시지 조회 (3단계 fallback)
   - 신고 정보 DB 저장

3. **`server/db/moderationLogger.js`** (약 69-115줄)
   - `saveReportLog()` 함수 (fallback)
   - 메시지 찾기 실패 시 사용

4. **`server/server.js`** (약 3004-3094줄, 3654-3662줄)
   - `replyToMessageId` 추출 및 변환
   - `handleMessage()` 호출 시 `replyToMessageId` 전달

### 유틸리티 파일
5. **`server/db/utils/attachmentExtractor.js`** (약 17-73줄)
   - `extractReplyTarget()` 함수
   - attachment 필드에서 답장 대상 메시지 ID 추출

### DB 스키마 파일
6. **`server/db/reports_schema.sql`**
   - `reports` 테이블 생성
   - 인덱스 및 트리거 설정

### 참고 문서
7. **`server/IMPLEMENTATION_SUMMARY.md`**
   - 신고 기능 구현 요약

8. **`server/ISSUE_IMPROVEMENT_PROPOSAL.md`**
   - 신고 기능 문제 분석 및 개선안

---

## 주요 로그 포인트

### 클라이언트 → 서버 전송 시
```javascript
// server/server.js
console.log(`[답장 링크] 클라이언트에서 받은 값: reply_to_message_id=${json?.reply_to_message_id}, ...`);
console.log(`[답장 링크] 최종 reply_to_kakao_log_id: ${replyToKakaoLogId}`);
console.log(`[답장 링크] ✅ 즉시 변환 성공: kakao_log_id(${numericLogId}) → DB id(${replyToMessageId})`);
console.log(`[handleMessage 호출] replyToMessageId 전달: ${replyToMessageId}, 타입: ${typeof replyToMessageId}`);
```

### 신고 명령어 감지 시
```javascript
// server/labbot-node.js
console.log('[신고] ✅ 신고 요청 감지:', { 
    replyToMessageId, 
    replyToMessageIdType: typeof replyToMessageId,
    replyToMessageIdValue: String(replyToMessageId),
    reporter: sender, 
    message: msg.trim() 
});
console.log(`[신고] ⚠️ replyToMessageId 없음: ${replyToMessageId}, 타입: ${typeof replyToMessageId}`);
console.log('[신고] 처리 시작:', { replyToMessageId: targetMessageId, ... });
console.log('[신고] saveReport 호출:', { reportedMessageId: targetMessageId, ... });
console.log('[신고] 처리 결과:', reportResult ? '✅ 성공' : '❌ 실패');
```

### 신고 저장 시
```javascript
// server/db/chatLogger.js
console.log(`[신고] saveReport 시작: messageId=${reportedMessageId}, reporter=${reporterName}`);
console.log(`[신고] 1. kakao_log_id로 검색: ${reportedMessageId}`);
console.log(`[신고] ✅ kakao_log_id로 찾음: id=${message.id}, kakao_log_id=${message.kakao_log_id}`);
console.log(`[신고] 1 실패: ${err1?.message || 'not found'}`);
console.log(`[신고] 2. metadata._id로 검색: ${reportedMessageId}`);
console.log(`[신고] 3. DB id로 검색: ${reportedMessageId}`);
console.log('[신고 저장 완료]', { report_id: data.id, ... });
console.error('[채팅 로그] 신고 저장 실패:', error.message);
```

---

## 데이터 구조 예시

### 입력 데이터 (클라이언트 → 서버)
```json
{
  "type": "message",
  "room": "의운모",
  "sender": "신고자/1234567890",
  "message": "!신고 부적절한 내용입니다",
  "json": {
    "reply_to_message_id": 3607650857048612864,
    "myUserId": 429744344,
    "user_id": 1234567890
  }
}
```

### 처리 중 데이터
```javascript
// server/server.js에서 추출
replyToKakaoLogId = 3607650857048612864;  // kakao_log_id
replyToMessageId = 12345;  // DB id (변환 성공 시)

// server/labbot-node.js에서 추출
targetMessageId = 12345;  // DB id
reportReason = "부적절한 내용입니다";
reporterName = "신고자";
reporterId = "1234567890";
```

### 저장 데이터 (`reports` 테이블)
```sql
INSERT INTO reports (
    reported_message_id,  -- 12345 (DB id)
    reporter_user_id,     -- 10 (users.id)
    reporter_name,        -- "신고자"
    reported_user_id,     -- 20 (users.id)
    reported_user_name,   -- "피신고자"
    original_message_text, -- "부적절한 메시지 내용"
    original_message_time, -- "2025-01-20 10:00:00"
    report_reason,        -- "부적절한 내용입니다"
    report_type,          -- "general"
    status                -- "pending"
);
```

---

## 테스트 시나리오

### 시나리오 1: 정상 신고
1. 카카오톡에서 메시지에 답장 버튼 클릭
2. `!신고 부적절한 내용` 입력
3. **예상 결과**: "✅ 신고 접수 완료!" 메시지
4. **DB 확인**: `reports` 테이블에 신고 내역 저장됨

### 시나리오 2: 답장 버튼 없이 신고
1. 일반 메시지로 `!신고` 입력
2. **예상 결과**: "📋 신고 방법 안내" 메시지
3. **로그 확인**: `[신고] ⚠️ replyToMessageId 없음`

### 시나리오 3: 신고 대상 메시지 없음
1. 답장 버튼 클릭 후 `!신고` 입력
2. 하지만 해당 메시지가 DB에 없음
3. **예상 결과**: "✅ 신고 접수 완료!" (fallback으로 `report_logs`에 저장)
4. **DB 확인**: `report_logs` 테이블에 저장됨

---

## 주의사항

1. **`reports_schema.sql` 실행 순서**
   - `chat_logs_schema.sql` 먼저 실행 필요
   - `chat_messages` 테이블이 존재해야 FK 제약 조건 생성 가능

2. **`replyToMessageId` 타입**
   - 클라이언트에서 보내는 값: `kakao_log_id` (카카오톡 원본 ID)
   - 서버에서 변환: DB `id` (chat_messages.id)
   - `saveReport()`는 두 가지 모두 처리 가능 (3단계 fallback)

3. **메시지 찾기 실패 시**
   - `reports` 테이블에 저장 실패
   - `report_logs` 테이블에 저장 (fallback)
   - 사용자에게는 성공 메시지 표시 (UX 고려)

4. **멘션 불필요**
   - 기존에는 멘션(`@랩봇`)이 필요했지만, 현재는 답장 버튼만으로 처리
   - `!신고` 명령어만으로 충분

---

## 추가 개선 가능 사항

1. **신고 타입 자동 분류**
   - 신고 사유에서 키워드 추출하여 `report_type` 자동 설정

2. **중복 신고 방지**
   - 같은 메시지를 같은 사용자가 여러 번 신고하는 것 방지

3. **신고 알림**
   - 관리자에게 신고 접수 알림 전송

4. **신고 통계**
   - 사용자별 신고 횟수 집계
   - 메시지별 신고 횟수 집계

---

## 질문 예시 (GPT에게 질문할 때)

### 질문 1: 신고 기능이 작동하지 않습니다
```
답장 버튼을 눌렀는데도 "신고 방법 안내" 메시지가 나옵니다.
로그를 확인해보니 replyToMessageId가 null입니다.
어디서 문제가 발생했는지 확인해주세요.
```

### 질문 2: 신고 저장이 실패합니다
```
신고 명령어는 감지되지만 "신고 접수 실패" 메시지가 나옵니다.
saveReport() 함수가 null을 반환합니다.
어떤 원인일 수 있나요?
```

### 질문 3: replyToMessageId 타입 문제
```
replyToMessageId가 문자열로 전달되는데, 숫자로 변환이 필요합니다.
어디서 변환해야 하나요?
```

---

## 요약

- **핵심 로직**: `server/labbot-node.js`의 `handleMessage()` 내부 (약 2298-2395줄)
- **DB 저장**: `server/db/chatLogger.js`의 `saveReport()` 함수 (약 1284-1446줄)
- **ID 추출**: `server/server.js`에서 `replyToMessageId` 추출 및 변환 (약 3004-3094줄)
- **필수 조건**: 답장 버튼 클릭 + `!신고` 명령어
- **DB 테이블**: `reports` (메인), `report_logs` (fallback)



