param(
    [ValidateSet("build", "clean", "test", "run", "compile", "slice")]
    [string]$Command = "build",
    [string[]]$Maps,
    [int]$Port = 8080,
    [switch]$PackageOnly
)

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$buildDir = Join-Path $root "build"
$dist = Join-Path $root "dist"
$unityVersion = "6000.6.7f1"
$unity = "C:\Program Files\Unity\Hub\Editor\$unityVersion\Editor\Unity.exe"

function Invoke-Checked([string]$label, [scriptblock]$action) {
    Write-Host "== $label"
    & $action
    if ($LASTEXITCODE -ne 0) { throw "$label failed with exit code $LASTEXITCODE" }
}

function Build-Player {
    if (-not (Test-Path $unity)) { throw "Unity $unityVersion with WebGL support is required at $unity" }
    $project = Join-Path $buildDir "unity"
    $log = Join-Path $buildDir "logs\player.log"
    New-Item -ItemType Directory -Force (Split-Path $log) | Out-Null

    robocopy (Join-Path $root "engine\unity\Assets") (Join-Path $project "Assets") /MIR /XF *.meta /NFL /NDL /NJH /NJS /NP | Out-Null
    if ($LASTEXITCODE -ge 8) { throw "Copying the Unity project failed with exit code $LASTEXITCODE" }
    New-Item -ItemType Directory -Force (Join-Path $project "Packages") | Out-Null
    Copy-Item (Join-Path $root "engine\unity\Packages\manifest.json") (Join-Path $project "Packages\manifest.json") -Force

    $env:UNTURNED_WEB_OUTPUT = Join-Path $buildDir "player"
    Write-Host "== Unity WebGL player (log: $log)"
    $process = Start-Process -FilePath $unity -Wait -PassThru -ArgumentList @(
        "-batchmode", "-nographics", "-quit",
        "-projectPath", "`"$project`"",
        "-buildTarget", "WebGL",
        "-executeMethod", "WebBuild.Run",
        "-logFile", "`"$log`""
    )
    if ($process.ExitCode -ne 0) {
        Select-String -Path $log -Pattern "error CS|Error building|Build Failed|Exception" | Select-Object -First 30 | ForEach-Object { Write-Host $_.Line }
        throw "Unity build failed with exit code $($process.ExitCode), see $log"
    }
}

function Build-Game([string]$method, [string]$logName, [switch]$StayOpen) {
    $project = Join-Path $buildDir "full"
    $log = Join-Path $buildDir "logs\$logName.log"
    New-Item -ItemType Directory -Force (Split-Path $log) | Out-Null

    foreach ($copy in @(
        @("src\Assets", "Assets"),
        @("assets\U3-SDK\Assets", "Assets"),
        @("assets\U3-SDK\ProjectSettings", "ProjectSettings"),
        @("assets\U3-SDK\Packages", "Packages")
    )) {
        robocopy (Join-Path $root $copy[0]) (Join-Path $project $copy[1]) /E /XO /XD Json.NET /NFL /NDL /NJH /NJS /NP | Out-Null
        if ($LASTEXITCODE -ge 8) { throw "Copying $($copy[0]) failed with exit code $LASTEXITCODE" }
    }
    Remove-Item (Join-Path $project "Assets\Plugins\Json.NET*") -Recurse -Force -ErrorAction SilentlyContinue

    $manifest = Join-Path $project "Packages\manifest.json"
    $manifestText = [IO.File]::ReadAllText($manifest)
    if (-not $manifestText.Contains("com.unity.nuget.newtonsoft-json")) {
        [IO.File]::WriteAllText($manifest, $manifestText.Replace('"dependencies": {', '"dependencies": { "com.unity.nuget.newtonsoft-json": "3.2.2",'))
    }
    robocopy (Join-Path $root "engine\overlay\Assets") (Join-Path $project "Assets") /E /NFL /NDL /NJH /NJS /NP | Out-Null
    if ($LASTEXITCODE -ge 8) { throw "Copying the overlay failed with exit code $LASTEXITCODE" }

    robocopy (Join-Path $root "engine\unity\Assets\Plugins\WebGL") (Join-Path $project "Assets\Plugins\WebGL") /E /NFL /NDL /NJH /NJS /NP | Out-Null
    if ($LASTEXITCODE -ge 8) { throw "Copying the browser plugins failed with exit code $LASTEXITCODE" }
    Invoke-Checked "Steam layer" {
        node (Join-Path $root "tools\gen-steam.mjs") `
            (Join-Path $root "src\Assets\com.rlabrecque.steamworks.net\Runtime\autogen\NativeMethods.cs") `
            (Join-Path $root "engine\overlay\Assets\Plugins\WebGL\SteamCore.jslib") `
            (Join-Path $project "Assets\Plugins\WebGL\SteamMissing.jslib")
    }

    $patches = Get-Content (Join-Path $root "engine\patches.json") -Raw | ConvertFrom-Json
    foreach ($patch in $patches) {
        $file = Join-Path $project "Assets\$($patch.file)"
        $text = [IO.File]::ReadAllText($file)
        if ($patch.replace.Contains($patch.find) -and $text.Contains($patch.replace)) { continue }
        if ($text.Contains($patch.find)) {
            [IO.File]::WriteAllText($file, $text.Replace($patch.find, $patch.replace))
        } elseif (-not $text.Contains($patch.replace)) {
            throw "Patch for $($patch.file) no longer matches: $($patch.find)"
        }
    }

    $env:UNTURNED_PLAYER_SCRIPTS = Join-Path $buildDir "player-scripts"
    $env:UNTURNED_WEB_OUTPUT = Join-Path $buildDir "game-player"
    Write-Host "== $method (log: $log)"
    $arguments = @(
        "-batchmode", "-nographics",
        "-projectPath", "`"$project`"",
        "-buildTarget", "WebGL",
        "-accept-apiupdate",
        "-executeMethod", $method,
        "-logFile", "`"$log`""
    )
    if (-not $StayOpen) { $arguments += "-quit" }
    $process = Start-Process -FilePath $unity -Wait -PassThru -ArgumentList $arguments
    $errors = Select-String -Path $log -Pattern "error CS\d+" | ForEach-Object { $_.Line } | Sort-Object -Unique
    Write-Host "Unity exit code $($process.ExitCode), $($errors.Count) unique compile errors"
    $errors | Select-Object -First 40 | ForEach-Object { Write-Host $_ }
    if ($process.ExitCode -ne 0) { throw "$method failed, see $log" }
}

function Convert-Assets {
    $project = Join-Path $buildDir "unity"
    $log = Join-Path $buildDir "logs\convert.log"
    robocopy (Join-Path $root "engine\unity\Assets") (Join-Path $project "Assets") /MIR /XF *.meta /NFL /NDL /NJH /NJS /NP | Out-Null
    if ($LASTEXITCODE -ge 8) { throw "Copying the Unity project failed with exit code $LASTEXITCODE" }
    $env:UNTURNED_ASSETS = Join-Path $root "assets"
    $env:UNTURNED_CONVERTED = Join-Path $buildDir "converted"
    $env:UNTURNED_MAPS = $Maps -join ";"
    $env:UNTURNED_BUNDLE_TOOL = Join-Path $root "tools\convert-bundle.mjs"
    Write-Host "== Convert assets (log: $log)"
    $process = Start-Process -FilePath $unity -Wait -PassThru -ArgumentList @(
        "-batchmode", "-quit",
        "-projectPath", "`"$project`"",
        "-buildTarget", "WebGL",
        "-executeMethod", "ConvertAssets.Run",
        "-logFile", "`"$log`""
    )
    if ($process.ExitCode -ne 0) { throw "Asset conversion failed with exit code $($process.ExitCode), see $log" }
}

function Build-Package([string]$playerName, [string]$output, [switch]$FullData) {
    $player = Join-Path $buildDir "$playerName\Build"
    $staging = Join-Path $buildDir "package\$playerName"
    Remove-Item $staging -Recurse -Force -ErrorAction SilentlyContinue
    New-Item -ItemType Directory -Force $staging | Out-Null
    Copy-Item (Join-Path $player "$playerName.data") (Join-Path $staging "game.data")
    Copy-Item (Join-Path $player "$playerName.framework.js") (Join-Path $staging "game.framework.js")
    Copy-Item (Join-Path $player "$playerName.wasm") (Join-Path $staging "game.wasm")

    $groups = @("player=$staging@player", "game=$(Join-Path $buildDir "converted\Textures")@game/Textures")
    $mapInfo = Join-Path $buildDir "package\MapInfo"
    Remove-Item $mapInfo -Recurse -Force -ErrorAction SilentlyContinue
    foreach ($map in $Maps) {
        $groups += "map/$map=$(Join-Path $buildDir "converted\Maps\$map")@game/Maps/$map/Converted"
        if ($FullData) {
            $mapFiles = Join-Path $buildDir "package\Maps\$map"
            robocopy (Join-Path $root "assets\Maps\$map") $mapFiles /MIR /NFL /NDL /NJH /NJS /NP | Out-Null
            if ($LASTEXITCODE -ge 8) { throw "Copying map $map failed with exit code $LASTEXITCODE" }
            robocopy (Join-Path $buildDir "converted\MapBundles\$map") $mapFiles /E /NFL /NDL /NJH /NJS /NP | Out-Null
            if ($LASTEXITCODE -ge 8) { throw "Copying converted bundles for $map failed with exit code $LASTEXITCODE" }
            New-Item -ItemType Directory -Force (Join-Path $mapInfo $map) | Out-Null
            Get-ChildItem $mapFiles -File | Where-Object { $_.Extension -eq ".dat" -or $_.Name -in "Config.json", "Icon.png", "Preview.png" } | Move-Item -Destination (Join-Path $mapInfo $map)
            $groups += "map/$map=$mapFiles@game/Maps/$map"
        } else {
            foreach ($part in "Landscape", "Spawns") {
                $groups += "map/$map=$(Join-Path $root "assets\Maps\$map\$part")@game/Maps/$map/$part"
            }
        }
    }
    if ($FullData) {
        foreach ($part in "Localization", "Content", "CuratedMapIcons", "LoadingScreens") {
            $groups += "game=$(Join-Path $root "assets\$part")@game/$part"
        }
        $bundles = Join-Path $buildDir "package\Bundles"
        robocopy (Join-Path $root "assets\Bundles") $bundles /MIR /XF core.masterbundle /NFL /NDL /NJH /NJS /NP | Out-Null
        if ($LASTEXITCODE -ge 8) { throw "Copying bundles failed with exit code $LASTEXITCODE" }
        Copy-Item (Join-Path $buildDir "converted\Bundles\core.masterbundle") $bundles
        Invoke-Checked "Menu scene" { node --max-old-space-size=4096 (Join-Path $root "tools\convert-scene.mjs") (Join-Path $root "assets\Unturned_Data") (Join-Path $buildDir "converted\Bundles\core.masterbundle") level8 (Join-Path $bundles "Menu_Base.bundle") }
        $groups += "game=$bundles@game/Bundles", "game=$mapInfo@game/Maps"
        $rootFiles = Join-Path $buildDir "package\root"
        Remove-Item $rootFiles -Recurse -Force -ErrorAction SilentlyContinue
        New-Item -ItemType Directory -Force $rootFiles | Out-Null
        Get-ChildItem (Join-Path $root "assets") -File | Copy-Item -Destination $rootFiles
        $groups += "game=$rootFiles@game"
    }

    Remove-Item $output -Recurse -Force -ErrorAction SilentlyContinue
    New-Item -ItemType Directory -Force $output | Out-Null
    Invoke-Checked "Packer" { dotnet build (Join-Path $root "tools\Packer") -c Release --nologo -v q --nodeReuse:false -p:UseSharedCompilation=false }
    Invoke-Checked "Package" { dotnet (Join-Path $buildDir "tools\Packer\bin\Packer.dll") (Join-Path $output "game.unturned") @groups }

    $runtime = @(
        Get-Content (Join-Path $player "$playerName.loader.js") -Raw
        (Get-Content (Join-Path $root "web\package.js") -Raw) -replace "(?m)^export ", ""
        Get-Content (Join-Path $root "web\boot.js") -Raw
    ) -join "`n"
    [IO.File]::WriteAllText((Join-Path $output "runtime.js"), $runtime)
    Copy-Item (Join-Path $root "web\index.html") (Join-Path $output "index.html")
}

switch ($Command) {
    "clean" {
        Remove-Item $buildDir, $dist -Recurse -Force -ErrorAction SilentlyContinue
    }
    "compile" {
        Build-Game "FullBuild.CompilePlayer" "compile"
    }
    "build" {
        if (-not $Maps) { $Maps = (Get-ChildItem (Join-Path $root "assets\Maps") -Directory).Name }
        if (-not $PackageOnly) {
            if (-not (Test-Path (Join-Path $buildDir "full\Assets\TextMesh Pro\Resources\TMP Settings.asset"))) {
                Build-Game "FullBuild.WaitForImport" "import" -StayOpen
            }
            Build-Game "FullBuild.BuildPlayer" "game"
            Convert-Assets
        }
        Build-Package "game-player" $dist -FullData
    }
    "slice" {
        if (-not $Maps) { $Maps = @("PEI") }
        if (-not $PackageOnly) {
            Build-Player
            Convert-Assets
        }
        Build-Package "player" (Join-Path $buildDir "slice-dist")
    }
    "test" {
        Invoke-Checked "Package tests" { node --test (Join-Path $root "tests\package.test.mjs") }
        Invoke-Checked "Browser test" { node (Join-Path $root "tests\browser.mjs") (Join-Path $buildDir "slice-dist") }
    }
    "run" {
        Invoke-Checked "Server" { node (Join-Path $root "tools\serve.mjs") $dist $Port }
    }
}
