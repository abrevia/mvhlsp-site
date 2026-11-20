# Automated MVHLSP Cloudflare Pages Deployment Script
$ErrorActionPreference = "Stop"
$envFile = Join-Path $PSScriptRoot ".env"

if (Test-Path $envFile) {
    Get-Content $envFile | Where-Object { $_ -match '^([^#=]+)=(.*)$' } | ForEach-Object {
        $key = $matches[1].Trim()
        $val = $matches[2].Trim()
        [System.Environment]::SetEnvironmentVariable($key, $val, "Process")
    }
}

if (-not $env:CLOUDFLARE_API_TOKEN -or $env:CLOUDFLARE_API_TOKEN -eq "your_token_here") {
    Write-Host "CLOUDFLARE_API_TOKEN not configured in $envFile" -ForegroundColor Yellow
    exit 1
}

Write-Host "Deploying MVHLSP to Cloudflare Pages..." -ForegroundColor Cyan
$accountArg = if ($env:CLOUDFLARE_ACCOUNT_ID -and $env:CLOUDFLARE_ACCOUNT_ID -ne "your_account_id_here") { "--account-id=$($env:CLOUDFLARE_ACCOUNT_ID)" } else { "" }
npx wrangler pages deploy "$PSScriptRoot" --project-name=mvhlsp $accountArg
