# 답장 메시지 저장 문제 수정 계획

## 문제점 요약

1. **DB 조회 결과**: 답장 메시지가 전혀 저장되지 않음
   - `reply_to_message_id`: 0개
   - `reply_to_kakao_log_id`: 0개

2. **서버 로그 분석**:
   - `reply_to_message_id=null`
   - `attachment=null`
   - `attachment_decrypted=null`
   - `msg_type=0`
   - `isReplyMessage=false`

3. **핵심 문제**: `replyToKakaoLogId`가 `null`로 전달됨

## 원인 분석

### 1. 클라이언트에서 답장 정보 추출 실패
- `client/a.py`에서 `attachment`, `referer` 필드를 제대로 추출하지 못함
- `msg_type=26`인 경우를 감지하지 못함
- `reply_to_message_id`를 `message_data`에 포함하지 않음

### 2. 서버에서 답장 정보 추출 실패
- `server/server.js`에서 `replyToKakaoLogId` 추출 로직이 제대로 작동하지 않음
- `attachment` 복호화 실패
- `msg_type=26` 감지 실패

## 수정 계획

### 1. server/server.js - replyToKakaoLogId 추출 로직 강화

**위치**: `server/server.js` 약 2447-2530번째 줄

**수정 내용**:
1. `msg_type` 감지 로직 강화 (26, "26", 0이지만 attachment 있는 경우)
2. `attachment` 복호화 로직 강화
3. `extractReplyTarget` 호출 전후 로그 추가
4. `replyToKakaoLogId` 최종 결정 로직 강화

### 2. client/a.py - 답장 정보 추출 및 전송 강화

**위치**: `client/a.py` - `poll_messages()` 함수

**수정 내용**:
1. `msg_type=26` 감지 로직 강화
2. `attachment`에서 `reply_to_kakao_log_id` 추출 강화
3. `referer`에서 답장 정보 추출 강화
4. `message_data`에 `reply_to_message_id` 포함 확인

### 3. 로그 강화

**목적**: 답장 정보 추출 과정을 추적하기 위한 상세 로그 추가

**추가할 로그**:
- 클라이언트: `[답장 추출] msg_type`, `attachment`, `referer` 확인
- 클라이언트: `[답장 전송] reply_to_message_id` 포함 여부 확인
- 서버: `[답장 수신] json.reply_to_message_id`, `attachment` 확인
- 서버: `[답장 추출] extractReplyTarget` 결과 확인
- 서버: `[답장 저장] replyToKakaoLogId` 최종 값 확인

## 수정 우선순위

1. **즉시 수정**: `server/server.js`의 `replyToKakaoLogId` 추출 로직 로그 강화
2. **즉시 수정**: `client/a.py`의 답장 정보 추출 로그 강화
3. **테스트**: 실제 답장 메시지 전송 후 로그 확인
4. **추가 수정**: 로그 분석 결과에 따라 로직 수정

