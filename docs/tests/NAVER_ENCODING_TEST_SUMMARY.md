# 네이버 카페 인코딩 모드 테스트 요약

## 현재 구현된 인코딩 모드

### 1. multipart/form-data (이미지 있을 때)

#### `raw` (기본값)
- **방식**: UTF-8 Buffer + `Content-Type: text/plain; charset=UTF-8`
- **코드**:
  ```javascript
  formData.append('subject', Buffer.from(subjectToSend, 'utf8'), {
      contentType: 'text/plain; charset=UTF-8'
  });
  ```

#### `double_ms949`
- **방식**: UTF-8 Buffer + `Content-Type: text/plain; charset=UTF-8` (raw와 동일)
- **설명**: 호환성을 위해 유지, 실제 동작은 raw와 동일

#### `raw_string`
- **방식**: 원본 문자열 그대로 (FormData가 자동으로 UTF-8 처리)
- **코드**:
  ```javascript
  formData.append('subject', subjectToSend);
  ```

#### `euckr_bytes`
- **방식**: EUC-KR Buffer + `Content-Type: text/plain; charset=EUC-KR`
- **코드**:
  ```javascript
  const euckrSubjectBuffer = iconv.encode(subject, 'EUC-KR');
  formData.append('subject', euckrSubjectBuffer, {
      contentType: 'text/plain; charset=EUC-KR'
  });
  ```

### 2. application/x-www-form-urlencoded (이미지 없을 때)

- **방식**: UTF-8 URL 인코딩 → MS949 바이트 변환 → URL 인코딩 (이중 인코딩)
- **코드**:
  ```javascript
  const utf8EncodedSubject = encodeURIComponent(subject);
  const ms949Buffer = iconv.encode(utf8EncodedSubject, 'EUC-KR');
  const ms949Subject = Array.from(ms949Buffer)
      .map(byte => '%' + byte.toString(16).toUpperCase().padStart(2, '0'))
      .join('');
  ```

## 테스트 방법

### 환경변수 설정
```bash
NAVER_MULTIPART_ENCODING_MODE=raw  # 또는 double_ms949, raw_string, euckr_bytes
```

### 테스트 스크립트 실행

1. **이미지 포함 테스트**:
   ```bash
   node server/test/test_all_modes_with_permission.js
   ```

2. **이미지 없음 테스트**:
   ```bash
   node server/test/test_encoding_without_image.js
   ```

3. **단일 모드 테스트**:
   ```bash
   NAVER_MULTIPART_ENCODING_MODE=raw node server/test/test_naver_cafe_image.js
   ```

## 테스트 결과 확인 방법

1. 각 모드로 작성된 글의 URL 확인
2. 브라우저에서 URL 열기
3. 한글이 올바르게 표시되는 모드 확인
4. `cafeWrite.js`의 기본값을 성공한 모드로 변경

## 현재 문제

- 모든 모드가 403 오류로 실패 중
- 토큰 검증은 성공 (사용자: 이민)
- 네이버 API 권한 문제로 보임

## 다음 단계

권한 문제 해결 후:
1. 각 모드로 테스트 실행
2. 작성된 글의 한글 표시 확인
3. 올바른 인코딩 모드 결정
4. `cafeWrite.js`의 기본값 변경



