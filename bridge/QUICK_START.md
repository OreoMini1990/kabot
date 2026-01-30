# KakaoBridge 빠른 시작 가이드

## 한 줄 명령어로 시작하기

### 프로젝트 루트에서 실행

```powershell
# 프로젝트 루트 (D:\JosupAI)에서
cd kakkaobot\bridge; .\create-gradle-wrapper-simple.ps1; .\build-and-install.ps1
```

### 또는 단계별로 실행

```powershell
# 1. bridge 디렉토리로 이동
cd kakkaobot\bridge

# 2. Gradle Wrapper 생성 (최초 1회만)
.\create-gradle-wrapper-simple.ps1

# 3. 빌드 및 설치
.\build-and-install.ps1
```

## 전체 워크플로우

```powershell
# 프로젝트 루트에서
cd D:\JosupAI\kakkaobot\bridge

# Gradle Wrapper 생성 (Gradle 설치 불필요!)
.\create-gradle-wrapper-simple.ps1

# 빌드 및 설치 (한 줄 명령어)
.\build-and-install.ps1
```

## 문제 해결

### "스크립트를 찾을 수 없습니다" 오류
- 현재 디렉토리 확인: `pwd` 또는 `Get-Location`
- bridge 디렉토리로 이동: `cd kakkaobot\bridge`

### Gradle Wrapper가 없는 경우
- `.\create-gradle-wrapper-simple.ps1` 실행 (Gradle 설치 불필요)

### ADB 연결 오류
- USB 디버깅 활성화 확인
- 기기 연결 확인: `adb devices`

## 다음 단계

설치 완료 후:
1. Galaxy A16에서 KakaoBridge 앱 실행
2. 알림 접근 권한 설정 (자동 요청)
3. 배터리 최적화 제외 설정 (자동 요청)
4. 서비스 시작 버튼 클릭





