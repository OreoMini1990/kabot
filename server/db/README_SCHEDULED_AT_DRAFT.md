# !질문 3분 후 자동 작성 (scheduled_at)

## 흐름

1. **!질문** 입력 → 질문을 **임시저장** (cafe_post_drafts) + **scheduled_at = 현재+3분** 설정 → 연동 링크 안내
2. 사용자가 **연동 링크**로 네이버 OAuth 완료 → 토큰 DB 저장 → "잠시 후 자동 등록됩니다" 안내
3. **별도 트리거 없이** 서버 워커가 30초마다 돌면서 **scheduled_at ≤ 현재** 인 draft만 처리
4. 임시저장 시점으로 **3분이 지나면** 해당 draft가 처리 대상이 됨 → 그 시점에는 연동 토큰이 이미 DB에 있음 → 카페 등록 + 카톡 알림

연동 완료 시 OAuth 콜백에서 **scheduled_at = now** 로 바꿀 수 있어, 3분을 기다리지 않고 **다음 워커 주기(최대 30초)** 에 바로 처리되도록 할 수 있음.

## 마이그레이션 (필수)

**Supabase SQL Editor**에서 아래 파일 내용 실행:

- `server/db/migration_add_scheduled_at_to_cafe_post_drafts.sql`

실행 후 `cafe_post_drafts` 테이블에 `scheduled_at` 컬럼이 추가됨.  
이 마이그레이션을 하지 않으면 새 draft 저장 시 컬럼 없음 오류가 날 수 있음.

## 관련 코드

- **saveDraft**: `scheduled_at = now + 3분` 설정
- **processPendingSubmits**: `scheduled_at` 이 null 이거나 `scheduled_at <= now` 인 행만 처리
- **naver-oauth-app 콜백**: 연동 완료 시 해당 draft의 `scheduled_at = now` 로 업데이트 (즉시 처리 가능)
