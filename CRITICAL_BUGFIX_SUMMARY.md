# 중요 버그 수정 요약

## 작업 일자
2025-01-27

## 수정된 문제

### ✅ 1. !신고 명령어 답장 인식 문제
- **문제**: `!신고` 명령어 사용 시 `replyToMessageId`가 null로 나와서 작동하지 않음
- **원인**: 
  - `json.reply_to_message_id`만 확인하고 `attachment`에서 추출하지 않음
  - 서버에서 변환 실패 시 fallback 로직 부족
- **수정**:
  - `json` 필드에서 직접 추출 시도
  - `attachment` 또는 `attachment_decrypted`에서 `extractReplyTarget` 함수로 추출 시도
  - DB id 변환 실패 시 `kakao_log_id` 직접 사용
  - 더 상세한 디버그 로그 추가
- **수정 파일**: `server/labbot-node.js`

### ✅ 2. !통계 관리자 기능 - chat_id로만 관리
- **문제**: 관리자 권한 체크가 닉네임 기반으로 작동하여 닉네임 변경 시 작동하지 않음
- **원인**: `isAdmin` 함수가 닉네임과 chat_id를 모두 확인하지만, 닉네임 우선으로 작동
- **수정**:
  - `isAdmin` 함수를 chat_id 우선으로 변경
  - `ADMIN_USER_IDS`에 있는 chat_id와 일치하는지 먼저 확인
  - 닉네임 기반 확인은 하위 호환성을 위해 유지하되, chat_id가 우선
  - 관리자 확인 시 로그 출력 추가
- **수정 파일**: `server/bot/utils/botUtils.js`

### ✅ 3. 비속어 감지 기능 작동 안함
- **문제**: 비속어 감지 기능이 전혀 작동하지 않음
- **원인**: `PROFANITY_FILTER.check` 함수가 `handleMessage`에서 호출되지 않음
- **수정**:
  - `handleMessage`에 비속어 필터링 로직 추가
  - 명령어가 아닌 일반 메시지만 필터링 (명령어는 제외)
  - 비속어 감지 시 경고 메시지 출력 및 로그 저장
  - 모더레이션 로그 저장 (`saveProfanityWarning`)
  - `profanityFilter.js`의 DB 접근 방식을 Supabase로 변경 (기존 SQLite 방식 제거)
- **수정 파일**: 
  - `server/labbot-node.js`
  - `server/bot/moderation/profanityFilter.js`

## 수정된 파일 목록

1. `server/labbot-node.js` - 신고 기능 replyToMessageId 추출 개선, 비속어 필터링 로직 추가
2. `server/bot/utils/botUtils.js` - 관리자 권한 체크를 chat_id 우선으로 변경
3. `server/bot/moderation/profanityFilter.js` - DB 접근 방식을 Supabase로 변경

## 주요 변경 내용

### !신고 명령어
- **이전**: `json.reply_to_message_id`만 확인
- **변경**: 
  - `json` 필드에서 직접 추출
  - `attachment`에서 `extractReplyTarget` 함수로 추출
  - DB id 변환 실패 시 `kakao_log_id` 직접 사용
  - 더 상세한 디버그 로그

### 관리자 권한 체크
- **이전**: 닉네임과 chat_id 모두 확인, 닉네임 우선
- **변경**: chat_id 우선 확인, 닉네임은 하위 호환성용

### 비속어 감지
- **이전**: `PROFANITY_FILTER.check` 호출되지 않음
- **변경**: 
  - 일반 메시지에 대해 비속어 필터링 수행
  - 비속어 감지 시 경고 메시지 출력
  - 경고 횟수 추적 및 모더레이션 로그 저장
  - Supabase를 사용한 DB 접근

## 테스트 필요 항목

1. `!신고` 명령어 작동 확인 (답장 버튼 + !신고)
2. `!통계` 명령어 관리자 권한 확인 (chat_id로만 작동하는지)
3. 비속어 감지 기능 작동 확인 (비속어 사용 시 경고 메시지 출력)
4. 닉네임 변경 후에도 관리자 권한 유지 확인

## 참고 사항

- 관리자 chat_id는 `server/bot/config.js`의 `ADMIN_USER_IDS`에 정의되어 있습니다.
- 비속어 필터는 명령어(`!`로 시작)와 슬래시 명령어(`/`로 시작)는 제외합니다.
- 비속어 감지 시 경고 메시지가 출력되고, 메시지 처리는 중단됩니다.
- 비속어 필터는 Supabase의 `profanity_words` 테이블에서 비속어 목록을 로드합니다.

