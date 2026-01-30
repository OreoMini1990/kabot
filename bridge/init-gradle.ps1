# Initialize Gradle Wrapper
# Usage: .\init-gradle.ps1

Write-Host "Initializing Gradle wrapper..." -ForegroundColor Cyan

# Check if gradle is installed
if (-not (Get-Command gradle -ErrorAction SilentlyContinue)) {
    Write-Host "[ERROR] Gradle not found. Please install Gradle first." -ForegroundColor Red
    Write-Host "[INFO] Download from: https://gradle.org/install/" -ForegroundColor Yellow
    exit 1
}

# Initialize wrapper
gradle wrapper --gradle-version 8.0

if ($LASTEXITCODE -eq 0) {
    Write-Host "[OK] Gradle wrapper initialized" -ForegroundColor Green
    Write-Host "[INFO] You can now run .\build-and-install.ps1" -ForegroundColor Cyan
} else {
    Write-Host "[FAIL] Failed to initialize Gradle wrapper" -ForegroundColor Red
    exit 1
}





