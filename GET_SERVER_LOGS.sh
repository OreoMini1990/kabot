#!/bin/bash
# 서버 로그 확인 스크립트
# 서버(Linux)에서 실행하세요

echo "=== 서버 로그 확인 ==="
echo ""

# PM2 로그 확인
echo "1. PM2 로그 (최근 50줄):"
pm2 logs kakkaobot-server --lines 50 --nostream 2>/dev/null || echo "PM2 로그를 읽을 수 없습니다."

echo ""
echo "2. PM2 에러 로그 (최근 50줄):"
pm2 logs kakkaobot-server --err --lines 50 --nostream 2>/dev/null || echo "PM2 에러 로그를 읽을 수 없습니다."

echo ""
echo "3. 로그 파일 직접 확인:"
if [ -f "/home/app/iris-core/logs/kakkaobot-out.log" ]; then
    echo "출력 로그 (마지막 50줄):"
    tail -n 50 /home/app/iris-core/logs/kakkaobot-out.log
fi

if [ -f "/home/app/iris-core/logs/kakkaobot-error.log" ]; then
    echo ""
    echo "에러 로그 (마지막 50줄):"
    tail -n 50 /home/app/iris-core/logs/kakkaobot-error.log
fi

echo ""
echo "4. 이미지 처리 관련 로그:"
pm2 logs kakkaobot-server --lines 200 --nostream 2>/dev/null | grep -E "이미지 처리|imageProcessor|imageDownloader|Bridge|인증" | tail -n 30

echo ""
echo "5. 최근 에러 로그:"
pm2 logs kakkaobot-server --lines 200 --nostream 2>/dev/null | grep -iE "error|에러|실패|failed" | tail -n 20

