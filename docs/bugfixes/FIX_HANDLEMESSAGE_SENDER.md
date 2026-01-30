# handleMessage 호출 시 sender 전달 문제 수정

## 문제 요약

**로그 분석**:
- 라인 71: `handleMessage` 호출 시 sender="랩장/AN/서울" (숫자 ID 없음)
- 라인 72: "⚠️ 숫자 ID 없음, 두 번째 부분 사용: AN"
- 라인 74: senderId="AN"으로 질문 대기 상태 찾음 (`의운모|AN`)
- 이미지 메시지 처리 시 senderId="4897202238384073231"로 조회 → 캐시 미스

**원인**:
- `handleMessage` 호출 시 `senderName`만 전달 (`senderName || sender || ''`)
- `senderName`은 `extractSenderName`으로 추출한 값으로 "랩장/AN/서울" 같은 형식
- 숫자 ID가 포함되지 않아 추출 실패

---

## 수정 내용

### 변경 전

```javascript
replies = await handleMessage(
  decryptedRoomName || '',
  decryptedMessage || '',
  senderName || sender || '',  // 닉네임 우선, 없으면 원본 sender 사용
  isGroupChat !== undefined ? isGroupChat : true,
  replyToMessageId
);
```

**문제**: `senderName`이 우선되어 숫자 ID가 없는 "랩장/AN/서울" 형식이 전달됨

### 변경 후

```javascript
// ⚠️ 중요: handleMessage에 원본 sender 전달 (숫자 ID 추출을 위해)
// senderName만 전달하면 "랩장/AN/서울" 같은 형식으로 숫자 ID가 없어 추출 실패
const senderForHandleMessage = sender || senderName || '';
replies = await handleMessage(
  decryptedRoomName || '',
  decryptedMessage || '',
  senderForHandleMessage,  // 원본 sender 우선 (숫자 ID 포함 가능)
  isGroupChat !== undefined ? isGroupChat : true,
  replyToMessageId
);
```

**효과**: 원본 `sender`가 우선되어 "EnmdCn3K/.../4897202238384073231" 같은 형식이 전달됨

---

## sender 형식 설명

### 원본 sender (클라이언트에서 전송)
```
"EnmdCn3K/kxHc9v0PW0rg/K/cHp6J8PIDhTMTQUbHt8=/4897202238384073231"
```
- 암호화된 이름 부분 + 숫자 ID
- 숫자 ID 추출 가능 ✅

### senderName (extractSenderName으로 추출)
```
"랩장/AN/서울"
```
- 복호화된 이름만 포함
- 숫자 ID 없음 ❌

---

## 예상 결과

### Before (수정 전)
```
handleMessage 호출: sender="랩장/AN/서울"
senderId 추출: "AN" (잘못됨)
질문 대기 상태 저장: key="의운모|AN"

이미지 메시지 처리: senderId="4897202238384073231"
질문 대기 상태 조회: key="의운모|4897202238384073231"
캐시 미스 ❌
```

### After (수정 후)
```
handleMessage 호출: sender="EnmdCn3K/.../4897202238384073231"
senderId 추출: "4897202238384073231" ✅
질문 대기 상태 저장: key="의운모|4897202238384073231"

이미지 메시지 처리: senderId="4897202238384073231"
질문 대기 상태 조회: key="의운모|4897202238384073231"
캐시 히트 ✅
```

---

## 테스트 방법

1. `!질문 제목,내용` 명령어 실행
2. 로그 확인:
   - `[네이버 카페] ✅ sender에서 숫자 ID 추출: 4897202238384073231`
   - `[질문 대기] ✅ 상태 저장 완료: key="의운모|4897202238384073231"`
3. 이미지 전송
4. 로그 확인:
   - `[질문 대기] ✅ 조회 및 삭제 성공: key="의운모|4897202238384073231"`



