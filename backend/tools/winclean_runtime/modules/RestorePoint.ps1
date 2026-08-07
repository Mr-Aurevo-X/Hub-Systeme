#Requires -Version 5.1
# RestorePoint.ps1 - Point de restauration système

function Enable-WinCleanSystemRestore {
    try {
        Enable-ComputerRestore -Drive "$($env:SystemDrive)\" -ErrorAction SilentlyContinue
    }
    catch { }
}

function New-WinCleanRestorePoint {
    param(
        [string]$Description = "WinClean $(Get-Date -Format 'yyyy-MM-dd HH:mm')"
    )

    Enable-WinCleanSystemRestore

    # Checkpoint-Computer needs admin; description max ~256 chars
    $desc = $Description.Substring(0, [Math]::Min(256, $Description.Length))

    try {
        Checkpoint-Computer -Description $desc -RestorePointType MODIFY_SETTINGS -ErrorAction Stop
        return @{ Success = $true; Message = "Point de restauration créé: $desc" }
    }
    catch {
        # Fallback COM API (sometimes works when Checkpoint-Computer is throttled)
        try {
            $sr = Get-CimInstance -Namespace root/default -ClassName SystemRestore -ErrorAction Stop
            $null = Invoke-CimMethod -InputObject $sr -MethodName CreateRestorePoint -Arguments @{
                Description      = $desc
                RestorePointType = 12
                EventType        = 100
            }
            return @{ Success = $true; Message = "Point de restauration créé (CIM): $desc" }
        }
        catch {
            return @{
                Success = $false
                Message = "Impossible de créer un point de restauration: $($_.Exception.Message). Active la protection système sur C: si besoin."
            }
        }
    }
}
