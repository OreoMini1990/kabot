# ATTACHMENT_DECRYPT_AVAILABLE NameError 수정

## 발견된 오류

### 오류: `ATTACHMENT_DECRYPT_AVAILABLE` is not defined
- **위치**: `client/kakao_poller.py` line 1518
- **에러 메시지**: `NameError: name 'ATTACHMENT_DECRYPT_AVAILABLE' is not defined`
- **원인**: `ATTACHMENT_DECRYPT_AVAILABLE` 변수가 `try-except` 블록 안에서만 정의되어 있어서, 전체 `try` 블록이 실패하면 변수가 정의되지 않음

## 수정 내용

### 변수 초기화를 파일 최상단으로 이동
- **27줄 이전**: `ATTACHMENT_DECRYPT_AVAILABLE = False` 기본값 설정 추가
- **28줄 이전**: `decrypt_attachment = None` 기본값 설정 추가
- **29줄 이전**: `ATTACHMENT_DECRYPT_WHITELIST = set()` 기본값 설정 추가

이렇게 하면 `try-except` 블록이 실패해도 변수가 항상 정의되어 `NameError`가 발생하지 않습니다.

## 수정 후 코드 구조

```python
# Phase 2: attachment 복호화 모듈 변수 초기화 (기본값 설정)
ATTACHMENT_DECRYPT_AVAILABLE = False
decrypt_attachment = None
ATTACHMENT_DECRYPT_WHITELIST = set()

try:
    # ... import 시도 ...
    try:
        from attachment_decrypt import decrypt_attachment as _decrypt_attachment, ATTACHMENT_DECRYPT_WHITELIST as _ATTACHMENT_DECRYPT_WHITELIST
        ATTACHMENT_DECRYPT_AVAILABLE = True
        decrypt_attachment = _decrypt_attachment
        ATTACHMENT_DECRYPT_WHITELIST = _ATTACHMENT_DECRYPT_WHITELIST
    except ImportError:
        # 이미 기본값으로 초기화되어 있으므로 추가 작업 불필요
        pass
except ImportError:
    # 변수는 이미 기본값으로 초기화되어 있음
    pass
```

## 검증

- [x] 변수 초기화 확인
- [x] import 실패 시에도 변수 정의 확인
- [x] Linter 오류 없음 확인

## 상태

✅ **수정 완료** - 클라이언트 재시작 후 정상 작동 예상

