<#
.SYNOPSIS
  Installs, removes or checks the No Asteroids mod loader.

.DESCRIPTION
  No Asteroids is an Electron app whose exe stores a SHA-256 of its game archive (app.asar) and
  refuses to start if the archive changes. This installer:
    1. backs up the original app.asar and exe (to <game>\mods\_backup)
    2. builds a new app.asar from the ORIGINAL with three small patches:
         - build/electron/main.cjs : serves files from <game>\mods (mod scripts + asset overrides), optional F12 DevTools
         - build/web/index.html    : loads /__modloader.js before the game starts
         - build/web/__modloader.js: the page-side loader (new file)
    3. writes the new archive's hash into the exe, so the integrity check stays ON and passes
    4. copies the bundled mods into <game>\mods

  Steam "Verify integrity of game files" or a game update puts the original files back; run
  install again afterwards. The installer notices a game update and backs up the new originals.

.EXAMPLE
  .\Install-ModLoader.ps1                 # install into the full game (or the demo if that's all there is)
  .\Install-ModLoader.ps1 -Demo           # install into the demo
  .\Install-ModLoader.ps1 status
  .\Install-ModLoader.ps1 uninstall
  .\Install-ModLoader.ps1 -DevTools       # also let F12 open Chromium DevTools in game
#>
[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [ValidateSet('install', 'uninstall', 'status')]
    [string]$Command = 'install',
    [string]$GameDir,
    [switch]$Demo,
    [switch]$DevTools,
    [switch]$NoBundledMods
)

$ErrorActionPreference = 'Stop'
$Here = Split-Path -Parent $MyInvocation.MyCommand.Path
$LoaderVersion = '1.1.1'

Add-Type -Path (Join-Path $Here 'AsarTool.cs') -ReferencedAssemblies System.Web.Extensions

function Find-Game {
    if ($GameDir) { return (Resolve-Path $GameDir).Path }
    $roots = @()
    foreach ($key in 'HKCU:\Software\Valve\Steam', 'HKLM:\SOFTWARE\WOW6432Node\Valve\Steam') {
        try { $p = Get-ItemProperty $key -ErrorAction Stop; if ($p.SteamPath) { $roots += ($p.SteamPath -replace '/', '\') }; if ($p.InstallPath) { $roots += $p.InstallPath } } catch {}
    }
    $roots += "${env:ProgramFiles(x86)}\Steam"
    $libs = @()
    foreach ($r in ($roots | Select-Object -Unique)) {
        $vdf = Join-Path $r 'steamapps\libraryfolders.vdf'
        if (Test-Path $vdf) {
            $libs += $r
            foreach ($m in [regex]::Matches((Get-Content $vdf -Raw), '"path"\s+"([^"]+)"')) { $libs += ($m.Groups[1].Value -replace '\\\\', '\') }
        }
    }
    $name = if ($Demo) { 'No Asteroids Demo' } else { 'No Asteroids' }
    foreach ($l in ($libs | Select-Object -Unique)) {
        $d = Join-Path $l "steamapps\common\$name"
        if (Test-Path (Join-Path $d 'resources\app.asar')) { return $d }
    }
    if (-not $Demo) {
        foreach ($l in ($libs | Select-Object -Unique)) {
            $d = Join-Path $l 'steamapps\common\No Asteroids Demo'
            if (Test-Path (Join-Path $d 'resources\app.asar')) {
                Write-Host 'Full game not found - using the demo.' -ForegroundColor Yellow
                return $d
            }
        }
    }
    throw 'Could not find No Asteroids. Pass -GameDir "<folder with the game exe>".'
}

function Find-Exe($dir) {
    $exe = Get-ChildItem $dir -Filter '*.exe' | Where-Object { $_.Name -like 'No Asteroids*' } | Select-Object -First 1
    if (-not $exe) { throw "No 'No Asteroids*.exe' in $dir" }
    return $exe.FullName
}

function Assert-Closed {
    if (Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.ProcessName -like 'No Asteroids*' }) {
        throw 'No Asteroids is running. Quit the game first.'
    }
}

function Replace-Once([string]$text, [string]$find, [string]$with, [string]$what) {
    $i = $text.IndexOf($find)
    if ($i -lt 0 -or $text.IndexOf($find, $i + 1) -ge 0) {
        throw "Can't patch $what - this game version's code differs from what the loader expects. Nothing was changed."
    }
    return $text.Substring(0, $i) + $with + $text.Substring($i + $find.Length)
}

function Get-State($backup) {
    $f = Join-Path $backup 'state.json'
    if (Test-Path $f) { return Get-Content $f -Raw | ConvertFrom-Json }
    return $null
}

$game   = Find-Game
$asar   = Join-Path $game 'resources\app.asar'
$exe    = Find-Exe $game
$mods   = Join-Path $game 'mods'
$backup = Join-Path $mods '_backup'
$state  = Get-State $backup
$current = [NAMods.Asar]::HeaderHash($asar)

Write-Host "Game:  $game"

switch ($Command) {
    'status' {
        if (-not $state) { Write-Host 'Mod loader: not installed.' }
        elseif ($current -eq $state.patchedHash) { Write-Host "Mod loader: installed (v$($state.loaderVersion))." -ForegroundColor Green }
        elseif ($current -eq $state.originalHash) { Write-Host 'Mod loader: not active - game files are original (Steam verify or update?). Run install again.' -ForegroundColor Yellow }
        else { Write-Host 'Mod loader: not active - the game was updated. Run install again.' -ForegroundColor Yellow }
        if (Test-Path $mods) {
            Get-ChildItem $mods -Directory | Where-Object { Test-Path (Join-Path $_.FullName 'mod.json') } | ForEach-Object {
                $m = Get-Content (Join-Path $_.FullName 'mod.json') -Raw | ConvertFrom-Json
                $on = if ($m.enabled -eq $false) { 'off' } else { 'on ' }
                Write-Host ("  [{0}] {1} {2}" -f $on, $m.name, $m.version)
            }
        }
        return
    }

    'uninstall' {
        Assert-Closed
        if (-not $state) { Write-Host 'Mod loader is not installed.'; return }
        if ($current -ne $state.patchedHash) {
            Write-Host 'Game files are not the modded ones (already restored or updated by Steam). Removing backup state only.' -ForegroundColor Yellow
        } else {
            Copy-Item (Join-Path $backup 'app.asar') $asar -Force
            Copy-Item (Join-Path $backup ([IO.Path]::GetFileName($exe))) $exe -Force
            if ([NAMods.Asar]::HeaderHash($asar) -ne $state.originalHash) { throw 'Restore check failed. Use Steam > Properties > Installed Files > Verify integrity.' }
            Write-Host 'Original game files restored.' -ForegroundColor Green
        }
        Remove-Item $backup -Recurse -Force
        Write-Host "Your mods folder was left in place: $mods"
        return
    }

    'install' {
        Assert-Closed
        New-Item -ItemType Directory -Force $backup | Out-Null
        $exeName = [IO.Path]::GetFileName($exe)

        # Decide which files are the originals.
        $needBackup = $true
        if ($state -and $current -eq $state.patchedHash) { $needBackup = $false }           # reinstall/upgrade loader
        elseif ($state -and $current -eq $state.originalHash) { $needBackup = $false }      # Steam verify restored originals
        if ($state -and $needBackup) { Write-Host 'The game was updated since the last install - backing up the new version.' -ForegroundColor Yellow }
        if ([NAMods.Asar]::HasEntry($asar, 'build/web/__modloader.js') -and $needBackup) {
            throw 'These game files are already modded but the backup is missing. Use Steam "Verify integrity of game files", then run install again.'
        }
        if ($needBackup) {
            Write-Host 'Backing up original game files (about 700 MB)...'
            Copy-Item $asar (Join-Path $backup 'app.asar') -Force
            Copy-Item $exe (Join-Path $backup $exeName) -Force
            $origHash = $current
        } else {
            $origHash = $state.originalHash
        }
        $origAsar = Join-Path $backup 'app.asar'
        $origExe  = Join-Path $backup $exeName
        if ([NAMods.Asar]::HeaderHash($origAsar) -ne $origHash) { throw 'Backup does not match the recorded original. Verify game files in Steam, delete mods\_backup, and install again.' }

        Write-Host 'Patching...'
        $utf8 = New-Object Text.UTF8Encoding($false)
        $main = $utf8.GetString([NAMods.Asar]::ReadFile($origAsar, 'build/electron/main.cjs'))
        $html = $utf8.GetString([NAMods.Asar]::ReadFile($origAsar, 'build/web/index.html'))
        $loaderMain = (Get-Content (Join-Path $Here 'loader-main.js') -Raw -Encoding UTF8) -replace "`r`n", "`n"
        $loaderPage = (Get-Content (Join-Path $Here 'loader-page.js') -Raw -Encoding UTF8) -replace "`r`n", "`n"

        $main = Replace-Once $main "`"use strict`";`n" ("`"use strict`";`n" + $loaderMain + "`n") 'main.cjs header'
        # the game's file server: the electron import's name and the line that maps a URL to a file both change between versions
        $el = [regex]::Matches($main, '(import_electron\d*)\.protocol\.handle\("app"')
        $srv = [regex]::Matches($main, '(?m)^    const path = [^\n]*webPath\(pathname\);\n')
        if ($el.Count -ne 1 -or $srv.Count -ne 1) { throw "Can't patch the game file server - this game version's code differs from what the loader expects. Nothing was changed." }
        $main = $main.Insert($srv[0].Index, "    const __modded = await __naMods.handle(req, pathname, webPath, $($el[0].Groups[1].Value).net, import_node_url.pathToFileURL);`n    if (__modded) return __modded;`n")
        $main = Replace-Once $main 'typeof pathname === "string" ? webPath(pathname) : null' 'typeof pathname === "string" ? (__naMods.resolve(pathname) ?? webPath(pathname)) : null' 'file reader'
        $main = Replace-Once $main "  const wc = page;`n" ("  const wc = page;`n" + '  if (__naMods.devtools) wc.on("before-input-event", (_e, i) => { if (i.type === "keyDown" && i.key === "F12") wc.toggleDevTools(); });' + "`n") 'window setup'
        $m = [regex]::Match($html, '<script type="module" crossorigin src="/assets/index-[^"]+"></script>')
        if (-not $m.Success) { throw "Can't patch index.html - unexpected game version. Nothing was changed." }
        $html = $html.Insert($m.Index, '<script src="/__modloader.js"></script>')

        $changes = New-Object Collections.Specialized.OrderedDictionary
        $changes['build/electron/main.cjs']  = $utf8.GetBytes($main)
        $changes['build/web/index.html']     = $utf8.GetBytes($html)
        $changes['build/web/__modloader.js'] = $utf8.GetBytes($loaderPage)

        $tmpAsar = "$asar.modding"
        $tmpExe  = "$exe.modding"
        try {
            $newHash = [NAMods.Asar]::Build($origAsar, $tmpAsar, $changes)
            $hits = [NAMods.Asar]::PatchExeHash($origExe, $tmpExe, $origHash, $newHash)
            if ($hits -ne 1) { throw "Expected the archive hash once in the exe, found it $hits times. Nothing was changed." }
            Move-Item $tmpAsar $asar -Force
            Move-Item $tmpExe $exe -Force
        } finally {
            Remove-Item $tmpAsar, $tmpExe -Force -ErrorAction SilentlyContinue
        }

        [ordered]@{ loaderVersion = $LoaderVersion; originalHash = $origHash; patchedHash = $newHash; exe = $exeName; installed = (Get-Date -Format s) } |
            ConvertTo-Json | Set-Content (Join-Path $backup 'state.json') -Encoding UTF8

        # loader.json (keep the player's existing settings unless -DevTools was passed)
        $cfgPath = Join-Path $mods 'loader.json'
        $cfg = if (Test-Path $cfgPath) { Get-Content $cfgPath -Raw | ConvertFrom-Json } else { [pscustomobject]@{ devtools = $false } }
        if ($DevTools) { $cfg.devtools = $true }
        $cfg | ConvertTo-Json | Set-Content $cfgPath -Encoding UTF8

        if (-not $NoBundledMods) {
            $bundled = Join-Path (Split-Path $Here -Parent) 'mods'
            if (Test-Path $bundled) {
                foreach ($d in Get-ChildItem $bundled -Directory) {
                    $dst = Join-Path $mods $d.Name
                    $wasOff = $false
                    if (Test-Path (Join-Path $dst 'mod.json')) { $wasOff = ((Get-Content (Join-Path $dst 'mod.json') -Raw | ConvertFrom-Json).enabled -eq $false) }
                    $keptSettings = $null   # the player's choices survive a reinstall
                    if (Test-Path (Join-Path $dst 'settings.json')) { $keptSettings = [IO.File]::ReadAllBytes((Join-Path $dst 'settings.json')) }
                    if (Test-Path $dst) { Remove-Item $dst -Recurse -Force }
                    Copy-Item $d.FullName $dst -Recurse
                    if ($keptSettings) { [IO.File]::WriteAllBytes((Join-Path $dst 'settings.json'), $keptSettings) }
                    if ($wasOff) {   # keep a mod the player switched off, off
                        $j = Get-Content (Join-Path $dst 'mod.json') -Raw | ConvertFrom-Json
                        $j | Add-Member -NotePropertyName enabled -NotePropertyValue $false -Force
                        $j | ConvertTo-Json -Depth 10 | Set-Content (Join-Path $dst 'mod.json') -Encoding UTF8
                    }
                    Write-Host "  mod: $($d.Name)"
                }
            }
        }

        Write-Host "Mod loader v$LoaderVersion installed. Mods folder: $mods" -ForegroundColor Green
        if ($cfg.devtools) { Write-Host 'DevTools: press F12 in game.' }
    }
}
