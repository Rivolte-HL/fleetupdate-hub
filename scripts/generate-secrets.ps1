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

Write-Host ""
Write-Host "======================================================================" -ForegroundColor Yellow
Write-Host "⚠️  IMPORTANT: SAUVEGARDEZ HORS-LIGNE VOTRE CLÉ MAÎTRESSE :" -ForegroundColor Yellow
Write-Host "Clé AES-256 : $masterKey" -ForegroundColor White
Write-Host "Conservez cette clé dans votre gestionnaire de mots de passe (KeePass/Vaultwarden)." -ForegroundColor Yellow
Write-Host "En cas de perte, les identifiants chiffrés en base seront irrécupérables." -ForegroundColor Yellow
Write-Host "======================================================================" -ForegroundColor Yellow
