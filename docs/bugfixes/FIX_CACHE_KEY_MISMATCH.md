# 캐시 키 불일치 문제 해결

## 문제 요약

**증상**: 질문 대기 상태 캐시 미스
- 저장 키: `"의운모|AN"`
- 조회 키: `"의운모|429744344"`

**원인**:
- `!질문` 명령어 처리 시 senderId가 "AN"으로 추출됨
- 이미지 메시지 처리 시 senderId가 "429744344"로 전달됨
- 캐시 키 불일치로 인해 질문과 이미지가 연결되지 않음

---

## 해결 방법

### 1. `!질문` 처리 시 숫자 ID 우선 추출

**파일**: `server/labbot-node.js` (라인 2223-2237)

**변경 전**:
```javascript
// 방법 3: sender에서 "/" 뒤의 ID 추출
if (!questionSenderId && sender && sender.includes('/')) {
    const parts = sender.split('/');
    const lastPart = parts[parts.length - 1];
    if (lastPart && /^\d+$/.test(lastPart.trim())) {
        questionSenderId = lastPart.trim();
    } else {
        // 숫자가 아니면 두 번째 부분 시도 (예: "랩장/AN/서울" -> "AN")
        const secondPart = parts.length > 1 ? parts[1] : null;
        if (secondPart) {
            questionSenderId = secondPart;  // ⚠️ "AN" 사용
        }
    }
}
```

**변경 후**:
```javascript
// 방법 3: sender에서 "/" 뒤의 ID 추출 (개선: 모든 부분에서 숫자 ID 찾기)
if (!questionSenderId && sender && sender.includes('/')) {
    const parts = sender.split('/');
    // 모든 부분에서 숫자 ID 찾기 (마지막부터 역순)
    for (let i = parts.length - 1; i >= 0; i--) {
        const part = parts[i].trim();
        if (/^\d+$/.test(part)) {
            questionSenderId = part;
            console.log(`[네이버 카페] ✅ sender split으로 숫자 ID 추출: ${questionSenderId} (인덱스 ${i})`);
            break;
        }
    }
    // 숫자를 찾지 못한 경우에만 두 번째 부분 사용 (하위 호환성)
    if (!questionSenderId && parts.length > 1) {
        questionSenderId = parts[1].trim();
        console.log(`[네이버 카페] ⚠️ 숫자 ID 없음, 두 번째 부분 사용: ${questionSenderId}`);
    }
}
```

**효과**:
- sender가 "랩장/AN/서울/429744344" 형식이면 "429744344" 추출
- sender가 "랩장/AN/서울" 형식이면 (숫자 없음) "AN" 사용 (하위 호환성)

### 2. `normalizeSenderIdForCache` 함수 강화

**파일**: `server/db/utils/roomKeyNormalizer.js`

**변경 전**:
```javascript
// 2. "이름/ID" 형식에서 마지막 부분이 숫자면 ID 추출
if (str.includes('/')) {
    const parts = str.split('/');
    const lastPart = parts[parts.length - 1].trim();
    if (/^\d+$/.test(lastPart)) {
        return lastPart;
    }
    return str;  // 숫자가 아니면 원본 그대로
}
```

**변경 후**:
```javascript
// 2. "이름/ID" 형식에서 모든 부분에서 숫자 ID 찾기 (마지막부터)
if (str.includes('/')) {
    const parts = str.split('/');
    // 모든 부분에서 숫자 ID 찾기 (마지막부터 역순)
    for (let i = parts.length - 1; i >= 0; i--) {
        const part = parts[i].trim();
        if (/^\d+$/.test(part)) {
            return part;  // 숫자 ID 반환
        }
    }
    // 숫자를 찾지 못한 경우 원본 그대로 (하위 호환성)
    return str;
}
```

**효과**:
- "AN" 같은 경우도 숫자 ID가 있으면 추출
- "랩장/AN/서울/429744344" → "429744344"
- "AN" (숫자 없음) → "AN" (그대로)

---

## 적용 방법

### 즉시 적용 (권장)

1. **코드 변경 완료** ✅
   - `server/labbot-node.js` 수정 완료
   - `server/db/utils/roomKeyNormalizer.js` 수정 완료

2. **서버 재시작 필요**
   ```bash
   pm2 restart kakkaobot-server
   ```

### 테스트

1. `!질문` 명령어 실행
2. 로그 확인:
   ```
   [네이버 카페] ✅ sender split으로 숫자 ID 추출: 429744344 (인덱스 X)
   [질문 대기] ✅ 상태 저장 완료: key="의운모|429744344"
   ```
3. 이미지 전송
4. 로그 확인:
   ```
   [질문 대기] 조회 시도: senderId="429744344"
   [질문 대기] 캐시 키 생성: "의운모|429744344"
   [질문 대기] ✅ 조회 및 삭제 성공: key="의운모|429744344"
   ```

---

## 예상 결과

### Before (수정 전)
```
[네이버 카페] ⚠️ sender split으로 추출 (숫자 아님): AN
[질문 대기] ✅ 상태 저장 완료: key="의운모|AN"

[이미지] senderId="429744344"
[질문 대기] 캐시 키 생성: "의운모|429744344"
[질문 대기] ⚠️ 캐시 미스: key="의운모|429744344"
```

### After (수정 후)
```
[네이버 카페] ✅ sender split으로 숫자 ID 추출: 429744344 (인덱스 3)
[질문 대기] ✅ 상태 저장 완료: key="의운모|429744344"

[이미지] senderId="429744344"
[질문 대기] 캐시 키 생성: "의운모|429744344"
[질문 대기] ✅ 조회 및 삭제 성공: key="의운모|429744344"
```

---

## 추가 개선 사항 (선택)

### fallback 로직 추가

이미지 메시지 처리 시 캐시 미스가 발생하면 여러 키로 재시도:

```javascript
// getAndClearPendingQuestion에서 fallback 추가
let pendingQuestion = getAndClearPendingQuestion(room, senderId);
if (!pendingQuestion && senderName) {
    // senderName으로도 시도
    pendingQuestion = getAndClearPendingQuestion(room, senderName);
}
```

하지만 이번 수정으로 대부분의 경우 해결될 것으로 예상됩니다.



