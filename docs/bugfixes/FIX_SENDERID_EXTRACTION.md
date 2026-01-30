# senderId 추출 로직 수정

## 문제 요약

**로그 분석 결과**:
- 라인 82: 캐시에 `의운모|AN` 저장됨
- 라인 83: 조회 시 `의운모|4897202238384073231` 사용 → 캐시 미스
- 라인 98-99: `handleMessage`에서 "서울", "랩장" 같은 잘못된 값으로 조회 시도

**원인**:
1. `handleMessage`에서 질문 대기 상태 확인 시 senderId 추출 로직이 불완전함
2. `senderNameOnly` 같은 fallback 로직이 혼란을 야기함
3. 숫자 ID 추출이 일관되지 않음

---

## 수정 내용

### 1. `handleMessage`에서 senderId 추출 로직 개선

**변경 전**:
```javascript
// 방법 1: sender에서 직접 숫자 ID 추출
if (sender) {
    const senderStr = String(sender);
    const idMatch = senderStr.match(/(\d+)$/);
    if (idMatch) {
        questionSenderId = idMatch[1];
    }
}

// 방법 2: extractSenderId 사용 (하위 호환성)
if (!questionSenderId) {
    questionSenderId = extractSenderId(null, sender) || (sender.includes('/') ? sender.split('/').pop() : null);
}

// 방법 3: sender에서 이름 추출 (이미지 메시지의 senderId와 매칭)
const senderNameOnly = sender && sender.includes('/') ? sender.split('/')[0] : sender;
```

**변경 후**:
```javascript
// 방법 1: sender에서 직접 숫자 ID 추출 (가장 정확)
if (sender) {
    const senderStr = String(sender);
    // "랩장/AN/서울/4897202238384073231" 형식에서 마지막 숫자 추출
    const idMatch = senderStr.match(/(\d+)$/);
    if (idMatch) {
        questionSenderId = idMatch[1];
        console.log(`[질문 대기] ✅ sender에서 숫자 ID 추출: ${questionSenderId}`);
    }
}

// 방법 2: extractSenderId 사용 (하위 호환성)
if (!questionSenderId) {
    questionSenderId = extractSenderId(null, sender);
    if (questionSenderId) {
        console.log(`[질문 대기] ✅ extractSenderId로 추출: ${questionSenderId}`);
    }
}

// 방법 3: sender에서 "/" 뒤의 ID 추출 (개선: 모든 부분에서 숫자 ID 찾기)
if (!questionSenderId && sender && sender.includes('/')) {
    const parts = sender.split('/');
    // 모든 부분에서 숫자 ID 찾기 (마지막부터 역순)
    for (let i = parts.length - 1; i >= 0; i--) {
        const part = parts[i].trim();
        if (/^\d+$/.test(part)) {
            questionSenderId = part;
            console.log(`[질문 대기] ✅ sender split으로 숫자 ID 추출: ${questionSenderId} (인덱스 ${i})`);
            break;
        }
    }
    // 숫자를 찾지 못한 경우에만 두 번째 부분 사용 (하위 호환성)
    if (!questionSenderId && parts.length > 1) {
        questionSenderId = parts[1].trim();
        console.log(`[질문 대기] ⚠️ 숫자 ID 없음, 두 번째 부분 사용: ${questionSenderId}`);
    }
}

// senderNameOnly는 더 이상 사용하지 않음 (숫자 ID를 우선적으로 사용)
```

**주요 변경점**:
- ✅ 방법 3에서 모든 부분을 역순으로 확인하여 숫자 ID 찾기
- ✅ 로깅 추가로 추출 과정 추적 가능
- ✅ `senderNameOnly` fallback 제거 (숫자 ID만 사용)

### 2. 질문 대기 상태 조회 로직 단순화

**변경 전**:
```javascript
// 여러 키로 질문 대기 상태 확인 (senderId, senderName 등)
let pendingQuestion = null;

// 1순위: senderId로 조회
if (questionSenderId) {
    pendingQuestion = getPendingQuestion(room, questionSenderId);
}

// 2순위: senderName으로 조회 (이미지 메시지의 senderId와 매칭을 위해)
if (!pendingQuestion && senderNameOnly) {
    pendingQuestion = getPendingQuestion(room, senderNameOnly);
}

// 3순위: 빈 roomName으로 senderName만으로 조회
if (!pendingQuestion && senderNameOnly) {
    pendingQuestion = getPendingQuestion('', senderNameOnly);
}
```

**변경 후**:
```javascript
// 질문 대기 상태 확인 (숫자 ID로만 조회)
let pendingQuestion = null;

// senderId로 조회 (정규화된 숫자 ID 사용)
if (questionSenderId) {
    pendingQuestion = getPendingQuestion(room, questionSenderId);
    console.log(`[질문 대기] 조회 결과: senderId="${questionSenderId}", found=${!!pendingQuestion}`);
} else {
    console.log(`[질문 대기] ⚠️ senderId 추출 실패, 질문 대기 상태 조회 불가: sender="${sender}"`);
}
```

**주요 변경점**:
- ✅ `senderNameOnly` fallback 제거
- ✅ 숫자 ID만 사용하여 조회
- ✅ 로깅 추가

### 3. 질문 대기 상태 삭제 로직 단순화

**변경 전**:
```javascript
// 여러 키로 질문 대기 상태 삭제 시도
let clearedQuestion = null;
if (questionSenderId) {
    clearedQuestion = getAndClearPendingQuestion(room, questionSenderId);
}
if (!clearedQuestion && senderNameOnly) {
    clearedQuestion = getAndClearPendingQuestion(room, senderNameOnly);
}
if (!clearedQuestion && senderNameOnly) {
    clearedQuestion = getAndClearPendingQuestion('', senderNameOnly);
}
```

**변경 후**:
```javascript
// 질문 대기 상태 삭제 (숫자 ID로만 삭제)
let clearedQuestion = null;
if (questionSenderId) {
    clearedQuestion = getAndClearPendingQuestion(room, questionSenderId);
    console.log(`[질문 대기] 삭제 결과: senderId="${questionSenderId}", found=${!!clearedQuestion}`);
} else {
    console.log(`[질문 대기] ⚠️ senderId 추출 실패, 질문 대기 상태 삭제 불가: sender="${sender}"`);
}
```

**주요 변경점**:
- ✅ `senderNameOnly` fallback 제거
- ✅ 숫자 ID만 사용하여 삭제
- ✅ 로깅 추가

---

## 예상 결과

### Before (수정 전)
```
[!질문] senderId 추출: "AN" (잘못됨)
[질문 대기] 저장: key="의운모|AN"

[이미지] senderId="4897202238384073231"
[질문 대기] 조회: key="의운모|4897202238384073231"
[질문 대기] ⚠️ 캐시 미스

[handleMessage] senderId 추출: "서울", "랩장" (잘못됨)
[질문 대기] 조회 시도: senderId="서울", senderId="랩장"
```

### After (수정 후)
```
[!질문] senderId 추출: "4897202238384073231" ✅
[질문 대기] 저장: key="의운모|4897202238384073231"

[이미지] senderId="4897202238384073231"
[질문 대기] 조회: key="의운모|4897202238384073231"
[질문 대기] ✅ 조회 및 삭제 성공 ✅

[handleMessage] senderId 추출: "4897202238384073231" ✅
[질문 대기] 조회: key="의운모|4897202238384073231"
[질문 대기] ✅ 조회 성공 ✅
```

---

## 테스트 방법

1. **`!질문` 명령어 테스트**:
   - `!질문 제목,내용` 실행
   - 로그 확인: `[네이버 카페] ✅ sender에서 숫자 ID 추출: 4897202238384073231`
   - 로그 확인: `[질문 대기] ✅ 상태 저장 완료: key="의운모|4897202238384073231"`

2. **이미지 메시지 테스트**:
   - 이미지 전송
   - 로그 확인: `[질문 대기] ✅ 조회 및 삭제 성공: key="의운모|4897202238384073231"`

3. **"없음" 메시지 테스트**:
   - "없음" 입력
   - 로그 확인: `[질문 대기] ✅ sender에서 숫자 ID 추출: 4897202238384073231`
   - 로그 확인: `[질문 대기] ✅ 조회 및 삭제 성공: key="의운모|4897202238384073231"`



