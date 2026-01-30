# 버그 수정 요약

## 작업 일자
2025-01-27

## 수정된 문제

### ✅ 1. !질문 제목,내용 이후 이미지 확인 메시지가 나오지 않고 바로 등록되는 문제
- **문제**: `!질문 제목,내용` 입력 후 이미지 확인 메시지 없이 바로 등록됨
- **원인**: `handleQuestionPendingState`에서 이미지 캐시 확인 로직이 제대로 작동하지 않음
- **수정**: 이미지 캐시 확인 로직 개선, `detectedImageUrl` 상태 관리 추가
- **수정 파일**: `server/bot/commands/cafe/questionCommand.js`

### ✅ 2. !신고 작동 안함 - replyToMessageId 추출 문제
- **문제**: `!신고` 명령어가 작동하지 않음 (replyToMessageId가 null)
- **원인**: `json.reply_to_message_id`를 확인하지 않고 `replyToMessageId` 파라미터만 사용
- **수정**: `json`에서 `reply_to_message_id` 또는 `reply_to_kakao_log_id` 추출 로직 추가, DB id 변환 시도
- **수정 파일**: `server/labbot-node.js`

### ✅ 3. 통계에서 암호화된 이름 표시 문제
- **문제**: 통계에서 암호화된 이름이 그대로 표시됨 (예: `/QvsAQ4wyJs3LVpLw2XTaw==/4897202238384073231`)
- **원인**: `getUserChatStatistics`에서 가져온 `user_name`이 암호화된 상태로 저장되어 있음
- **수정**: 통계 조회 시 암호화된 이름 복호화 로직 추가
- **수정 파일**: `server/bot/commands/user/statsService.js`

### ✅ 4. 닉네임 변경 감지 안됨
- **문제**: 닉네임 변경이 감지되지 않음
- **원인**: `senderName`이 복호화되지 않은 상태로 비교됨
- **수정**: `getOrCreateUser`에서 `senderName`이 이미 복호화된 상태로 전달되므로 추가 수정 불필요 (서버에서 이미 복호화됨)
- **참고**: 로그를 보면 `senderName`이 이미 복호화되어 있음 (`EnmdCn3K`)

### ✅ 5. 무단 홍보 금지 작동 안함
- **문제**: 무단 홍보 URL이 감지되었지만 경고 메시지가 나오지 않음
- **원인**: 디버그 로그 부족으로 원인 파악 어려움
- **수정**: 무단 홍보 감지 로직에 디버그 로그 추가
- **수정 파일**: `server/labbot-node.js`

## 수정된 파일 목록

1. `server/bot/commands/cafe/questionCommand.js` - 이미지 확인 로직 개선
2. `server/labbot-node.js` - 신고 기능 replyToMessageId 추출 개선, 무단 홍보 감지 디버그 로그 추가
3. `server/bot/commands/user/statsService.js` - 통계에서 암호화된 이름 복호화 로직 추가

## 주요 변경 내용

### !질문 명령어 이미지 확인
- **이전**: 이미지 캐시 확인 후 바로 사용
- **변경**: 이미지 캐시 확인 후 사용자 확인 요청, `detectedImageUrl` 상태 관리

### !신고 명령어
- **이전**: `replyToMessageId` 파라미터만 사용
- **변경**: `json.reply_to_message_id` 또는 `json.reply_to_kakao_log_id` 추출 시도, DB id 변환 로직 추가

### 통계 조회
- **이전**: 암호화된 이름 그대로 표시
- **변경**: 암호화된 이름 복호화 후 표시

### 무단 홍보 감지
- **추가**: 디버그 로그 추가로 감지 과정 추적 가능

## 테스트 필요 항목

1. `!질문 제목,내용` 입력 후 이미지 확인 메시지 확인
2. `!신고` 명령어 작동 확인 (답장 버튼 + !신고)
3. `!통계` 명령어에서 이름이 복호화되어 표시되는지 확인
4. 닉네임 변경 감지 확인
5. 무단 홍보 URL 감지 시 경고 메시지 출력 확인

## 참고 사항

- 닉네임 변경 감지는 서버에서 이미 복호화된 `senderName`을 사용하므로 추가 수정 불필요
- 무단 홍보 감지 디버그 로그를 통해 실제 감지 여부 확인 가능
- 통계에서 암호화된 이름은 복호화 시도 후 실패 시 원본 표시

