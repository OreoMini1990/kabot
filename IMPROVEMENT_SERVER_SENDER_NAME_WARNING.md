# 서버 senderName 경고 메시지 개선

## 문제

서버 로그에서 `sender_name`이 정상적으로 저장되고 있지만, 여전히 암호화 경고 메시지가 출력되고 있습니다.

## 원인

`extractSenderName` 함수가 `json.sender_name_encrypted`를 반환하거나, `json.sender_name`이 암호화된 값을 가지고 있을 수 있습니다. 하지만 실제로는 `sender` 필드에 복호화된 이름이 있어서, 최종적으로는 정상적으로 저장됩니다.

## 수정 내용

### 경고 메시지 출력 전에 sender 필드 재확인
- `senderName`이 암호화된 상태로 인식되면, `sender` 필드를 다시 확인
- `sender` 필드에 복호화된 이름이 있으면 그것을 사용하고 경고를 출력하지 않음
- `sender` 필드도 암호화되어 있거나 파싱할 수 없을 때만 경고 출력

## 수정 전 동작

```javascript
if (isStillEncrypted && json) {
  console.warn(`[발신자] ⚠️ senderName이 여전히 암호화된 상태: "${senderName}"`);
  // 복호화 시도...
}
```

## 수정 후 동작

```javascript
if (isStillEncrypted && json) {
  // sender 필드에 복호화된 이름이 있는지 다시 확인
  if (sender && sender.includes('/')) {
    const senderNamePart = senderParts.slice(0, -1).join('/');
    const isNotEncrypted = !(senderNamePart.length > 5 && /^[A-Za-z0-9+/=]+$/.test(senderNamePart));
    if (isNotEncrypted && senderNamePart.trim()) {
      // sender 필드에 복호화된 이름이 있으면 그것을 사용 (경고 없이)
      senderName = senderNamePart.trim();
      console.log(`[발신자] sender 필드에서 복호화된 이름 사용 (암호화 경고 무시): "${senderName}"`);
    } else {
      // sender 필드도 암호화되어 있으면 경고 출력
      console.warn(`[발신자] ⚠️ senderName이 여전히 암호화된 상태: "${senderName}"`);
    }
  }
}
```

## 상태

✅ **수정 완료** - 이제 `sender` 필드에 복호화된 이름이 있으면 경고가 출력되지 않습니다.

## 예상 결과

이제 서버 로그에서:
- `sender` 필드에 복호화된 이름이 있으면 경고 없이 정상 처리
- `sender` 필드도 암호화되어 있을 때만 경고 출력
- 최종적으로 저장되는 `sender_name`은 정상적으로 복호화된 값

