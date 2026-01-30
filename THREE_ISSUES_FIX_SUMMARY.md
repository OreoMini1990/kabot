# 세 가지 문제 수정 요약

## 문제점

1. **질문 등록 후 "없음" 입력 시 응답 없음**: 질문 제출 후 응답이 오지 않음
2. **chat_reactions 저장 안 됨**: 반응 데이터가 DB에 저장되지 않음
3. **신고 기능 작동 안 함**: `msg_type=26` (답장)일 때 `reply_to_message_id`가 null로 나옴

## 수정 내용

### 1. 질문 등록 후 "없음" 입력 시 응답 없음 문제

**위치**: `server/bot/commands/cafe/questionCommand.js`

**변경 사항**:
- `processQuestionSubmission` 결과를 확인하고, 빈 배열이 반환되면 에러 메시지 추가
- 더 상세한 로그 추가

**코드 변경**:
```javascript
const questionReplies = await processQuestionSubmission(room, sender, title, content, null, json);
console.log(`[질문 대기] processQuestionSubmission 결과: replies.length=${questionReplies ? questionReplies.length : 0}`);
if (questionReplies && questionReplies.length > 0) {
    replies.push(...questionReplies);
    console.log(`[질문 대기] ✅ 질문 제출 완료: ${questionReplies.length}개 응답`);
} else {
    console.error(`[질문 대기] ❌ processQuestionSubmission이 빈 배열 반환`);
    replies.push("❌ 질문 제출 중 오류가 발생했습니다. 관리자에게 문의해주세요.");
}
```

### 2. chat_reactions 저장 안 됨 문제

**위치**: `server/server.js`

**변경 사항**:
- `supplement`에서 `allReactions` 추출 로직 강화
- 다양한 필드명 시도 (`reactions`, `all_reactions`, `emoticons`, `reactions.all`, `reactions.list`, `list`)
- 반응 개수는 있는데 `newReactions`와 `allReactions`가 모두 비어있을 때 경고 로그 추가

**코드 변경**:
```javascript
// 다양한 필드명 시도
const reactionsFromSupplement = 
  (Array.isArray(supplementObj.reactions) ? supplementObj.reactions : null) ||
  (Array.isArray(supplementObj.all_reactions) ? supplementObj.all_reactions : null) ||
  (Array.isArray(supplementObj.emoticons) ? supplementObj.emoticons : null) ||
  (Array.isArray(supplementObj.reactions?.all) ? supplementObj.reactions.all : null) ||
  (Array.isArray(supplementObj.reactions?.list) ? supplementObj.reactions.list : null) ||
  (Array.isArray(supplementObj.list) ? supplementObj.list : null) ||
  [];

// 반응 개수는 있는데 데이터가 없을 때 경고
if (newReactions.length === 0 && allReactions.length === 0 && newCount > 0) {
  console.warn(`[반응 업데이트] [2-2] ⚠️ 반응 개수는 ${newCount}개인데 newReactions와 allReactions가 모두 비어있음`);
}
```

### 3. 신고 기능 작동 안 함 문제

**위치**: `server/server.js`, `server/labbot-node.js`

**변경 사항**:
- `msg_type=26` (답장 메시지)일 때 `attachment`에서 `reply_to_kakao_log_id` 추출 강화
- `server.js`에서 `msg_type=26`일 때 `attachment` 추출 로직 추가
- `labbot-node.js`에서 신고 처리 시 `msg_type=26`일 때 `attachment` 추출 강화

**코드 변경** (`server/server.js`):
```javascript
// ⚠️ 중요: msg_type이 26(답장)인 경우 attachment에서 반드시 추출 시도
let replyToKakaoLogIdFromAttachment = null;
if (json?.msg_type === 26 || json?.type === 26 || (json?.attachment || json?.attachment_decrypted)) {
    replyToKakaoLogIdFromAttachment = extractReplyTarget(
        json?.attachment_decrypted || json?.attachment,
        null,
        json?.msg_type || json?.type
    );
    if (replyToKakaoLogIdFromAttachment) {
        console.log(`[답장 링크] ✅ attachment에서 추출: ${replyToKakaoLogIdFromAttachment}`);
    } else if (json?.msg_type === 26 || json?.type === 26) {
        console.log(`[답장 링크] ⚠️ msg_type=26인데 attachment에서 추출 실패`);
    }
}
```

**코드 변경** (`server/labbot-node.js`):
```javascript
// ⚠️ 중요: msg_type이 26(답장)인 경우 attachment에서 반드시 추출 시도
if (!replyToKakaoLogId && json && (json.attachment || json.attachment_decrypted || json.msg_type === 26 || json.type === 26)) {
    // ... extractReplyTarget 호출
    if (replyFromAttachment) {
        replyToKakaoLogId = replyFromAttachment;
        console.log(`[신고] ✅ attachment에서 reply_to_kakao_log_id 추출: ${replyToKakaoLogId}`);
    } else if (json.msg_type === 26 || json.type === 26) {
        console.log(`[신고] ⚠️ msg_type=26인데 attachment에서 추출 실패`);
    }
}
```

## 변경 파일

### [수정] server/bot/commands/cafe/questionCommand.js
- 질문 제출 후 응답 확인 로직 추가
- 빈 배열 반환 시 에러 메시지 추가

### [수정] server/server.js
- `msg_type=26`일 때 `attachment`에서 `reply_to_kakao_log_id` 추출 강화
- `supplement`에서 `allReactions` 추출 로직 강화
- 반응 데이터 없을 때 경고 로그 추가

### [수정] server/labbot-node.js
- 신고 처리 시 `msg_type=26`일 때 `attachment` 추출 강화

## 예상 결과

1. **질문 등록**: "없음" 입력 시 질문 제출 완료 메시지 또는 에러 메시지 표시
2. **반응 저장**: `supplement`에서 반응 데이터 추출 성공률 향상, 반응 데이터 없을 때 원인 파악 가능
3. **신고 기능**: `msg_type=26`일 때 `attachment`에서 답장 대상 메시지 ID 추출 성공률 향상

