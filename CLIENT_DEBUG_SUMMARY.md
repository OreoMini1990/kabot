# 클라이언트 디버깅 로그 추가 요약

## 추가된 로그

### 1. 메시지 처리 시작
- `[DEBUG] 메시지 처리 시작`: 모든 메시지의 기본 정보 (msg_id, msg_type, attachment 존재 여부, referer)

### 2. 타입 체크
- `[타입 체크]`: msg_type, msg_type_str 확인
- `[타입 체크] msg_type_str in reaction_types 체크`: 반응 타입 확인 과정
- `[Feed 감지]`: Feed 타입(12) 메시지 감지

### 3. 반응 감지
- `[반응 체크]`: is_reaction 상태, attachment 존재 여부
- `[반응 체크] attachment_to_check 존재`: attachment 확인
- `[반응 체크] attachment가 dict/문자열`: attachment 타입 확인
- `[반응 체크] 반응 키 검색 시작`: 반응 키 검색 시작
- `[반응 감지] ✅ attachment에서 반응 키 발견`: 반응 키 발견 시
- `[반응 감지] ✅ attachment에서 반응 감지 완료`: 반응 감지 완료
- `[반응 체크 최종]`: 최종 is_reaction 상태
- `[반응 처리] 반응 메시지 감지`: 반응 메시지 처리 시작
- `[반응 전송] 서버로 전송 시도`: 서버 전송 시도

### 4. 답장 ID 추출
- `[답장 ID] referer에서 추출`: referer에서 ID 추출 성공
- `[답장 ID] 복호화된 attachment에서 추출`: 복호화된 attachment에서 추출 성공
- `[답장 ID] 원본 attachment에서 추출`: 원본 attachment에서 추출 성공
- `[답장 ID] 추출 실패`: 모든 방법으로 추출 실패

### 5. 이미지 감지
- `[이미지 체크]`: msg_type_str, attachment 존재 여부
- `[이미지 체크] ✅ 이미지 타입 감지`: 이미지 타입 감지
- `[이미지 체크] attachment_to_check 존재`: attachment 확인
- `[이미지 감지] ✅ 감지`: 이미지 URL 추출 성공

## 문제 진단

### 로그가 전혀 없다면
1. 메시지가 DB에서 조회되지 않음
2. 메시지 처리 루프가 실행되지 않음
3. Python 스크립트가 실행되지 않음

### 특정 로그만 없다면
1. **반응 로그 없음**: 
   - msg_type이 반응 타입이 아님
   - attachment에 반응 정보가 없음
   - attachment 복호화 실패
   
2. **답장 ID 로그 없음**:
   - referer 필드 없음
   - attachment 없음
   - attachment 복호화 실패
   
3. **이미지 로그 없음**:
   - msg_type이 이미지 타입(2, 12, 27)이 아님
   - attachment 없음
   - attachment 복호화 실패

## 다음 단계

1. 클라이언트 재시작 후 로그 확인
2. 각 단계별 로그가 출력되는지 확인
3. 로그가 없는 단계를 파악하여 원인 확인










