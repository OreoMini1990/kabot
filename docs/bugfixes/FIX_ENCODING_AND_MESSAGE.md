# 인코딩 문제 및 메시지 전송 문제 해결

## 문제 요약

1. **인코딩 문제**: 네이버 카페에 글을 발행할 때 한글이 깨짐 (예: "!질문 테스트" → "◇꿩 ◇뜀 ◇듁")
2. **메시지 미표시**: 글쓰기 완료 시 "✅ 질문 작성 완료!" 메시지가 표시되지 않음

---

## 인코딩 문제 해결 방안

### 현재 상태

FormData를 사용할 때:
- Buffer.from(subject, 'utf8') + contentType 옵션 사용 → 여전히 깨짐
- 원본 문자열 사용 → FormData가 자동으로 UTF-8 인코딩

### 네이버 카페 API 요구사항

Java 예제를 보면:
- multipart/form-data의 각 필드에 Content-Type: text/plain; charset=UTF-8 명시

### 해결 방법

FormData 라이브러리는 기본적으로 UTF-8을 사용하므로, 원본 문자열을 그대로 사용하는 것이 가장 안전합니다.

만약 여전히 깨진다면, 네이버 카페 API가 특정 인코딩 방식을 요구할 수 있으므로:
1. application/x-www-form-urlencoded 방식 확인 (이미지 없을 때 사용하는 방식)
2. 네이버 카페 API 문서 재확인
3. 실제 전송되는 바이트 확인

---

## 메시지 전송 문제

### 현재 플로우

1. `processQuestionSubmission`에서 `replies.push(replyMsg)` 실행
2. `ws.pendingQuestionReplies = questionReplies` 저장
3. `server.js`에서 `ws.pendingQuestionReplies` 확인
4. `replies` 배열을 사용하여 메시지 전송

### 확인 사항

- `ws.pendingQuestionReplies`가 제대로 설정되는지 확인
- `replies` 배열이 제대로 전송되는지 확인
- 로그에서 "질문 응답" 관련 메시지 확인

---

## 테스트 방법

1. 서버 재시작
2. `!질문 테스트,내용` 명령어 실행
3. 이미지 첨부 (선택)
4. 로그 확인:
   - `[질문 제출] ✅ 질문 등록 완료`
   - `[질문 응답] ws 객체에서 replies 가져옴: X개`
5. 네이버 카페에서 글 확인:
   - 한글이 올바르게 표시되는지 확인
   - 이미지가 첨부되었는지 확인
6. 카카오톡에서 메시지 확인:
   - "✅ 질문 작성 완료!" 메시지가 표시되는지 확인



