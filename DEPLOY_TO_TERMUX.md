# Termux로 파일 전송 가이드

## 방법 1: ADB push (추천)

### 1단계: Android 기기 연결 확인

```powershell
# PowerShell에서 실행
adb devices
```

연결된 기기가 표시되어야 합니다.

### 2단계: 파일 전송

```powershell
# kakao_poller.py를 Termux 홈 디렉토리로 전송
adb push client\kakao_poller.py /data/data/com.termux/files/home/kakao_poller.py

# 또는 프로젝트 디렉토리로 전송 (기존에 있다면)
adb push client\kakao_poller.py /data/data/com.termux/files/home/kakkaobot/client/kakao_poller.py
```

### 3단계: 권한 확인

```powershell
# 파일 권한 설정 (실행 가능하도록)
adb shell "chmod 755 /data/data/com.termux/files/home/kakao_poller.py"
```

### 한 번에 실행 (PowerShell 스크립트)

```powershell
# 전체 경로가 있다면
$termuxPath = "/data/data/com.termux/files/home/kakkaobot/client/kakao_poller.py"
adb push client\kakao_poller.py $termuxPath
adb shell "chmod 755 $termuxPath"
Write-Host "파일 전송 완료!" -ForegroundColor Green
```

## 방법 2: 더 간단한 방법 (파일 복사)

### 옵션 A: Termux 내부에서 직접 수정

1. **Termux에서 파일 열기**
   ```bash
   # Termux에서 실행
   cd ~/kakkaobot/client
   nano kakao_poller.py
   ```

2. **Windows에서 수정한 내용을 복사하여 붙여넣기**
   - Windows에서 파일을 열어 전체 내용 복사
   - Termux nano 에디터에서 붙여넣기 (Ctrl+Shift+V 또는 길게 터치)

3. **저장 후 종료**
   - Ctrl+O (저장)
   - Ctrl+X (종료)

### 옵션 B: 파일 공유 앱 사용

1. **Windows에서 파일 공유**
   - Windows 탐색기에서 `client\kakao_poller.py` 파일을 공유
   - 또는 클라우드 저장소 (Google Drive, Dropbox 등)에 업로드

2. **Android에서 다운로드**
   - 파일 관리자에서 다운로드한 파일을 Termux 디렉토리로 이동
   - 또는 Termux에서 wget/curl로 직접 다운로드:
   ```bash
   # Google Drive 공유 링크가 있다면 (예시)
   cd ~/kakkaobot/client
   # 파일 다운로드 후
   mv ~/Download/kakao_poller.py .
   ```

### 옵션 C: SSH/SCP 사용 (고급)

만약 Termux에 SSH가 설정되어 있다면:

```powershell
# PowerShell에서 (Windows에 SSH 클라이언트 필요)
scp client\kakao_poller.py termux@<기기IP>:/data/data/com.termux/files/home/kakkaobot/client/kakao_poller.py
```

## 방법 3: 자동화 스크립트

다음 PowerShell 스크립트를 저장하고 실행:

```powershell
# deploy-to-termux.ps1

$adbPath = if (Test-Path "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe") { 
    "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" 
} else { 
    "adb" 
}

Write-Host "ADB 경로: $adbPath" -ForegroundColor Cyan

# 기기 연결 확인
$devices = & $adbPath devices | Select-String -Pattern "device$"
if (-not $devices) {
    Write-Host "❌ 연결된 기기가 없습니다. 'adb devices'를 확인하세요." -ForegroundColor Red
    exit 1
}

Write-Host "✅ 기기 연결 확인됨" -ForegroundColor Green

# Termux 경로 (기존 프로젝트 구조 가정)
$termuxPath = "/data/data/com.termux/files/home/kakkaobot/client/kakao_poller.py"

# 파일 전송
Write-Host "파일 전송 중..." -ForegroundColor Yellow
& $adbPath push "client\kakao_poller.py" $termuxPath

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ 파일 전송 완료!" -ForegroundColor Green
    
    # 권한 설정
    Write-Host "권한 설정 중..." -ForegroundColor Yellow
    & $adbPath shell "chmod 755 $termuxPath"
    
    Write-Host "✅ 완료! Termux에서 실행하세요:" -ForegroundColor Green
    Write-Host "   cd ~/kakkaobot/client && python kakao_poller.py" -ForegroundColor Cyan
} else {
    Write-Host "❌ 파일 전송 실패" -ForegroundColor Red
}
```

## 추천 방법

**가장 빠른 방법**: **방법 2-A (Termux 내부에서 직접 수정)**
- 파일이 작다면 (1000줄 정도) 복사-붙여넣기가 가장 빠릅니다
- 추가 도구 불필요
- 즉시 수정 가능

**정기적으로 업데이트하는 경우**: **방법 1 (ADB push)**
- 스크립트로 자동화 가능
- 정확한 파일 전송
- 여러 파일도 한 번에 전송 가능

## 파일 위치 확인

Termux에서 실제 경로 확인:

```bash
# Termux에서 실행
pwd
ls -la ~/kakkaobot/client/kakao_poller.py

# 또는 찾기
find ~ -name "kakao_poller.py" 2>/dev/null
```

## 문제 해결

### ADB가 인식되지 않는 경우

```powershell
# ADB 경로 확인
Get-Command adb

# 또는 전체 경로 사용
& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" devices
```

### 권한 오류

```powershell
# Termux 디렉토리에 직접 접근하려면 root 권한이 필요할 수 있습니다
# 대신 sdcard를 통해 전송:
adb push client\kakao_poller.py /sdcard/kakao_poller.py

# 그 다음 Termux에서:
# termux-setup-storage (한 번만 실행)
# cp ~/storage/shared/kakao_poller.py ~/kakkaobot/client/kakao_poller.py
```

### 파일이 덮어씌워지지 않는 경우

```powershell
# 기존 파일 삭제 후 전송
adb shell "rm /data/data/com.termux/files/home/kakkaobot/client/kakao_poller.py"
adb push client\kakao_poller.py /data/data/com.termux/files/home/kakkaobot/client/kakao_poller.py
```

