# 구현 로그

## Phase 1: 클라이언트-서버 데이터 구조 표준화 ✅

### 완료 사항

1. **클라이언트 (kakao_poller.py)**
   - `sender_name`, `sender_id`를 별도 필드로 전송 추가
   - `kakao_log_id` 필드 명시적 추가
   - `raw_sender` 필드 추가 (디버깅용)

2. **서버 (server.js, labbot-node.js)**
   - `extractSenderName`, `extractSenderId` 함수 구현 및 개선
   - json.sender_name, json.sender_id 우선 사용 로직 구현
   - 하위 호환성 유지 (sender 파싱 fallback)

3. **DB 스키마**
   - `migration_add_raw_sender_kakao_log_id.sql` 생성
   - `raw_sender`, `kakao_log_id` 컬럼 추가 스크립트
   - 인덱스 생성 스크립트

4. **Git 설정**
   - `.gitattributes` 파일 생성 (UTF-8 인코딩 보장)
   - Git 인코딩 설정 완료

### 다음 단계: Phase 2 (attachment 복호화)

