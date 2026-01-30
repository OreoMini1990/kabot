# 네이버 카페 인코딩 문제 최종 해결 방안

## 문제

네이버 카페에 글을 발행할 때 한글이 깨짐 (예: "!질문 테스트" → "◇꿩 ◇뜀 ◇듁")

## 현재 코드 상태

FormData를 사용할 때 원본 문자열을 그대로 사용:
```javascript
formData.append('subject', subject);
formData.append('content', content);
```

FormData 라이브러리는 기본적으로 UTF-8을 사용하므로, 이 방법이 맞습니다.

## 가능한 원인

1. 네이버 카페 API가 multipart/form-data에서 특정 인코딩 방식을 요구할 수 있음
2. Node.js의 문자열 인코딩 설정 문제
3. 네이버 카페 서버가 잘못된 Content-Type을 해석

## 해결 방법

### 방법 1: Buffer를 명시적으로 사용하지 않음 (현재 방식)
FormData는 문자열을 받으면 자동으로 UTF-8로 인코딩합니다. 이것이 가장 안전한 방법입니다.

### 방법 2: 네이버 카페 API 문서 재확인
네이버 개발자 문서에서 multipart/form-data의 정확한 요구사항을 확인해야 합니다.

### 방법 3: Content-Type 헤더 확인
실제 전송되는 Content-Type 헤더를 로깅하여 확인합니다.

## 디버깅

실제 전송되는 데이터를 확인하기 위해:
1. 네트워크 요청 로깅 활성화
2. FormData의 실제 바이트 확인
3. 네이버 카페 API 응답 확인

## 참고

- 이미지가 없을 때 사용하는 `application/x-www-form-urlencoded` 방식은 이미 올바르게 인코딩되어 있습니다.
- 문제는 multipart/form-data 방식에서만 발생합니다.



