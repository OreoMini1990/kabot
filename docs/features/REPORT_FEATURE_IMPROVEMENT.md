# !신고 기능 개선 보고서

## 개선 배경

DB 분석 결과를 바탕으로 답장 정보(`referer` 컬럼)를 활용하여 `!신고` 기능을 개선했습니다.

### 분석 결과 요약
- `chat_logs` 테이블에 `referer` 컬럼 존재
- 답장 메시지의 `referer`에 원본 메시지 ID 저장
- 총 38개의 답장 메시지 발견
- 답장 메시지와 원본 메시지 매칭 가능

## 개선 사항

### 1. 답장 정보 자동 감지 로직 추가

**위치**: `server/labbot-node.js` (2304-2395줄)

**개선 내용**:
- `replyToMessageId`가 없을 때, DB에서 답장 정보를 자동으로 조회
- 현재 메시지 내용으로 최근 답장 메시지 찾기
- 사용자 ID로 최근 답장 메시지 찾기
- `reply_to_kakao_log_id`를 DB id로 변환

```javascript
// replyToMessageId가 없으면 DB에서 답장 정보 확인
if (!replyToMessageId) {
    // 1. 현재 메시지 내용으로 최근 답장 메시지 찾기
    const recentReplyMessage = await db.supabase
        .from('chat_messages')
        .select('reply_to_message_id, reply_to_kakao_log_id')
        .eq('room_name', room)
        .eq('message_text', msgTrimmed)
        .not('reply_to_message_id', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1);
    
    // 2. reply_to_kakao_log_id를 DB id로 변환
    if (recentReplyMessage.reply_to_kakao_log_id) {
        // kakao_log_id로 원본 메시지 찾기
        const targetMessage = await db.supabase
            .from('chat_messages')
            .select('id')
            .eq('kakao_log_id', numericLogId)
            .eq('room_name', room);
    }
}
```

### 2. saveReport 함수 개선

**위치**: `server/db/chatLogger.js` (1287-1446줄)

**개선 내용**:
- DB id와 kakao_log_id 모두 지원
- roomName 파라미터 추가하여 검색 범위 제한
- 더 나은 메시지 찾기 로직

```javascript
async function saveReport(reportedMessageId, reporterName, reporterId, reportReason, reportType = 'general', roomName = null) {
    // 1. DB id로 검색 (작은 숫자인 경우)
    if (numericId < 1000000) {
        // DB id로 검색
    }
    
    // 2. kakao_log_id로 검색 (큰 숫자인 경우)
    if (!message) {
        // kakao_log_id로 검색
    }
    
    // 3. roomName으로 검색 범위 제한
    if (roomName) {
        query = query.eq('room_name', roomName);
    }
}
```

### 3. 로깅 개선

**개선 내용**:
- 더 상세한 로그 메시지
- 각 단계별 성공/실패 로그
- 디버깅을 위한 상세 정보 출력

```javascript
console.log('[신고] ✅ 신고 요청 감지:', { 
    replyToMessageId, 
    finalReplyToMessageId,  // 새로 추가
    targetMessageId,
    reporter: sender,
    reportReason,
    room: room
});
```

## 개선 효과

### Before (개선 전)
- `replyToMessageId`가 없으면 신고 불가
- 답장 버튼을 누르지 않으면 신고 불가능
- 에러 메시지만 표시

### After (개선 후)
- `replyToMessageId`가 없어도 DB에서 답장 정보 자동 조회
- 답장 메시지 저장 시 `reply_to_kakao_log_id` 정보 활용
- 더 나은 메시지 찾기 로직 (DB id, kakao_log_id 모두 지원)
- roomName으로 검색 범위 제한하여 정확도 향상
- 더 상세한 로깅으로 디버깅 용이

## 사용 예시

### 시나리오 1: 답장 버튼을 누르고 !신고
```
사용자: [메시지에 답장 버튼 클릭] !신고 부적절한 내용
→ replyToMessageId가 있으면 즉시 처리
```

### 시나리오 2: 답장 버튼 없이 !신고 (개선됨)
```
사용자: !신고 부적절한 내용
→ DB에서 최근 답장 메시지 자동 조회
→ reply_to_kakao_log_id로 원본 메시지 찾기
→ 신고 처리
```

## 테스트 권장 사항

1. **답장 버튼 사용**: 정상 작동 확인
2. **답장 버튼 없이**: DB에서 자동 조회 확인
3. **여러 답장**: 최근 답장 메시지 정확히 찾는지 확인
4. **에러 처리**: 메시지를 찾지 못할 때 적절한 안내 메시지 표시

## 참고 파일

- `server/labbot-node.js`: 신고 명령어 처리 로직
- `server/db/chatLogger.js`: saveReport 함수
- `server/server.js`: 답장 정보 추출 로직
- `client/analyze_reply_info.py`: DB 분석 스크립트
- `db_analysis_output/reply_analysis_*.json`: 분석 결과



