# 신고 기능 수정 (최종)

## 문제점

DB 조회 결과:
- 답장 메시지가 전혀 저장되지 않음 (`reply_to_kakao_log_id`가 있는 메시지 0개)
- 최근 메시지들도 모두 `reply_to_message_id`와 `reply_to_kakao_log_id`가 NULL

## 원인 분석

1. **클라이언트**: `msg_type`과 `reply_to_message_id`를 서버로 전송하고 있음 (확인됨)
2. **서버**: `json.msg_type` 또는 `json.type`을 확인하지만, 클라이언트에서 `json.msgType`으로 전송할 수도 있음
3. **서버**: `msg_type` 확인 시 숫자와 문자열 모두 처리해야 함 (26 vs '26')

## 수정 내용

### server/server.js

1. **msg_type 확인 로직 개선**:
   - `json?.msg_type || json?.type || json?.msgType` 순서로 확인
   - 숫자와 문자열 모두 처리 (26 === '26' 비교 추가)

2. **디버그 로그 추가**:
   - `msg_type=26` 감지 시 상세 로그 출력
   - `reply_to_kakao_log_id` 추출 과정 로그 강화

**변경 사항**:
```javascript
// 기존
if (json?.msg_type === 26 || json?.type === 26 || ...)

// 수정
const msgTypeForCheck = json?.msg_type || json?.type || json?.msgType || null;
if (msgTypeForCheck === 26 || msgTypeForCheck === '26' || ...)
```

## 변경 파일

### [수정] server/server.js
- `msg_type` 확인 로직 개선 (숫자/문자열 모두 처리)
- 디버그 로그 추가

## 예상 결과

1. **답장 메시지 저장**:
   - `msg_type=26`인 메시지가 서버로 전송되면 `reply_to_kakao_log_id` 저장
   - `attachment`에서 `src_message` 추출 성공

2. **신고 기능**:
   - 답장 메시지에 `reply_to_kakao_log_id`가 있으면 신고 기능 정상 작동
   - `!신고` 명령어로 답장 메시지 신고 가능

## 다음 단계

1. 실제 답장 메시지(`msg_type=26`)를 서버로 전송하여 테스트
2. 서버 로그에서 `[답장 링크] ⚠️ msg_type=26 감지` 로그 확인
3. DB에서 `reply_to_kakao_log_id` 저장 여부 확인

