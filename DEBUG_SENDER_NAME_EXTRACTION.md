# senderName 추출 디버깅 로그 추가

## 문제

로그에서 `sender: "랩장/AN/서"`는 이미 복호화된 값인데, 서버가 여전히 암호화된 값(`"/QvsAQ4wyJs3LVpLw2XTaw=="`)으로 인식하고 있습니다.

## 원인 분석

1. 클라이언트에서 복호화 실패 시 `sender_name_decrypted`가 `None`이 됨
2. 하지만 `sender` 필드에는 이미 복호화된 이름(`"랩장/AN/서"`)이 들어감
3. 서버의 `extractSenderName` 함수가 `json.sender_name_decrypted`를 확인하지만, 값이 `None`이면 `sender` 필드를 파싱함
4. `sender` 필드 파싱 시 문제가 있을 수 있음

## 수정 내용

### 디버깅 로그 추가
- `json.sender_name_decrypted`, `json.sender_name`, `json.user_name`, `sender` 필드 값을 로그로 출력
- `extractSenderName` 함수가 어떤 값을 반환하는지 확인

## 예상 결과

이제 서버 로그에서:
1. 클라이언트가 보낸 `json` 필드 값들을 확인할 수 있음
2. `extractSenderName` 함수가 어떤 값을 반환하는지 확인할 수 있음
3. 문제의 원인을 정확히 파악할 수 있음

## 다음 단계

1. 서버 재시작
2. 메시지 전송 테스트
3. 로그 확인하여 실제 값 확인
4. 필요시 추가 수정

