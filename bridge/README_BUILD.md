# KakaoBridge 빌드 및 설치 가이드

## 빠른 시작 (한 줄 명령어)

### Windows (PowerShell)
```powershell
cd kakkaobot\bridge; .\build-and-install.ps1
```

### Linux/Mac (Bash)
```bash
cd kakkaobot/bridge && ./build-and-install.sh
```

## 상세 사용법

### Windows PowerShell

#### Release 빌드 (기본)
```powershell
.\build-and-install.ps1
```

#### Debug 빌드
```powershell
.\build-and-install.ps1 -Debug
```

#### 특정 기기에 설치
```powershell
.\build-and-install.ps1 -DeviceId "device_id"
```

### Linux/Mac Bash

#### Release 빌드 (기본)
```bash
./build-and-install.sh Release
```

#### Debug 빌드
```bash
./build-and-install.sh Debug
```

## 수동 빌드 및 설치

### 1. 빌드
```bash
# Windows
.\gradlew.bat assembleRelease

# Linux/Mac
./gradlew assembleRelease
```

### 2. 설치
```bash
adb install -r app/build/outputs/apk/release/app-release.apk
```

## 요구사항

- Android SDK Platform Tools (ADB)
- Java JDK 17 이상
- Gradle (자동 다운로드됨)
- 연결된 Android 기기 (USB 디버깅 활성화)

## 문제 해결

### ADB를 찾을 수 없는 경우
1. Android SDK Platform Tools 설치 확인
2. PATH 환경 변수에 `platform-tools` 디렉토리 추가

### 기기가 연결되지 않는 경우
1. USB 디버깅 활성화 확인
2. USB 케이블 확인
3. `adb devices` 명령어로 연결 상태 확인

### 빌드 실패하는 경우
1. Java JDK 버전 확인 (17 이상)
2. Android Studio에서 프로젝트 열어서 Gradle 동기화
3. `gradlew clean` 후 재빌드

## 참고

- 빌드된 APK는 `app/build/outputs/apk/` 디렉토리에 생성됩니다
- Release APK는 서명되지 않은 상태입니다 (디버그용)
- 프로덕션 배포 시 서명 키로 서명 필요

