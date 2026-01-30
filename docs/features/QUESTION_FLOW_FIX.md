# !질문 명령어 플로우 수정

## 사용자 요구사항

**정확한 순서**:
1. `!질문 제목, 내용` → 질문 대기 상태 저장
2. "이미지 첨부할거냐고 묻기" 메시지 전송
3. 이미지 첨부 시: 이미지 저장하고 글쓰기 API에 전달
4. "없음" 전달 시: 이미지 없이 글쓰기 API 전달

---

## 현재 구현 분석

### 현재 플로우

**1단계: !질문 명령어** (`labbot-node.js` 라인 2167-2279)
- ✅ 질문 파싱 (제목, 내용)
- ✅ senderId 추출
- ⚠️ **이미지 캐시 확인** (라인 2249-2259) ← 혼란의 원인
  - 캐시에 이미지가 있으면 바로 처리하고 return
  - 없으면 질문 대기 상태 저장
- ✅ 질문 대기 상태 저장 (`setPendingQuestion`)
- ✅ "이미지 첨부할거냐고 묻기" 메시지 전송

**2단계: 이미지 메시지** (`server.js` 라인 2562-2580)
- ✅ 질문 대기 상태 확인 (`getAndClearPendingQuestion`)
- ✅ 있으면 `processQuestionSubmission` 호출 (이미지 포함)

**3단계: 텍스트 메시지 ("없음" 등)** (`labbot-node.js` 라인 1866-1878)
- ✅ 질문 대기 상태 확인
- ✅ "없음" 키워드 확인
- ✅ 있으면 `processQuestionSubmission` 호출 (이미지 없이)

---

## 문제점

### 문제 1: 이미지 캐시 확인 로직이 혼란스러움

현재 `!질문` 명령어에서 이미지 캐시를 먼저 확인합니다:
```javascript
// 먼저 캐시된 이미지 확인 (이미지가 먼저 도착했을 수 있음)
const cachedImageUrl = getAndClearPendingAttachment(room, questionSenderId);

if (cachedImageUrl) {
    // 이미지가 있으면 바로 처리 (질문 대기 상태 저장 불필요)
    const result = await processQuestionSubmission(room, sender, title, content, cachedImageUrl);
    return result;
}
```

**문제**: 사용자가 이미지를 먼저 보낸 경우, `!질문` 명령어가 바로 처리되어 "이미지 첨부할거냐고 묻기" 메시지가 전송되지 않습니다.

**해결**: 이미지 캐시 확인 로직을 제거하고, 항상 질문 대기 상태를 저장한 후 "이미지 첨부할거냐고 묻기" 메시지를 전송합니다. 이미지가 캐시에 있으면 이미지 메시지 처리 단계에서 자동으로 처리됩니다.

---

## 수정 방안

### 수정 1: 이미지 캐시 확인 로직 제거

`labbot-node.js` 라인 2249-2259의 이미지 캐시 확인 로직을 제거:

```javascript
// ❌ 제거할 코드
// 먼저 캐시된 이미지 확인 (이미지가 먼저 도착했을 수 있음)
const { getAndClearPendingAttachment } = require('./labbot-node');
const cachedImageUrl = getAndClearPendingAttachment(room, questionSenderId);

if (cachedImageUrl) {
    console.log(`[네이버 카페] ✅ 캐시에서 이미지 URL 발견: ${cachedImageUrl.substring(0, 50)}...`);
    // 이미지가 있으면 바로 처리 (질문 대기 상태 저장 불필요)
    const result = await processQuestionSubmission(room, sender, title, content, cachedImageUrl);
    console.log(`[네이버 카페] ✅ 질문 처리 완료 (이미지 포함): ${questionSenderId}`);
    return result;
}
```

**대신**: 항상 질문 대기 상태를 저장하고 "이미지 첨부할거냐고 묻기" 메시지를 전송합니다.

---

## 수정된 플로우

### 정확한 순서

**1단계: !질문 제목, 내용**
```
사용자: !질문 제목, 내용
봇: 📝 질문이 등록되었습니다.
    혹시 같이 첨부할 이미지가 있나요?
    • 이미지를 첨부하려면 이미지를 보내주세요
    • 이미지 없이 진행하려면 '없음' 또는 다른 메시지를 보내주세요
```
- 질문 대기 상태 저장 (`setPendingQuestion`)
- "이미지 첨부할거냐고 묻기" 메시지 전송

**2-1: 이미지 첨부**
```
사용자: [이미지 전송]
봇: ✅ 질문 작성 완료!
    Q. 제목
    내용
    📷 (이미지 첨부 완료)
    답변하러가기: [URL]
```
- 이미지 메시지 처리 (`server.js`)
- 질문 대기 상태 확인 (`getAndClearPendingQuestion`)
- `processQuestionSubmission` 호출 (이미지 포함)

**2-2: "없음" 전달**
```
사용자: 없음
봇: ✅ 질문 작성 완료!
    Q. 제목
    내용
    답변하러가기: [URL]
```
- 텍스트 메시지 처리 (`labbot-node.js`)
- 질문 대기 상태 확인 (`getPendingQuestion`)
- "없음" 키워드 확인
- `processQuestionSubmission` 호출 (이미지 없이)

---

## 이미지 먼저 보낸 경우 처리

**현재**: 이미지가 캐시에 저장되고, `!질문` 명령어가 캐시를 확인하여 바로 처리

**수정 후**: 
1. 이미지 전송 → 캐시에 저장 (질문 대기 상태 없으므로 답장 없음)
2. `!질문` 명령어 → 질문 대기 상태 저장 + "이미지 첨부할거냐고 묻기" 메시지 전송
3. 사용자가 다시 이미지를 보내거나 "없음" 전달
   - 이미지: 캐시에서 이미지 찾아서 처리 (또는 새 이미지 처리)
   - 없음: 이미지 없이 처리

**또는 더 나은 방법**: 이미지 메시지 처리 시 질문 대기 상태가 없으면, 이미지를 캐시에 저장하지만 질문 대기 상태를 생성하지 않습니다. 사용자가 `!질문`을 입력하면, 이미지 캐시를 확인하여 있으면 자동으로 첨부하도록 할 수 있습니다.

하지만 사용자의 요구사항은 "이미지 먼저 보낸 경우"에 대한 명확한 설명이 없으므로, 현재 수정 방안대로 진행합니다.



