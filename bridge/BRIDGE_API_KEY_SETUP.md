# Bridge API Key 설정 가이드

## Bridge API Key란?

Bridge API Key는 **서버와 Bridge APK 간의 인증을 위한 비밀 키**입니다. Bridge APK가 서버로 이미지를 업로드할 때 이 키를 사용하여 인증합니다.

## API Key 생성 방법

**임의의 긴 문자열을 생성**하면 됩니다. 예를 들어:

### 방법 1: 온라인 UUID 생성기 사용
- https://www.uuidgenerator.net/
- UUID v4를 생성하여 사용

### 방법 2: PowerShell로 생성 (Windows)
```powershell
# 32자리 랜덤 문자열 생성
-join ((48..57) + (65..90) + (97..122) | Get-Random -Count 32 | ForEach-Object {[char]$_})

# 또는 더 긴 문자열 (64자리)
-join ((48..57) + (65..90) + (97..122) | Get-Random -Count 64 | ForEach-Object {[char]$_})
```

### 방법 3: 간단한 키 생성 (예시)
```
kakkaobot-bridge-2024-secret-key-12345
```

**권장**: 최소 32자 이상의 랜덤 문자열을 사용하세요.

## 설정 방법

### 1. 서버 설정 (`.env` 파일)

서버 디렉토리의 `.env` 파일에 추가:

```bash
BRIDGE_API_KEY=kakkaobot-bridge-2024-secret-key-12345
BRIDGE_PREVIEW_ENABLED=true
```

**위치**: `server/.env` 또는 서버가 실행되는 디렉토리의 `.env`

### 2. Bridge APK 설정

Bridge APK의 `MainActivity` 또는 설정 화면에서 SharedPreferences에 저장:

```kotlin
val prefs = context.getSharedPreferences("bridge_config", Context.MODE_PRIVATE)
prefs.edit()
    .putString("bridge_api_key", "kakkaobot-bridge-2024-secret-key-12345")
    .putString("server_url", "http://192.168.0.15:5002")
    .apply()
```

**또는** 설정 UI를 추가하여 사용자가 직접 입력할 수 있도록 할 수 있습니다.

## 설정 확인

### 서버 로그 확인
```bash
# 서버 시작 시 로그 확인
[Bridge] ⚠️ BRIDGE_API_KEY가 설정되지 않음 - 인증 비활성화
# 또는
[Bridge] ✅ 인증 성공
```

### Bridge APK 로그 확인
```bash
adb logcat | grep -E "ImagePreviewUploader|Bridge"
```

## 보안 주의사항

1. **API Key는 비밀로 유지**: `.env` 파일을 Git에 커밋하지 마세요
2. **강력한 키 사용**: 최소 32자 이상의 랜덤 문자열 권장
3. **정기적 변경**: 보안을 위해 주기적으로 키를 변경하세요

## 문제 해결

### 인증 실패 시
- 서버와 Bridge APK의 키가 **정확히 일치**하는지 확인
- 대소문자 구분됨
- 공백이나 특수문자 확인

### 키가 없을 때
- 서버: `BRIDGE_API_KEY`가 없으면 인증이 비활성화됨 (경고 로그만 출력)
- Bridge APK: 키가 없으면 업로드 시도하지만 서버에서 401 오류 발생 가능

## 예시 키 생성 스크립트

PowerShell에서 실행:
```powershell
# 64자리 랜덤 키 생성
$key = -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 64 | ForEach-Object {[char]$_})
Write-Host "BRIDGE_API_KEY=$key"
```

이 키를 복사하여 `.env` 파일과 Bridge APK에 설정하세요.

