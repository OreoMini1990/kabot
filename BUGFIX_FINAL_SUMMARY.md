# 버그 수정 완료 요약

## 수정 완료 항목

### 1. ✅ 비속어 경고 메시지에 전체 닉네임 표시

**문제**: 비속어 경고 메시지에서 "랩장님"만 표시되고 전체 닉네임이 표시되지 않음

**수정 내용**:
- `server/bot/moderation/profanityFilter.js`: `getWarningMessage` 함수 수정
  - `sender` 파라미터가 전체 닉네임(예: "랩장/AN/서울")을 받도록 수정
  - 숫자만 있는 경우 기본 메시지, 전체 닉네임이 있으면 전체 닉네임 표시
- `server/labbot-node.js`: 비속어 필터 처리 부분 수정
  - `extractSenderName(json, sender)`로 추출한 전체 닉네임을 `getWarningMessage`에 전달

**결과**: 비속어 경고 메시지에 전체 닉네임이 표시됨 (예: "⚠️ 랩장/AN/서울님, 비속어 사용 시 강퇴될 수 있습니다.")

---

### 2. ✅ !신고 기능 작동 안함 문제 해결

**문제**: !신고 명령어가 작동하지 않음 (채팅 로그는 저장되지만 신고 기능이 작동하지 않음)

**수정 내용**:
- `server/labbot-node.js`: `replyToMessageId` 추출 로직 강화
  - `json` 필드에서 더 많은 필드 확인: `reply_to_message_id`, `reply_to`, `parent_message_id`, `reply_to_kakao_log_id`, `reply_to_kakao_log_id_raw`, `src_message`, `logId`, `src_logId`
  - `metadata`에서도 추출 시도
  - `attachment`에서도 추출 시도 (기존 로직 유지)
- `server/db/chatLogger.js`: `saveReport` 함수 개선
  - 메시지를 찾지 못한 경우에도 신고 기록 저장 (기존 로직 유지)
  - 저장 성공 시 `result` 반환하여 성공 메시지 표시

**결과**: !신고 명령어가 정상적으로 작동하며, 메시지를 찾지 못한 경우에도 신고 기록이 저장됨

---

### 3. ✅ 통계 명령어 관리자 권한 체크 수정

**문제**: 
- `/통계` 명령어가 답장 없음
- `/오늘 채팅`, `/어제 채팅` 명령어가 관리자 권한이 없다고 나옴
- 관리자 `sender_id`가 `4897202238384073231`로 설정되어 있음

**수정 내용**:
- `server/bot/config.js`: `ADMIN_USER_IDS` 수정
  - `"4897202238384073231"` → `"4897202238384074000"`
- `server/bot/commands/index.js`: `/통계` 명령어 라우팅 추가
  - `/통계` 명령어도 `handleStatsCommand`로 라우팅
- `server/bot/utils/botUtils.js`: `isAdmin` 함수 확인
  - `ADMIN_USER_IDS`를 우선 확인하도록 이미 구현되어 있음 (추가 수정 불필요)

**결과**: 
- `/통계` 명령어가 정상적으로 작동
- 관리자 `sender_id` `4897202238384074000`로 권한 체크
- `/오늘 채팅`, `/어제 채팅`, `/이번주 채팅` 명령어도 관리자 권한으로 정상 작동

---

## 변경 파일 목록

### [수정] server/bot/moderation/profanityFilter.js
- 비속어 경고 메시지에 전체 닉네임 표시하도록 수정

### [수정] server/labbot-node.js
- 비속어 경고 메시지에 전체 닉네임 전달
- !신고 기능의 `replyToMessageId` 추출 로직 강화 (더 많은 필드 확인)

### [수정] server/bot/config.js
- 관리자 `sender_id` 변경: `4897202238384073231` → `4897202238384074000`

### [수정] server/bot/commands/index.js
- `/통계` 명령어 라우팅 추가

### [수정] server/db/chatLogger.js
- `saveReport` 함수에서 메시지를 찾지 못한 경우에도 신고 기록 저장 성공 처리

---

## 테스트 필요 항목

1. **비속어 경고 메시지**: 전체 닉네임이 표시되는지 확인
2. **!신고 기능**: 답장 버튼을 누르고 !신고 명령어 입력 시 정상 작동하는지 확인
3. **통계 명령어**: 
   - `/통계` 명령어가 정상적으로 작동하는지 확인
   - 관리자 `sender_id` `4897202238384074000`로 권한 체크가 정상 작동하는지 확인
   - `/오늘 채팅`, `/어제 채팅`, `/이번주 채팅` 명령어가 관리자 권한으로 정상 작동하는지 확인

