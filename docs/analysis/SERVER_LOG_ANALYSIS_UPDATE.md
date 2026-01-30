# 서버 로그 분석 업데이트 (2025-12-20T11:46:27)

## 로그 분석 결과

### ✅ 정상 작동
- 이미지 메시지 감지 및 처리
- Attachment 복호화
- 이미지 다운로드 및 서버 저장
- Bridge APK 전송

### ⚠️ 여전히 문제 발생

**라인 129-133**:
```
[질문 대기] 조회 시도: roomName="의운모", senderId="429744344"
[질문 대기] 캐시 키 생성: "의운모|429744344"
[질문 대기] 현재 캐시 키 개수: 1
[질문 대기] 유사 키 샘플: 의운모|AN
[질문 대기] ⚠️ 캐시 미스: key="의운모|429744344"
```

**분석**:
- 캐시에 저장된 키: `"의운모|AN"`
- 조회 시도 키: `"의운모|429744344"`
- **정규화 함수가 적용되지 않음** (서버 재시작 필요 또는 코드 미배포)

---

## 해결 방법

### 방법 1: 서버 재시작 (권장)

`normalizeSenderIdForCache` 함수가 추가되었지만, 실행 중인 서버 프로세스에는 적용되지 않았습니다.

```bash
# 서버 재시작
pm2 restart kakkaobot-server
```

### 방법 2: 코드 확인

`setPendingQuestion` 호출 시 senderId가 정규화되는지 확인:

```javascript
// server/labbot-node.js 라인 2266
setPendingQuestion(room, questionSenderId, title, content);
```

**확인 사항**:
1. `questionSenderId` 값이 "AN"인지 "429744344"인지 확인
2. `createCacheKey`가 `normalizeSenderIdForCache`를 호출하는지 확인

### 방법 3: 추가 로깅

`setPendingQuestion` 호출 시 로깅 추가:

```javascript
console.log(`[질문 대기] 저장 시도: roomName="${roomName}", senderId="${senderId}", title="${title}"`);
console.log(`[질문 대기] senderId 정규화 전: "${senderId}"`);
const key = createCacheKey(roomName, senderId);
console.log(`[질문 대기] 캐시 키 생성: "${key}"`);
console.log(`[질문 대기] senderId 정규화 후: "${key.split('|')[1]}"`);
```

---

## 근본 원인 분석

### 문제점 1: `!질문` 명령어 처리 시 senderId 추출

**코드 위치**: `server/labbot-node.js` 라인 2203-2237

```javascript
// 방법 1: sender에서 직접 숫자 ID 추출 (가장 정확)
if (sender) {
    const senderStr = String(sender);
    const idMatch = senderStr.match(/(\d+)$/);
    if (idMatch) {
        questionSenderId = idMatch[1];
    }
}

// 방법 2: extractSenderId 사용
if (!questionSenderId) {
    questionSenderId = extractSenderId(null, sender);
}

// 방법 3: sender split으로 추출
if (!questionSenderId && sender && sender.includes('/')) {
    const parts = sender.split('/');
    const lastPart = parts[parts.length - 1];
    if (lastPart && /^\d+$/.test(lastPart.trim())) {
        questionSenderId = lastPart.trim();
    } else {
        // 숫자가 아니면 두 번째 부분 시도 (예: "랩장/AN/서울" -> "AN")
        const secondPart = parts.length > 1 ? parts[1] : null;
        if (secondPart) {
            questionSenderId = secondPart;  // ⚠️ 여기서 "AN"이 설정됨
        }
    }
}
```

**문제**:
- sender가 "랩장/AN/서울" 형식일 때
- 마지막 부분이 숫자가 아니면 두 번째 부분("AN")을 사용
- 하지만 이미지 메시지에서는 sender="429744344"로 숫자 ID가 직접 전달됨

### 해결책

**Option A: `!질문` 처리 시 숫자 ID 강제 추출**

```javascript
// 방법 3 개선: 숫자가 아니면 마지막 숫자 부분 찾기
if (!questionSenderId && sender && sender.includes('/')) {
    const parts = sender.split('/');
    // 모든 부분에서 숫자 ID 찾기
    for (let i = parts.length - 1; i >= 0; i--) {
        const part = parts[i].trim();
        if (/^\d+$/.test(part)) {
            questionSenderId = part;
            console.log(`[네이버 카페] ✅ sender split으로 숫자 ID 추출: ${questionSenderId}`);
            break;
        }
    }
    // 숫자를 찾지 못한 경우에만 두 번째 부분 사용
    if (!questionSenderId && parts.length > 1) {
        questionSenderId = parts[1];
        console.log(`[네이버 카페] ⚠️ 숫자 ID 없음, 두 번째 부분 사용: ${questionSenderId}`);
    }
}
```

**Option B: `createCacheKey` 정규화 강화**

이미 적용했지만, "AN" 같은 경우는 그대로 유지됩니다. 

더 강력한 정규화:
```javascript
function normalizeSenderIdForCache(senderId) {
    if (!senderId) return '';
    const str = String(senderId).trim();
    
    // 1. 숫자만 있으면 그대로 사용
    if (/^\d+$/.test(str)) {
        return str;
    }
    
    // 2. "이름/ID" 형식에서 마지막 숫자 부분 추출
    if (str.includes('/')) {
        const parts = str.split('/');
        // 마지막부터 역순으로 숫자 찾기
        for (let i = parts.length - 1; i >= 0; i--) {
            const part = parts[i].trim();
            if (/^\d+$/.test(part)) {
                return part;  // 숫자 ID 반환
            }
        }
        // 숫자를 찾지 못한 경우 원본 유지 (하위 호환성)
        return str;
    }
    
    return str;
}
```

---

## 즉시 적용 권장

### 1. 서버 재시작
```bash
pm2 restart kakkaobot-server
```

### 2. `!질문` 처리 로직 개선

`server/labbot-node.js` 라인 2223-2237 수정:

```javascript
// 방법 3: sender에서 "/" 뒤의 ID 추출 (개선)
if (!questionSenderId && sender && sender.includes('/')) {
    const parts = sender.split('/');
    // 모든 부분에서 숫자 ID 찾기 (마지막부터)
    for (let i = parts.length - 1; i >= 0; i--) {
        const part = parts[i].trim();
        if (/^\d+$/.test(part)) {
            questionSenderId = part;
            console.log(`[네이버 카페] ✅ sender split으로 숫자 ID 추출: ${questionSenderId}`);
            break;
        }
    }
    // 숫자를 찾지 못한 경우에만 두 번째 부분 사용
    if (!questionSenderId && parts.length > 1) {
        questionSenderId = parts[1];
        console.log(`[네이버 카페] ⚠️ 숫자 ID 없음, 두 번째 부분 사용: ${questionSenderId}`);
    }
}
```

---

## 테스트 방법

1. **서버 재시작 후 테스트**:
   - `!질문` 명령어 실행
   - 이미지 전송
   - 캐시 키 일치 여부 확인

2. **로깅 확인**:
   - `[질문 대기] 저장 시도` 로그에서 senderId 확인
   - `[질문 대기] 캐시 키 생성` 로그에서 생성된 키 확인
   - `[이미지 + 질문] 질문 대기 상태 확인` 로그에서 조회 키 확인

---

## 예상 결과 (수정 후)

### Before (현재)
```
[질문 대기] 저장: senderId="AN", 캐시 키="의운모|AN"
[이미지] 조회: senderId="429744344", 캐시 키="의운모|429744344"
→ 캐시 미스 ❌
```

### After (수정 후)
```
[질문 대기] 저장: senderId="429744344", 캐시 키="의운모|429744344"
[이미지] 조회: senderId="429744344", 캐시 키="의운모|429744344"
→ 캐시 히트 ✅
```

또는

```
[질문 대기] 저장: senderId="AN", 캐시 키="의운모|429744344" (정규화 후)
[이미지] 조회: senderId="429744344", 캐시 키="의운모|429744344" (정규화 후)
→ 캐시 히트 ✅
```



