# Gradle Wrapper 초기화 가이드

Android 프로젝트를 빌드하려면 Gradle Wrapper가 필요합니다.

## 방법 1: Android Studio 사용 (권장)

1. Android Studio에서 프로젝트 열기
2. File → Sync Project with Gradle Files
3. Gradle Wrapper가 자동으로 생성됩니다

## 방법 2: 수동 초기화

### Gradle이 설치되어 있는 경우
```powershell
gradle wrapper --gradle-version 8.0
```

### Gradle이 설치되어 있지 않은 경우

1. **Gradle 설치**
   - https://gradle.org/install/ 에서 다운로드
   - 또는 Chocolatey 사용: `choco install gradle`

2. **Wrapper 초기화**
   ```powershell
   gradle wrapper --gradle-version 8.0
   ```

3. **필요한 파일 확인**
   ```
   bridge/
   ├── gradlew.bat (Windows)
   ├── gradlew (Linux/Mac)
   ├── gradle/
   │   └── wrapper/
   │       ├── gradle-wrapper.jar
   │       └── gradle-wrapper.properties
   └── build.gradle.kts
   ```

## 방법 3: 스크립트 사용

```powershell
.\init-gradle.ps1
```

## 확인

Gradle Wrapper가 제대로 생성되었는지 확인:
```powershell
.\gradlew.bat --version
```

또는
```powershell
.\gradlew --version
```

## 문제 해결

### "gradlew.bat not found" 오류
- `init-gradle.ps1` 실행 또는 수동으로 Gradle Wrapper 초기화

### "Gradle not found" 오류
- Gradle 설치 필요: https://gradle.org/install/

### Android Studio에서 프로젝트 열기
- 가장 쉬운 방법은 Android Studio에서 프로젝트를 열면 자동으로 Gradle Wrapper가 생성됩니다.





