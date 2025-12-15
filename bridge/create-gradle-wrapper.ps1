# Create Gradle Wrapper without Android Studio
# Usage: .\create-gradle-wrapper.ps1

Write-Host "Creating Gradle Wrapper..." -ForegroundColor Cyan

# Check if gradle is installed
if (-not (Get-Command gradle -ErrorAction SilentlyContinue)) {
    Write-Host "[INFO] Gradle not found" -ForegroundColor Yellow
    Write-Host "[INFO] Using simple wrapper creation (no Gradle installation needed)" -ForegroundColor Cyan
    Write-Host ""
    
    # Use the simple method instead
    if (Test-Path "create-gradle-wrapper-simple.ps1") {
        Write-Host "[INFO] Running create-gradle-wrapper-simple.ps1..." -ForegroundColor Cyan
        & ".\create-gradle-wrapper-simple.ps1"
        exit $LASTEXITCODE
    } else {
        Write-Host "[ERROR] create-gradle-wrapper-simple.ps1 not found" -ForegroundColor Red
        Write-Host "[INFO] Please install Gradle manually:" -ForegroundColor Yellow
        Write-Host "  1. Download from: https://gradle.org/releases/" -ForegroundColor Yellow
        Write-Host "  2. Extract and add to PATH" -ForegroundColor Yellow
        Write-Host "  3. Or run: .\create-gradle-wrapper-simple.ps1" -ForegroundColor Yellow
        exit 1
    }
}

# Create gradle wrapper directory structure
$gradleDir = "gradle\wrapper"
if (-not (Test-Path $gradleDir)) {
    New-Item -ItemType Directory -Path $gradleDir -Force | Out-Null
    Write-Host "[OK] Created gradle\wrapper directory" -ForegroundColor Green
}

# Initialize Gradle wrapper
Write-Host "[INFO] Initializing Gradle wrapper..." -ForegroundColor Yellow
gradle wrapper --gradle-version 8.0 --distribution-type all

if ($LASTEXITCODE -eq 0) {
    Write-Host "[OK] Gradle wrapper created successfully" -ForegroundColor Green
    Write-Host ""
    Write-Host "Files created:" -ForegroundColor Cyan
    Write-Host "  - gradlew.bat (Windows)" -ForegroundColor White
    Write-Host "  - gradlew (Linux/Mac)" -ForegroundColor White
    Write-Host "  - gradle/wrapper/gradle-wrapper.jar" -ForegroundColor White
    Write-Host "  - gradle/wrapper/gradle-wrapper.properties" -ForegroundColor White
    Write-Host ""
    Write-Host "You can now run: .\build-and-install.ps1" -ForegroundColor Green
} else {
    Write-Host "[FAIL] Failed to create Gradle wrapper" -ForegroundColor Red
    exit 1
}

