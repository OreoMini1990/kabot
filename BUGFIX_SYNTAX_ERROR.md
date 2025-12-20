# SyntaxError 수정 완료

## 발견된 오류

### 오류 1: `questionSenderId` 중복 선언
- **위치**: `server/labbot-node.js` line 1634
- **에러 메시지**: `Identifier 'questionSenderId' has already been declared`
- **원인**: 1469줄에서 이미 선언된 변수를 1634줄에서 다시 선언

### 오류 2: `previousMessageImage` 중복 선언
- **위치**: `server/labbot-node.js` line 1522, 1640
- **에러 메시지**: `Cannot redeclare block-scoped variable 'previousMessageImage'`
- **원인**: 동일한 스코프에서 두 번 선언

## 수정 내용

### 1. `questionSenderId` 중복 선언 제거
- **1469줄**: 기존 선언을 `extractSenderId` 사용으로 개선
- **1634줄**: 중복 선언 제거, 주석으로 설명 추가

### 2. `previousMessageImage` 중복 선언 제거
- **1522줄**: Phase 4 캐시 조회 코드로 통합 (유지)
- **1640줄**: 중복 선언 제거 (기존 코드 제거)

## 수정 후 코드 구조

```javascript
// 1469줄: questionSenderId 선언 (extractSenderId 사용)
const questionSenderId = extractSenderId(null, sender) || (sender.includes('/') ? sender.split('/')[1] : null);

// ... (중간 코드) ...

// 1522줄: previousMessageImage 선언 (Phase 4 캐시 조회)
let previousMessageImage = getAndClearPendingAttachment(room, questionSenderId);

// ... (캐시에서 못 찾으면 DB 조회 fallback) ...

// 1635줄: 네이버 카페 질문 서비스 호출
const { submitQuestion, saveQuestionWithoutPermission } = require('./integrations/naverCafe/questionService');
const senderName = extractSenderName(sender);
// questionSenderId와 previousMessageImage는 위에서 이미 선언됨 (중복 선언 방지)
```

## 검증

- [x] Linter 오류 없음 확인
- [x] 중복 선언 제거 확인
- [x] 변수 스코프 정상 확인

## 상태

✅ **수정 완료** - 서버 재시작 후 정상 작동 예상

