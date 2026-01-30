# 카카오톡 봇 이미지 첨부 질문 기능 - 현재 상황 및 플로우 문서

## 📋 현재 상황 요약

### 🔴 발견된 문제점

1. **모듈 경로 오류 (Critical)**
   - 에러: `Cannot find module '../utils/imageDownloader'`
   - 위치: `server/services/imageProcessor.js:8`
   - 원인: `imageProcessor.js`가 `../utils/imageDownloader`를 require하는데, 실제 파일은 `server/utils/imageDownloader.js`에 존재
   - 영향: 이미지 처리 파이프라인이 완전히 실패하여 이미지 첨부 기능이 작동하지 않음

2. **Bridge API 인증 실패**
   - 에러: `[Bridge] ❌ 인증 실패: provided=있음, expected=있음`
   - 원인: Bridge APK의 API Key와 서버의 `.env` 파일의 `BRIDGE_API_KEY`가 일치하지 않음
   - 영향: Fallback 이미지 업로드 메커니즘이 작동하지 않음

3. **이미지 메시지 감지는 성공하지만 처리 실패**
   - 로그: `[이미지 저장] ✅ 이미지 메시지 감지됨`
   - 로그: `msgType=2, attachment_decrypted 존재=false, attachment 존재=true`
   - 원인: 모듈 경로 오류로 인해 이미지 다운로드/저장 단계에서 실패
   - 영향: 사용자가 이미지를 보내도 계속 "이미지를 보내시면..." 메시지가 반복됨

---

## 🔄 전체 플로우 상세 설명

### Phase 1: 사용자 질문 시작 (`!질문` 명령어)

**위치**: `server/labbot-node.js` → `handleMessage()` 함수

**플로우**:
```
사용자 입력: "!질문"
  ↓
handleMessage() 호출
  ↓
명령어 파싱: msgLower.startsWith("!질문")
  ↓
질문 제목/내용 입력 요청
  ↓
PENDING_QUESTION_CACHE에 질문 정보 저장
  - key: `${room}|${senderId}`
  - value: { title, content, timestamp }
  ↓
사용자에게 "이미지를 보내시면 자동으로 첨부됩니다" 메시지 전송
```

**샘플 코드**:
```javascript
// server/labbot-node.js
if (msgLower.startsWith("!질문")) {
    // 질문 제목/내용 파싱
    const parts = msgTrimmed.split('\n');
    const title = parts[0].replace(/^!질문\s*/, '').trim();
    const content = parts.slice(1).join('\n').trim();
    
    if (!title || title.length < 2) {
        replies.push("❌ 질문 제목을 입력해주세요.\n\n사용법: !질문 제목\n내용");
        return replies;
    }
    
    // 질문 대기 상태 저장
    setPendingQuestion(room, senderId, title, content);
    
    // 이미지 첨부 안내
    replies.push("⏳ 이미지를 보내시면 질문에 자동으로 첨부됩니다.\n\n이미지 없이 진행하려면 '없음'을 입력해주세요.");
    return replies;
}
```

---

### Phase 2: 이미지 메시지 도착 및 감지

**위치**: `server/server.js` → WebSocket 메시지 수신 핸들러

**플로우**:
```
클라이언트(Python) → WebSocket → server.js
  ↓
JSON 파싱: { msg_type, attachment, image_url, has_image, ... }
  ↓
이미지 메시지 조기 감지 (저장 전)
  - 조건: msg_type === 2 또는 27
  - 또는: image_url 존재
  - 또는: has_image === true
  ↓
isImageMessageEarly = true 설정
  ↓
imageUrlEarly 추출 시도
  - 우선: json.image_url
  - 없으면: attachment에서 extractImageUrl() 호출
```

**샘플 코드**:
```javascript
// server/server.js (약 2100번째 줄)
if (json) {
    const msgType = json.msg_type || json.type;
    const imageUrlFromClient = json.image_url || null;
    const hasImageBool = json.has_image === true || json.has_image === 'true';
    const imageTypes = [2, 27, '2', '27'];
    
    // 이미지 메시지 조기 감지
    isImageMessageEarly = imageUrlFromClient || hasImageBool || 
                          (msgType && imageTypes.includes(String(msgType)));
    
    if (isImageMessageEarly) {
        // 이미지 URL 추출 시도
        const { extractImageUrl } = require('./db/utils/attachmentExtractor');
        let attachmentData = json.attachment_decrypted || json.attachment || null;
        
        if (attachmentData && typeof attachmentData === 'string') {
            try {
                attachmentData = JSON.parse(attachmentData);
            } catch (e) {
                // 파싱 실패
            }
        }
        
        imageUrlEarly = imageUrlFromClient;
        if (!imageUrlEarly && attachmentData) {
            imageUrlEarly = extractImageUrl(attachmentData, msgType);
        }
    }
}
```

---

### Phase 3: 이미지 처리 파이프라인 (Primary → Fallback)

**위치**: `server/services/imageProcessor.js` → `handleIncomingImageMessage()`

**플로우**:
```
이미지 메시지 감지됨
  ↓
handleIncomingImageMessage() 호출
  ↓
[Primary Flow]
  1. 이미지 URL 추출
     - imageUrlFromClient 우선 사용
     - 없으면 attachment에서 extractImageUrl() 호출
  2. downloadAndSaveImage(imageUrl) 호출
     - ❌ 현재 실패: 모듈 경로 오류
     - 성공 시: 서버에 이미지 저장 → 공개 URL 생성
  3. 성공 시 즉시 반환
  ↓
[Fallback Flow] (Primary 실패 시)
  1. PENDING_PREVIEW_CACHE 조회
     - key: `${roomName}|${senderId}` 또는 `${roomName}|${senderName}`
  2. Bridge APK가 업로드한 미리보기 이미지 확인
     - ❌ 현재 실패: Bridge 인증 실패로 업로드 안 됨
  3. 파일 존재 확인 후 서버 URL 생성
  ↓
모두 실패 시: { success: false, error: '...', trace: {...} } 반환
```

**샘플 코드**:
```javascript
// server/services/imageProcessor.js
async function handleIncomingImageMessage({
    roomName, senderId, senderName, msgType,
    attachment, attachmentDecrypted, imageUrlFromClient,
    encType, kakaoLogId
}) {
    // ========== Primary Flow ==========
    let imageUrl = imageUrlFromClient;
    
    if (!imageUrl) {
        // attachment에서 추출
        const attachmentData = attachmentDecrypted || attachment;
        if (attachmentData) {
            let attachObj = attachmentData;
            if (typeof attachmentData === 'string') {
                attachObj = JSON.parse(attachmentData);
            }
            if (attachObj && typeof attachObj === 'object') {
                imageUrl = extractImageUrl(attachObj, msgType);
            }
        }
    }
    
    if (imageUrl) {
        // ❌ 여기서 실패: 모듈 경로 오류
        const downloadResult = await downloadAndSaveImage(imageUrl);
        // require('../utils/imageDownloader') → Cannot find module
        
        if (downloadResult.success) {
            return {
                success: true,
                source: 'primary',
                url: downloadResult.url,
                filePath: downloadResult.filePath
            };
        }
    }
    
    // ========== Fallback Flow ==========
    const previewData = getAndClearPendingPreview(roomName, senderId || senderName);
    if (previewData && previewData.filePath) {
        const fs = require('fs');
        if (fs.existsSync(previewData.filePath)) {
            const serverUrl = process.env.SERVER_URL || 'http://192.168.0.15:5002';
            const imageUrl = `${serverUrl}/api/image/${previewData.filename}`;
            return {
                success: true,
                source: 'fallback',
                url: imageUrl,
                filePath: previewData.filePath
            };
        }
    }
    
    // 모두 실패
    return { success: false, error: 'Primary와 Fallback 모두 실패' };
}
```

---

### Phase 4: 질문 대기 상태 확인 및 이미지 결합

**위치**: `server/server.js` → 이미지 처리 성공 후

**플로우**:
```
이미지 처리 성공 (imageResult.success === true)
  ↓
질문 대기 상태 확인
  - getAndClearPendingQuestion(roomName, senderId)
  - PENDING_QUESTION_CACHE에서 조회 및 삭제
  ↓
질문 대기 상태 있음
  ↓
processQuestionSubmission() 호출
  - room, sender, title, content, imageUrl 전달
  ↓
질문 대기 상태 없음
  ↓
PENDING_ATTACHMENT_CACHE에 이미지 URL 저장
  - 나중에 !질문 명령어에서 사용 가능
```

**샘플 코드**:
```javascript
// server/server.js (약 2387번째 줄)
if (imageResult.success && imageResult.url) {
    const { getAndClearPendingQuestion, processQuestionSubmission } = require('./labbot-node');
    
    if (senderId) {
        const pendingQuestion = getAndClearPendingQuestion(roomName, senderId);
        
        if (pendingQuestion) {
            // 질문과 함께 처리
            const questionReplies = await processQuestionSubmission(
                roomName,
                senderName || sender || '',
                pendingQuestion.title,
                pendingQuestion.content,
                imageResult.url  // 이미지 URL 전달
            );
            
            ws.pendingQuestionReplies = questionReplies || [];
        } else {
            // 질문 대기 상태 없음 - 캐시에만 저장
            setPendingAttachment(roomName, senderId, imageResult.url);
        }
    }
}
```

---

### Phase 5: 네이버 카페 글쓰기 (이미지 포함)

**위치**: `server/labbot-node.js` → `processQuestionSubmission()`

**플로우**:
```
processQuestionSubmission(room, sender, title, content, imageUrl)
  ↓
이미지 URL 처리
  - URL인 경우: axios로 다운로드 → Buffer로 변환
  - 파일 경로인 경우: fs.readFileSync() → Buffer
  ↓
imageBuffers 배열 준비
  - 예: [Buffer, Buffer, ...]
  ↓
submitQuestion() 호출
  - images: imageBuffers 배열 전달
  ↓
네이버 카페 API 호출 (writeCafeArticle)
  - multipart/form-data 형식
  - FormData에 subject, content, images 추가
  ↓
성공 시: articleUrl 반환
실패 시: 에러 메시지 반환
```

**샘플 코드**:
```javascript
// server/labbot-node.js (약 1484번째 줄)
async function processQuestionSubmission(room, sender, title, content, imageUrl = null) {
    let imageBuffers = [];
    
    if (imageUrl) {
        if (fs.existsSync(imageUrl)) {
            // 파일 경로인 경우
            const imageBuffer = fs.readFileSync(imageUrl);
            imageBuffers = [imageBuffer];
        } else if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
            // URL인 경우 다운로드
            const axios = require('axios');
            const imageResponse = await axios.get(imageUrl, {
                responseType: 'arraybuffer',
                timeout: 30000
            });
            const imageBuffer = Buffer.from(imageResponse.data);
            imageBuffers = [imageBuffer];
        }
    }
    
    // 네이버 카페에 질문 제출
    const result = await submitQuestion({
        senderId: sender,
        senderName: extractSenderName(sender),
        roomId: room,
        title: title,
        content: content,
        accessToken: accessToken,
        clubid: clubid,
        menuid: menuid,
        headid: headid,
        images: imageBuffers.length > 0 ? imageBuffers : null
    });
    
    if (result.success) {
        replies.push(`✅ 질문 작성 완료!\n\nQ. ${title}\n${content}\n\n📷 (이미지 첨부 완료)\n\n답변하러가기: ${result.articleUrl}`);
    }
    
    return replies;
}
```

**네이버 카페 API 호출**:
```javascript
// server/integrations/naverCafe/cafeWrite.js
async function writeCafeArticle({ subject, content, clubid, menuid, accessToken, headid, images = null }) {
    const hasImages = images !== null && Array.isArray(images) && images.length > 0;
    
    if (hasImages) {
        // multipart/form-data
        const formData = new FormData();
        formData.append('subject', subject);
        formData.append('content', content);
        
        // 이미지 추가 (fieldName: "0", "1", ...)
        for (let i = 0; i < images.length; i++) {
            const image = images[i];
            let imageBuffer;
            
            if (Buffer.isBuffer(image)) {
                imageBuffer = image;
            } else if (typeof image === 'string' && fs.existsSync(image)) {
                imageBuffer = fs.readFileSync(image);
            }
            
            formData.append(String(i), imageBuffer, {
                filename: `image${i + 1}.jpg`,
                contentType: 'image/jpeg'
            });
        }
        
        const response = await axios.post(apiUrl, formData, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                ...formData.getHeaders()
            }
        });
        
        return {
            success: true,
            articleId: response.data.result.article.articleId,
            articleUrl: response.data.result.article.articleUrl
        };
    } else {
        // application/x-www-form-urlencoded
        // ...
    }
}
```

---

## 🔧 해결해야 할 문제점

### 1. 모듈 경로 오류 (최우선)

**문제**:
```javascript
// server/services/imageProcessor.js:8
const { downloadAndSaveImage } = require('../utils/imageDownloader');
// ❌ Cannot find module '../utils/imageDownloader'
```

**확인 사항**:
- ✅ 파일 존재: `server/utils/imageDownloader.js` 존재 확인됨
- ✅ 상대 경로: `../utils/imageDownloader` 정확함
- ✅ require.resolve: 로컬 테스트에서 성공
- ❌ 서버 실행 시 실패: 서버가 다른 디렉토리에서 실행되거나 모듈 캐시 문제 가능

**해결 방법**:
- 옵션 1: `__dirname` 기반 절대 경로 사용 (권장)
  ```javascript
  // server/services/imageProcessor.js
  const path = require('path');
  const imageDownloaderPath = path.join(__dirname, '../utils/imageDownloader');
  const { downloadAndSaveImage } = require(imageDownloaderPath);
  ```

- 옵션 2: 서버 실행 디렉토리 확인
  - 서버가 `server/` 디렉토리에서 실행되는지 확인
  - `package.json`의 `start` 스크립트 확인
  - PM2 또는 다른 프로세스 매니저의 `cwd` 설정 확인

- 옵션 3: 모듈 캐시 클리어
  ```javascript
  // 서버 재시작 전에
  delete require.cache[require.resolve('../utils/imageDownloader')];
  ```

- 옵션 4: 에러 핸들링 추가
  ```javascript
  let downloadAndSaveImage;
  try {
      downloadAndSaveImage = require('../utils/imageDownloader').downloadAndSaveImage;
  } catch (e) {
      console.error('[이미지 처리] 모듈 로드 실패:', e.message);
      console.error('[이미지 처리] __dirname:', __dirname);
      console.error('[이미지 처리] 예상 경로:', path.join(__dirname, '../utils/imageDownloader.js'));
      // Fallback: 직접 구현 또는 다른 방법 사용
  }
  ```

### 2. Bridge API Key 불일치

**문제**:
- Bridge APK: `kakkaobot-bridge-2024-12-20-secret-key-default` (하드코딩)
- 서버 `.env`: 설정되지 않았거나 다른 값

**해결 방법**:
1. 서버 `.env` 파일에 추가:
   ```bash
   BRIDGE_API_KEY=kakkaobot-bridge-2024-12-20-secret-key-default
   BRIDGE_PREVIEW_ENABLED=true
   ```
2. 서버 재시작
3. Bridge APK의 SharedPreferences 확인:
   ```kotlin
   val prefs = context.getSharedPreferences("bridge_config", Context.MODE_PRIVATE)
   val apiKey = prefs.getString("bridge_api_key", null)
   // apiKey가 서버와 일치하는지 확인
   ```

### 3. 이미지 처리 실패 시 사용자 피드백

**현재 동작**:
- 이미지 처리 실패 → 질문 대기 상태 유지 → 사용자에게 "이미지를 보내시면..." 메시지 반복

**개선 필요**:
- 이미지 메시지가 도착했지만 처리 실패한 경우 명확한 피드백 제공
- Bridge fallback 대기 중임을 알림

---

## 📊 데이터 구조

### PENDING_QUESTION_CACHE
```javascript
// Map<string, {title, content, timestamp}>
// key: `${room}|${senderId}`
// value: { title: string, content: string, timestamp: number }
```

### PENDING_ATTACHMENT_CACHE
```javascript
// Map<string, {url, timestamp}>
// key: `${room}|${senderId}`
// value: { url: string, timestamp: number }
```

### PENDING_PREVIEW_CACHE
```javascript
// Map<string, {filePath, filename, mime, size, ts, ...}>
// key: `${room}|${senderId}` 또는 `${room}|${senderName}`
// value: { filePath: string, filename: string, mime: string, size: number, ts: number, ... }
```

---

## 🎯 요청 사항

외주 업자에게 다음을 질문해주세요:

1. **모듈 경로 오류 해결**
   - `server/services/imageProcessor.js`에서 `require('../utils/imageDownloader')`가 실패하는 이유
   - 파일은 `server/utils/imageDownloader.js`에 존재함
   - Node.js 모듈 해석이 실패하는 원인 파악

2. **이미지 처리 파이프라인 개선**
   - Primary Flow 실패 시 Fallback Flow로 전환하는 로직이 올바른지
   - 에러 핸들링 및 사용자 피드백 개선 방안

3. **Bridge API 인증 개선**
   - API Key 불일치 시 더 명확한 에러 메시지
   - 인증 실패 시 자동 재시도 로직 필요 여부

4. **전체 플로우 검증**
   - `!질문` → 이미지 첨부 → 네이버 카페 글쓰기 전체 플로우가 올바르게 작동하는지
   - 각 단계별 에러 핸들링이 충분한지

---

## 📝 참고 파일 목록

- `server/labbot-node.js`: 메시지 처리 및 질문 제출 로직
- `server/server.js`: WebSocket 메시지 수신 및 이미지 조기 감지
- `server/services/imageProcessor.js`: 이미지 처리 파이프라인 (Primary/Fallback)
- `server/utils/imageDownloader.js`: 이미지 다운로드 및 저장 유틸리티
- `server/integrations/naverCafe/questionService.js`: 네이버 카페 질문 제출 서비스
- `server/integrations/naverCafe/cafeWrite.js`: 네이버 카페 API 호출
- `server/routes/bridge.js`: Bridge APK 이미지 업로드 엔드포인트
- `client/kakao_poller.py`: 클라이언트 이미지 메시지 감지 및 전송

