#Requires -Version 5.1
# Cleanup.Categories.ps1 - Définition des zones de nettoyage
# Root / BaseDir : Core.ps1

function Get-WinCleanCategories {
    $localApp = $env:LOCALAPPDATA
    $userTemp = $env:TEMP
    $win = $env:WINDIR
    $userProfile = $env:USERPROFILE

    $browserCaches = @(
        @{ Name = 'Chrome'; Path = Join-Path $localApp 'Google\Chrome\User Data\Default\Cache' }
        @{ Name = 'ChromeCode'; Path = Join-Path $localApp 'Google\Chrome\User Data\Default\Code Cache' }
        @{ Name = 'ChromeGPU'; Path = Join-Path $localApp 'Google\Chrome\User Data\Default\GPUCache' }
        @{ Name = 'Edge'; Path = Join-Path $localApp 'Microsoft\Edge\User Data\Default\Cache' }
        @{ Name = 'EdgeCode'; Path = Join-Path $localApp 'Microsoft\Edge\User Data\Default\Code Cache' }
        @{ Name = 'EdgeGPU'; Path = Join-Path $localApp 'Microsoft\Edge\User Data\Default\GPUCache' }
        @{ Name = 'Brave'; Path = Join-Path $localApp 'BraveSoftware\Brave-Browser\User Data\Default\Cache' }
        @{ Name = 'Firefox'; Path = Join-Path $localApp 'Mozilla\Firefox\Profiles' ; Pattern = 'cache2' }
        @{ Name = 'LibreWolf'; Path = Join-Path $localApp 'librewolf\Profiles' ; Pattern = 'cache2' }
    )

    $nvidia = @(
        Join-Path $localApp 'NVIDIA\DXCache'
        Join-Path $localApp 'NVIDIA\GLCache'
        Join-Path $localApp 'NVIDIA Corporation\NV_Cache'
    )
    $amd = @(
        Join-Path $localApp 'AMD\DxCache'
        Join-Path $userProfile 'AppData\Local\AMD\DxCache'
    )

    return [ordered]@{
        UserTemp = @{
            Id          = 'UserTemp'
            Label       = 'Temp utilisateur'
            Description = '%TEMP% et Local\Temp'
            Paths       = @($userTemp, (Join-Path $localApp 'Temp')) | Select-Object -Unique
            NeedsAdmin  = $false
            DefaultOn   = $true
            Profiles    = @('Light', 'Gaming', 'Max')
        }
        SystemTemp = @{
            Id          = 'SystemTemp'
            Label       = 'Temp système'
            Description = 'C:\Windows\Temp'
            Paths       = @(Join-Path $win 'Temp')
            NeedsAdmin  = $true
            DefaultOn   = $true
            Profiles    = @('Light', 'Gaming', 'Max')
        }
        RecycleBin = @{
            Id          = 'RecycleBin'
            Label       = 'Corbeille'
            Description = 'Tous les lecteurs'
            Paths       = @('SPECIAL:RecycleBin')
            NeedsAdmin  = $false
            DefaultOn   = $true
            Profiles    = @('Light', 'Gaming', 'Max')
        }
        BrowserCache = @{
            Id          = 'BrowserCache'
            Label       = 'Caches navigateurs'
            Description = 'Chrome / Edge / Firefox / Brave / LibreWolf (cache seulement)'
            Paths       = $browserCaches
            NeedsAdmin  = $false
            DefaultOn   = $true
            Profiles    = @('Light', 'Gaming', 'Max')
        }
        WindowsUpdate = @{
            Id          = 'WindowsUpdate'
            Label       = 'Cache Windows Update'
            Description = 'SoftwareDistribution\Download'
            Paths       = @(Join-Path $win 'SoftwareDistribution\Download')
            NeedsAdmin  = $true
            DefaultOn   = $true
            StopService = 'wuauserv'
            Profiles    = @('Gaming', 'Max')
        }
        DeliveryOpt = @{
            Id          = 'DeliveryOpt'
            Label       = 'Delivery Optimization'
            Description = 'Cache Do'
            Paths       = @(Join-Path $win 'SoftwareDistribution\DeliveryOptimization')
            NeedsAdmin  = $true
            DefaultOn   = $true
            Profiles    = @('Gaming', 'Max')
        }
        Thumbnails = @{
            Id          = 'Thumbnails'
            Label       = 'Miniatures / icônes'
            Description = 'thumbcache + IconCache'
            Paths       = @(
                Join-Path $localApp 'Microsoft\Windows\Explorer'
                Join-Path $localApp 'IconCache.db'
            )
            FilePatterns = @('thumbcache_*.db', 'IconCache.db')
            NeedsAdmin   = $false
            DefaultOn    = $true
            Profiles     = @('Gaming', 'Max')
            TracesOnly   = $true
        }
        Prefetch = @{
            Id          = 'Prefetch'
            Label       = 'Prefetch'
            Description = 'C:\Windows\Prefetch'
            Paths       = @(Join-Path $win 'Prefetch')
            NeedsAdmin  = $true
            DefaultOn   = $true
            Profiles    = @('Max')
            TracesOnly  = $true
        }
        CrashDumps = @{
            Id          = 'CrashDumps'
            Label       = 'Dumps / rapports d''erreur'
            Description = 'CrashDumps, minidumps, WER ReportQueue'
            Paths       = @(
                Join-Path $localApp 'CrashDumps'
                Join-Path $win 'Minidump'
                Join-Path $win 'LiveKernelReports'
                Join-Path $localApp 'Microsoft\Windows\WER\ReportQueue'
                Join-Path $localApp 'Microsoft\Windows\WER\ReportArchive'
            )
            NeedsAdmin = $true
            DefaultOn  = $true
            Profiles   = @('Gaming', 'Max')
        }
        GpuCache = @{
            Id          = 'GpuCache'
            Label       = 'Caches GPU (NVIDIA/AMD)'
            Description = 'DXCache / shader caches'
            Paths       = @($nvidia + $amd)
            NeedsAdmin  = $false
            DefaultOn   = $true
            Profiles    = @('Gaming', 'Max')
        }
        AppCaches = @{
            Id          = 'AppCaches'
            Label       = 'Caches apps (Discord/Steam/Spotify/Teams)'
            Description = 'Caches navigateur des apps — pas les données hors-ligne'
            Paths       = @(
                @{ Name = 'DiscordCache'; Path = Join-Path $env:APPDATA 'discord\Cache' }
                @{ Name = 'DiscordCode';  Path = Join-Path $env:APPDATA 'discord\Code Cache' }
                @{ Name = 'DiscordGPU';   Path = Join-Path $env:APPDATA 'discord\GPUCache' }
                @{ Name = 'SteamHtml';    Path = Join-Path $localApp 'Steam\htmlcache' }
                @{ Name = 'SteamHttp';    Path = Join-Path $localApp 'Steam\appcache\httpcache' }
                @{ Name = 'SpotifyCache'; Path = Join-Path $localApp 'Spotify\Browser' }
                @{ Name = 'SpotifyDataCache'; Path = Join-Path $localApp 'Spotify\Data\Cache' }
                @{ Name = 'TeamsCache';  Path = Join-Path $env:APPDATA 'Microsoft\Teams\Cache' }
                @{ Name = 'TeamsGPU';    Path = Join-Path $env:APPDATA 'Microsoft\Teams\GPUCache' }
                @{ Name = 'TeamsCode';   Path = Join-Path $env:APPDATA 'Microsoft\Teams\Code Cache' }
            )
            NeedsAdmin  = $false
            DefaultOn   = $false
            Profiles    = @('Max')
        }
        DownloadsOld = @{
            Id          = 'DownloadsOld'
            Label       = 'Téléchargements anciens (>30 j)'
            Description = 'Fichiers dans Downloads plus vieux que 30 jours (opt-in)'
            Paths       = @(Join-Path $userProfile 'Downloads')
            MaxAgeDays  = 30
            NeedsAdmin  = $false
            DefaultOn   = $false
            Profiles    = @()
            ConfirmStrong = $true
        }
        WindowsLogs = @{
            Id          = 'WindowsLogs'
            Label       = 'Logs Windows (fichiers)'
            Description = 'Fichiers .log dans Windows\Logs (non verrouillés)'
            Paths       = @(Join-Path $win 'Logs')
            FilePatterns = @('*.log', '*.etl')
            NeedsAdmin  = $true
            DefaultOn   = $false
            Profiles    = @('Max')
        }
        Recent = @{
            Id          = 'Recent'
            Label       = 'Fichiers récents'
            Description = 'Raccourcis Recent (.lnk)'
            Paths       = @([Environment]::GetFolderPath('Recent'))
            FilePatterns = @('*.lnk')
            NeedsAdmin  = $false
            DefaultOn   = $true
            Profiles    = @()
            TracesOnly  = $true
        }
        JumpLists = @{
            Id          = 'JumpLists'
            Label       = 'Jump lists'
            Description = 'AutomaticDestinations / CustomDestinations'
            Paths       = @(
                (Join-Path $env:APPDATA 'Microsoft\Windows\Recent\AutomaticDestinations')
                (Join-Path $env:APPDATA 'Microsoft\Windows\Recent\CustomDestinations')
            )
            FilePatterns = @('*.automaticDestinations-ms', '*.customDestinations-ms')
            NeedsAdmin  = $false
            DefaultOn   = $true
            Profiles    = @()
            TracesOnly  = $true
        }
        ExplorerHistory = @{
            Id          = 'ExplorerHistory'
            Label       = 'Historique Explorateur'
            Description = 'RecentDocs, TypedPaths, WordWheel, RunMRU'
            Paths       = @('SPECIAL:ExplorerHistory')
            NeedsAdmin  = $false
            DefaultOn   = $true
            Profiles    = @()
            TracesOnly  = $true
        }
        ClipboardHistory = @{
            Id          = 'ClipboardHistory'
            Label       = 'Historique presse-papiers'
            Description = 'Cache local Clipboard (Win+V)'
            Paths       = @(Join-Path $localApp 'Microsoft\Windows\Clipboard')
            NeedsAdmin  = $false
            DefaultOn   = $true
            Profiles    = @()
            TracesOnly  = $true
        }
        Screenshots = @{
            Id          = 'Screenshots'
            Label       = 'Captures d''écran'
            Description = 'Images\Captures d''écran / Screenshots'
            Paths       = @(
                (Join-Path ([Environment]::GetFolderPath('MyPictures')) "Captures d'écran")
                (Join-Path ([Environment]::GetFolderPath('MyPictures')) 'Screenshots')
            )
            FilePatterns = @('*.png', '*.jpg', '*.jpeg', '*.bmp', '*.gif', '*.webp')
            NeedsAdmin  = $false
            DefaultOn   = $false
            Profiles    = @()
            TracesOnly  = $true
            ConfirmStrong = $true
        }
    }
}
