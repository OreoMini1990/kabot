# 반응 감지/저장 및 신고 기능 수정

## 문제점

### 1. 반응 감지/저장 안됨
- **원인**: `poll_reaction_updates()`가 호출되지 않음
- **로그 확인**: 클라이언트 로그에 `[반응 업데이트] 주기적 확인 시작` 로그가 없음
- **문제**: `last_reaction_check`가 `0`으로 초기화되어 있어서, 첫 번째 확인이 너무 빨리 실행되거나 실행되지 않을 수 있음

### 2. 신고 기능 작동 안함 (msg_type=26)
- **원인**: `attachment`가 암호화된 문자열인데 복호화하지 않고 JSON 파싱 시도
- **로그 확인**: `[답장 링크] ⚠️ msg_type=26인데 attachment에서 추출 실패`
- **문제**: `attachment_decrypted`가 없고, `attachment`가 암호화된 문자열인 경우 복호화가 필요함

## 수정 내용

### 1. 반응 감지/저장 문제

**위치**: `client/a.py`

**변경 사항**:
- `last_reaction_check` 초기화를 `time.time()`으로 변경 (현재 시간으로 설정)
- 디버그 로그 추가 (대기 중일 때도 로그 출력)

**코드 변경**:
```python
# 반응 업데이트 확인 주기 (10초마다)
last_reaction_check = time.time()  # ✅ 초기화: 현재 시간으로 설정
REACTION_CHECK_INTERVAL = 10  # 10초

print(f"[반응 업데이트] 주기적 확인 설정: 간격={REACTION_CHECK_INTERVAL}초, 초기 시간={last_reaction_check}")

while True:
    # ...
    time_since_last_check = current_time - last_reaction_check
    if time_since_last_check >= REACTION_CHECK_INTERVAL:
        print(f"[반응 업데이트] 주기적 확인 시작 (간격: {REACTION_CHECK_INTERVAL}초, 경과: {time_since_last_check:.1f}초)")
        updated_count = poll_reaction_updates()
        # ...
    else:
        # 디버그: 처음 몇 번만 로그 출력
        if time_since_last_check < 2.0:  # 2초 이내에만 출력
            print(f"[반응 업데이트] 대기 중... (다음 확인까지 {REACTION_CHECK_INTERVAL - time_since_last_check:.1f}초 남음)")
```

### 2. 신고 기능 강화 (msg_type=26)

**위치**: `server/server.js`

**변경 사항**:
- `msg_type=26`일 때 `attachment`가 암호화된 문자열인 경우 복호화 시도
- `decryptKakaoTalkMessage`를 사용하여 복호화
- 복호화 후 JSON 파싱 시도
- 더 상세한 로그 추가

**코드 변경**:
```javascript
// attachment 복호화 시도 (msg_type=26일 때)
let attachmentToUse = json?.attachment_decrypted || json?.attachment;

// attachment_decrypted가 없고 attachment가 암호화된 문자열인 경우 복호화 시도
if (!json?.attachment_decrypted && json?.attachment && typeof json.attachment === 'string' && (json?.msg_type === 26 || json?.type === 26)) {
    try {
        const myUserId = json?.myUserId || json?.userId || null;
        const encType = json?.encType || null;
        
        if (myUserId && encType) {
            console.log(`[답장 링크] attachment 복호화 시도: myUserId=${myUserId}, encType=${encType}, attachment 길이=${json.attachment.length}`);
            const decryptedAttachment = decryptKakaoTalkMessage(json.attachment, String(myUserId), encType);
            
            if (decryptedAttachment) {
                console.log(`[답장 링크] ✅ attachment 복호화 성공: ${decryptedAttachment.substring(0, 100)}...`);
                // 복호화된 결과를 JSON으로 파싱 시도
                try {
                    attachmentToUse = JSON.parse(decryptedAttachment);
                    console.log(`[답장 링크] ✅ 복호화 후 JSON 파싱 성공`);
                } catch (parseError) {
                    // JSON이 아니면 문자열 그대로 사용
                    attachmentToUse = decryptedAttachment;
                    console.log(`[답장 링크] ⚠️ 복호화 후 JSON 파싱 실패, 문자열 그대로 사용: ${parseError.message}`);
                }
            }
        }
    } catch (decryptError) {
        console.error(`[답장 링크] attachment 복호화 예외: ${decryptError.message}`);
    }
}

replyToKakaoLogIdFromAttachment = extractReplyTarget(
    attachmentToUse,
    null,
    json?.msg_type || json?.type
);
```

## 변경 파일

### [수정] client/a.py
- `last_reaction_check` 초기화 개선
- 디버그 로그 추가

### [수정] server/server.js
- `msg_type=26`일 때 `attachment` 복호화 로직 추가
- 더 상세한 로그 추가

## 예상 결과

1. **반응 감지/저장**: 
   - 10초마다 `poll_reaction_updates()` 호출
   - 클라이언트 로그에 `[반응 업데이트] 주기적 확인 시작` 로그 출력
   - 반응 변화 감지 시 서버로 전송

2. **신고 기능**: 
   - `msg_type=26`일 때 `attachment` 복호화 성공
   - `src_message` 또는 `logId` 추출 성공
   - 신고 기능 정상 작동

