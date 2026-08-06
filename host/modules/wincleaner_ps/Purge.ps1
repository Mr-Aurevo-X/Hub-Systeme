#Requires -Version 5.1
# Purge.ps1 - Désinstalleur intelligent
# Verdicts:
#   Safe      — exclusif au mot-clé, suppression autorisée (défaut sélectionné)
#   Shared    — zone ambiguë / partagée, confirmation manuelle
#   Protected — SystemGuard, listes protect-paths/keep, exclusions user — jamais auto
# Exclusions utilisateur (lists\user-exclusions.txt) → Protected via SystemGuard + skip purge.

function Get-WinCleanProtectPatterns {
    param([string]$BaseDir = $Global:WinCleanRoot)
    if (-not $BaseDir) { $BaseDir = Get-WinCleanBaseDir }
    $file = Join-Path $BaseDir 'lists\protect-paths.txt'
    $patterns = @(Read-WinCleanListFile $file)
    $keep = Join-Path $BaseDir 'lists\keep-apps.txt'
    $patterns += @(Read-WinCleanListFile $keep)
    $patterns += @(Get-WinCleanUserExclusions -BaseDir $BaseDir)
    return @($patterns | Select-Object -Unique)
}

function Test-WinCleanSystemGuard {
    param(
        [string]$Path = $null,
        [string]$Name = $null,
        [string]$ProcessName = $null,
        [string]$BaseDir = $Global:WinCleanRoot
    )

    $criticalProcs = @(
        'csrss', 'lsass', 'services', 'winlogon', 'smss', 'svchost', 'System',
        'explorer', 'fontdrvhost', 'dwm', 'RuntimeBroker', 'SearchHost',
        'StartMenuExperienceHost', 'SystemSettings', 'SecurityHealthService',
        'MsMpEng', 'NisSrv', 'Idle'
    )
    if ($ProcessName) {
        $pn = ($ProcessName -replace '\.exe$', '')
        if ($criticalProcs -contains $pn) {
            return @{ Blocked = $true; Reason = "Processus critique Windows ($pn)" }
        }
    }

    $patterns = Get-WinCleanProtectPatterns -BaseDir $BaseDir
    $check = @()
    if ($Path) { $check += $Path }
    if ($Name) { $check += $Name }
    if ($ProcessName) { $check += $ProcessName }

    foreach ($c in $check) {
        if ([string]::IsNullOrWhiteSpace($c)) { continue }
        $full = $c
        try {
            if ($Path -and (Test-Path -LiteralPath $Path)) {
                $full = [IO.Path]::GetFullPath($Path)
            }
        } catch { }

        # Hub containers (exact-ish)
        $hubs = @(
            $env:USERPROFILE
            $env:LOCALAPPDATA
            $env:APPDATA
            $env:ProgramData
            ${env:ProgramFiles}
            ${env:ProgramFiles(x86)}
            $env:WINDIR
            (Join-Path $env:USERPROFILE 'AppData')
        ) | Where-Object { $_ }
        foreach ($h in $hubs) {
            try {
                $hn = [IO.Path]::GetFullPath($h).TrimEnd('\')
                $fn = $full.TrimEnd('\')
                if ($fn -eq $hn) {
                    return @{ Blocked = $true; Reason = 'Conteneur système / profil (hub) - interdit' }
                }
            } catch { }
        }

        # Drive roots
        if ($full -match '^[A-Za-z]:\\?$') {
            return @{ Blocked = $true; Reason = 'Racine de lecteur - interdit' }
        }

        foreach ($p in $patterns) {
            if ($full -like "*$p*" -or ($Name -and $Name -like "*$p*") -or ($ProcessName -and $ProcessName -like "*$p*")) {
                # Allow dedicated child folders under AppData that only match keep for unrelated names
                if ($p -match '^(Steam|Epic|Discord|NVIDIA|AMD|Docker)$' -and $Name -and $Name -notlike "*$p*") {
                    continue
                }
                return @{ Blocked = $true; Reason = "Protégé (liste / OS) : $p" }
            }
        }

        if ($full -match '(?i)\\Windows(\\|$)' -or $full -match '(?i)\\System32(\\|$)' -or $full -match '(?i)\\WinSxS(\\|$)') {
            return @{ Blocked = $true; Reason = 'Dossier Windows critique' }
        }
    }

    return @{ Blocked = $false; Reason = '' }
}

# Get-WinCleanPathSizeBytes : Core.ps1

function Resolve-WinCleanLnkTarget {
    param([string]$LnkPath)
    try {
        $sh = New-Object -ComObject WScript.Shell
        $sc = $sh.CreateShortcut($LnkPath)
        return [string]$sc.TargetPath
    }
    catch { return $null }
}

function Get-WinCleanHitVerdict {
    param(
        [string]$Keyword,
        [string]$Kind,
        [string]$Name,
        [string]$Path,
        [string]$BaseDir = $Global:WinCleanRoot
    )

    $kw = $Keyword.Trim()
    $guard = Test-WinCleanSystemGuard -Path $Path -Name $Name -BaseDir $BaseDir
    if ($guard.Blocked) {
        return @{ Verdict = 'Protected'; Reason = $guard.Reason; Confidence = 0; Selected = $false }
    }

    if ($kw.Length -lt 3) {
        return @{ Verdict = 'Shared'; Reason = 'Mot-clé trop court - prudence'; Confidence = 40; Selected = $false }
    }

    $nameOk = $Name -and ($Name -like "*$kw*")
    $pathOk = $Path -and ($Path -like "*$kw*")
    $leaf = if ($Path) { Split-Path $Path -Leaf } else { '' }
    $leafExact = $leaf -and ($leaf -eq $kw -or $leaf -like "$kw*" -or $leaf -like "*$kw")

    $sharedHints = @(
        'Common Files', 'Microsoft Shared', 'dotnet', 'Microsoft.NET',
        'WindowsApps', 'Package Cache', 'Installer', 'Temp\Win'
    )
    foreach ($h in $sharedHints) {
        if ($Path -like "*$h*") {
            return @{ Verdict = 'Shared'; Reason = "Zone partagée ($h)"; Confidence = 45; Selected = $false }
        }
    }

    # Sibling check: parent has other dirs not matching keyword
    if ($Path -and (Test-Path -LiteralPath $Path)) {
        try {
            $parent = Split-Path $Path -Parent
            if ($parent -and (Test-Path -LiteralPath $parent)) {
                $siblings = @(Get-ChildItem -LiteralPath $parent -Directory -Force -ErrorAction SilentlyContinue |
                    Where-Object { $_.Name -notlike "*$kw*" -and $_.FullName -ne $Path })
                $parentLeaf = Split-Path $parent -Leaf
                $parentIsHub = $parentLeaf -match '^(AppData|Local|Roaming|LocalLow|Programs|Program Files|Program Files \(x86\)|ProgramData)$'
                if ($siblings.Count -gt 0 -and -not $leafExact -and -not $parentIsHub) {
                    # under a non-hub parent with unrelated siblings → shared-ish unless leaf exact
                    if (-not $leafExact) {
                        return @{
                            Verdict    = 'Shared'
                            Reason     = 'Dossier voisin d''autres apps (pas exclusif)'
                            Confidence = 50
                            Selected   = $false
                        }
                    }
                }
            }
        } catch { }
    }

    $dedicatedRoots = @(
        $env:LOCALAPPDATA
        $env:APPDATA
        (Join-Path $env:USERPROFILE 'AppData\LocalLow')
        ${env:ProgramFiles}
        ${env:ProgramFiles(x86)}
        [Environment]::GetFolderPath('Desktop')
        [Environment]::GetFolderPath('StartMenu')
        (Join-Path $env:ProgramData 'Microsoft\Windows\Start Menu')
    ) | Where-Object { $_ }

    $underDedicated = $false
    foreach ($r in $dedicatedRoots) {
        if ($Path -and $Path.StartsWith($r, [StringComparison]::OrdinalIgnoreCase)) {
            $underDedicated = $true
            break
        }
    }

    if ($Kind -eq 'Process') {
        if ($pathOk -or $nameOk) {
            return @{ Verdict = 'Safe'; Reason = 'Processus lié au mot-clé (hors critiques)'; Confidence = 80; Selected = $true }
        }
        return @{ Verdict = 'Shared'; Reason = 'Processus ambigu'; Confidence = 40; Selected = $false }
    }

    if ($Kind -in @('Uninstall', 'AppX')) {
        if ($nameOk -and ($pathOk -or -not $Path)) {
            return @{ Verdict = 'Safe'; Reason = 'Programme / package nommé explicitement'; Confidence = 90; Selected = $true }
        }
        if ($nameOk) {
            return @{ Verdict = 'Safe'; Reason = 'Entrée désinstall nommée'; Confidence = 85; Selected = $true }
        }
    }

    if ($Kind -eq 'Shortcut') {
        if ($nameOk -or $pathOk) {
            return @{ Verdict = 'Safe'; Reason = 'Raccourci dédié'; Confidence = 85; Selected = $true }
        }
    }

    if ($Kind -eq 'Folder' -or $Kind -eq 'File') {
        if ($leafExact -and $underDedicated) {
            return @{ Verdict = 'Safe'; Reason = "Dossier/fichier exclusif ($leaf)"; Confidence = 95; Selected = $true }
        }
        if ($pathOk -and $underDedicated -and $nameOk) {
            return @{ Verdict = 'Safe'; Reason = 'Chemin AppData/Program Files dédié'; Confidence = 80; Selected = $true }
        }
        if ($pathOk -or $nameOk) {
            return @{ Verdict = 'Shared'; Reason = 'Correspondance partielle - vérifier'; Confidence = 55; Selected = $false }
        }
    }

    return @{ Verdict = 'Shared'; Reason = 'Ambigu - non coché'; Confidence = 35; Selected = $false }
}

function Find-WinCleanInstalledApps {
    param(
        [Parameter(Mandatory)][string]$Keyword,
        [string]$BaseDir = $Global:WinCleanRoot
    )

    $kw = $Keyword.Trim()
    $apps = @()

    $uninstallRoots = @(
        'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall'
        'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall'
        'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall'
    )

    foreach ($root in $uninstallRoots) {
        if (-not (Test-Path $root)) { continue }
        Get-ChildItem -LiteralPath $root -ErrorAction SilentlyContinue | ForEach-Object {
            try {
                $p = Get-ItemProperty -LiteralPath $_.PSPath -ErrorAction Stop
                $dn = [string]$p.DisplayName
                if (-not $dn -or $dn -notlike "*$kw*") { return }
                $loc = [string]$p.InstallLocation
                $quiet = [string]$p.QuietUninstallString
                $uninst = if ($quiet) { $quiet } else { [string]$p.UninstallString }
                $bytes = 0L
                if ($p.EstimatedSize) { $bytes = [long]$p.EstimatedSize * 1KB }
                elseif ($loc) { $bytes = Get-WinCleanPathSizeBytes $loc }

                $v = Get-WinCleanHitVerdict -Keyword $kw -Kind 'Uninstall' -Name $dn -Path $loc -BaseDir $BaseDir
                $apps += [PSCustomObject]@{
                    Selected        = [bool]$v.Selected
                    Verdict         = $v.Verdict
                    Reason          = $v.Reason
                    Kind            = 'Uninstall'
                    Name            = $dn
                    Version         = [string]$p.DisplayVersion
                    Publisher       = [string]$p.Publisher
                    Path            = $loc
                    UninstallString = $uninst
                    Bytes           = $bytes
                    SizeText        = (Format-WinCleanSize $bytes)
                    PackageFullName = $null
                }
            }
            catch { }
        }
    }

    try {
        $pkgs = @()
        try { $pkgs += Get-AppxPackage -ErrorAction SilentlyContinue } catch { }
        try { $pkgs += Get-AppxPackage -AllUsers -ErrorAction SilentlyContinue } catch { }
        $pkgs | Where-Object { $_.Name -like "*$kw*" -or $_.PackageFullName -like "*$kw*" } |
            Sort-Object PackageFullName -Unique |
            ForEach-Object {
                $v = Get-WinCleanHitVerdict -Keyword $kw -Kind 'AppX' -Name $_.Name -Path $_.InstallLocation -BaseDir $BaseDir
                $bytes = Get-WinCleanPathSizeBytes $_.InstallLocation
                $apps += [PSCustomObject]@{
                    Selected        = [bool]$v.Selected
                    Verdict         = $v.Verdict
                    Reason          = $v.Reason
                    Kind            = 'AppX'
                    Name            = $_.Name
                    Version         = [string]$_.Version
                    Publisher       = [string]$_.Publisher
                    Path            = $_.InstallLocation
                    UninstallString = $null
                    Bytes           = $bytes
                    SizeText        = (Format-WinCleanSize $bytes)
                    PackageFullName = $_.PackageFullName
                }
            }
    }
    catch { }

    return @($apps | Sort-Object Verdict, Name)
}

function Find-WinCleanLeftovers {
    param(
        [Parameter(Mandatory)][string]$Keyword,
        [string[]]$InstallLocations = @(),
        [string]$BaseDir = $Global:WinCleanRoot,
        [int]$TimeoutSec = 40
    )

    $kw = $Keyword.Trim()
    $hits = New-Object System.Collections.Generic.List[object]
    $seen = @{}
    $sw = [Diagnostics.Stopwatch]::StartNew()

    function Add-Hit {
        param($Kind, $Name, $Path, $Extra = '')
        if (-not $Path -and -not $Name) { return }
        $key = "$Kind|$Path|$Name"
        if ($seen.ContainsKey($key)) { return }
        $seen[$key] = $true
        $bytes = if ($Path -and (Test-Path -LiteralPath $Path)) { Get-WinCleanPathSizeBytes $Path } else { 0L }
        $v = Get-WinCleanHitVerdict -Keyword $kw -Kind $Kind -Name $Name -Path $Path -BaseDir $BaseDir
        $hits.Add([PSCustomObject]@{
            Selected = [bool]$v.Selected
            Verdict  = $v.Verdict
            Reason   = $v.Reason
            Kind     = $Kind
            Name     = $Name
            Path     = $Path
            Bytes    = $bytes
            SizeText = (Format-WinCleanSize $bytes)
            Extra    = $Extra
        })
    }

    $roots = @(
        $env:LOCALAPPDATA
        $env:APPDATA
        (Join-Path $env:USERPROFILE 'AppData\LocalLow')
        $env:ProgramData
        ${env:ProgramFiles}
        ${env:ProgramFiles(x86)}
        (Join-Path $env:USERPROFILE 'Downloads')
        (Join-Path $env:USERPROFILE 'Documents')
        [Environment]::GetFolderPath('Desktop')
    ) | Where-Object { $_ -and (Test-Path -LiteralPath $_) }

    foreach ($loc in $InstallLocations) {
        if ($loc -and (Test-Path -LiteralPath $loc)) {
            Add-Hit -Kind 'Folder' -Name (Split-Path $loc -Leaf) -Path $loc -Extra 'InstallLocation'
        }
    }

    foreach ($root in $roots) {
        if ($sw.Elapsed.TotalSeconds -gt $TimeoutSec) { break }
        try {
            # Depth 1-2: direct children matching keyword
            Get-ChildItem -LiteralPath $root -Force -ErrorAction SilentlyContinue |
                Where-Object { $_.Name -like "*$kw*" } |
                ForEach-Object {
                    $kind = if ($_.PSIsContainer) { 'Folder' } else { 'File' }
                    Add-Hit -Kind $kind -Name $_.Name -Path $_.FullName
                }

            # One level deeper for AppData-style
            Get-ChildItem -LiteralPath $root -Directory -Force -ErrorAction SilentlyContinue |
                ForEach-Object {
                    if ($sw.Elapsed.TotalSeconds -gt $TimeoutSec) { return }
                    Get-ChildItem -LiteralPath $_.FullName -Force -ErrorAction SilentlyContinue |
                        Where-Object { $_.Name -like "*$kw*" } |
                        ForEach-Object {
                            $kind = if ($_.PSIsContainer) { 'Folder' } else { 'File' }
                            Add-Hit -Kind $kind -Name $_.Name -Path $_.FullName
                        }
                }
        }
        catch { }
    }

    # Shortcuts
    $lnkDirs = @(
        [Environment]::GetFolderPath('Desktop')
        [Environment]::GetFolderPath('StartMenu')
        (Join-Path $env:ProgramData 'Microsoft\Windows\Start Menu\Programs')
        (Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs')
    ) | Where-Object { $_ -and (Test-Path -LiteralPath $_) }

    foreach ($ld in $lnkDirs) {
        Get-ChildItem -LiteralPath $ld -Recurse -Filter '*.lnk' -Force -ErrorAction SilentlyContinue |
            ForEach-Object {
                $target = Resolve-WinCleanLnkTarget $_.FullName
                if ($_.BaseName -like "*$kw*" -or ($target -and $target -like "*$kw*")) {
                    Add-Hit -Kind 'Shortcut' -Name $_.Name -Path $_.FullName -Extra $target
                }
            }
    }

    # Processes
    Get-Process -ErrorAction SilentlyContinue |
        Where-Object { $_.ProcessName -like "*$kw*" } |
        ForEach-Object {
            $ppath = $null
            try { $ppath = $_.Path } catch { }
            $g = Test-WinCleanSystemGuard -ProcessName $_.ProcessName -Path $ppath -BaseDir $BaseDir
            if ($g.Blocked) {
                $hits.Add([PSCustomObject]@{
                    Selected = $false
                    Verdict  = 'Protected'
                    Reason   = $g.Reason
                    Kind     = 'Process'
                    Name     = $_.ProcessName
                    Path     = $ppath
                    Bytes    = 0L
                    SizeText = '-'
                    Extra    = "PID $($_.Id)"
                })
            }
            else {
                Add-Hit -Kind 'Process' -Name $_.ProcessName -Path $ppath -Extra "PID $($_.Id)"
            }
        }

    return @($hits | Sort-Object @{ Expression = {
        switch ($_.Verdict) { 'Safe' { 0 } 'Shared' { 1 } default { 2 } }
    } }, Name)
}

function Invoke-WinCleanOfficialUninstall {
    param(
        [Parameter(Mandatory)]$App,
        [string]$LogPath,
        [string]$BaseDir = $Global:WinCleanRoot
    )

    $guard = Test-WinCleanSystemGuard -Path $App.Path -Name $App.Name -BaseDir $BaseDir
    if ($guard.Blocked -or $App.Verdict -eq 'Protected') {
        Write-WinCleanLog -Message "Uninstall BLOQUÉ (Protected): $($App.Name) - $($guard.Reason)" -LogPath $LogPath -Level WARN
        return @{ Success = $false; Message = "Protégé - désinstall refusée: $($App.Name)" }
    }

    Write-WinCleanLog -Message "=== Désinstall officiel: $($App.Name) ($($App.Kind)) ===" -LogPath $LogPath

    try {
        if ($App.Kind -eq 'AppX' -and $App.PackageFullName) {
            Remove-AppxPackage -Package $App.PackageFullName -ErrorAction Stop
            try { Remove-AppxPackage -Package $App.PackageFullName -AllUsers -ErrorAction SilentlyContinue } catch { }
            Write-WinCleanLog -Message "AppX retiré: $($App.PackageFullName)" -LogPath $LogPath -Level OK
            return @{ Success = $true; Message = "AppX désinstallé: $($App.Name)" }
        }

        if ($App.Kind -eq 'Uninstall' -and $App.UninstallString) {
            $cmd = $App.UninstallString.Trim()
            # msiexec
            if ($cmd -match '(?i)msiexec') {
                if ($cmd -notmatch '/quiet|/qn') {
                    if ($cmd -match '/I\{') { $cmd = $cmd -replace '/I', '/X' }
                    $cmd = "$cmd /qn /norestart"
                }
            }
            Write-WinCleanLog -Message "Lancement: $cmd" -LogPath $LogPath
            if ($cmd.StartsWith('"')) {
                $exe = $cmd -replace '^"([^"]+)".*', '$1'
                $args = ($cmd.Substring($exe.Length + 2)).Trim()
                Start-Process -FilePath $exe -ArgumentList $args -Wait -NoNewWindow -ErrorAction Stop
            }
            else {
                $parts = $cmd -split '\s+', 2
                if ($parts.Count -gt 1) {
                    Start-Process -FilePath $parts[0] -ArgumentList $parts[1] -Wait -NoNewWindow -ErrorAction Stop
                }
                else {
                    Start-Process -FilePath $parts[0] -Wait -NoNewWindow -ErrorAction Stop
                }
            }
            Write-WinCleanLog -Message "Désinstall terminée: $($App.Name)" -LogPath $LogPath -Level OK
            return @{ Success = $true; Message = "Désinstall officiel lancé: $($App.Name)" }
        }

        return @{ Success = $false; Message = ("Pas de desinstalleur officiel pour {0} - utilise Purger restes." -f $App.Name) }
    }
    catch {
        Write-WinCleanLog -Message "Uninstall échec: $($_.Exception.Message)" -LogPath $LogPath -Level ERROR
        return @{ Success = $false; Message = $_.Exception.Message }
    }
}

function Remove-WinCleanLeftoverHits {
    param(
        [object[]]$Hits,
        [string]$LogPath,
        [string]$BaseDir = $Global:WinCleanRoot,
        [switch]$KillProcesses
    )

    $removed = 0
    $skipped = 0
    $failed = 0
    $undo = @(
        "# WinClean leftover purge - $(Get-Date -Format o)"
        '# Les fichiers/dossiers listés ont été retirés (restauration manuelle si backup).'
        ''
    )

    foreach ($h in $Hits) {
        if (-not $h.Selected) { continue }

        if ($h.Path -and (Test-WinCleanPathExcluded -Path $h.Path -BaseDir $BaseDir)) {
            Write-WinCleanLog -Message "SKIP exclusion user: $($h.Path)" -LogPath $LogPath -Level SKIP
            $skipped++
            continue
        }

        $guard = Test-WinCleanSystemGuard -Path $h.Path -Name $h.Name -ProcessName $(if ($h.Kind -eq 'Process') { $h.Name } else { $null }) -BaseDir $BaseDir
        if ($guard.Blocked -or $h.Verdict -eq 'Protected') {
            Write-WinCleanLog -Message "SKIP Protected: $($h.Name) - $($guard.Reason)" -LogPath $LogPath -Level WARN
            $skipped++
            continue
        }

        try {
            if ($h.Kind -eq 'Process') {
                if (-not $KillProcesses) {
                    Write-WinCleanLog -Message "Process ignoré (option off): $($h.Name)" -LogPath $LogPath -Level SKIP
                    $skipped++
                    continue
                }
                Get-Process -Name $h.Name -ErrorAction SilentlyContinue | ForEach-Object {
                    Stop-Process -Id $_.Id -Force -ErrorAction Stop
                    Write-WinCleanLog -Message "Process stoppé: $($h.Name) PID $($_.Id)" -LogPath $LogPath -Level OK
                }
                $removed++
                continue
            }

            if ($h.Path -and (Test-Path -LiteralPath $h.Path)) {
                $undo += "# $($h.Kind) $($h.Path)"
                $r = Remove-WinCleanItemSafe -Path $h.Path -LogPath $LogPath
                if ($r.Ok) {
                    $removed++
                    Write-WinCleanLog -Message "Supprimé ($($h.Verdict)): $($h.Path)" -LogPath $LogPath -Level OK
                }
                else {
                    $failed++
                }
            }
            else {
                $skipped++
            }
        }
        catch {
            $failed++
            Write-WinCleanLog -Message "Échec $($h.Name): $($_.Exception.Message)" -LogPath $LogPath -Level WARN
        }
    }

    if ($removed -gt 0) {
        $logs = Join-Path $BaseDir 'logs'
        if (-not (Test-Path $logs)) { New-Item -ItemType Directory -Path $logs -Force | Out-Null }
        $undoPath = Join-Path $logs ("undo-purge-{0}.txt" -f (Get-Date -Format 'yyyyMMdd_HHmmss'))
        $undo | Set-Content -LiteralPath $undoPath -Encoding UTF8
        Write-WinCleanLog -Message "Trace purge: $undoPath" -LogPath $LogPath
    }

    return @{ Removed = $removed; Skipped = $skipped; Failed = $failed }
}
