# 네이버 카페 인코딩 자동 테스트 구현

## 개요

권한 문제가 해결되지 않을 경우, 실제 네이버 카페에 테스트 글을 작성하여 성공한 인코딩 모드를 자동으로 찾아서 사용하는 기능을 구현했습니다.

## 구현 내용

### 1. `encodingTester.js` 모듈 생성

**위치**: `server/integrations/naverCafe/encodingTester.js`

**주요 기능**:
- 각 인코딩 모드를 순차적으로 테스트
- 성공한 첫 번째 모드를 찾아서 캐시 파일에 저장
- 다음 호출 시 캐시된 모드를 먼저 검증하여 성능 최적화

**사용 가능한 인코딩 모드**:
- `raw_string`: 원본 문자열 그대로 (FormData 자동 UTF-8 처리)
- `raw`: UTF-8 Buffer + Content-Type 명시
- `double_ms949`: UTF-8 Buffer + Content-Type 명시 (raw와 동일)
- `euckr_bytes`: EUC-KR Buffer + Content-Type 명시

### 2. `cafeWrite.js` 수정

**변경 사항**:
- `NAVER_MULTIPART_ENCODING_MODE` 환경변수가 설정되지 않았거나 `'auto'`인 경우 자동 테스트 실행
- 성공한 인코딩 모드를 자동으로 찾아서 사용
- 테스트용 이미지 파일을 자동으로 찾아서 사용

### 3. 캐시 파일

**위치**: `.naver_encoding_cache.json` (프로젝트 루트)

**내용**:
```json
{
  "encodingMode": "raw_string",
  "timestamp": "2025-01-20T12:00:00.000Z"
}
```

**특징**:
- 성공한 인코딩 모드를 저장하여 다음 호출 시 즉시 사용
- 캐시된 모드 검증 실패 시 자동으로 새 모드 찾기
- `.gitignore`에 추가되어 Git에 커밋되지 않음

## 사용 방법

### 자동 모드 (권장)

환경변수를 설정하지 않거나 `'auto'`로 설정:

```bash
# 환경변수 미설정 또는
NAVER_MULTIPART_ENCODING_MODE=auto
```

이 경우 첫 번째 호출 시 자동으로 모든 모드를 테스트하여 성공한 모드를 찾습니다.

### 수동 모드

특정 인코딩 모드를 강제로 사용:

```bash
NAVER_MULTIPART_ENCODING_MODE=raw_string
```

## 동작 흐름

1. **첫 번째 호출 (캐시 없음)**:
   - 모든 인코딩 모드를 순차적으로 테스트
   - 성공한 첫 번째 모드를 캐시에 저장
   - 해당 모드를 사용하여 실제 글 작성

2. **이후 호출 (캐시 있음)**:
   - 캐시된 모드를 먼저 검증
   - 검증 성공 시 해당 모드 사용
   - 검증 실패 시 다시 모든 모드 테스트하여 새 모드 찾기

## 테스트 로직

각 인코딩 모드로 다음 테스트 글을 작성:

- **제목**: "인코딩 테스트"
- **내용**: "<p>한글 테스트: 가나다라마바사</p>"
- **이미지**: 테스트 이미지 파일이 있으면 포함

성공한 모드는 실제 네이버 카페에 글을 작성하므로, 작성된 글에서 한글이 올바르게 표시되는지 확인할 수 있습니다.

## 주의사항

1. **테스트 글 생성**: 각 모드 테스트 시 실제 네이버 카페에 테스트 글이 작성됩니다.
2. **API 호출 횟수**: 최대 4개의 테스트 요청이 발생할 수 있습니다 (각 모드별 1개).
3. **성능**: 캐시된 모드가 있으면 추가 테스트 없이 즉시 사용합니다.

## 캐시 삭제

캐시를 삭제하여 처음부터 다시 테스트하려면:

```bash
rm .naver_encoding_cache.json
```

또는 Node.js 코드에서:

```javascript
const { saveCachedEncodingMode } = require('./server/integrations/naverCafe/encodingTester');
saveCachedEncodingMode(null);  // 캐시 삭제
```

## 로그 확인

인코딩 테스트 과정은 다음 로그로 확인할 수 있습니다:

```
[네이버 카페] 인코딩 모드 자동 테스트 시작...
[인코딩 테스트] 캐시에서 인코딩 모드 로드: raw_string
[인코딩 테스트] 캐시된 모드 "raw_string" 검증 중...
[인코딩 테스트] ✅ 캐시된 모드 "raw_string" 검증 성공
[네이버 카페] ✅ 성공한 인코딩 모드: raw_string
[네이버 카페] multipart 인코딩 모드: raw_string
```

