param(
    [ValidateSet("build", "clean", "test", "run", "compile", "game")]
    [string]$Command = "build",
    [string[]]$Maps = @("PEI"),
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

function Build-Game([string]$method, [string]$logName) {
    $project = Join-Path $buildDir "full"
    $log = Join-Path $buildDir "logs\$logName.log"
    New-Item -ItemType Directory -Force (Split-Path $log) | Out-Null

    foreach ($copy in @(
        @("src\Assets", "Assets"),
        @("assets\U3-SDK\Assets", "Assets"),
        @("assets\U3-SDK\ProjectSettings", "ProjectSettings"),
        @("assets\U3-SDK\Packages", "Packages")
    )) {
        robocopy (Join-Path $root $copy[0]) (Join-Path $project $copy[1]) /E /XO /NFL /NDL /NJH /NJS /NP | Out-Null
        if ($LASTEXITCODE -ge 8) { throw "Copying $($copy[0]) failed with exit code $LASTEXITCODE" }
    }
    robocopy (Join-Path $root "engine\overlay\Assets") (Join-Path $project "Assets") /E /NFL /NDL /NJH /NJS /NP | Out-Null
    if ($LASTEXITCODE -ge 8) { throw "Copying the overlay failed with exit code $LASTEXITCODE" }

    $patches = Get-Content (Join-Path $root "engine\patches.json") -Raw | ConvertFrom-Json
    foreach ($patch in $patches) {
        $file = Join-Path $project "Assets\$($patch.file)"
        $text = [IO.File]::ReadAllText($file)
        if ($text.Contains($patch.find)) {
            [IO.File]::WriteAllText($file, $text.Replace($patch.find, $patch.replace))
        } elseif (-not $text.Contains($patch.replace)) {
            throw "Patch for $($patch.file) no longer matches: $($patch.find)"
        }
    }

    $env:UNTURNED_PLAYER_SCRIPTS = Join-Path $buildDir "player-scripts"
    $env:UNTURNED_WEB_OUTPUT = Join-Path $buildDir "game-player"
    Write-Host "== $method (log: $log)"
    $process = Start-Process -FilePath $unity -Wait -PassThru -ArgumentList @(
        "-batchmode", "-nographics", "-quit",
        "-projectPath", "`"$project`"",
        "-buildTarget", "WebGL",
        "-accept-apiupdate",
        "-executeMethod", $method,
        "-logFile", "`"$log`""
    )
    $errors = Select-String -Path $log -Pattern "error CS\d+" | ForEach-Object { $_.Line } | Sort-Object -Unique
    Write-Host "Unity exit code $($process.ExitCode), $($errors.Count) unique compile errors"
    $errors | Select-Object -First 40 | ForEach-Object { Write-Host $_ }
    if ($process.ExitCode -ne 0) { throw "$method failed, see $log" }
}

function Convert-Assets {
    $project = Join-Path $buildDir "unity"
    $log = Join-Path $buildDir "logs\convert.log"
    $env:UNTURNED_ASSETS = Join-Path $root "assets"
    $env:UNTURNED_CONVERTED = Join-Path $buildDir "converted"
    $env:UNTURNED_MAPS = $Maps -join ";"
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

function Build-Package {
    $player = Join-Path $buildDir "player\Build"
    $staging = Join-Path $buildDir "package\player"
    Remove-Item $staging -Recurse -Force -ErrorAction SilentlyContinue
    New-Item -ItemType Directory -Force $staging | Out-Null
    Copy-Item (Join-Path $player "player.data") (Join-Path $staging "game.data")
    Copy-Item (Join-Path $player "player.framework.js") (Join-Path $staging "game.framework.js")
    Copy-Item (Join-Path $player "player.wasm") (Join-Path $staging "game.wasm")

    $groups = @("player=$staging@player", "game=$(Join-Path $buildDir "converted\Textures")@game/Textures")
    foreach ($map in $Maps) {
        $groups += "map/$map=$(Join-Path $buildDir "converted\Maps\$map")@game/Maps/$map/Converted"
        foreach ($part in "Landscape", "Spawns") {
            $groups += "map/$map=$(Join-Path $root "assets\Maps\$map\$part")@game/Maps/$map/$part"
        }
    }

    Remove-Item $dist -Recurse -Force -ErrorAction SilentlyContinue
    New-Item -ItemType Directory -Force $dist | Out-Null
    Invoke-Checked "Packer" { dotnet build (Join-Path $root "tools\Packer") -c Release --nologo -v q --nodeReuse:false -p:UseSharedCompilation=false }
    Invoke-Checked "Package" { dotnet (Join-Path $buildDir "tools\Packer\bin\Packer.dll") (Join-Path $dist "game.unturned") @groups }

    $runtime = @(
        Get-Content (Join-Path $player "player.loader.js") -Raw
        (Get-Content (Join-Path $root "web\package.js") -Raw) -replace "(?m)^export ", ""
        Get-Content (Join-Path $root "web\boot.js") -Raw
    ) -join "`n"
    [IO.File]::WriteAllText((Join-Path $dist "runtime.js"), $runtime)
    Copy-Item (Join-Path $root "web\index.html") (Join-Path $dist "index.html")
}

switch ($Command) {
    "clean" {
        Remove-Item $buildDir, $dist -Recurse -Force -ErrorAction SilentlyContinue
    }
    "compile" {
        Build-Game "FullBuild.CompilePlayer" "compile"
    }
    "game" {
        Build-Game "FullBuild.BuildPlayer" "game"
    }
    "build" {
        if (-not $PackageOnly) {
            Build-Player
            Convert-Assets
        }
        Build-Package
    }
    "test" {
        Invoke-Checked "Package tests" { node --test (Join-Path $root "tests\package.test.mjs") }
        Invoke-Checked "Browser test" { node (Join-Path $root "tests\browser.mjs") $dist }
    }
    "run" {
        Invoke-Checked "Server" { node (Join-Path $root "tools\serve.mjs") $dist $Port }
    }
}
