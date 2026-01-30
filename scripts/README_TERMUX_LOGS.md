# Termux 클라이언트 로그 수집 가이드

## 1. 로그 수집 방법

### 방법 A: Python 스크립트 실행 시 로그 파일로 저장

```bash
# Termux에서
cd ~/kakkaobot
python a.py 2>&1 | tee client_logs.log
```

또는 백그라운드로 실행:
```bash
nohup python a.py > client_logs.log 2>&1 &
```

### 방법 B: ADB를 통한 로그 수집

Windows PowerShell에서:
```powershell
# 로그 파일 다운로드
.\scripts\fetch_termux_logs.ps1

# 실시간 로그 확인
.\scripts\fetch_termux_logs.ps1 -Follow

# 최근 200줄만 확인
.\scripts\fetch_termux_logs.ps1 -Lines 200
```

### 방법 C: ADB logcat 사용 (Android 로그)

```powershell
# Python 관련 로그만 필터링
adb logcat -d | Select-String -Pattern "python|kakao|reaction" | Select-Object -Last 100
```

## 2. 로그 확인 스크립트

### `fetch_termux_logs.ps1`
- Termux의 로그 파일을 PC로 다운로드
- 실시간 모니터링 지원
- 최근 N줄만 확인 가능

### `setup_termux_logging.ps1`
- Termux에서 로그 파일 저장 디렉토리 설정
- 권한 설정

## 3. 로그 위치

- Termux 내부: `/data/data/com.termux/files/home/kakkaobot/client_logs.log`
- PC로 다운로드 후: `client_logs.log` (프로젝트 루트)

## 4. 문제 해결

### 로그 파일이 없을 때
1. Termux에서 Python 스크립트를 로그 파일로 리다이렉트하여 실행
2. 또는 `setup_termux_logging.ps1` 실행 후 다시 시도

### ADB 연결이 안 될 때
1. USB 디버깅 확인
2. `adb devices`로 연결 상태 확인
3. `adb kill-server && adb start-server` 재시작










