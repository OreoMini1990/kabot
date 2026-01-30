# 답장 메시지 저장 문제 분석

## DB 조회 결과

### 통계
- 전체 메시지: 86개
- reply_to_message_id 있는 메시지: **0개**
- reply_to_kakao_log_id 있는 메시지: **0개**
- 답장 메시지가 전혀 저장되지 않음

## 문제점

### 1. server/server.js의 saveChatMessage 호출 오류

**위치**: `server/server.js` 약 2598번째 줄

**문제 코드**:
```javascript
const savedMessage = await (
            decryptedRoomName || '',
            senderName || sender || '',
            senderId,
            decryptedMessage || '',
            isGroupChat !== undefined ? isGroupChat : true,
            metadata,
            replyToMessageId,
            threadId,
            sender,
            json?._id || json?.kakao_log_id,
            replyToKakaoLogId
          );
```

**문제점**:
- `await` 다음에 함수 호출이 없음
- `chatLogger.saveChatMessage()`를 호출해야 하는데, 그냥 괄호로 감싼 값들만 있음
- 이로 인해 `savedMessage`가 `undefined`가 되고, 메시지가 저장되지 않음

**수정 필요**:
```javascript
const savedMessage = await chatLogger.saveChatMessage(
            decryptedRoomName || '',
            senderName || sender || '',
            senderId,
            decryptedMessage || '',
            isGroupChat !== undefined ? isGroupChat : true,
            metadata,
            replyToMessageId,
            threadId,
            sender,
            json?._id || json?.kakao_log_id,
            replyToKakaoLogId
          );
```

### 2. replyToKakaoLogId 추출 로직 확인 필요

**위치**: `server/server.js` 약 2447-2528번째 줄

**확인 사항**:
- `replyToKakaoLogId`가 제대로 추출되는지
- 클라이언트에서 `reply_to_message_id`를 보내는지
- `attachment`에서 `reply_to_kakao_log_id`를 추출하는지
- `msg_type=26`인 경우 처리하는지

### 3. 클라이언트에서 답장 정보 전송 확인 필요

**위치**: `client/a.py`

**확인 사항**:
- `reply_to_message_id`를 `message_data`에 포함하는지
- `attachment`에서 답장 정보를 추출하는지
- `msg_type=26`인 경우 처리하는지

## 수정 계획

1. **server/server.js**: `saveChatMessage` 호출 수정
2. **server/server.js**: `replyToKakaoLogId` 추출 로직 로그 강화
3. **client/a.py**: 답장 정보 전송 로그 강화
4. **테스트**: 실제 답장 메시지 전송 후 DB 확인

