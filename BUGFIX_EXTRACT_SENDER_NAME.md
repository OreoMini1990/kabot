# extractSenderName 함수 개선

## 발견된 문제

### 문제: `sender_name_decrypted` 필드를 확인하지 않음
- **위치**: `server/labbot-node.js` line 868-878
- **증상**: 클라이언트에서 `json.sender_name_decrypted`로 복호화된 이름을 보내지만, 서버가 이를 확인하지 않고 `json.sender_name`만 확인
- **결과**: `sender_name_decrypted`가 없으면 `sender` 필드를 파싱하거나 `sender_name_encrypted`를 사용하게 되어, 암호화된 이름이 그대로 사용됨

## 수정 내용

### `extractSenderName` 함수 개선
- **1순위**: `json.sender_name_decrypted` 확인 (클라이언트에서 복호화된 값)
- **2순위**: `json.sender_name` 또는 `json.senderName` 확인 (하위 호환성)
- **3순위**: `json.user_name` 확인 (하위 호환성)
- **4순위**: `sender` 필드 파싱 (fallback)

## 수정 전 코드

```javascript
// 1. json.sender_name 우선 사용
if (json && (json.sender_name || json.senderName)) {
    return json.sender_name || json.senderName;
}
```

## 수정 후 코드

```javascript
// 1. json.sender_name_decrypted 최우선 사용 (클라이언트에서 복호화된 값)
if (json && json.sender_name_decrypted) {
    return json.sender_name_decrypted;
}

// 2. json.sender_name 또는 json.senderName 사용 (하위 호환성)
if (json && (json.sender_name || json.senderName)) {
    return json.sender_name || json.senderName;
}

// 3. json.user_name 사용 (하위 호환성)
if (json && json.user_name) {
    return json.user_name;
}
```

## 검증

- [x] `sender_name_decrypted` 우선 확인 확인
- [x] 하위 호환성 유지 확인
- [x] Linter 오류 없음 확인

## 상태

✅ **수정 완료** - 서버 재시작 후 정상 작동 예상

## 예상 결과

이제 클라이언트에서 `json.sender_name_decrypted`로 복호화된 이름을 보내면, 서버가 이를 우선적으로 사용하여 암호화된 이름이 표시되지 않습니다.

