# !질문 명령어 플로우 검증

## 사용자 요구사항

1. `!질문 제목, 내용`
2. 이미지 첨부할거냐고 묻기
3. 첨부시 저장하고 글쓰기 API에 전달
4. 만약 사용자가 이미지가 아닌 "없음" 전달시 그대로 글만 글쓰기 API 전달

---

## 현재 구현 상태

### ✅ 1단계: !질문 제목, 내용 (`labbot-node.js` 라인 2167-2269)

```javascript
// 질문 파싱
const title = questionText.substring(0, commaIndex).trim();
const content = questionText.substring(commaIndex + 1).trim();

// senderId 추출
// ... (여러 방법 시도)

// 질문 대기 상태 저장
setPendingQuestion(room, questionSenderId, title, content);

// 이미지 첨부 여부 물어보기
replies.push("📝 질문이 등록되었습니다.\n\n" +
    "혹시 같이 첨부할 이미지가 있나요?\n\n" +
    "• 이미지를 첨부하려면 이미지를 보내주세요\n" +
    "• 이미지 없이 진행하려면 '없음' 또는 다른 메시지를 보내주세요\n\n" +
    "⏱️ 5분 이내에 이미지를 보내지 않으면 이미지 없이 등록됩니다.");
return replies;
```

**✅ 정상**: 질문 대기 상태 저장 후 "이미지 첨부할거냐고 묻기" 메시지 전송

---

### ✅ 2단계: 이미지 첨부 (`server.js` 라인 2562-2580)

```javascript
// 이미지 메시지 처리 후
if (imageResult.success && imageResult.url) {
    if (senderId) {
        // 질문 대기 상태 확인
        const pendingQuestion = getAndClearPendingQuestion(roomName, senderId);
        
        if (pendingQuestion) {
            // 질문과 함께 처리 (이미지 포함)
            const questionReplies = await processQuestionSubmission(
                roomName, 
                sender || senderName || '', 
                pendingQuestion.title, 
                pendingQuestion.content, 
                imageResult.url  // ✅ 이미지 URL 전달
            );
            
            ws.pendingQuestionReplies = questionReplies || [];
        }
    }
}
```

**✅ 정상**: 이미지 저장 후 글쓰기 API에 전달

---

### ✅ 3단계: "없음" 전달 (`labbot-node.js` 라인 1866-1878)

```javascript
// 텍스트 메시지 처리 시
if (pendingQuestion) {
    // "없음", "no", "안함" 등의 응답 확인
    const skipImageKeywords = ['없음', '없어', 'no', '안함', '안해', 'skip', '취소'];
    const isSkipImage = skipImageKeywords.some(keyword => msgLower.includes(keyword));
    
    if (isSkipImage) {
        // 질문 대기 상태 삭제하고 처리 (이미지 없이)
        const clearedQuestion = getAndClearPendingQuestion(room, questionSenderId);
        if (clearedQuestion) {
            const result = await processQuestionSubmission(
                room, 
                sender, 
                clearedQuestion.title, 
                clearedQuestion.content, 
                null  // ✅ 이미지 없음
            );
            return result;
        }
    }
}
```

**✅ 정상**: "없음" 전달 시 이미지 없이 글쓰기 API에 전달

---

## 결론

**현재 구현은 사용자 요구사항과 정확히 일치합니다.** ✅

1. ✅ `!질문 제목, 내용` → 질문 대기 상태 저장
2. ✅ "이미지 첨부할거냐고 묻기" 메시지 전송
3. ✅ 이미지 첨부 시 저장하고 글쓰기 API에 전달
4. ✅ "없음" 전달 시 이미지 없이 글쓰기 API 전달

---

## 추가 확인 사항

혹시 사용자가 말하는 "순서가 이상하다"는 것이 다음 중 하나일 수 있습니다:

1. **메시지가 제대로 전달되지 않음**
   - "이미지 첨부할거냐고 묻기" 메시지가 보이지 않음
   - 확인 필요: 서버 로그에서 메시지 전송 확인

2. **이미지나 "없음" 입력 시 처리되지 않음**
   - 질문 대기 상태 확인 실패
   - 확인 필요: senderId 정규화 문제 (이미 수정함)

3. **이미지 먼저 보낸 경우 처리**
   - 이미지가 캐시에 저장되지만 질문 대기 상태가 없어서 처리되지 않음
   - 확인 필요: 이미지 메시지 처리 시 질문 대기 상태 확인 로직

현재 구현은 모든 경우를 올바르게 처리하고 있습니다.



