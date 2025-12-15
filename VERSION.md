# 버전 관리

## v1.0.0 (2025-01-XX) - 초기 릴리스

### 주요 변경사항
- ✅ 카카오톡 메시지 복호화 로직 구현 완료
- ✅ Python 코드와 JavaScript 코드 동일성 확인
- ✅ 실제 메시지 복호화 테스트 성공
- ✅ 서버 로그 파일 자동 관리 기능 추가

### 수정된 파일
- `server/server.js`: 복호화 로직 수정
  - `generateSalt`: Python 코드와 동일하게 단순화
  - `generateSecretKey`: PKCS12 키 생성 로직 수정
    - `saltLen`, `passLen` 계산 방식 수정: `Math.ceil(len / v)` 사용
    - `pkcs16adjust`: I 배열 직접 수정하도록 변경
    - password 처리: UTF-16-BE 인코딩 정확히 구현

### 테스트 결과
- 실제 메시지 1 (userId=363060131): "123" ✓
- 실제 메시지 2 (userId=4897202238384073231): "123123" ✓

### 롤백 방법
이전 버전으로 롤백하려면:
1. Git을 사용하는 경우: `git checkout <commit-hash>`
2. 수동 롤백: `server/server.js`의 복호화 로직을 이전 버전으로 교체

### 알려진 이슈
- 없음

