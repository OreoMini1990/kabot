# 네이버 카페 인코딩 문제 해결 구현

## 작업지시서 요약

### P0. 재현/로그
- 이미지 첨부(multipart) 요청 시 깨지는 샘플 3개 확보
- urlencoded vs multipart 비교 로그
- formData 실제 바이트/헤더 덤프

### P1. 인코딩 토글 적용
- `NAVER_MULTIPART_ENCODING_MODE` 환경변수 추가
- 3가지 모드: `raw`, `double_ms949`, `euckr_bytes`
- 스테이징에서 테스트 후 성공 모드 고정

### P2. 이미지 파트 키 정리
- 이미지 필드명을 "0" 고정에서 "0","1","2"...로 변경
- 다중 이미지 인식 검증

---

## 구현 내용

### 1. 인코딩 모드 토글 (P1)

**환경변수**: `NAVER_MULTIPART_ENCODING_MODE`

**3가지 모드**:

#### `raw` (기본값)
- 원본 문자열을 그대로 사용
- FormData가 자동으로 UTF-8로 인코딩
- 네이버 카페 API가 UTF-8을 기본으로 인식하는 경우 사용

#### `double_ms949`
- `application/x-www-form-urlencoded`와 동일한 이중 인코딩 적용
- Java 예제: `URLEncoder.encode(URLEncoder.encode("텍스트", "UTF-8"), "MS949")`
- 1단계: UTF-8로 URL 인코딩
- 2단계: MS949로 변환 후 URL 인코딩
- 3단계: 디코딩하여 원본 텍스트로 복원 (FormData에 전달)

#### `euckr_bytes`
- EUC-KR 바이트로 직접 전송
- `iconv.encode(text, 'EUC-KR')`로 변환
- Content-Type: `text/plain; charset=EUC-KR` 명시

### 2. 이미지 필드명 개선 (P2)

**변경 전**: 모든 이미지를 "0"으로 전송
```javascript
formData.append('0', imageBuffer, {...});
```

**변경 후**: 인덱스별로 "0", "1", "2"... 사용
```javascript
const imageFieldName = String(i); // "0", "1", "2"...
formData.append(imageFieldName, imageBuffer, {...});
```

### 3. 로깅 강화 (P0)

**추가된 로그**:
- 인코딩 모드 표시
- 원본 subject/content 로깅
- FormData 헤더 및 바이트 덤프 (개발 환경)
- 응답에서 articleUrl 로깅 (실제 글 확인용)

**개발 환경에서만 상세 로그**:
- `NODE_ENV=development` 또는 `DEBUG_NAVER_MULTIPART=1` 설정 시
- FormData 스트림 상세 정보 출력

---

## 사용 방법

### 환경변수 설정

```bash
# .env 파일에 추가
NAVER_MULTIPART_ENCODING_MODE=raw          # 기본값
NAVER_MULTIPART_ENCODING_MODE=double_ms949 # 이중 인코딩
NAVER_MULTIPART_ENCODING_MODE=euckr_bytes  # EUC-KR 바이트
```

### 테스트 순서

#### 방법 1: 자동 테스트 스크립트 (권장)
```powershell
# server/test 디렉토리에서 실행
cd server/test
.\test_encoding_modes.ps1
```
이 스크립트는 3가지 모드를 순차적으로 테스트합니다.

#### 방법 2: 수동 테스트
```powershell
# 모드 1: raw
$env:NAVER_MULTIPART_ENCODING_MODE="raw"
.\test_naver_cafe_image.ps1
# 네이버 카페에서 한글 확인

# 모드 2: double_ms949
$env:NAVER_MULTIPART_ENCODING_MODE="double_ms949"
.\test_naver_cafe_image.ps1
# 네이버 카페에서 한글 확인

# 모드 3: euckr_bytes
$env:NAVER_MULTIPART_ENCODING_MODE="euckr_bytes"
.\test_naver_cafe_image.ps1
# 네이버 카페에서 한글 확인
```

#### 방법 3: 서버 환경에서 테스트
```bash
# 모드 1: raw
NAVER_MULTIPART_ENCODING_MODE=raw pm2 restart kakkaobot-server
# 테스트: !질문 테스트,내용 + 이미지 첨부
# 네이버 카페에서 한글 확인

# 모드 2: double_ms949
NAVER_MULTIPART_ENCODING_MODE=double_ms949 pm2 restart kakkaobot-server
# 테스트: !질문 테스트,내용 + 이미지 첨부
# 네이버 카페에서 한글 확인

# 모드 3: euckr_bytes
NAVER_MULTIPART_ENCODING_MODE=euckr_bytes pm2 restart kakkaobot-server
# 테스트: !질문 테스트,내용 + 이미지 첨부
# 네이버 카페에서 한글 확인
```

2. **성공한 모드 고정**
   - 한글이 올바르게 표시되는 모드를 선택
   - `.env` 파일에 해당 모드 설정
   - 프로덕션 배포

### 로그 확인

**개발 환경에서 상세 로그 활성화**:
```bash
DEBUG_NAVER_MULTIPART=1 pm2 restart kakkaobot-server
```

**확인할 로그**:
- `[네이버 카페] multipart 인코딩 모드: XXX`
- `[네이버 카페] FormData 헤더: {...}`
- `[네이버 카페] FormData 스트림 개수: X`
- `[네이버 카페] ✅ 글 작성 완료: https://cafe.naver.com/...`

---

## 예상 결과

### raw 모드
- 원본 문자열 그대로 전송
- 네이버 카페가 UTF-8을 올바르게 처리하는 경우 성공

### double_ms949 모드
- `application/x-www-form-urlencoded`와 동일한 인코딩
- 네이버 카페가 multipart에서도 동일한 인코딩을 요구하는 경우 성공

### euckr_bytes 모드
- EUC-KR 바이트로 직접 전송
- 네이버 카페가 EUC-KR을 요구하는 경우 성공

---

## 다중 이미지 테스트

**P2 구현으로 다중 이미지 지원**:
- 이미지 1개: fieldName="0"
- 이미지 2개: fieldName="0", "1"
- 이미지 3개: fieldName="0", "1", "2"

**테스트 방법**:
1. 여러 이미지를 연속으로 전송
2. 네이버 카페에서 실제로 몇 장이 첨부되었는지 확인
3. 로그에서 `이미지 X 추가: fieldName="Y"` 확인

---

## 문제 해결 체크리스트

- [ ] P0: 깨진 샘플 3개 확보
- [ ] P0: urlencoded vs multipart 비교 로그
- [ ] P0: FormData 바이트/헤더 덤프
- [ ] P1: 3가지 인코딩 모드 구현 완료
- [ ] P1: 스테이징에서 3모드 테스트
- [ ] P1: 성공 모드 고정
- [ ] P2: 이미지 필드명 인덱스 변경
- [ ] P2: 다중 이미지 인식 검증

