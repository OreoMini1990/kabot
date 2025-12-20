# 기능 테스트 체크리스트

## 개요
모든 기능이 정상 작동하는지 확인하기 위한 테스트 목록입니다.
각 기능 테스트 시 **DB 저장 여부**도 함께 확인해야 합니다.

---

## 📋 테스트 준비

### 환경 설정
- [ ] 서버 실행 중 (`npm start` 또는 `node server.js`)
- [ ] 클라이언트(kakao_poller.py) 실행 중
- [ ] Bridge APK 설치 및 실행 중
- [ ] Supabase 연결 확인 (환경 변수 설정)
- [ ] 테스트용 카카오톡 오픈채팅방 준비

### DB 테이블 확인 (Supabase)
```sql
-- 새 테이블 생성 스크립트 실행 필요
-- server/db/moderation_schema.sql 실행
```

---

## 1️⃣ 무단 홍보 감지 테스트

### 테스트 방법
| # | 테스트 케이스 | 입력 메시지 | 예상 결과 |
|---|-------------|------------|----------|
| 1-1 | 오픈채팅 링크 | `https://open.kakao.com/o/test123` | ⚠️ 오픈채팅 무단 홍보 감지 메시지 |
| 1-2 | 토스 링크 | `https://toss.me/username` | ⚠️ 토스 무단 홍보 감지 메시지 |
| 1-3 | 디스코드 링크 | `https://discord.gg/invite123` | ⚠️ 디스코드 무단 홍보 감지 메시지 |
| 1-4 | 화이트리스트 링크 | `https://naver.com/news` | ❌ 감지하지 않음 |
| 1-5 | 2회 위반 | 동일 사용자가 다시 금지 링크 전송 | 2회 경고 메시지 |
| 1-6 | 3회 위반 | 동일 사용자가 다시 금지 링크 전송 | 🚨 관리자 보고 메시지 |

### DB 저장 확인
```sql
SELECT * FROM promotion_violations ORDER BY created_at DESC LIMIT 10;
```
- [ ] room_name 저장됨
- [ ] sender_name 저장됨
- [ ] sender_id 저장됨 (변하지 않는 ID)
- [ ] message_text 저장됨 (광고 내용)
- [ ] detected_url 저장됨
- [ ] violation_type 저장됨 (open_chat, toss, discord 등)
- [ ] violation_count 저장됨
- [ ] warning_level 저장됨 (1, 2, 3)
- [ ] is_reported_to_admin 저장됨 (3회 이상 시 true)
- [ ] created_at 저장됨

---

## 2️⃣ 닉네임 변경 감지 테스트

### 테스트 방법
| # | 테스트 케이스 | 방법 | 예상 결과 |
|---|-------------|------|----------|
| 2-1 | 닉네임 변경 | 카카오톡에서 닉네임 변경 후 메시지 전송 | 📛 닉네임 변경 감지 메시지 |
| 2-2 | 첫 메시지 | 처음 채팅하는 사용자 | 첫 기록 저장 (알림 없음) |
| 2-3 | 동일 닉네임 | 닉네임 변경 없이 메시지 전송 | 변경 감지 없음 |

### DB 저장 확인
```sql
-- user_name_history 테이블
SELECT * FROM user_name_history ORDER BY changed_at DESC LIMIT 10;

-- nickname_changes 테이블
SELECT * FROM nickname_changes ORDER BY created_at DESC LIMIT 10;
```
- [ ] user_id 저장됨 (변하지 않는 ID)
- [ ] old_nickname 저장됨
- [ ] new_nickname 저장됨
- [ ] room_name 저장됨
- [ ] change_count 저장됨 (누적 변경 횟수)
- [ ] created_at 저장됨

---

## 3️⃣ 메시지 삭제 감지 테스트

### 테스트 방법
| # | 테스트 케이스 | 방법 | 예상 결과 |
|---|-------------|------|----------|
| 3-1 | 메시지 삭제 1회 | 본인 메시지 삭제 | 💬 삭제 감지 메시지 (1회) |
| 3-2 | 메시지 삭제 2회 | 다시 메시지 삭제 | ⚠️ 경고 메시지 (2회) |
| 3-3 | 메시지 삭제 3회 | 다시 메시지 삭제 | 🚨 관리자 보고 메시지 (3회) |
| 3-4 | 24시간 후 리셋 | 24시간 후 삭제 | 1회로 초기화 |

### DB 저장 확인
```sql
SELECT * FROM message_delete_warnings ORDER BY created_at DESC LIMIT 10;
```
- [ ] room_name 저장됨
- [ ] sender_name 저장됨
- [ ] sender_id 저장됨 (변하지 않는 ID)
- [ ] deleted_message_id 저장됨
- [ ] deleted_message_text 저장됨 (삭제된 내용, 있는 경우)
- [ ] delete_count_24h 저장됨
- [ ] warning_level 저장됨
- [ ] is_reported_to_admin 저장됨
- [ ] created_at 저장됨

---

## 4️⃣ 강퇴 감지 테스트

### 테스트 방법
| # | 테스트 케이스 | 방법 | 예상 결과 |
|---|-------------|------|----------|
| 4-1 | 강퇴 실행 | 관리자가 사용자 강퇴 | ⚠️ 강퇴 감지 메시지 출력 |

**주의**: 실제 강퇴 테스트는 테스트 계정 사용 권장

### DB 저장 확인
```sql
SELECT * FROM member_kicks ORDER BY created_at DESC LIMIT 10;
```
- [ ] room_name 저장됨
- [ ] kicked_user_name 저장됨
- [ ] kicked_user_id 저장됨
- [ ] kicked_by_name 저장됨
- [ ] kicked_by_id 저장됨
- [ ] kick_reason 저장됨 (있는 경우)
- [ ] created_at 저장됨

---

## 5️⃣ 입퇴장 감지 테스트 (현재 주석 처리됨)

### 활성화 방법
`server/labbot-node.js`에서 주석 해제:
```javascript
// JOIN_LEAVE_DETECTION: true,  // 주석 해제
```

### 테스트 방법
| # | 테스트 케이스 | 방법 | 예상 결과 |
|---|-------------|------|----------|
| 5-1 | 입장 | 새 사용자 입장 | 🎉 입장 메시지 |
| 5-2 | 퇴장 | 사용자 나가기 | 👋 퇴장 메시지 |
| 5-3 | 초대 | 관리자가 사용자 초대 | 👋 초대 메시지 |

### DB 저장 확인
```sql
SELECT * FROM member_activities ORDER BY created_at DESC LIMIT 10;
```
- [ ] room_name 저장됨
- [ ] user_name 저장됨
- [ ] user_id 저장됨
- [ ] activity_type 저장됨 (join, leave, kick, invite)
- [ ] invited_by_name 저장됨 (초대인 경우)
- [ ] join_count 저장됨
- [ ] leave_count 저장됨
- [ ] created_at 저장됨

---

## 6️⃣ 비속어 감지 테스트

### 테스트 방법
| # | 테스트 케이스 | 입력 메시지 | 예상 결과 |
|---|-------------|------------|----------|
| 6-1 | 일반 비속어 | (테스트용 비속어) | ⚠️ 비속어 경고 메시지 |
| 6-2 | 타직업 비하 | (테스트용 비하 표현) | 🚨 강력 경고 메시지 |
| 6-3 | 2회 경고 | 같은 사용자 비속어 재사용 | 2회 경고 메시지 |
| 6-4 | 3회 경고 | 같은 사용자 비속어 재사용 | 🚨 관리자 보고 메시지 |

### DB 저장 확인
```sql
SELECT * FROM profanity_warnings ORDER BY created_at DESC LIMIT 10;
```
- [ ] room_name 저장됨
- [ ] sender_name 저장됨
- [ ] sender_id 저장됨
- [ ] message_text 저장됨 (감지된 메시지)
- [ ] detected_word 저장됨
- [ ] warning_level 저장됨
- [ ] warning_count 저장됨
- [ ] is_reported_to_admin 저장됨
- [ ] created_at 저장됨

---

## 7️⃣ 반응(이모지) 감지 테스트

### 테스트 방법
| # | 테스트 케이스 | 방법 | 예상 결과 |
|---|-------------|------|----------|
| 7-1 | 하트 반응 | 메시지에 ❤️ 반응 | 반응 로그 저장 |
| 7-2 | 좋아요 반응 | 메시지에 👍 반응 | 반응 로그 저장 |
| 7-3 | 확인 반응 | 메시지에 ✅ 반응 | 반응 로그 저장 |
| 7-4 | 관리자 반응 | 관리자가 반응 | is_admin_reaction = true |

### DB 저장 확인
```sql
-- chat_reactions 테이블 (기존)
SELECT * FROM chat_reactions ORDER BY created_at DESC LIMIT 10;

-- reaction_logs 테이블 (상세 로그)
SELECT * FROM reaction_logs ORDER BY created_at DESC LIMIT 10;
```
- [ ] room_name 저장됨
- [ ] target_message_id 저장됨
- [ ] reactor_name 저장됨
- [ ] reactor_id 저장됨
- [ ] reaction_type 저장됨 (heart, thumbs_up, check 등)
- [ ] reaction_emoji 저장됨 (❤️, 👍, ✅ 등)
- [ ] is_admin_reaction 저장됨
- [ ] created_at 저장됨

---

## 8️⃣ 신고 기능 테스트

### 테스트 방법
| # | 테스트 케이스 | 방법 | 예상 결과 |
|---|-------------|------|----------|
| 8-1 | 신고 성공 | 메시지에 답장 + `!신고 사유` | ✅ 신고 접수 완료 메시지 |
| 8-2 | 신고 실패 | 답장 없이 `!신고` | 📋 신고 방법 안내 메시지 |
| 8-3 | 사유 포함 | `!신고 부적절한 내용입니다` | 신고 사유 저장 |

### DB 저장 확인
```sql
SELECT * FROM report_logs ORDER BY created_at DESC LIMIT 10;
```
- [ ] room_name 저장됨
- [ ] reporter_name 저장됨
- [ ] reporter_id 저장됨
- [ ] reported_message_id 저장됨
- [ ] reported_message_text 저장됨
- [ ] reported_user_name 저장됨
- [ ] report_reason 저장됨
- [ ] report_type 저장됨
- [ ] status 저장됨 (pending)
- [ ] created_at 저장됨

---

## 9️⃣ 기타 기능 테스트

### 채팅 로그 저장
| # | 테스트 케이스 | 예상 결과 |
|---|-------------|----------|
| 9-1 | 일반 메시지 | chat_messages 테이블에 저장 |
| 9-2 | 통계 조회 | `/통계` 또는 `/랭킹` 명령어 응답 |
| 9-3 | 네이버 카페 질문 | `!질문 내용` → 카페에 글 작성 |

### DB 저장 확인
```sql
SELECT * FROM chat_messages ORDER BY created_at DESC LIMIT 10;
```

---

## 📊 테스트 결과 요약

| 기능 | 동작 테스트 | DB 저장 테스트 | 비고 |
|-----|-----------|---------------|-----|
| 무단 홍보 감지 | ⬜ | ⬜ | |
| 닉네임 변경 감지 | ⬜ | ⬜ | |
| 메시지 삭제 감지 | ⬜ | ⬜ | |
| 강퇴 감지 | ⬜ | ⬜ | |
| 입퇴장 감지 | ⬜ | ⬜ | 주석 처리됨 |
| 비속어 감지 | ⬜ | ⬜ | |
| 반응 감지 | ⬜ | ⬜ | |
| 신고 기능 | ⬜ | ⬜ | |
| 채팅 로그 | ⬜ | ⬜ | |

---

## 🔧 문제 해결

### DB 테이블이 없는 경우
```sql
-- Supabase SQL 에디터에서 실행
-- server/db/moderation_schema.sql 내용 복사하여 실행
```

### 서버 로그 확인
```bash
# 서버 로그에서 확인할 키워드
grep -E "\[무단 홍보\]|\[닉네임 변경\]|\[메시지 삭제\]|\[강퇴\]|\[반응\]|\[신고\]|\[모더레이션\]" server.log
```

### 클라이언트 로그 확인
```bash
# 클라이언트 로그에서 확인할 키워드
grep -E "\[반응 감지\]|\[반응 처리\]" kakao_poller.log
```

