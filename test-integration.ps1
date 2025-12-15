# KakaoBot Integration Test Script

param(
    [switch]$Server,
    [switch]$Client,
    [switch]$Bridge,
    [switch]$All
)

$ErrorActionPreference = "Stop"

# Get script directory
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $scriptDir) {
    $scriptDir = $PWD.Path
}

Write-Host "================================================" -ForegroundColor Cyan
Write-Host "KakaoBot Integration Test" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

# Server Test
if ($Server -or $All) {
    Write-Host "[1/3] Server Test" -ForegroundColor Yellow
    
    $serverPath = Join-Path $scriptDir "server\server.js"
    if (-not (Test-Path $serverPath)) {
        Write-Host "  [X] server.js not found: $serverPath" -ForegroundColor Red
    } else {
        Write-Host "  -> Checking server code syntax..." -ForegroundColor Gray
        Push-Location (Join-Path $scriptDir "server")
        try {
            $result = node --check server.js 2>&1
            if ($LASTEXITCODE -eq 0) {
                Write-Host "  [OK] Server code syntax OK" -ForegroundColor Green
            } else {
                Write-Host "  [X] Server code syntax error:" -ForegroundColor Red
                Write-Host $result -ForegroundColor Red
            }
        } finally {
            Pop-Location
        }
    }
}

# Client Test
if ($Client -or $All) {
    Write-Host "`n[2/3] Client Test" -ForegroundColor Yellow
    
    $clientPath = Join-Path $scriptDir "client\kakao_poller.py"
    if (-not (Test-Path $clientPath)) {
        Write-Host "  [X] kakao_poller.py not found: $clientPath" -ForegroundColor Red
    } else {
        Write-Host "  -> Checking client code syntax..." -ForegroundColor Gray
        Push-Location (Join-Path $scriptDir "client")
        try {
            $result = python -m py_compile kakao_poller.py 2>&1
            if ($LASTEXITCODE -eq 0) {
                Write-Host "  [OK] Client code syntax OK" -ForegroundColor Green
            } else {
                Write-Host "  [X] Client code syntax error:" -ForegroundColor Red
                Write-Host $result -ForegroundColor Red
            }
        } finally {
            Pop-Location
        }
    }
}

# Bridge APK Test
if ($Bridge -or $All) {
    Write-Host "`n[3/3] Bridge APK Test" -ForegroundColor Yellow
    
    $bridgeTestPath = Join-Path $scriptDir "bridge\test-bridge.ps1"
    if (-not (Test-Path $bridgeTestPath)) {
        Write-Host "  [X] test-bridge.ps1 not found: $bridgeTestPath" -ForegroundColor Red
    } else {
        Write-Host "  -> Running Bridge APK test..." -ForegroundColor Gray
        Push-Location (Join-Path $scriptDir "bridge")
        try {
            & .\test-bridge.ps1 -Test
        } finally {
            Pop-Location
        }
    }
}

# Test Complete
if ($All) {
    Write-Host "`n================================================" -ForegroundColor Cyan
    Write-Host "Integration Test Complete" -ForegroundColor Green
    Write-Host "================================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Next Steps:" -ForegroundColor Yellow
    Write-Host "  1. Start server: cd server; node server.js" -ForegroundColor Gray
    Write-Host "  2. Start client: cd client; python kakao_poller.py" -ForegroundColor Gray
    Write-Host "  3. Install Bridge APK and start service" -ForegroundColor Gray
    Write-Host "  4. Send test message from KakaoTalk" -ForegroundColor Gray
    Write-Host "  5. Check logs: cd bridge; .\test-bridge.ps1 -Logs" -ForegroundColor Gray
}

# Help
if (-not ($Server -or $Client -or $Bridge -or $All)) {
    Write-Host "KakaoBot Integration Test Script" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Usage:" -ForegroundColor Yellow
    Write-Host "  .\test-integration.ps1 -Server    # Test server" -ForegroundColor Gray
    Write-Host "  .\test-integration.ps1 -Client    # Test client" -ForegroundColor Gray
    Write-Host "  .\test-integration.ps1 -Bridge    # Test Bridge APK" -ForegroundColor Gray
    Write-Host "  .\test-integration.ps1 -All       # Test all" -ForegroundColor Gray
    Write-Host ""
    Write-Host "Example:" -ForegroundColor Yellow
    Write-Host "  .\test-integration.ps1 -All       # Test entire system" -ForegroundColor Gray
}

