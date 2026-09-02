<#
.SYNOPSIS
  Create a GeoLang workspace and clone every platform repo (PowerShell port of
  clone-geolang.sh, for developing natively on Windows).

.DESCRIPTION
  Clones the 20 GeoLang GitHub repos + the geolang private-GitLab repo + the
  upstream letta fork into a target folder. Idempotent: existing repos are left
  alone (or pulled with -Pull).

.PARAMETER Target
  Destination folder (default: GeoLang).

.PARAMETER Pull
  Run 'git pull --ff-only' on repos that already exist.

.PARAMETER Https
  Clone the GeoLang GitHub repos over HTTPS instead of SSH.

.EXAMPLE
  .\clone-geolang.ps1 C:\src\GeoLang

.EXAMPLE
  .\clone-geolang.ps1 -Pull C:\src\GeoLang

.NOTES
  * geolang is on a private GitLab reached via the 'gitlab-rsa' SSH host alias —
    configure %USERPROFILE%\.ssh\config for it, or that one clone is skipped with
    a warning (the rest still clone).
  * Requires git on PATH (Git for Windows).
#>
[CmdletBinding()]
param(
    [string]$Target = "GeoLang",
    [switch]$Pull,
    [switch]$Https
)

# GeoLang-owned repos (GeoLang GitHub org).
$GithubRepos = @(
    "agora", "collecta", "fenestra", "fluvius", "geodukt", "geogit", "geokode",
    "GeoLang.github.io", "geoplumb", "infrastructure", "interiora", "itinera",
    "jung", "nubis", "panoptes", "projicio", "ptolemy", "sibyl", "terrano",
    "terravista", "tiletopia", "topoi", "viewtopia"
)

# Repos that don't live in the GeoLang GitHub org.
$ExternalRepos = @(
    @{ Name = "geolang"; Url = "gitlab-rsa:geolanghq/geolang.git" },   # private GitLab (SSH alias)
    @{ Name = "letta";   Url = "https://github.com/letta-ai/letta.git" } # upstream Letta (third-party)
)

function Get-GithubUrl([string]$Name) {
    if ($Https) { "https://github.com/GeoLang/$Name.git" } else { "git@github.com:GeoLang/$Name.git" }
}

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Write-Error "git not found on PATH. Install Git for Windows."
    exit 1
}

New-Item -ItemType Directory -Force -Path $Target | Out-Null
Set-Location -Path $Target
Write-Host "Workspace: $(Get-Location)`n"

$script:Ok = 0; $script:Skip = 0; $script:Fail = 0; $script:Failed = @()

function Invoke-CloneOne([string]$Name, [string]$Url) {
    if (Test-Path (Join-Path $Name ".git")) {
        if ($Pull) {
            Write-Host "~ $Name - pulling"
            git -C $Name pull --ff-only
            if ($LASTEXITCODE -eq 0) { $script:Ok++ } else { $script:Fail++; $script:Failed += $Name }
        }
        else {
            Write-Host "- $Name - already present, skipping"
            $script:Skip++
        }
        return
    }
    Write-Host "v $Name - cloning from $Url"
    git clone $Url $Name
    if ($LASTEXITCODE -eq 0) {
        $script:Ok++
    }
    else {
        Write-Warning "failed to clone $Name"
        $script:Fail++; $script:Failed += $Name
    }
}

foreach ($name in $GithubRepos) { Invoke-CloneOne $name (Get-GithubUrl $name) }
foreach ($repo in $ExternalRepos) { Invoke-CloneOne $repo.Name $repo.Url }

Write-Host "`nDone - $($script:Ok) ok, $($script:Skip) skipped, $($script:Fail) failed."
if ($script:Fail -gt 0) {
    Write-Warning "Failed: $($script:Failed -join ', ')"
    Write-Warning "(SSH repos need your key on file; geolang needs the 'gitlab-rsa' SSH host alias.)"
    exit 1
}
