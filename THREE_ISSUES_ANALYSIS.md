# 세 가지 문제 분석 및 개선 방안

## 1. !질문 제목,내용 -> 이미지여부에서 "없음" 입력 시 응답 없음

### 현재 로직
```javascript
// server/bot/commands/cafe/questionCommand.js
// 1. !질문 제목,내용 입력 시 step='image'로 저장
setPendingQuestion(room, questionSenderId, {
    step: 'image',
    title: title,
    content: content,
    ...
});

// 2. "없음" 입력 시 step='image'인지 확인
if (pendingQuestion.step === 'image') {
    const isSkipImage = skipImageKeywords.some(keyword => msgLower.includes(keyword));
    if (isSkipImage) {
        // 질문 제출
        const questionReplies = await processQuestionSubmission(...);
        replies.push(...questionReplies);
        return replies;
    }
}
```

### 문제점
- **로그**: `step="unknown"` → `pendingQuestion.step`이 없거나 undefined
- **원인**: `getPendingQuestion`이 반환하는 객체에 `step` 필드가 없거나, 캐시에서 가져올 때 손실됨
- **결과**: `if (pendingQuestion.step === 'image')` 조건에 걸리지 않아 `return null` → 응답 없음

### 개선 방안
1. **step 기본값 처리**: `step`이 없으면 `'image'`로 간주
2. **캐시 저장 확인**: `setPendingQuestion` 시 `step` 필드가 제대로 저장되는지 확인
3. **로깅 강화**: `getPendingQuestion` 결과를 로그로 출력

### 수정 코드
```javascript
// step이 없으면 'image'로 간주 (하위 호환)
const currentStep = pendingQuestion.step || 'image';
if (currentStep === 'image') {
    // ... 기존 로직
}
```

---

## 2. 반응 감지는 되는데 저장이 안됨

### 현재 로직
```javascript
// server/server.js
// 1. reaction_update 타입 메시지 수신
if (messageData.type === 'reaction_update') {
    const newReactions = json?.new_reactions || [];
    const allReactions = json?.all_reactions || [];
    
    // 2. supplement에서 allReactions 추출 시도
    if (!allReactions.length && supplement) {
        // supplement 파싱하여 allReactions 추출
    }
    
    // 3. reactionsToProcess 결정
    const reactionsToProcess = newReactions.length > 0 
        ? newReactions 
        : allReactions.length > 0 
            ? allReactions 
            : [];
    
    // 4. 각 반응 저장
    for (const reactionDetail of reactionsToProcess) {
        await chatLogger.saveReaction(actualMessageId, ...);
    }
}
```

### 문제점
- **반응 감지는 됨**: 클라이언트에서 반응을 감지하고 있음
- **저장이 안됨**: `reaction_update` 메시지가 서버로 전송되지 않거나, `newReactions`/`allReactions`가 비어있음
- **트리거 문제**: 클라이언트의 `poll_reaction_updates()`가 주기적으로 실행되지만, 서버로 전송하는 로직이 없거나 실패

### 개선 방안
1. **클라이언트 확인**: `client/a.py`의 `poll_reaction_updates()`에서 `reaction_update` 메시지를 서버로 전송하는지 확인
2. **supplement 파싱 강화**: 다양한 필드명 시도 (이미 구현됨)
3. **로깅 강화**: `reaction_update` 메시지 수신 여부, `newReactions`/`allReactions` 개수 로그 출력

### 확인 필요 사항
- 클라이언트에서 `reaction_update` 타입 메시지를 서버로 전송하는가?
- `new_reactions` 또는 `all_reactions` 필드가 포함되어 있는가?
- `supplement` 필드에 반응 정보가 포함되어 있는가?

---

## 3. 신고 기능 작동 안함

### 현재 로직
```javascript
// server/labbot-node.js
// 1. !신고 명령어 감지
if (hasReportCommand) {
    // 2. reply_to_kakao_log_id 추출 (4단계)
    // - json 필드에서 추출
    // - metadata에서 추출
    // - attachment에서 추출 (msg_type=26일 때)
    
    // 3. kakao_log_id를 DB id로 변환
    if (replyToKakaoLogId) {
        const { data: replyToMessage } = await db.supabase
            .from('chat_messages')
            .select('id')
            .eq('kakao_log_id', numericLogId)
            .eq('room_name', room)
            .maybeSingle();
        
        if (replyToMessage) {
            actualReplyToMessageId = replyToMessage.id;
        }
    }
    
    // 4. replyToMessageId 없으면 에러 메시지
    if (!actualReplyToMessageId) {
        replies.push("📋 신고 방법 안내...");
        return replies;
    }
}
```

### 문제점
- **로그**: `reply_to_message_id=null`, `msg_type=26` (답장 메시지)
- **원인**: 
  1. `server.js`에서 `msg_type=26`일 때 `attachment`에서 추출하지만, `replyToKakaoLogId`가 `null`로 전달됨
  2. `labbot-node.js`에서 `attachment` 추출 시도하지만, 이미 `null`이거나 추출 실패
  3. `extractReplyTarget`이 `attachment`에서 `src_message` 또는 `logId`를 찾지 못함

### 개선 방안
1. **server.js에서 추출 강화**: `msg_type=26`일 때 `attachment`에서 추출한 값을 `replyToKakaoLogId`로 전달
2. **extractReplyTarget 개선**: `attachment` 파싱 실패 시 더 자세한 로그 출력
3. **fallback 로직**: `attachment`가 문자열인 경우 JSON 파싱 시도

### 수정 코드
```javascript
// server/server.js
// msg_type=26일 때 attachment에서 추출 강화
if (json?.msg_type === 26 || json?.type === 26) {
    const replyFromAttachment = extractReplyTarget(
        json.attachment_decrypted || json.attachment,
        null,
        json.msg_type || json.type
    );
    if (replyFromAttachment) {
        replyToKakaoLogId = replyFromAttachment; // ✅ 이 값이 handleMessage로 전달되어야 함
    }
}
```

---

## 요약

### 1. 질문 등록 문제
- **문제**: `step="unknown"`으로 인해 조건문에 걸리지 않음
- **해결**: `step` 기본값 처리 또는 캐시 저장 확인

### 2. 반응 저장 문제
- **문제**: `reaction_update` 메시지가 서버로 전송되지 않거나, `newReactions`/`allReactions`가 비어있음
- **해결**: 클라이언트 전송 로직 확인, supplement 파싱 강화

### 3. 신고 기능 문제
- **문제**: `msg_type=26`일 때 `attachment`에서 `reply_to_kakao_log_id` 추출 실패
- **해결**: `server.js`에서 추출 강화, `extractReplyTarget` 개선

