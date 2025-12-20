
/**
 * 네이버 카페 글쓰기 API 호출
 * 참고: https://developers.naver.com/docs/login/cafe-api/cafe-api.md
 */

const axios = require('axios');
const iconv = require('iconv-lite');
const querystring = require('querystring');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');
const { validateAccessToken } = require('./naverOAuth');
const { validateAndRefreshToken } = require('./tokenManager');

/**
 * 네이버 카페에 글 작성
 * @param {Object} params
 * @param {string} params.subject - 글 제목
 * @param {string} params.content - 글 내용
 * @param {number} params.clubid - 카페 ID
 * @param {number} params.menuid - 게시판 메뉴 ID
 * @param {string} params.accessToken - 네이버 OAuth 액세스 토큰
 * @param {number} [params.headid] - 말머리 ID (선택사항)
 * @param {Array<Buffer|string>} [params.images] - 이미지 파일 배열 (Buffer 또는 파일 경로)
 * @returns {Promise<Object>} { articleId, articleUrl }
 */
async function writeCafeArticle({ subject, content, clubid, menuid, accessToken, headid, images = null }) {
    try {
        // ========== 1단계: Access Token 유효성 검증 ==========
        console.log(`[네이버 카페] Access Token 검증 시작: accessToken 길이=${accessToken ? accessToken.length : 0}`);
        
        if (!accessToken || accessToken.trim() === '') {
            console.error('[네이버 카페] Access Token이 제공되지 않았습니다.');
            return {
                success: false,
                error: 'no_token',
                message: 'Access Token이 설정되지 않았습니다. OAuth 인증을 먼저 완료해주세요.'
            };
        }
        
        // 토큰 유효성 검증 및 필요시 자동 갱신
        let validToken = accessToken;
        const tokenValidation = await validateAndRefreshToken(accessToken);
        
        if (!tokenValidation.valid) {
            console.error(`[네이버 카페] Access Token 검증 실패: ${tokenValidation.error}`);
            return {
                success: false,
                error: 'invalid_token',
                message: `Access Token이 유효하지 않습니다: ${tokenValidation.error}. 새로운 토큰을 발급받아주세요.`
            };
        }
        
        if (tokenValidation.refreshed) {
            console.log(`[네이버 카페] Access Token 자동 갱신 완료`);
            validToken = tokenValidation.token;
        } else {
            // 토큰이 유효한지 한 번 더 확인 (사용자 정보 가져오기)
            const validationResult = await validateAccessToken(accessToken);
            if (validationResult.valid) {
                console.log(`[네이버 카페] Access Token 검증 성공: 사용자=${validationResult.user_info?.name || validationResult.user_info?.id || '알 수 없음'}`);
            }
        }
        
        // ========== 2단계: 카페 글쓰기 API 호출 ==========
        // 네이버 카페 API 엔드포인트
        const apiUrl = `https://openapi.naver.com/v1/cafe/${clubid}/menu/${menuid}/articles`;
        
        // 이미지가 있으면 multipart/form-data 사용, 없으면 application/x-www-form-urlencoded 사용
        // images가 null이 아닌 배열이고 길이가 0보다 큰지 확인
        const hasImages = images !== null && images !== undefined && Array.isArray(images) && images.length > 0;
        
        let response;
        
        if (hasImages) {
            // ========== multipart/form-data 방식 (이미지 첨부) ==========
            console.log(`[네이버 카페] 이미지 첨부 모드: ${images.length}개 이미지`);
            
            const formData = new FormData();
            
            // 인코딩 모드: 참고 자료에 따른 urlencoded 모드를 기본값으로 사용
            // 참고: multipart/form-data의 한글 필드는 encodeURIComponent로 인코딩 후 전송,
            //       서버에서 URLDecoder.decode로 디코딩하는 방식이 안전함
            // urlencoded 모드: encodeURIComponent(str) + contentType: 'text/plain; charset=UTF-8'
            let encodingMode = process.env.NAVER_MULTIPART_ENCODING_MODE || 'urlencoded';
            
            let subjectToSend = subject;
            let contentToSend = content;
            
            if (encodingMode === 'double_ms949') {
                // Java 예제: String subject = URLEncoder.encode("네이버 multi-part 이미지 첨부 테스트", "UTF-8");
                //           mu.addFormField("subject", subject);
                // addFormField는 URL 인코딩된 값을 받아서 디코딩하여 원본 텍스트로 전송
                // 하지만 실제로는 원본 텍스트를 직접 전송하는 것이 더 안전함
                // 다만 이전에 성공했던 방식과의 호환성을 위해 원본 텍스트 사용
                subjectToSend = subject;
                contentToSend = content;
                
                console.log(`[네이버 카페] double_ms949 모드: 원본 텍스트 사용="${subject.substring(0, 30)}"`);
            } else if (encodingMode === 'euckr_bytes') {
                // EUC-KR 바이트로 직접 전송
                const euckrSubjectBuffer = iconv.encode(subject, 'EUC-KR');
                const euckrContentBuffer = iconv.encode(content, 'EUC-KR');
                
                // Buffer를 FormData에 직접 전달 (Content-Type 명시)
                formData.append('subject', euckrSubjectBuffer, {
                    contentType: 'text/plain; charset=EUC-KR'
                });
                formData.append('content', euckrContentBuffer, {
                    contentType: 'text/plain; charset=EUC-KR'
                });
                
                console.log(`[네이버 카페] euckr_bytes 모드: subject=${euckrSubjectBuffer.length} bytes, content=${euckrContentBuffer.length} bytes`);
            } else {
                // raw 모드: 원본 문자열 그대로 (기본값)
                subjectToSend = subject;
                contentToSend = content;
            }
            
            // ========== 텍스트 파트 인코딩 처리 ==========
            // multipart/form-data는 기본적으로 ISO-8859-1을 사용하므로
            // 한글 텍스트 필드의 경우 특별한 인코딩 처리가 필요합니다.
            if (encodingMode === 'euckr_bytes') {
                // euckr_bytes는 이미 위에서 처리됨 (Buffer로 append)
                // EUC-KR 인코딩은 iconv로 처리했으므로 여기서는 아무것도 하지 않음
            } else if (encodingMode === 'iso8859_to_utf8') {
                // 참고 자료 방식 1: 서버에서 new String(name.getBytes("8859_1"), "utf-8")로 받는 경우
                // ⚠️ 주의: 이 방법은 실제로 작동하지 않을 수 있습니다.
                // Java 서버가 ISO-8859-1 바이트를 UTF-8로 디코딩하려면,
                // 클라이언트에서 UTF-8 문자열을 ISO-8859-1로 잘못 해석한 바이트를 보내야 합니다.
                // 하지만 이는 데이터 손실을 초래하므로 올바른 방법이 아닙니다.
                // 대신 URL 인코딩 방식을 사용하는 것이 더 안전합니다.
                // 이 모드는 테스트 목적으로만 유지합니다.
                formData.append('subject', Buffer.from(subjectToSend, 'utf8'), {
                    contentType: 'text/plain; charset=UTF-8'
                });
                console.log(`[네이버 카페] subject 필드 추가 (iso8859_to_utf8): "${subjectToSend.substring(0, 50)}${subjectToSend.length > 50 ? '...' : ''}"`);
                
                formData.append('content', Buffer.from(contentToSend, 'utf8'), {
                    contentType: 'text/plain; charset=UTF-8'
                });
                console.log(`[네이버 카페] content 필드 추가 (iso8859_to_utf8): "${contentToSend.substring(0, 50)}${contentToSend.length > 50 ? '...' : ''}"`);
            } else if (encodingMode === 'urlencoded') {
                // 참고 자료 방식: URL 인코딩 후 전송
                // 클라이언트에서 encodeURIComponent로 인코딩한 것처럼 서버에서도 인코딩
                // 참고: encodeURIComponent를 사용 (querystring.escape보다 더 넓은 문자 지원)
                const encodedSubject = encodeURIComponent(subjectToSend);
                const encodedContent = encodeURIComponent(contentToSend);
                
                formData.append('subject', encodedSubject, {
                    contentType: 'text/plain; charset=UTF-8'
                });
                console.log(`[네이버 카페] subject 필드 추가 (urlencoded): "${subjectToSend.substring(0, 50)}${subjectToSend.length > 50 ? '...' : ''}"`);
                
                formData.append('content', encodedContent, {
                    contentType: 'text/plain; charset=UTF-8'
                });
                console.log(`[네이버 카페] content 필드 추가 (urlencoded): "${contentToSend.substring(0, 50)}${contentToSend.length > 50 ? '...' : ''}"`);
            } else {
                // 기본 모드(raw, raw_string, double_ms949): UTF-8 Buffer + charset 명시
                // ⚠️ 중요: 네이버 카페 API multipart 요청에서 한글 깨짐 방지를 위한 정석 패턴
                // 1. Buffer.from(str, 'utf8')로 강제 UTF-8 인코딩
                // 2. contentType: 'text/plain; charset=UTF-8' 명시
                formData.append('subject', Buffer.from(subjectToSend, 'utf8'), {
                    contentType: 'text/plain; charset=UTF-8'
                });
                console.log(`[네이버 카페] subject 필드 추가 (${encodingMode}): "${subjectToSend.substring(0, 50)}${subjectToSend.length > 50 ? '...' : ''}"`);
                
                formData.append('content', Buffer.from(contentToSend, 'utf8'), {
                    contentType: 'text/plain; charset=UTF-8'
                });
                console.log(`[네이버 카페] content 필드 추가 (${encodingMode}): "${contentToSend.substring(0, 50)}${contentToSend.length > 50 ? '...' : ''}"`);
            }
            
            // headid 필드 추가 (있는 경우)
            if (headid !== null && headid !== undefined && headid !== '') {
                formData.append('headid', String(headid));
                console.log(`[네이버 카페] 말머리(headid) 포함: "${headid}"`);
            }
            
            // ========== 이미지 파일 추가 ==========
            // 정석 패턴: 파일명은 ASCII로 통일 (한글 파일명 깨짐 방지)
            // images는 Buffer, 파일 경로(string), 또는 URL(string)을 받을 수 있음
            for (let i = 0; i < images.length; i++) {
                const image = images[i];
                let imageBuffer;
                let originalFileName = `image${i + 1}.jpg`;  // 원본 파일명 (한글 포함 가능)
                let safeFileName = `image_${i + 1}.jpg`;    // ASCII 파일명 (업로드용)
                let contentType = 'image/jpeg';
                
                if (Buffer.isBuffer(image)) {
                    // Buffer인 경우
                    imageBuffer = image;
                } else if (typeof image === 'string') {
                    // 파일 경로 또는 URL인 경우
                    if (fs.existsSync(image)) {
                        // 파일 경로인 경우
                        console.log(`[네이버 카페] 이미지 ${i + 1}: 파일 경로에서 읽기: ${image}`);
                        imageBuffer = fs.readFileSync(image);
                        originalFileName = path.basename(image) || originalFileName;
                        
                        // MIME 타입 추정
                        const ext = path.extname(image).toLowerCase();
                        const mimeTypes = {
                            '.jpg': 'image/jpeg',
                            '.jpeg': 'image/jpeg',
                            '.png': 'image/png',
                            '.gif': 'image/gif',
                            '.webp': 'image/webp'
                        };
                        contentType = mimeTypes[ext] || 'image/jpeg';
                        
                        // 파일명에서 확장자 추출하여 ASCII 파일명 생성
                        safeFileName = `image_${i + 1}${ext}`;
                        
                        console.log(`[네이버 카페] 이미지 ${i + 1} 파일 읽기 완료: ${imageBuffer.length} bytes, mime=${contentType}, 원본파일명="${originalFileName}", 업로드파일명="${safeFileName}"`);
                    } else if (image.startsWith('http://') || image.startsWith('https://')) {
                        // URL인 경우 다운로드
                        try {
                            console.log(`[네이버 카페] 이미지 ${i + 1} 다운로드 시작: ${image.substring(0, 80)}...`);
                            const imageResponse = await axios.get(image, {
                                responseType: 'arraybuffer',
                                timeout: 30000,
                                maxRedirects: 5,
                                headers: {
                                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                                },
                                validateStatus: (status) => status >= 200 && status < 400
                            });
                            
                            imageBuffer = Buffer.from(imageResponse.data);
                            console.log(`[네이버 카페] 이미지 ${i + 1} 다운로드 완료: ${imageBuffer.length} bytes`);
                            
                            // 파일명 추출 (URL에서)
                            try {
                                const urlPath = new URL(image).pathname;
                                const urlFileName = path.basename(urlPath);
                                if (urlFileName && urlFileName.includes('.')) {
                                    originalFileName = urlFileName;
                                    // 확장자 추출하여 ASCII 파일명 생성
                                    const ext = path.extname(urlFileName).toLowerCase();
                                    safeFileName = `image_${i + 1}${ext || '.jpg'}`;
                                }
                            } catch (e) {
                                // URL 파싱 실패 시 기본 파일명 사용
                            }
                            
                            // Content-Type 추출
                            if (imageResponse.headers['content-type']) {
                                contentType = imageResponse.headers['content-type'];
                            }
                        } catch (error) {
                            console.error(`[네이버 카페] 이미지 ${i + 1} 다운로드 실패:`, error.message);
                            throw new Error(`이미지 다운로드 실패: ${error.message}`);
                        }
                    } else {
                        console.warn(`[네이버 카페] 이미지 ${i + 1}: 지원하지 않는 형식 (파일 경로도 URL도 아님): ${image.substring(0, 50)}`);
                        continue;
                    }
                } else {
                    console.warn(`[네이버 카페] 지원하지 않는 이미지 형식: ${typeof image}`);
                    continue;
                }
                
                // 이미지 필드명을 "0", "1", "2"...로 변경 (다중 이미지 지원)
                const imageFieldName = String(i); // "0", "1", "2"...
                
                // ⚠️ 중요: 파일명은 ASCII로 통일하여 한글 파일명 깨짐 방지
                // 원본 파일명(originalFileName)이 한글을 포함할 수 있지만,
                // 업로드 시에는 safeFileName(ASCII)을 사용합니다.
                formData.append(imageFieldName, imageBuffer, {
                    filename: safeFileName,  // ASCII 파일명 사용 (한글 깨짐 방지)
                    contentType: contentType
                });
                
                console.log(`[네이버 카페] 이미지 ${i + 1} 추가: fieldName="${imageFieldName}", fileName="${safeFileName}" (원본: "${originalFileName}"), size=${imageBuffer.length} bytes, contentType=${contentType}`);
            }
            
            // P0: FormData 필드 수 계산 및 로깅 (디버깅용)
            const fieldCount = (formData._streams || []).length;
            const imageCount = (formData._streams || []).filter(s => s && typeof s === 'object' && s.filename).length;
            console.log(`[네이버 카페] 글쓰기 요청 (multipart): clubid=${clubid}, menuid=${menuid}, 이미지=${images.length}개, 전체 필드 수=${fieldCount}, 이미지 필드=${imageCount}, 인코딩 모드=${encodingMode}`);
            console.log(`[네이버 카페] 제목 원본: "${subject.substring(0, 50)}${subject.length > 50 ? '...' : ''}"`);
            console.log(`[네이버 카페] 내용 원본: "${content.substring(0, 50)}${content.length > 50 ? '...' : ''}"`);
            
            // P0: FormData 헤더 및 바이트 덤프 (개발 환경에서만)
            const formDataHeaders = formData.getHeaders();
            if (process.env.NODE_ENV === 'development' || process.env.DEBUG_NAVER_MULTIPART === '1') {
                console.log(`[네이버 카페] FormData 헤더:`, JSON.stringify(formDataHeaders, null, 2));
                // FormData의 실제 바이트 확인 (일부만)
                try {
                    const formDataStream = formData._streams || [];
                    console.log(`[네이버 카페] FormData 스트림 개수: ${formDataStream.length}`);
                    formDataStream.forEach((stream, idx) => {
                        if (typeof stream === 'string') {
                            console.log(`[네이버 카페] 스트림[${idx}]: 문자열 (${stream.substring(0, 100)}...)`);
                        } else if (Buffer.isBuffer(stream)) {
                            console.log(`[네이버 카페] 스트림[${idx}]: Buffer (${stream.length} bytes, 처음 50바이트: ${stream.slice(0, 50).toString('hex')})`);
                        } else if (typeof stream === 'object' && stream !== null) {
                            console.log(`[네이버 카페] 스트림[${idx}]: 객체 (filename=${stream.filename || 'N/A'}, contentType=${stream.contentType || 'N/A'})`);
                        }
                    });
                } catch (e) {
                    console.warn(`[네이버 카페] FormData 덤프 실패: ${e.message}`);
                }
            }
            
            // ========== multipart/form-data 요청 전송 ==========
            // 정석 패턴: formData.getHeaders()를 사용하여 boundary 포함된 Content-Type 헤더 사용
            // ⚠️ 중요: Content-Type을 수동으로 고정하지 않고, formData.getHeaders()를 그대로 사용
            // formData.getHeaders()는 자동으로 'Content-Type: multipart/form-data; boundary=...'를 포함합니다.
            response = await axios.post(apiUrl, formData, {
                headers: {
                    ...formDataHeaders,  // boundary 포함된 Content-Type 자동 설정
                    'Authorization': `Bearer ${validToken}`
                },
                maxRedirects: 0,
                validateStatus: (status) => status >= 200 && status < 400
            });
            
            // P0: 응답에서 subject/content 확인 (깨짐 여부 확인)
            console.log(`[네이버 카페] API 응답 상태: ${response.status}`);
            if (response.data) {
                const responseStr = JSON.stringify(response.data, null, 2);
                console.log(`[네이버 카페] API 응답 데이터: ${responseStr.substring(0, 500)}${responseStr.length > 500 ? '...' : ''}`);
                
                // 응답에서 subject/content 추출 시도 (깨짐 확인용)
                try {
                    const result = response.data?.message?.result || response.data?.result;
                    if (result) {
                        console.log(`[네이버 카페] 응답 result: articleId=${result.articleId}, articleUrl=${result.articleUrl || 'N/A'}`);
                        // articleUrl에서 실제 글을 확인할 수 있으므로 로깅
                        if (result.articleUrl) {
                            console.log(`[네이버 카페] ✅ 글 작성 완료: ${result.articleUrl}`);
                            console.log(`[네이버 카페] 💡 위 URL에서 subject/content가 올바르게 표시되는지 확인하세요.`);
                        }
                    }
                } catch (e) {
                    console.warn(`[네이버 카페] 응답 파싱 실패: ${e.message}`);
                }
            }
        } else {
            // ========== application/x-www-form-urlencoded 방식 (기존 방식, 이미지 없음) ==========
            // 요청 파라미터 준비 (Java/Python 방식: UTF-8 URL 인코딩 → MS949 URL 인코딩)
            // Java: URLEncoder.encode(URLEncoder.encode("카페 가입 인사", "UTF-8"), "MS949")
            // Python: urllib.parse.quote()로 인코딩 후, urlencode() 사용
            
            // 1단계: UTF-8로 URL 인코딩 (Python의 urllib.parse.quote와 동일)
            const utf8EncodedSubject = encodeURIComponent(subject);
            const utf8EncodedContent = encodeURIComponent(content);
            
            // 2단계: UTF-8 인코딩된 문자열을 MS949로 변환 후 URL 인코딩
            // Java의 URLEncoder.encode(utfStr, "MS949")와 동일
            const encodeMs949 = (utf8Str) => {
                // UTF-8 인코딩된 문자열을 MS949로 변환
                const ms949Buffer = iconv.encode(utf8Str, 'EUC-KR');
                // MS949 바이트를 퍼센트 인코딩 (% -> %25 등)
                return Array.from(ms949Buffer)
                    .map(byte => '%' + byte.toString(16).toUpperCase().padStart(2, '0'))
                    .join('');
            };
            
            const ms949Subject = encodeMs949(utf8EncodedSubject);
            const ms949Content = encodeMs949(utf8EncodedContent);
            
            // 3단계: Python 예시처럼 직접 문자열 조합 (이미 인코딩된 값은 querystring.stringify 사용하지 않음)
            // Python: data = "subject=" + subject + "&content=" + content
            // headid 파라미터 추가 (말머리 ID - 문자열로 전달)
            let formDataStr = `subject=${ms949Subject}&content=${ms949Content}`;
            if (headid !== null && headid !== undefined && headid !== '') {
                // 문자열로 전달 (예: "단톡방질문")
                formDataStr += `&headid=${encodeURIComponent(String(headid))}`;
                console.log(`[네이버 카페] 말머리(headid) 포함: "${headid}" (문자열)`);
            } else {
                console.log(`[네이버 카페] 말머리(headid) 없음 - headid=${headid}, 환경변수 NAVER_CAFE_HEADID 확인 필요`);
            }
            
            console.log(`[네이버 카페] 글쓰기 요청: clubid=${clubid}, menuid=${menuid}, headid=${headid !== null && headid !== undefined ? headid : '없음'}, 제목=${subject.substring(0, 30)}...`);
            console.log(`[네이버 카페] formData (일부): ${formDataStr.substring(0, 200)}...`);
            
            // API 호출 (갱신된 토큰 사용)
            response = await axios.post(apiUrl, formDataStr, {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Authorization': `Bearer ${validToken}`
                },
                maxRedirects: 0,
                validateStatus: (status) => status >= 200 && status < 400
            });
        }
        
        // P0: 응답 로깅은 이미 multipart 부분에서 수행됨 (중복 방지)
        // application/x-www-form-urlencoded 방식에서만 여기서 로깅
        if (!hasImages) {
            console.log(`[네이버 카페] API 응답 상태: ${response.status}`);
            console.log(`[네이버 카페] API 응답 데이터:`, JSON.stringify(response.data, null, 2));
        }
        
        // 응답 확인 (네이버 카페 API는 response.data.message.result 구조 사용)
        let result = null;
        
        // 응답 구조 확인: response.data.message.result 또는 response.data.result
        if (response.data && response.data.message && response.data.message.result) {
            result = response.data.message.result;
            console.log(`[네이버 카페] 응답 구조: message.result 사용`);
        } else if (response.data && response.data.result) {
            result = response.data.result;
            console.log(`[네이버 카페] 응답 구조: result 직접 사용`);
        }
        
        if (result && result.articleId && result.articleUrl) {
            const { articleId, articleUrl } = result;
            console.log(`[네이버 카페] 글쓰기 성공: articleId=${articleId}, articleUrl=${articleUrl}`);
            return {
                success: true,
                articleId: articleId,
                articleUrl: articleUrl
            };
        } else {
            // 응답에 result가 없는 경우 - 상세 정보 로깅
            console.error('[네이버 카페] API 응답에 articleId/articleUrl이 없습니다.');
            console.error('[네이버 카페] 전체 응답:', response.data);
            
            // 에러 응답 체크 (네이버 API는 에러 시 errorMessage 필드 사용)
            const errorMessage = (response.data && response.data.message && response.data.message.errorMessage) 
                || (response.data && response.data.errorMessage);
            
            if (errorMessage) {
                return {
                    success: false,
                    error: 'api_error',
                    message: errorMessage,
                    statusCode: response.status
                };
            }
            
            // 응답 형식이 예상과 다른 경우
            return {
                success: false,
                error: 'invalid_response',
                message: `API 응답에 articleId/articleUrl이 없습니다. 응답: ${JSON.stringify(response.data)}`
            };
        }
        
    } catch (error) {
        console.error('[네이버 카페] 글쓰기 실패:', error.message);
        
        // 권한 없음 오류 체크
        if (error.response) {
            const status = error.response.status;
            const errorData = error.response.data;
            
            // 네이버 API 오류 응답 구조 파싱
            let errorMessage = '알 수 없는 오류';
            if (errorData?.message?.error?.msg) {
                // 네이버 API 표준 오류 형식: { message: { error: { msg: "...", code: "..." } } }
                errorMessage = errorData.message.error.msg;
                console.error(`[네이버 카페] API 오류 코드: ${errorData.message.error.code || 'N/A'}`);
            } else if (errorData?.message?.errorMessage) {
                errorMessage = errorData.message.errorMessage;
            } else if (errorData?.errorMessage) {
                errorMessage = errorData.errorMessage;
            } else if (errorData?.message) {
                errorMessage = typeof errorData.message === 'string' ? errorData.message : JSON.stringify(errorData.message);
            }
            
            console.error(`[네이버 카페] API 오류 응답 (${status}):`, JSON.stringify(errorData, null, 2));
            
            // 403: 권한 없음, 401: 인증 오류
            if (status === 403 || status === 401) {
                return {
                    success: false,
                    error: 'no_permission',
                    message: errorMessage || '카페 글쓰기 권한이 없습니다.',
                    statusCode: status,
                    errorDetails: errorData
                };
            }
            
            return {
                success: false,
                error: 'api_error',
                message: errorMessage || error.message,
                statusCode: status,
                errorDetails: errorData
            };
        }
        
        return {
            success: false,
            error: 'network_error',
            message: error.message
        };
    }
}

module.exports = {
    writeCafeArticle
};

