#Requires -Version 5.1
# Debloat.Apps.ps1 - Désinstallation AppX bloat

function Read-WinCleanListFile {
    param([string]$Path)
    if (-not (Test-Path -LiteralPath $Path)) { return @() }
    Get-Content -LiteralPath $Path -Encoding UTF8 |
        ForEach-Object { $_.Trim() } |
        Where-Object { $_ -and -not $_.StartsWith('#') }
}

function Test-WinCleanKeepPackage {
    param(
        [string]$PackageName,
        [string[]]$KeepPatterns
    )
    foreach ($k in $KeepPatterns) {
        if ($PackageName -like "*$k*") { return $true }
    }
    return $false
}

function Test-WinCleanBloatPackage {
    param(
        [string]$PackageName,
        [string[]]$BloatPatterns
    )
    foreach ($b in $BloatPatterns) {
        if ($PackageName -like "*$b*") { return $true }
    }
    return $false
}

function Get-WinCleanBloatApps {
    param(
        [string]$BaseDir = $Global:WinCleanRoot
    )

    $bloatFile = Join-Path $BaseDir 'lists\bloat-apps.txt'
    $keepFile = Join-Path $BaseDir 'lists\keep-apps.txt'
    $bloatPatterns = @(Read-WinCleanListFile $bloatFile)
    $keepPatterns = @(Read-WinCleanListFile $keepFile)

    $found = @()

    # Installed for current user / all users
    $packages = @()
    try { $packages += Get-AppxPackage -AllUsers -ErrorAction SilentlyContinue } catch { }
    try { $packages += Get-AppxPackage -ErrorAction SilentlyContinue } catch { }

    $packages = $packages | Sort-Object -Property PackageFullName -Unique

    foreach ($pkg in $packages) {
        $name = $pkg.Name
        if (Test-WinCleanKeepPackage -PackageName $name -KeepPatterns $keepPatterns) { continue }
        if (-not (Test-WinCleanBloatPackage -PackageName $name -BloatPatterns $bloatPatterns)) { continue }

        $size = 0L
        try {
            if ($pkg.InstallLocation -and (Test-Path -LiteralPath $pkg.InstallLocation)) {
                $size = [long]((Get-ChildItem -LiteralPath $pkg.InstallLocation -Recurse -Force -ErrorAction SilentlyContinue |
                        Where-Object { -not $_.PSIsContainer } |
                        Measure-Object -Property Length -Sum).Sum)
            }
        }
        catch { }

        $found += [pscustomobject]@{
            Name             = $name
            PackageFullName  = $pkg.PackageFullName
            Publisher        = $pkg.Publisher
            Version          = $pkg.Version.ToString()
            InstallLocation  = $pkg.InstallLocation
            ApproxBytes      = $size
            ApproxSizeText   = (Format-WinCleanSize $size)
            Provisioned      = $false
            Selected         = $true
        }
    }

    # Provisioned packages
    try {
        $prov = Get-AppxProvisionedPackage -Online -ErrorAction SilentlyContinue
        foreach ($p in $prov) {
            $name = $p.DisplayName
            if (Test-WinCleanKeepPackage -PackageName $name -KeepPatterns $keepPatterns) { continue }
            if (-not (Test-WinCleanBloatPackage -PackageName $name -BloatPatterns $bloatPatterns)) { continue }
            if ($found | Where-Object { $_.Name -eq $name }) {
                ($found | Where-Object { $_.Name -eq $name }).Provisioned = $true
                continue
            }
            $found += [pscustomobject]@{
                Name            = $name
                PackageFullName = $p.PackageName
                Publisher       = ''
                Version         = $p.Version
                InstallLocation = ''
                ApproxBytes     = 0L
                ApproxSizeText  = '-'
                Provisioned     = $true
                Selected        = $true
            }
        }
    }
    catch { }

    return $found | Sort-Object Name
}

function Remove-WinCleanBloatApps {
    param(
        [object[]]$Apps,
        [string]$LogPath,
        [string]$BaseDir = $Global:WinCleanRoot
    )

    $removed = 0
    $failed = 0

    foreach ($app in $Apps) {
        if (-not $app.Selected) { continue }
        Write-WinCleanLog -Message "Debloat: $($app.Name)" -LogPath $LogPath

        # Remove installed packages
        try {
            Get-AppxPackage -AllUsers -Name $app.Name -ErrorAction SilentlyContinue | ForEach-Object {
                Remove-AppxPackage -Package $_.PackageFullName -AllUsers -ErrorAction SilentlyContinue
            }
            Get-AppxPackage -Name $app.Name -ErrorAction SilentlyContinue | ForEach-Object {
                Remove-AppxPackage -Package $_.PackageFullName -ErrorAction Stop
            }
            Write-WinCleanLog -Message "AppX retiré: $($app.Name)" -LogPath $LogPath -Level OK
            $removed++
        }
        catch {
            Write-WinCleanLog -Message "AppX échec $($app.Name): $($_.Exception.Message)" -LogPath $LogPath -Level WARN
            $failed++
        }

        # Remove provisioned
        try {
            Get-AppxProvisionedPackage -Online -ErrorAction SilentlyContinue |
                Where-Object { $_.DisplayName -eq $app.Name -or $_.PackageName -like "*$($app.Name)*" } |
                ForEach-Object {
                    Remove-AppxProvisionedPackage -Online -PackageName $_.PackageName -ErrorAction SilentlyContinue |
                        Out-Null
                    Write-WinCleanLog -Message "Provisioned retiré: $($_.DisplayName)" -LogPath $LogPath -Level OK
                }
        }
        catch {
            Write-WinCleanLog -Message "Provisioned échec $($app.Name): $($_.Exception.Message)" -LogPath $LogPath -Level WARN
        }
    }

    # Write undo hint
    try {
        $undo = Join-Path $BaseDir ("logs\undo-apps-{0}.txt" -f (Get-Date -Format 'yyyyMMdd_HHmmss'))
        $Apps | Where-Object Selected | ForEach-Object {
            "winget install --id (rechercher Store) OR Get-AppxPackage - pour: $($_.Name)"
        } | Set-Content -LiteralPath $undo -Encoding UTF8
        Write-WinCleanLog -Message "Liste undo apps: $undo" -LogPath $LogPath
    }
    catch { }

    return @{ Removed = $removed; Failed = $failed }
}
