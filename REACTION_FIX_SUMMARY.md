# 반응 감지 및 저장 로직 수정 요약

## 문제점

1. **`chat_reactions` 테이블이 비어있음**
   - 클라이언트에서 `new_reactions`만 전송
   - 서버에서 `newReactions` 배열만 처리
   - 첫 실행 시 모든 반응을 전송하지만, 이후에는 새 반응만 전송
   - 서버에서 `allReactions`를 사용하지 않음

## 수정 내용

### 1. `allReactions` 사용 로직 추가

**위치**: `server/server.js` (라인 1299-1300)

**변경 전**:
```javascript
if (Array.isArray(newReactions) && newReactions.length > 0) {
  // newReactions만 처리
}
```

**변경 후**:
```javascript
// ⚠️ 중요: newReactions가 비어있으면 allReactions 사용 (첫 실행 또는 전체 동기화)
const reactionsToProcess = (Array.isArray(newReactions) && newReactions.length > 0) 
  ? newReactions 
  : (Array.isArray(allReactions) && allReactions.length > 0) 
    ? allReactions 
    : [];
```

### 2. `supplement`에서 `allReactions` 추출 로직 추가

**위치**: `server/server.js` (라인 1184-1201)

**변경 내용**:
- `supplement` 필드에서 `reactions` 또는 `emoticons` 추출
- `newReactions`와 `allReactions`가 모두 비어있을 때 `supplement`에서 추출 시도

### 3. 로그 개선

- 처리할 반응 개수 상세 로그 출력
- `newReactions`, `allReactions`, `reactionsToProcess` 개수 모두 출력

## 예상 결과

1. **첫 실행 시**: `allReactions` 또는 `supplement`에서 모든 반응 추출하여 저장
2. **이후 실행 시**: `newReactions`만 처리 (기존 로직 유지)
3. **동기화**: `allReactions`가 있으면 전체 반응 동기화

## 테스트 필요 사항

1. **반응 추가 테스트**: 메시지에 반응 추가 시 `chat_reactions` 테이블에 저장되는지 확인
2. **첫 실행 테스트**: 서버 재시작 후 기존 반응이 저장되는지 확인
3. **로그 확인**: `[반응 업데이트]` 관련 로그에서 처리할 반응 개수 확인

## 변경 파일

### [수정] server/server.js
- `allReactions` 사용 로직 추가
- `supplement`에서 `allReactions` 추출 로직 추가
- 로그 개선

