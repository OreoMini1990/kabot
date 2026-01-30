# PowerShell 스크립트 사용 가이드

## 📋 프로젝트 내 PowerShell 스크립트 목록

### 서버 관리 스크립트
- `check-server-status.ps1` - 서버 상태 확인 (PM2, 로그, 포트, 환경변수)
- `fix-websocket-connection.ps1` - WebSocket 연결 문제 해결 및 진단

### Bridge APK 관련 스크립트
- `bridge/build-and-install.ps1` - APK 빌드 및 설치
- `bridge/install-apk.ps1` - APK 설치만
- `bridge/test-bridge.ps1` - Bridge APK 테스트 및 디버깅
- `bridge/test-accessibility.ps1` - Accessibility 서비스 테스트
- `bridge/create-gradle-wrapper.ps1` - Gradle Wrapper 생성
- `bridge/create-gradle-wrapper-simple.ps1` - Gradle Wrapper 생성 (간단 버전)
- `bridge/init-gradle.ps1` - Gradle 초기화

### 테스트 스크립트
- `test-message-flow.ps1` - 메시지 흐름 테스트
- `test-integration.ps1` - 통합 테스트
- `debug-realtime.ps1` - 실시간 디버깅

### Iris 관련 스크립트
- `Iris-main/iris_control.ps1` - Iris 서비스 관리 (status, start, stop, install)

---

## 🚀 PowerShell 스크립트 실행 방법

### 기본 실행 방법

```powershell
# 현재 디렉토리에서 실행
.\script-name.ps1

# 절대 경로로 실행
D:\JosupAI\kakkaobot\check-server-status.ps1
```

### 실행 정책 오류 해결

PowerShell에서 스크립트 실행이 차단되는 경우:

```powershell
# 현재 세션에서만 실행 정책 변경 (권장)
Set-ExecutionPolicy -ExecutionPolicy Bypass -Scope Process

# 또는 스크립트 직접 실행
powershell -ExecutionPolicy Bypass -File .\check-server-status.ps1
```

### 실행 정책 확인

```powershell
Get-ExecutionPolicy
```

---

## 📝 주요 스크립트 사용법

### 1. 서버 상태 확인

```powershell
# 프로젝트 루트에서
.\check-server-status.ps1
```

**기능:**
- PM2 프로세스 확인
- 서버 로그 확인 (최근 50줄)
- WebSocket 연결 확인
- 포트 5002 확인
- 환경변수 확인

### 1-1. WebSocket 연결 문제 해결

```powershell
# 프로젝트 루트에서
.\fix-websocket-connection.ps1
```

**기능:**
- 서버 프로세스 확인
- 포트 5002 확인
- 서버 로그 확인
- WebSocket 연결 테스트
- 해결 방법 제안

### 2. Bridge APK 빌드 및 설치

```powershell
cd bridge
.\build-and-install.ps1
```

**기능:**
- Gradle로 APK 빌드
- ADB로 기기에 설치
- 설치 확인

### 3. Bridge APK 테스트

```powershell
cd bridge
.\test-bridge.ps1 -All
```

**옵션:**
- `-Build` - APK 빌드만
- `-Install` - APK 설치만
- `-Logs` - 로그 확인
- `-Test` - 테스트만 실행
- `-All` - 전체 실행

### 4. Iris 서비스 관리

```powershell
cd Iris-main
.\iris_control.ps1 status   # 상태 확인
.\iris_control.ps1 start    # 시작
.\iris_control.ps1 stop     # 중지
.\iris_control.ps1 install  # 설치
```

---

## 🔧 문제 해결

### "스크립트를 찾을 수 없습니다" 오류

```powershell
# 현재 디렉토리 확인
Get-Location

# 스크립트 파일 확인
Get-ChildItem -Filter *.ps1

# 올바른 디렉토리로 이동
cd D:\JosupAI\kakkaobot
```

### "실행할 수 없습니다" 오류

```powershell
# 실행 정책 변경
Set-ExecutionPolicy -ExecutionPolicy Bypass -Scope Process

# 또는 관리자 권한으로 PowerShell 실행
```

### ADB 연결 오류

```powershell
# ADB 경로 확인
Get-Command adb

# 기기 연결 확인
adb devices

# 네트워크 연결 (필요시)
adb connect <기기IP>:5555
```

---

## 📚 추가 리소스

- [PowerShell 공식 문서](https://docs.microsoft.com/powershell/)
- [PowerShell 스크립팅 가이드](https://docs.microsoft.com/powershell/scripting/)

---

## 💡 팁

1. **스크립트 실행 전 확인사항:**
   - 현재 디렉토리 확인 (`Get-Location`)
   - 필요한 도구 설치 확인 (ADB, PM2 등)
   - 실행 정책 확인 (`Get-ExecutionPolicy`)

2. **디버깅:**
   - 스크립트에 `-Verbose` 옵션 추가
   - `$ErrorActionPreference = "Stop"` 추가하여 오류 시 중단
   - `Write-Host`로 단계별 진행 상황 확인

3. **로그 확인:**
   - 서버 로그: `pm2 logs labbot-node`
   - ADB 로그: `adb logcat | Select-String -Pattern "BridgeForegroundService"`

