#!/bin/bash
# KakaoBridge 빌드 및 설치 스크립트 (Linux/Mac)
# 사용법: ./build-and-install.sh

set -e

BUILD_TYPE="${1:-Release}"  # 기본값: Release

echo "========================================"
echo "KakaoBridge 빌드 및 설치 스크립트"
echo "========================================"
echo ""

# 1. Gradle 래퍼 확인
if [ ! -f "./gradlew" ]; then
    echo "[오류] gradlew 파일을 찾을 수 없습니다."
    echo "[정보] 이 스크립트는 bridge 디렉토리에서 실행해야 합니다."
    exit 1
fi

# 2. 실행 권한 부여
chmod +x ./gradlew

# 3. 빌드 타입 확인
if [ "$BUILD_TYPE" != "Debug" ] && [ "$BUILD_TYPE" != "Release" ]; then
    echo "[오류] 빌드 타입은 Debug 또는 Release여야 합니다."
    exit 1
fi

echo "[1/4] 빌드 타입: $BUILD_TYPE"

# 4. APK 빌드
echo "[2/4] APK 빌드 중..."
if [ "$BUILD_TYPE" = "Debug" ]; then
    ./gradlew assembleDebug
else
    ./gradlew assembleRelease
fi

if [ $? -ne 0 ]; then
    echo "[✗] 빌드 실패"
    exit 1
fi

echo "[✓] 빌드 완료"

# 5. APK 파일 경로 확인
BUILD_TYPE_LOWER=$(echo "$BUILD_TYPE" | tr '[:upper:]' '[:lower:]')
APK_PATH="app/build/outputs/apk/$BUILD_TYPE_LOWER/app-$BUILD_TYPE_LOWER.apk"

if [ ! -f "$APK_PATH" ]; then
    echo "[✗] APK 파일을 찾을 수 없습니다: $APK_PATH"
    exit 1
fi

APK_SIZE=$(du -h "$APK_PATH" | cut -f1)
echo "[정보] APK 경로: $APK_PATH"
echo "[정보] APK 크기: $APK_SIZE"
echo ""

# 6. ADB 연결 확인
echo "[3/4] ADB 연결 확인 중..."
if ! command -v adb &> /dev/null; then
    echo "[✗] ADB를 찾을 수 없습니다."
    echo "[정보] Android SDK Platform Tools 설치 필요"
    exit 1
fi

DEVICE_COUNT=$(adb devices | grep -c "device$" || true)
if [ "$DEVICE_COUNT" -eq 0 ]; then
    echo "[경고] 연결된 기기가 없습니다."
    echo "[정보] USB 디버깅이 활성화되어 있고 기기가 연결되어 있는지 확인하세요."
    read -p "계속하시겠습니까? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 0
    fi
else
    echo "[✓] 연결된 기기: $DEVICE_COUNT개"
fi

# 7. APK 설치
echo "[4/4] APK 설치 중..."
adb install -r "$APK_PATH"

if [ $? -eq 0 ]; then
    echo "[✓] 설치 완료"
else
    echo "[✗] 설치 실패"
    echo "[정보] 수동 설치: adb install -r \"$APK_PATH\""
    exit 1
fi

echo ""
echo "========================================"
echo "설치 완료!"
echo "========================================"
echo ""
echo "다음 단계:"
echo "1. Galaxy A16에서 KakaoBridge 앱 실행"
echo "2. 알림 접근 권한 설정 (앱에서 자동 요청)"
echo "3. 배터리 최적화 제외 설정 (앱에서 자동 요청)"
echo "4. 서비스 시작 버튼 클릭"
echo ""
echo "테스트 명령어:"
echo 'adb shell am broadcast -a com.goodhabit.kakaobridge.SEND -n com.goodhabit.kakaobridge/.BridgeCommandReceiver --es token "LOCAL_DEV_TOKEN" --es roomKey "의운모" --es text "테스트 메시지"'
echo ""

