<#
.SYNOPSIS
  Back up and restore No Asteroids saves (full game and demo).

.DESCRIPTION
  No Asteroids keeps its saves in two places:
    1. %APPDATA%\No Asteroids  - "Local Storage" and "IndexedDB" (Chromium LevelDB databases)
    2. Steam Cloud folders      - <Steam>\userdata\<id>\5527800\remote (save.json, world.b64, save-2.json ...)
  The demo (app 5541510) and the full game (app 5527800) share both.

  This tool never touches game files. It only copies save data while the game is closed.

.EXAMPLE
  .\NoAsteroidsBackup.ps1 backup            # make a backup now
  .\NoAsteroidsBackup.ps1 list              # show backups
  .\NoAsteroidsBackup.ps1 restore 3         # restore backup #3 from the list (makes a safety backup first)
  .\NoAsteroidsBackup.ps1 play              # back up, then launch the full game through Steam
  .\NoAsteroidsBackup.ps1 play -Demo        # back up, then launch the demo
#>
[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [ValidateSet('backup', 'list', 'restore', 'play', 'help')]
    [string]$Command = 'help',

    [Parameter(Position = 1)]
    [string]$Which,

    [string]$Note = '',
    [int]$Keep = 30,
    [string]$BackupDir = (Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'No Asteroids Backups'),
    [switch]$Demo
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem

$AppIds   = @{ Full = 5527800; Demo = 5541510 }
$UserData = Join-Path $env:APPDATA 'No Asteroids'
$LocalParts = @('Local Storage', 'IndexedDB')   # the only folders that hold progress and settings

function Get-SteamPath {
    foreach ($key in 'HKCU:\Software\Valve\Steam', 'HKLM:\SOFTWARE\WOW6432Node\Valve\Steam') {
        try {
            $p = (Get-ItemProperty $key -ErrorAction Stop)
            $v = if ($p.SteamPath) { $p.SteamPath } else { $p.InstallPath }
            if ($v -and (Test-Path $v)) { return ($v -replace '/', '\') }
        } catch {}
    }
    $default = "${env:ProgramFiles(x86)}\Steam"
    if (Test-Path $default) { return $default }
    return $null
}

# Every Steam Cloud "remote" folder for No Asteroids, across all Steam accounts on this PC.
function Get-CloudFolders {
    $steam = Get-SteamPath
    if (-not $steam) { return @() }
    $ud = Join-Path $steam 'userdata'
    if (-not (Test-Path $ud)) { return @() }
    $out = @()
    foreach ($user in Get-ChildItem $ud -Directory) {
        foreach ($id in $AppIds.Values) {
            $remote = Join-Path $user.FullName "$id\remote"
            if (Test-Path $remote) {
                $out += [pscustomobject]@{ User = $user.Name; App = $id; Path = $remote }
            }
        }
    }
    return $out
}

function Assert-GameClosed {
    $running = Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.ProcessName -like 'No Asteroids*' }
    if ($running) {
        throw "No Asteroids is running. Quit the game first - its save databases can't be copied safely while it's open."
    }
}

function Get-Backups {
    if (-not (Test-Path $BackupDir)) { return @() }
    $zips = Get-ChildItem $BackupDir -Filter 'NoAsteroids_*.zip' | Sort-Object Name -Descending
    $i = 0
    foreach ($z in $zips) {
        $i++
        $meta = $null
        try {
            $zip = [IO.Compression.ZipFile]::OpenRead($z.FullName)
            $entry = $zip.GetEntry('manifest.json')
            if ($entry) {
                $r = New-Object IO.StreamReader($entry.Open())
                $meta = $r.ReadToEnd() | ConvertFrom-Json
                $r.Close()
            }
            $zip.Dispose()
        } catch {}
        [pscustomobject]@{
            '#'     = $i
            Created = if ($meta) { $meta.created } else { $z.LastWriteTime.ToString('yyyy-MM-dd HH:mm') }
            SizeMB  = [math]::Round($z.Length / 1MB, 1)
            Note    = if ($meta) { $meta.note } else { '' }
            File    = $z.FullName
        }
    }
}

function New-Backup([string]$note) {
    Assert-GameClosed
    $hasLocal = Test-Path $UserData
    $cloud = @(Get-CloudFolders)
    if (-not $hasLocal -and $cloud.Count -eq 0) {
        throw "No save data found (looked in '$UserData' and the Steam Cloud folders)."
    }

    New-Item -ItemType Directory -Force $BackupDir | Out-Null
    $stamp = Get-Date -Format 'yyyy-MM-dd_HH-mm-ss'
    $stage = Join-Path ([IO.Path]::GetTempPath()) "na-backup-$stamp"
    New-Item -ItemType Directory -Force $stage | Out-Null

    try {
        $manifest = [ordered]@{ created = (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'); note = $note; local = @(); cloud = @() }

        if ($hasLocal) {
            foreach ($part in $LocalParts) {
                $src = Join-Path $UserData $part
                if (Test-Path $src) {
                    Copy-Item $src (Join-Path $stage "local\$part") -Recurse -Force
                    # LevelDB lock files are empty placeholders; leave them out.
                    Get-ChildItem (Join-Path $stage "local\$part") -Recurse -Filter 'LOCK' | Remove-Item -Force
                    $manifest.local += $part
                }
            }
        }
        foreach ($c in $cloud) {
            $dst = Join-Path $stage "cloud\$($c.User)\$($c.App)"
            New-Item -ItemType Directory -Force $dst | Out-Null
            Copy-Item (Join-Path $c.Path '*') $dst -Recurse -Force
            $manifest.cloud += [ordered]@{ user = $c.User; app = $c.App }
        }

        $manifest | ConvertTo-Json -Depth 5 | Set-Content (Join-Path $stage 'manifest.json') -Encoding UTF8
        $zipPath = Join-Path $BackupDir "NoAsteroids_$stamp.zip"
        [IO.Compression.ZipFile]::CreateFromDirectory($stage, $zipPath, [IO.Compression.CompressionLevel]::Optimal, $false)
    }
    finally {
        Remove-Item $stage -Recurse -Force -ErrorAction SilentlyContinue
    }

    # Prune the oldest backups beyond -Keep.
    $all = Get-ChildItem $BackupDir -Filter 'NoAsteroids_*.zip' | Sort-Object Name -Descending
    if ($Keep -gt 0 -and $all.Count -gt $Keep) {
        $all | Select-Object -Skip $Keep | Remove-Item -Force
    }

    Write-Host "Backup saved: $zipPath ($([math]::Round((Get-Item $zipPath).Length / 1MB, 1)) MB)" -ForegroundColor Green
    return $zipPath
}

function Restore-Backup([string]$which) {
    Assert-GameClosed
    $list = @(Get-Backups)
    if ($list.Count -eq 0) { throw "No backups found in '$BackupDir'." }

    $pick = $null
    if (-not $which) { $pick = $list[0] }
    elseif ($which -match '^\d+$') { $pick = $list | Where-Object { $_.'#' -eq [int]$which } }
    elseif (Test-Path $which) { $pick = [pscustomobject]@{ File = (Resolve-Path $which).Path; Created = ''; Note = '' } }
    if (-not $pick) { throw "No backup '$which'. Run '.\NoAsteroidsBackup.ps1 list' to see them." }

    Write-Host "Restoring: $($pick.File)" -ForegroundColor Cyan
    Write-Host 'First, a safety backup of your current saves...'
    New-Backup "auto: before restoring $([IO.Path]::GetFileName($pick.File))" | Out-Null

    $stage = Join-Path ([IO.Path]::GetTempPath()) ("na-restore-" + [guid]::NewGuid().ToString('N'))
    [IO.Compression.ZipFile]::ExtractToDirectory($pick.File, $stage)
    try {
        $manifest = Get-Content (Join-Path $stage 'manifest.json') -Raw | ConvertFrom-Json

        foreach ($part in $manifest.local) {
            $dst = Join-Path $UserData $part
            if (Test-Path $dst) { Remove-Item $dst -Recurse -Force }
            New-Item -ItemType Directory -Force $UserData | Out-Null
            Copy-Item (Join-Path $stage "local\$part") $dst -Recurse -Force
        }

        $steam = Get-SteamPath
        foreach ($c in $manifest.cloud) {
            if (-not $steam) { Write-Warning 'Steam not found - skipping Steam Cloud files.'; break }
            $dst = Join-Path $steam "userdata\$($c.user)\$($c.app)\remote"
            New-Item -ItemType Directory -Force $dst | Out-Null
            Get-ChildItem $dst -File | Remove-Item -Force
            Copy-Item (Join-Path $stage "cloud\$($c.user)\$($c.app)\*") $dst -Recurse -Force
        }
    }
    finally {
        Remove-Item $stage -Recurse -Force -ErrorAction SilentlyContinue
    }

    Write-Host 'Restored.' -ForegroundColor Green
    Write-Host 'If Steam shows a "Cloud Sync Conflict" next launch, choose the LOCAL files to keep this restore.' -ForegroundColor Yellow
}

switch ($Command) {
    'backup'  { New-Backup $Note | Out-Null }
    'list'    {
        $l = @(Get-Backups)
        if ($l.Count -eq 0) { Write-Host "No backups yet in '$BackupDir'." }
        else { $l | Format-Table '#', Created, SizeMB, Note -AutoSize }
    }
    'restore' { Restore-Backup $Which }
    'play'    {
        New-Backup 'auto: before playing' | Out-Null
        $id = if ($Demo) { $AppIds.Demo } else { $AppIds.Full }
        Write-Host "Launching No Asteroids$(if ($Demo) {' Demo'}) through Steam..."
        Start-Process "steam://rungameid/$id"
    }
    default   { Get-Help $PSCommandPath -Detailed }
}
