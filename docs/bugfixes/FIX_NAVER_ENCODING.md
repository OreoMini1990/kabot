# 네이버 카페 인코딩 문제 해결

## 문제 요약

**증상**: 네이버 카페에 글을 발행할 때 한글이 깨져서 표시됨 (예: "!질문 테스트" → "◇꿩 ◇뜀 ◇듁")

**원인**: `multipart/form-data` 방식에서 `subject`와 `content` 필드를 전송할 때 UTF-8 charset이 명시되지 않아 네이버 카페 API가 잘못된 인코딩으로 해석

---

## 해결 방법

### 변경 전

```javascript
// subject 필드 추가 (FormData는 자동으로 UTF-8 인코딩 처리하므로 원본 문자열 사용)
formData.append('subject', subject);

// content 필드 추가 (FormData는 자동으로 UTF-8 인코딩 처리하므로 원본 문자열 사용)
formData.append('content', content);
```

**문제**: FormData가 자동으로 인코딩하지만, 네이버 카페 API가 Content-Type에 charset 정보가 없으면 기본 인코딩을 사용할 수 있음

### 변경 후

```javascript
// subject 필드 추가 (UTF-8 charset 명시)
// Java 예제: Content-Type: text/plain; charset=UTF-8
formData.append('subject', Buffer.from(subject, 'utf8'), {
    contentType: 'text/plain; charset=UTF-8'
});

// content 필드 추가 (UTF-8 charset 명시)
formData.append('content', Buffer.from(content, 'utf8'), {
    contentType: 'text/plain; charset=UTF-8'
});
```

**효과**: 
- UTF-8로 명시적으로 인코딩된 Buffer 사용
- Content-Type에 `charset=UTF-8` 명시하여 네이버 카페 API가 올바른 인코딩으로 해석

---

## 기술적 설명

### 네이버 카페 API 요구사항

네이버 카페 API는 Java 예제에서 다음과 같이 multipart 필드를 설정합니다:

```java
// Java 예제
writer.append("Content-Disposition: form-data; name=\"" + name + "\"; Content-Type: text/plain; charset=UTF-8").append(LINE_FEED);
```

각 필드에 `Content-Type: text/plain; charset=UTF-8`을 명시적으로 지정합니다.

### Node.js FormData 라이브러리

`form-data` 라이브러리에서 `append()` 메서드의 세 번째 인자로 옵션을 전달할 수 있습니다:

```javascript
formData.append(fieldName, value, options)
```

옵션:
- `contentType`: 해당 필드의 Content-Type (예: `'text/plain; charset=UTF-8'`)
- `filename`: 파일명 (파일 업로드 시)
- `knownLength`: 파일 크기 (선택사항)

### UTF-8 Buffer 변환

`Buffer.from(string, 'utf8')`을 사용하여 문자열을 UTF-8로 명시적으로 인코딩합니다:
- 원본 문자열을 UTF-8 바이트 배열로 변환
- 네이버 카페 API가 이 바이트 배열을 UTF-8로 해석하도록 보장

---

## 테스트 방법

1. `!질문 테스트,내용` 명령어 실행
2. 이미지 첨부 (선택)
3. 네이버 카페에서 글 확인
4. 한글이 올바르게 표시되는지 확인:
   - ✅ 예상: "테스트"
   - ❌ 이전: "◇뜀" (깨진 글자)

---

## 참고: application/x-www-form-urlencoded 방식

이미지가 없을 때 사용하는 `application/x-www-form-urlencoded` 방식은 이미 올바르게 인코딩되어 있습니다:

```javascript
// UTF-8 → URL 인코딩 → MS949 변환 → URL 인코딩
const utf8EncodedSubject = encodeURIComponent(subject);
const ms949Buffer = iconv.encode(utf8EncodedSubject, 'EUC-KR');
// ...
```

이 방식은 문제없으므로 수정하지 않았습니다.



