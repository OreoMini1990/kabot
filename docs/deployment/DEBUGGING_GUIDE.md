# 디버깅 가이드

## 현재 문제점

1. **답장 링크**: 서버 로그에 답장 링크 관련 로그가 없고, DB에 `reply_to_kakao_log_id`가 null
2. **반응**: 서버 로그에 반응 관련 로그가 없음
3. **이미지 저장**: 서버 로그에 이미지 저장 성공 로그가 없고, DB에도 저장 내역 없음

## 추가된 로깅

### 1. 답장 링크 로깅

서버에서 다음 로그들이 출력됩니다:
- `[답장 링크] 클라이언트에서 받은 값: ...`
- `[답장 링크] attachment에서 추출: ...`
- `[답장 링크] 최종 reply_to_kakao_log_id: ...`
- `[답장 링크] safeParseInt 결과: ...`
- `[답장 링크] DB 조회 결과: ...`
- `[답장 링크] ✅ 즉시 변환 성공: ...` 또는 `[답장 링크] ⏳ 백필 필요: ...`

**확인 방법:**
```bash
# 서버 로그 확인
pm2 logs kakkaobot-server --lines 100 | grep "답장 링크"
```

**문제 진단:**
- 로그가 전혀 없으면: 클라이언트에서 `reply_to_message_id`를 보내지 않음
- `클라이언트에서 받은 값: ...` 로그에서 모든 값이 null이면: 클라이언트에서 추출 실패
- `safeParseInt 결과: null`이면: 값이 숫자가 아님
- `DB 조회 결과: not found`이면: 대상 메시지가 아직 DB에 없음 (정상, 백필로 처리됨)

---

### 2. 반응 로깅

서버에서 다음 로그들이 출력됩니다:
- `[반응 처리] 반응 메시지 수신: type=reaction`
- `[반응 처리] json keys: ...`
- `[반응 저장] 시작: ...`
- `[반응 저장] 조건 통과: 저장 진행`
- `[반응 저장] ✅ 성공: ...` 또는 `[반응 저장] ❌ 실패: ...`

**확인 방법:**
```bash
# 서버 로그 확인
pm2 logs kakkaobot-server --lines 100 | grep "반응"
```

**클라이언트 로그 확인:**
```bash
# 클라이언트 로그에서 반응 감지 확인
# Python 클라이언트 로그에서 다음 메시지 확인:
# [반응 감지] ...
# [반응 처리] 반응 메시지 감지: ...
# [반응 전송] 서버로 전송 시도: ...
```

**문제 진단:**
- `[반응 처리] 반응 메시지 수신` 로그가 없으면: 클라이언트에서 `type: "reaction"`으로 보내지 않음
- `[반응 저장] ❌ 실패: targetMessageId 또는 reactorName/reactorId 없음`이면: 필요한 값이 누락됨

---

### 3. 이미지 저장 로깅

서버에서 다음 로그들이 출력됩니다:
- `[이미지 저장] msgType=..., attachment_decrypted 존재=..., attachment 존재=..., attachmentData 존재=...`
- `[이미지 저장] extractImageUrl 결과: ...`
- `[이미지 저장] ✅ 성공: message_id=..., url=...` 또는 `[이미지 저장] ⚠️ 이미지 URL 추출 실패: ...`

**확인 방법:**
```bash
# 서버 로그 확인
pm2 logs kakkaobot-server --lines 100 | grep "이미지 저장"
```

**문제 진단:**
- 로그가 전혀 없으면: 이미지 타입(2, 12, 27) 메시지가 처리되지 않음
- `attachmentData 존재=false`이면: attachment가 없음
- `extractImageUrl 결과: null`이면: URL 추출 실패 (attachment 구조 확인 필요)

---

## 체크리스트

### 답장 링크 문제 해결

1. **클라이언트에서 값 추출 확인:**
   - Python 클라이언트 로그에서 `reply_to_message_id` 추출 확인
   - `referer` 필드 또는 `attachment.src_message` 확인

2. **서버에서 값 수신 확인:**
   - `[답장 링크] 클라이언트에서 받은 값` 로그 확인
   - 값이 있으면 추출 성공, 없으면 클라이언트 문제

3. **DB 저장 확인:**
   - `[채팅 로그] ✅ reply_to_kakao_log_id 저장` 로그 확인
   - DB 직접 조회:
     ```sql
     SELECT id, reply_to_kakao_log_id, reply_to_message_id 
     FROM chat_messages 
     ORDER BY created_at DESC LIMIT 10;
     ```

---

### 반응 문제 해결

1. **클라이언트에서 반응 감지 확인:**
   - Python 클라이언트 로그에서 `[반응 감지]` 또는 `[반응 처리]` 로그 확인
   - `send_to_server(reaction_data, is_reaction=True)` 호출 확인

2. **서버에서 반응 수신 확인:**
   - `[반응 처리] 반응 메시지 수신` 로그 확인
   - `messageData.type === 'reaction'` 조건 확인

3. **반응 저장 확인:**
   - `[반응 저장] ✅ 성공` 로그 확인
   - DB 직접 조회:
     ```sql
     SELECT * FROM chat_reactions 
     ORDER BY created_at DESC LIMIT 10;
     ```

---

### 이미지 저장 문제 해결

1. **이미지 메시지 타입 확인:**
   - Python 클라이언트 로그에서 `msg_type=2, 12, 27` 확인

2. **attachment 확인:**
   - `[이미지 저장] attachmentData 존재=...` 로그 확인
   - attachment가 있으면 `extractImageUrl` 결과 확인

3. **이미지 저장 확인:**
   - `[이미지 저장] ✅ 성공` 로그 확인
   - DB 직접 조회:
     ```sql
     SELECT * FROM message_attachments 
     WHERE attachment_type = 'image'
     ORDER BY created_at DESC LIMIT 10;
     ```

---

## 다음 단계

1. 서버 재시작:
   ```bash
   pm2 restart kakkaobot-server
   ```

2. 로그 모니터링:
   ```bash
   pm2 logs kakkaobot-server --lines 200
   ```

3. 테스트:
   - 답장 메시지 전송
   - 반응 메시지 전송 (따봉 등)
   - 이미지 메시지 전송

4. 로그 확인 후 문제점 보고:
   - 각 기능별로 어떤 로그가 나오는지 확인
   - 로그가 없으면 클라이언트 문제 가능성
   - 로그는 나오지만 저장 실패하면 서버 로직 문제
