# Local release gate for AegisProof-mini.
# Windows PowerShell 5.1 and PowerShell 7.
# This script is not used by GitHub Actions.
# It does not force-push, hard-reset, clean, or discard uncommitted work.
[CmdletBinding()]
param(
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"
if (Test-Path -LiteralPath variable:PSNativeCommandUseErrorActionPreference) {
    $PSNativeCommandUseErrorActionPreference = $false
}

$script:CommitCreated = $false
$script:PushStarted = $false

$ArtifactPaths = @(
    "circuit/main.wasm",
    "circuit/main.r1cs",
    "circuit/mini.zkey",
    "keys/verification_key.json",
    "artifacts/manifest.json",
    "artifacts/manifest.sha256",
    "artifacts/baseline.json",
    "experimental/sepolia/deployments/sepolia.json"
)

$ProtectedPaths = @(
    "circuit/main.circom",
    "circuit/main.wasm",
    "circuit/main.r1cs",
    "circuit/mini.zkey",
    "keys/verification_key.json",
    "artifacts/baseline.json",
    "experimental/sepolia/deployments/sepolia.json",
    "package.json",
    "package-lock.json"
)

$AllowedExact = @(
    ".github/workflows/codeql.yml",
    ".github/workflows/crypto-security.yml",
    "scripts/security-observability.js",
    "SECURITY.md",
    "README.md"
)

function Stop-Release {
    param([string]$Message)
    if ($script:PushStarted) {
        Write-Host "Commit succeeded."
        Write-Host "Push failed."
        if ($Message) { Write-Host $Message }
        Write-Host "The commit remains local and was NOT reverted."
        exit 1
    }
    if ($Message) { Write-Host $Message }
    Write-Host "Release aborted."
    Write-Host "No commit or push was performed."
    exit 1
}

function Invoke-Native {
    param(
        [string]$File,
        [string[]]$ArgumentList,
        [string]$FailureMessage
    )
    & $File @ArgumentList
    if ($LASTEXITCODE -ne 0) {
        Stop-Release $FailureMessage
    }
}

function Get-RepoPath {
    param([string]$RelativePath)
    $child = $RelativePath.Replace("/", "\")
    return Join-Path -Path $repoRoot -ChildPath $child
}

function Get-ArtifactSnapshot {
    $snapshot = @{}
    foreach ($relativePath in $ArtifactPaths) {
        $fullPath = Get-RepoPath $relativePath
        if (-not (Test-Path -LiteralPath $fullPath)) {
            Stop-Release "Missing artifact: $relativePath"
        }
        $hash = (Get-FileHash -LiteralPath $fullPath -Algorithm SHA256).Hash.ToLowerInvariant()
        $snapshot[$relativePath] = $hash
    }
    return $snapshot
}

function Test-SnapshotMatch {
    param($Before, $After)
    $changed = New-Object System.Collections.Generic.List[string]
    foreach ($relativePath in $ArtifactPaths) {
        if ($Before[$relativePath] -ne $After[$relativePath]) {
            $changed.Add($relativePath)
        }
    }
    return $changed
}

function Get-ChangedPaths {
    $raw = & git status --porcelain
    if ($LASTEXITCODE -ne 0) {
        Stop-Release "git status failed"
    }
    $paths = New-Object System.Collections.Generic.List[string]
    if (-not $raw) { return $paths }
    foreach ($line in @($raw)) {
        if ([string]::IsNullOrWhiteSpace($line)) { continue }
        if ($line.Length -lt 4) { continue }
        $pathPart = $line.Substring(3)
        $arrow = $pathPart.IndexOf(" -> ")
        if ($arrow -ge 0) {
            $pathPart = $pathPart.Substring($arrow + 4)
        }
        $pathPart = $pathPart.Trim().Trim('"').Replace("\", "/")
        $paths.Add($pathPart)
    }
    return $paths
}

function Test-AllowedPath {
    param([string]$RelativePath)
    if ($AllowedExact -contains $RelativePath) { return $true }
    if ($RelativePath -like "docs/*") { return $true }
    return $false
}

function Test-ForbiddenPath {
    param([string]$RelativePath)
    $normalized = $RelativePath.Replace("\", "/").TrimStart("./")
    $base = [System.IO.Path]::GetFileName($normalized)
    if ($base -eq ".env" -or $normalized -eq ".env" -or $normalized -like "*/.env") { return $true }
    if ($base -like "*.mldsa.sk") { return $true }
    if ($base -eq "input.json" -or $base -eq "proof.json") { return $true }
    if ($normalized -eq "node_modules" -or $normalized -like "node_modules/*") { return $true }
    if ($normalized -like "keys/*") {
        if ($base -match "secret" -or $base -match "private" -or $base -like "*.sk") { return $true }
    }
    return $false
}

function Read-Approval {
    param([string]$Prompt)
    $answer = Read-Host $Prompt
    if ($answer -eq "Y" -or $answer -eq "y") { return $true }
    return $false
}

if ($env:GITHUB_ACTIONS -eq "true") {
    Stop-Release "This script is local-only and must not run in GitHub Actions."
}

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $repoRoot

Write-Host "=== AegisProof-mini Local Release ==="
if ($DryRun) {
    Write-Host "Dry run: commit and push will not be performed."
}

if (-not (Test-Path -LiteralPath (Join-Path $repoRoot "package.json"))) {
    Stop-Release "package.json was not found."
}

$packageJson = Get-Content -LiteralPath (Join-Path $repoRoot "package.json") -Raw -Encoding UTF8 | ConvertFrom-Json
foreach ($scriptName in @("keys:check", "integrity", "test", "sepolia:test")) {
    $property = $packageJson.scripts.PSObject.Properties[$scriptName]
    if (-not $property -or [string]::IsNullOrWhiteSpace([string]$property.Value)) {
        Stop-Release "Required npm script is missing: $scriptName"
    }
}

Write-Host ""
Write-Host "[1/7] Checking cryptographic artifacts..."
$before = Get-ArtifactSnapshot
Write-Host "PASS"

Write-Host ""
Write-Host "[2/7] keys:check..."
Invoke-Native -File "npm.cmd" -ArgumentList @("run", "keys:check") -FailureMessage "keys:check failed"
Write-Host "PASS"

Write-Host ""
Write-Host "[3/7] integrity..."
Invoke-Native -File "npm.cmd" -ArgumentList @("run", "integrity") -FailureMessage "integrity failed"
Write-Host "PASS"

Write-Host ""
Write-Host "[4/7] tests..."
Invoke-Native -File "npm.cmd" -ArgumentList @("test") -FailureMessage "tests failed"
Write-Host "PASS"

Write-Host ""
Write-Host "[5/7] Sepolia regression..."
Invoke-Native -File "npm.cmd" -ArgumentList @("run", "sepolia:test") -FailureMessage "sepolia:test failed"
Write-Host "PASS"

Write-Host ""
Write-Host "[6/7] Git validation..."
Invoke-Native -File "git" -ArgumentList @("diff", "--check") -FailureMessage "git diff --check failed"
Write-Host "PASS"

Write-Host ""
Write-Host "[7/7] Artifact immutability..."
$after = Get-ArtifactSnapshot
$artifactChanges = Test-SnapshotMatch -Before $before -After $after
if ($artifactChanges.Count -gt 0) {
    Write-Host "ERROR: Cryptographic artifact changed during release checks."
    foreach ($relativePath in $artifactChanges) {
        Write-Host $relativePath
    }
    Write-Host "Release aborted."
    Write-Host "No commit or push was performed."
    exit 1
}
Write-Host "PASS"

Write-Host ""
Write-Host "=== Release candidate ==="
Write-Host ""
Write-Host "Changed files:"
& git status --short
if ($LASTEXITCODE -ne 0) { Stop-Release "git status failed" }
Write-Host ""
& git diff --stat
if ($LASTEXITCODE -ne 0) { Stop-Release "git diff --stat failed" }
Write-Host ""
& git diff --name-only
if ($LASTEXITCODE -ne 0) { Stop-Release "git diff --name-only failed" }

$changed = Get-ChangedPaths
$protectedHits = New-Object System.Collections.Generic.List[string]
$stagePaths = New-Object System.Collections.Generic.List[string]
$leftUnstaged = New-Object System.Collections.Generic.List[string]

foreach ($relativePath in $changed) {
    if (Test-ForbiddenPath $relativePath) {
        Stop-Release "Refusing to continue because a forbidden path is present in the change list: $relativePath"
    }
    $isProtected = $false
    foreach ($protectedPath in $ProtectedPaths) {
        if ($relativePath -eq $protectedPath) { $isProtected = $true }
    }
    if ($isProtected) {
        $protectedHits.Add($relativePath)
        continue
    }
    if (Test-AllowedPath $relativePath) {
        $stagePaths.Add($relativePath)
    } else {
        $leftUnstaged.Add($relativePath)
    }
}

if ($protectedHits.Count -gt 0) {
    Write-Host ""
    Write-Host "ERROR: Protected file changed:"
    Write-Host ""
    foreach ($relativePath in $protectedHits) {
        Write-Host $relativePath
    }
    Write-Host ""
    Write-Host "This release script will not stage or commit protected files."
    Write-Host "Release aborted."
    Write-Host "No commit or push was performed."
    exit 1
}

Write-Host ""
Write-Host "Protected artifacts: UNCHANGED"

if ($leftUnstaged.Count -gt 0) {
    Write-Host ""
    Write-Host "Left unstaged:"
    foreach ($relativePath in $leftUnstaged) {
        Write-Host "  $relativePath"
    }
}

if ($stagePaths.Count -eq 0) {
    Write-Host ""
    Write-Host "No allow-listed changes to commit."
    if ($DryRun) {
        Write-Host "Dry run complete."
        Write-Host "No commit or push was performed."
    }
    exit 0
}

Write-Host ""
Write-Host "Stage candidates:"
foreach ($relativePath in $stagePaths) {
    Write-Host "  $relativePath"
}

$originUrl = & git remote get-url origin
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace([string]$originUrl)) {
    Stop-Release "origin is not configured."
}
Write-Host ""
Write-Host "origin: $($originUrl.Trim())"

$branch = & git rev-parse --abbrev-ref HEAD
if ($LASTEXITCODE -ne 0) { Stop-Release "git rev-parse failed" }
$branch = [string]$branch
if ($branch.Trim() -ne "main") {
    Stop-Release "Current branch is not main."
}

if ($DryRun) {
    Write-Host ""
    Write-Host "Dry run complete."
    Write-Host "No files were staged."
    Write-Host "No commit or push was performed."
    exit 0
}

foreach ($relativePath in $stagePaths) {
    & git add -- $relativePath
    if ($LASTEXITCODE -ne 0) {
        Stop-Release "git add failed for $relativePath"
    }
}

Write-Host ""
Write-Host "Staged files:"
$staged = & git diff --cached --name-only
if ($LASTEXITCODE -ne 0) { Stop-Release "git diff --cached --name-only failed" }
if (-not $staged) { Stop-Release "Nothing was staged." }
foreach ($line in @($staged)) {
    if ([string]::IsNullOrWhiteSpace($line)) { continue }
    $stagedPath = $line.Trim().Replace("\", "/")
    Write-Host "  $stagedPath"
    if (Test-ForbiddenPath $stagedPath) {
        Stop-Release "Forbidden path is staged: $stagedPath"
    }
    if (-not (Test-AllowedPath $stagedPath)) {
        Stop-Release "Path outside the allow list is staged: $stagedPath"
    }
}

Write-Host ""
& git status
if ($LASTEXITCODE -ne 0) { Stop-Release "git status failed" }
Write-Host ""
& git diff --cached --stat
if ($LASTEXITCODE -ne 0) { Stop-Release "git diff --cached --stat failed" }
Invoke-Native -File "git" -ArgumentList @("diff", "--cached", "--check") -FailureMessage "git diff --cached --check failed"

Write-Host ""
if (-not (Read-Approval "Commit these changes? [Y/N]")) {
    Write-Host "Commit skipped."
    Write-Host "No commit or push was performed."
    exit 0
}

Invoke-Native -File "git" -ArgumentList @("commit", "-m", "Add CodeQL and crypto security observability") -FailureMessage "git commit failed"
$script:CommitCreated = $true

Write-Host ""
& git status --short
if ($LASTEXITCODE -ne 0) { Stop-Release "git status failed after commit" }
& git log -1 --oneline
if ($LASTEXITCODE -ne 0) { Stop-Release "git log failed after commit" }

Write-Host ""
if (-not (Read-Approval "Push this commit to origin/main? [Y/N]")) {
    Write-Host "Commit created locally."
    Write-Host "Push skipped."
    exit 0
}

Write-Host ""
Write-Host "origin: $($originUrl.Trim())"
$script:PushStarted = $true
Invoke-Native -File "git" -ArgumentList @("push", "origin", "main") -FailureMessage "git push origin main failed"
Write-Host ""
Write-Host "Release complete."
exit 0
