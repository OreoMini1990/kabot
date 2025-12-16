#!/bin/bash
# 채팅 로그 DB 및 통계 기능 통합 테스트 실행 스크립트

echo "═══════════════════════════════════════════"
echo "채팅 로그 DB 및 통계 기능 테스트 시작"
echo "═══════════════════════════════════════════"
echo ""

# 서버 디렉토리로 이동
cd "$(dirname "$0")/.." || exit 1

# Node.js가 설치되어 있는지 확인
if ! command -v node &> /dev/null; then
    echo "❌ Node.js가 설치되어 있지 않습니다."
    exit 1
fi

# .env 파일 확인
if [ ! -f .env ]; then
    echo "⚠️  .env 파일이 없습니다."
    echo "   Supabase 설정을 확인하세요."
    echo ""
fi

# 테스트 실행
echo "테스트 스크립트 실행 중..."
echo ""

node test/test-chat-logging.js

TEST_EXIT_CODE=$?

echo ""
echo "═══════════════════════════════════════════"

if [ $TEST_EXIT_CODE -eq 0 ]; then
    echo "✅ 테스트 완료"
else
    echo "❌ 테스트 실패 (종료 코드: $TEST_EXIT_CODE)"
    exit $TEST_EXIT_CODE
fi

