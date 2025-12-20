# Python vs JavaScript 복호화 로직 차이 분석

## 결론

**네, 가능합니다!** Python과 JavaScript가 로직은 같지만, **미묘한 차이**로 인해 복호화 성공/실패가 달라질 수 있습니다.

## 핵심 차이점

### 1. **큰 숫자 처리 (가장 가능성 높음)**

#### 문제
- Python `int`: **임의 정밀도** (무제한)
- JavaScript `Number`: **53비트 정밀도** 제한 (약 9,007,199,254,740,991까지)

#### 영향
```python
# Python
MY_USER_ID = 429744344  # 정확히 저장됨
user_id = 4897202238384073231  # 정확히 저장됨
```

```javascript
// JavaScript
const MY_USER_ID = 429744344;  // ✅ 정확
const user_id = 4897202238384073231;  // ⚠️ 정밀도 손실 가능성!
// JavaScript Number.MAX_SAFE_INTEGER = 9007199254740991
// 4897202238384073231 > 9007199254740991
```

**결과**: JavaScript에서 큰 `user_id`를 처리할 때 정밀도 손실이 발생할 수 있음!

### 2. **Salt 생성 방식의 미묘한 차이**

#### Python (`kakaodecrypt.py`)
```python
s = (prefix + str(user_id))[:16]
s = s + "\0" * (16 - len(s))
return s.encode("utf-8")
```

#### JavaScript (`server.js`)
```javascript
let saltStr = (prefix + userIdStr).substring(0, 16);
const salt = Buffer.alloc(16, 0);
const saltBytes = Buffer.from(saltStr, 'utf-8');
const copyLen = Math.min(saltBytes.length, 16);
saltBytes.copy(salt, 0, 0, copyLen);
```

**차이점**:
- Python: 문자열을 만들고 마지막에 패딩 추가 후 인코딩
- JavaScript: Buffer를 미리 할당하고 복사
- **결과는 거의 동일하지만**, 문자열 길이 계산이나 UTF-8 인코딩 시 미묘한 차이가 있을 수 있음

### 3. **Password UTF-16-BE 인코딩 차이**

#### Python
```python
password = (KAKAO_PASSWORD + b'\0').decode('ascii').encode('utf-16-be')
```

#### JavaScript
```javascript
const password = Buffer.from(KAKAO_PASSWORD);
const passwordWithNull = Buffer.concat([password, Buffer.from([0])]);
const passwordUtf16be = Buffer.alloc(passwordWithNull.length * 2);
for (let i = 0; i < passwordWithNull.length; i++) {
  passwordUtf16be[i * 2] = 0;
  passwordUtf16be[i * 2 + 1] = passwordWithNull[i];
}
```

**차이점**:
- Python: `.decode('ascii')`는 각 바이트를 ASCII 문자로 변환
- JavaScript: 직접 바이트 처리 (ASCII 범위 0-127 가정)
- **대부분의 경우 동일하지만**, 바이트 값이 ASCII 범위를 벗어나면 다를 수 있음

### 4. **PKCS12 키 유도 알고리즘**

로직은 거의 동일하지만:
- Python: `bytearray` 사용 (가변)
- JavaScript: `Buffer` 사용 (불변, 복사 필요)
- 바이트 연산 시 미묘한 차이가 있을 수 있음

### 5. **AES 복호화 및 Padding 처리**

#### Python
```python
cipher = AES.new(secret_key, AES.MODE_CBC, KAKAO_IV)
padded = cipher.decrypt(decoded_bytes)
pad = padded[-1]
pt = padded[:-pad]
```

#### JavaScript
```javascript
const decipher = crypto.createDecipheriv('aes-256-cbc', secretKey, KAKAO_IV);
decipher.setAutoPadding(false);
let padded = Buffer.concat([decipher.update(decoded), decipher.final()]);
const pad = padded[padded.length - 1];
const pt = padded.slice(0, padded.length - pad);
```

**차이점**: 거의 동일하지만 `decipher.update()` + `decipher.final()` 조합이 Python의 단일 `decrypt()`와 미묘하게 다를 수 있음

## 실제 문제 원인 추정

### 가장 가능성 높은 이유: **큰 숫자 정밀도 손실**

```javascript
// JavaScript에서 큰 user_id 처리
const user_id = 4897202238384073231;  // ⚠️ Number 정밀도 초과!
const userIdStr = String(user_id);    // "4897202238384073000" (손실!)
```

**해결책**: 서버 코드를 보면 이미 `String(userId)`로 변환하여 사용하고 있으므로, 이 문제는 아닐 수 있음.

### 두 번째 가능성: **Salt 생성 시 문자열 처리**

```python
# Python
s = (prefix + str(user_id))[:16]  # "veil429744344" → "veil429744344" (13자)
s = s + "\0" * (16 - len(s))      # "veil429744344\0\0\0"
```

```javascript
// JavaScript
let saltStr = (prefix + userIdStr).substring(0, 16);
// userIdStr가 문자열이면 동일해야 하지만...
```

### 세 번째 가능성: **실제로는 서버에서도 실패하지만 다른 경로로 해결**

서버 로그를 확인하면:
1. 복호화 시도 → 실패
2. `sender` 필드 파싱으로 복호화된 이름 추출 (이미 클라이언트에서 복호화된 값이 있으면)

## 결론

**로직은 거의 동일하지만, Python과 JavaScript의 언어 특성 차이**로 인해:
1. **큰 숫자 처리** (JavaScript Number 정밀도 제한)
2. **문자열/바이트 처리** (UTF-8 인코딩 방식)
3. **부동소수점 연산** (있을 수 있음)

이러한 차이로 인해 복호화 결과가 달라질 수 있습니다.

**하지만 현재 상태는 정상입니다**: 서버에서 정상적으로 복호화되어 저장되므로, 클라이언트 복호화 실패는 문제가 되지 않습니다.

