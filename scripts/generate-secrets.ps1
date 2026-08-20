# ==============================================================================
# FleetUpdate-Hub - Secrets Generator for PowerShell / Windows
# ==============================================================================
$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$rootDir = Split-Path -Parent $scriptDir
$secretsDir = Join-Path $rootDir "secrets"

if (-not (Test-Path $secretsDir)) {
    New-Item -ItemType Directory -Path $secretsDir -Force | Out-Null
}

Write-Host "🔐 Generating cryptographic secrets for FleetUpdate-Hub..." -ForegroundColor Cyan

Function Generate-RandomHex([int]$bytesCount) {
    $bytes = New-Object byte[] $bytesCount
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    $rng.GetBytes($bytes)
    return ($bytes | ForEach-Object { $_.ToString("x2") }) -join ''
}

# 1. Database Password
$dbPass = Generate-RandomHex 24
[System.IO.File]::WriteAllText((Join-Path $secretsDir "db_password.txt"), $dbPass, [System.Text.Encoding]::ASCII)
Write-Host "  [OK] Database password generated in secrets/db_password.txt" -ForegroundColor Green

# 2. Master Key (32 bytes = 256 bits)
$masterKey = Generate-RandomHex 32
[System.IO.File]::WriteAllText((Join-Path $secretsDir "master_key.txt"), $masterKey, [System.Text.Encoding]::ASCII)
Write-Host "  [OK] AES-256 Master Key generated in secrets/master_key.txt" -ForegroundColor Green

# 3. JWT Secret
$jwtSecret = Generate-RandomHex 32
[System.IO.File]::WriteAllText((Join-Path $secretsDir "jwt_secret.txt"), $jwtSecret, [System.Text.Encoding]::ASCII)
Write-Host "  [OK] JWT Secret generated in secrets/jwt_secret.txt" -ForegroundColor Green

# 4. Connection URL
$dbUrl = "postgresql://fleet_user:$($dbPass)@db:5432/fleetupdate?schema=public"
[System.IO.File]::WriteAllText((Join-Path $secretsDir "db_connection_url.txt"), $dbUrl, [System.Text.Encoding]::ASCII)
Write-Host "  [OK] Database Connection URL generated in secrets/db_connection_url.txt" -ForegroundColor Green

# 5. Populate or Create .env file for Docker Compose
$envFile = Join-Path $rootDir ".env"
if (-not (Test-Path $envFile)) {
    $envContent = @"
# ==============================================================================
# FleetUpdate-Hub - Auto-Generated Production Configuration
# ==============================================================================
NODE_ENV=production
PORT=5000
HOST=0.0.0.0

POSTGRES_DB=fleetupdate
POSTGRES_USER=fleet_user
POSTGRES_PASSWORD=$dbPass
DATABASE_URL=$dbUrl

MASTER_ENCRYPTION_KEY=$masterKey
JWT_SECRET=$jwtSecret
JWT_EXPIRES_IN=8h

CORS_ORIGIN=http://localhost:3000,http://127.0.0.1:3000

INITIAL_ADMIN_EMAIL=admin@fleetupdate.local
INITIAL_ADMIN_PASSWORD=
"@
    [System.IO.File]::WriteAllText($envFile, $envContent, [System.Text.Encoding]::UTF8)
    Write-Host "  [OK] Ready-to-use .env configuration file generated!" -ForegroundColor Green
} else {
    Write-Host "  [INFO] Existing .env detected, preserved without overwriting." -ForegroundColor Cyan
}

Write-Host ""
Write-Host "======================================================================" -ForegroundColor Yellow
Write-Host "⚠️  IMPORTANT: SAVE YOUR MASTER ENCRYPTION KEY OFFLINE:" -ForegroundColor Yellow
Write-Host "AES-256 Key: $masterKey" -ForegroundColor White
Write-Host "Store this key in your password manager (e.g. KeePass, Bitwarden, 1Password)." -ForegroundColor Yellow
Write-Host "If lost, encrypted credentials stored in the database cannot be recovered." -ForegroundColor Yellow
Write-Host "======================================================================" -ForegroundColor Yellow
Write-Host "🚀 To launch the FleetUpdate-Hub stack:" -ForegroundColor Cyan
Write-Host "   docker compose up -d" -ForegroundColor White
Write-Host "======================================================================" -ForegroundColor Yellow
