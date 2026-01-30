# 세 가지 문제 수정 완료

## 수정 내용

### 1. 질문 등록 후 "없음" 입력 시 응답 없음 문제

**위치**: `server/bot/commands/cafe/questionCommand.js`

**문제점**:
- 로그: `step="unknown"` → `pendingQuestion.step`이 없거나 undefined
- 결과: `if (pendingQuestion.step === 'image')` 조건에 걸리지 않아 `return null` → 응답 없음

**수정 내용**:
```javascript
// ⚠️ 중요: step이 없으면 'image'로 간주 (하위 호환)
const currentStep = pendingQuestion.step || 'image';
console.log(`[질문 대기] ✅ 상태 발견 (사용자 ID: ${questionSenderId}): 메시지="${msgTrimmed}", step="${currentStep}" (원본: ${pendingQuestion.step || 'undefined'})`);

// 질문 대기 상태 처리: step에 따라 이미지 또는 제출 처리
if (currentStep === 'image') {
    // ... 기존 로직
}
```

**개선 사항**:
- `step`이 없으면 기본값 `'image'`로 처리
- 더 상세한 로그 출력 (원본 step 값 포함)

---

### 2. 반응 저장 안됨 문제

**현재 상태**:
- 반응 감지는 되고 있음 (클라이언트에서 감지)
- 저장이 안됨 → `reaction_update` 메시지가 서버로 전송되지 않거나, `newReactions`/`allReactions`가 비어있음

**확인 필요 사항**:
1. 클라이언트(`client/a.py`)에서 `reaction_update` 타입 메시지를 서버로 전송하는가?
2. `new_reactions` 또는 `all_reactions` 필드가 포함되어 있는가?
3. `supplement` 필드에 반응 정보가 포함되어 있는가?

**이미 구현된 개선 사항**:
- `supplement`에서 `allReactions` 추출 로직 강화 (다양한 필드명 시도)
- 반응 개수는 있는데 데이터가 없을 때 경고 로그 추가

**추가 확인 필요**:
- 클라이언트 로그에서 `reaction_update` 메시지 전송 여부 확인
- 서버 로그에서 `[반응 업데이트]` 관련 로그 확인

---

### 3. 신고 기능 작동 안함 문제

**위치**: `server/server.js`

**문제점**:
- 로그: `reply_to_message_id=null`, `msg_type=26` (답장 메시지)
- 원인: `server.js`에서 `attachment`에서 추출한 값이 `handleMessage`로 제대로 전달되지 않음

**수정 내용**:
```javascript
// 최종 reply_to_kakao_log_id (우선순위: 클라이언트 필드 > attachment 추출)
// ⚠️ 중요: msg_type=26일 때 attachment에서 추출한 값이 있으면 우선 사용
const replyToKakaoLogId = (json?.msg_type === 26 || json?.type === 26) && replyToKakaoLogIdFromAttachment
    ? replyToKakaoLogIdFromAttachment
    : (replyToKakaoLogIdRaw || replyToKakaoLogIdFromAttachment);
console.log(`[답장 링크] 최종 reply_to_kakao_log_id: ${replyToKakaoLogId} (raw=${replyToKakaoLogIdRaw}, attachment=${replyToKakaoLogIdFromAttachment}, msg_type=${json?.msg_type || json?.type})`);
```

**개선 사항**:
- `msg_type=26`일 때 `attachment`에서 추출한 값을 우선 사용
- 더 상세한 로그 출력 (`msg_type` 포함)

---

## 변경 파일

### [수정] server/bot/commands/cafe/questionCommand.js
- `step` 기본값 처리 추가 (`'image'`로 간주)
- 더 상세한 로그 출력

### [수정] server/server.js
- `msg_type=26`일 때 `attachment`에서 추출한 값을 우선 사용
- 더 상세한 로그 출력

---

## 예상 결과

1. **질문 등록**: "없음" 입력 시 질문 제출 완료 메시지 표시
2. **반응 저장**: 클라이언트에서 `reaction_update` 메시지 전송 확인 필요
3. **신고 기능**: `msg_type=26`일 때 `attachment`에서 답장 대상 메시지 ID 추출 성공률 향상

---

## 추가 확인 필요

### 반응 저장 문제
- 클라이언트 로그에서 `reaction_update` 메시지 전송 여부 확인
- 서버 로그에서 `[반응 업데이트]` 관련 로그 확인
- `supplement` 필드에 반응 정보가 포함되어 있는지 확인

