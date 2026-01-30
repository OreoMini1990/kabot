# msg_type_str UnboundLocalError 수정

## 발견된 오류

### 오류: `msg_type_str` is not defined
- **위치**: `client/kakao_poller.py` line 1744
- **에러 메시지**: `UnboundLocalError: cannot access local variable 'msg_type_str' where it is not associated with a value`
- **원인**: `msg_type_str` 변수가 `if msg_type:` 블록 안에서만 정의되어 있어서, `msg_type`이 None이거나 해당 블록이 실행되지 않으면 변수가 정의되지 않음

## 수정 내용

### 1. `msg_type_str` 초기화를 블록 밖으로 이동
- **1580줄 이전**: `msg_type_str = str(msg_type) if msg_type is not None else None` 추가
- 이렇게 하면 `msg_type`이 None이어도 `msg_type_str`가 항상 정의됨

### 2. `msg_type_str` 사용 전 None 체크 추가
- **1744줄**: `if msg_type_str and msg_type_str in ["2", "12", "27"] and attachment_decrypted:`로 수정
- None 체크를 추가하여 안전하게 처리

## 수정 후 코드 구조

```python
# msg_type_str 초기화 (항상 정의되도록)
msg_type_str = str(msg_type) if msg_type is not None else None

# ... (중간 코드) ...

# Phase 2: 복호화된 attachment 정보 추출
has_image = False
image_url = None
if msg_type_str and msg_type_str in ["2", "12", "27"] and attachment_decrypted:
    # ... (이미지 처리 로직) ...
```

## 검증

- [x] `msg_type_str` 항상 정의 확인
- [x] None 체크 추가 확인
- [x] Linter 오류 없음 확인

## 상태

✅ **수정 완료** - 클라이언트 재시작 후 정상 작동 예상

