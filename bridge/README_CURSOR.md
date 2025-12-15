# Cursor에서 Android 프로젝트 작업하기

Cursor는 VS Code 기반이므로 Android Studio 없이도 Android 프로젝트를 편집하고 빌드할 수 있습니다.

## Android Studio 없이 작업하기

### 1. Gradle Wrapper 생성 (Gradle 설치 불필요!)

#### 방법 A: 간단한 방법 (권장) - Gradle 설치 불필요
```powershell
.\create-gradle-wrapper-simple.ps1
```

이 방법은 Gradle을 설치하지 않고도 Wrapper 파일을 직접 생성합니다.

#### 방법 B: Gradle이 설치되어 있는 경우
```powershell
.\create-gradle-wrapper.ps1
```

#### 방법 C: 수동으로 Gradle 설치 후
```powershell
# Chocolatey로 설치 (Windows, 관리자 권한 필요)
choco install gradle -y

# 또는 직접 다운로드
# https://gradle.org/releases/

# Wrapper 생성
gradle wrapper --gradle-version 8.0
```

### 2. Cursor에서 프로젝트 열기

```powershell
# Cursor에서 bridge 폴더 열기
cursor kakkaobot\bridge
```

또는 Cursor에서:
- File → Open Folder → `kakkaobot/bridge` 선택

### 3. 빌드 및 설치

```powershell
.\build-and-install.ps1
```

## Android Studio 사용하기 (선택사항)

Android Studio가 필요한 경우:

### Android Studio 설치
1. https://developer.android.com/studio 다운로드
2. 설치 후 실행

### 프로젝트 열기
1. Android Studio 실행
2. File → Open → `kakkaobot/bridge` 선택
3. Gradle Sync 자동 실행 (Gradle Wrapper 자동 생성)

### Cursor와 Android Studio 함께 사용
- **Cursor**: 코드 편집 (더 가벼움, 빠름)
- **Android Studio**: 디버깅, 에뮬레이터, 프로파일링

## 권장 워크플로우

1. **Cursor에서 코드 편집**
   ```powershell
   cursor kakkaobot\bridge
   ```

2. **빌드 및 테스트**
   ```powershell
   .\build-and-install.ps1
   ```

3. **필요시 Android Studio로 디버깅**
   - Android Studio에서 프로젝트 열기
   - 디버깅/프로파일링 수행

## Cursor 확장 프로그램 (선택사항)

Android 개발을 위한 유용한 확장:
- **Kotlin Language**: Kotlin 문법 하이라이팅
- **Gradle Language Support**: Gradle 파일 지원
- **XML Tools**: Android XML 파일 편집

## 문제 해결

### Gradle Wrapper가 없는 경우
```powershell
.\create-gradle-wrapper.ps1
```

### 빌드 오류 발생 시
1. Gradle Wrapper 확인: `.\gradlew.bat --version`
2. Android SDK 경로 확인 (필요시)
3. Android Studio에서 프로젝트 열어서 Gradle Sync

### Android Studio 없이도 가능한 작업
- ✅ 코드 편집
- ✅ Gradle 빌드
- ✅ APK 생성
- ✅ ADB 설치
- ✅ 로그 확인 (`adb logcat`)

### Android Studio가 필요한 작업
- ⚠️ 에뮬레이터 실행
- ⚠️ 디버깅 (브레이크포인트)
- ⚠️ 프로파일링
- ⚠️ UI 디자인 (Layout Editor)

## 결론

**Android Studio 없이도 Cursor에서 충분히 개발 가능합니다!**

- 코드 편집: Cursor
- 빌드: Gradle (명령어)
- 설치: ADB
- 테스트: 실제 기기 또는 에뮬레이터

Android Studio는 디버깅이나 UI 작업이 필요할 때만 사용하면 됩니다.

