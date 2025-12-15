/**
 * 네이버 카페 글쓰기 API 호출
 * 참고: https://developers.naver.com/docs/login/cafe-api/cafe-api.md
 */

const axios = require('axios');
const iconv = require('iconv-lite');
const querystring = require('querystring');
const { validateAccessToken } = require('./naverOAuth');

/**
 * 네이버 카페에 글 작성
 * @param {Object} params
 * @param {string} params.subject - 글 제목
 * @param {string} params.content - 글 내용
 * @param {number} params.clubid - 카페 ID
 * @param {number} params.menuid - 게시판 메뉴 ID
 * @param {string} params.accessToken - 네이버 OAuth 액세스 토큰
 * @param {number} [params.headid] - 말머리 ID (선택사항)
 * @returns {Promise<Object>} { articleId, articleUrl }
 */
async function writeCafeArticle({ subject, content, clubid, menuid, accessToken, headid }) {
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
        
        // 토큰 유효성 검증
        const validationResult = await validateAccessToken(accessToken);
        
        if (!validationResult.valid) {
            console.error(`[네이버 카페] Access Token 검증 실패: ${validationResult.error}`);
            return {
                success: false,
                error: 'invalid_token',
                message: `Access Token이 유효하지 않습니다: ${validationResult.error}. 새로운 토큰을 발급받아주세요.`
            };
        }
        
        console.log(`[네이버 카페] Access Token 검증 성공: 사용자=${validationResult.user_info?.name || validationResult.user_info?.id || '알 수 없음'}`);
        
        // ========== 2단계: 카페 글쓰기 API 호출 ==========
        // 네이버 카페 API 엔드포인트
        const apiUrl = `https://openapi.naver.com/v1/cafe/${clubid}/menu/${menuid}/articles`;
        
        // 요청 파라미터 준비 (Java/Python 방식: UTF-8 URL 인코딩 → MS949 URL 인코딩)
        // Java: URLEncoder.encode(URLEncoder.encode("카페 가입 인사", "UTF-8"), "MS949")
        // Python: urllib.parse.quote()로 인코딩 후, urlencode() 사용
        const querystring = require('querystring');
        
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
        // headid 파라미터 추가 (말머리 ID)
        let formData = `subject=${ms949Subject}&content=${ms949Content}`;
        if (headid !== null && headid !== undefined && !isNaN(headid)) {
            formData += `&headid=${headid}`;
            console.log(`[네이버 카페] 말머리(headid) 포함: ${headid}`);
        } else {
            console.log(`[네이버 카페] 말머리(headid) 없음 - headid=${headid}, 환경변수 NAVER_CAFE_HEADID 확인 필요`);
        }
        
        console.log(`[네이버 카페] 글쓰기 요청: clubid=${clubid}, menuid=${menuid}, headid=${headid !== null && headid !== undefined ? headid : '없음'}, 제목=${subject.substring(0, 30)}...`);
        console.log(`[네이버 카페] formData (일부): ${formData.substring(0, 200)}...`);
        
        // API 호출
        const response = await axios.post(apiUrl, formData, {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': `Bearer ${accessToken}`
            },
            maxRedirects: 0,
            validateStatus: (status) => status >= 200 && status < 400
        });
        
        // 응답 전체 로깅 (디버깅용)
        console.log(`[네이버 카페] API 응답 상태: ${response.status}`);
        console.log(`[네이버 카페] API 응답 데이터:`, JSON.stringify(response.data, null, 2));
        
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
            
            // 403: 권한 없음, 401: 인증 오류
            if (status === 403 || status === 401) {
                return {
                    success: false,
                    error: 'no_permission',
                    message: errorData?.errorMessage || '카페 글쓰기 권한이 없습니다.'
                };
            }
            
            return {
                success: false,
                error: 'api_error',
                message: errorData?.errorMessage || error.message,
                statusCode: status
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

