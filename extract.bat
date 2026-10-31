@echo off
setlocal EnableDelayedExpansion

set "ROOT=%~dp0"
set "ROOT=!ROOT:~0,-1!"
set "SDK=%~1"
if not defined SDK set /p "SDK=Path to the U3-SDK folder: "
set "SDK=!SDK:"=!"
if "!SDK:~-1!"=="\" set "SDK=!SDK:~0,-1!"
if not exist "!SDK!\Assets\Runtime\" (
    echo "!SDK!" is not a U3-SDK folder: Assets\Runtime is missing.
    exit /b 1
)

set "STEAM="
for /f "tokens=2,*" %%a in ('reg query "HKCU\Software\Valve\Steam" /v SteamPath 2^>nul ^| findstr /i "SteamPath"') do set "STEAM=%%b"
if not defined STEAM for /f "tokens=2,*" %%a in ('reg query "HKLM\SOFTWARE\WOW6432Node\Valve\Steam" /v InstallPath 2^>nul ^| findstr /i "InstallPath"') do set "STEAM=%%b"
if not defined STEAM (
    echo Steam was not found.
    exit /b 1
)
set "STEAM=!STEAM:/=\!"

set "GAME="
if exist "!STEAM!\steamapps\common\Unturned\Bundles\" set "GAME=!STEAM!\steamapps\common\Unturned"
if not defined GAME if exist "!STEAM!\steamapps\libraryfolders.vdf" (
    for /f tokens^=2^,4^ delims^=^" %%a in ('findstr /c:"path" "!STEAM!\steamapps\libraryfolders.vdf"') do (
        if /i "%%a"=="path" (
            set "LIBRARY=%%b"
            set "LIBRARY=!LIBRARY:\\=\!"
            if exist "!LIBRARY!\steamapps\common\Unturned\Bundles\" set "GAME=!LIBRARY!\steamapps\common\Unturned"
        )
    )
)
if not defined GAME (
    echo Unturned was not found in any Steam library.
    exit /b 1
)

echo SDK:   !SDK!
echo Steam: !GAME!
echo Into:  !ROOT!

set "CODE=*.cs *.cs.meta *.asmdef *.asmdef.meta csc.rsp csc.rsp.meta"
set "FLAGS=/XC /XN /XO /R:1 /W:1 /NP /NFL /NDL /NJH /NJS"

echo Copying source...
robocopy "!SDK!\Assets" "!ROOT!\src\Assets" !CODE! /S !FLAGS! >nul
if errorlevel 8 goto failed
robocopy "!SDK!\JenkinsBootstrapper" "!ROOT!\src\JenkinsBootstrapper" Program.cs !FLAGS! >nul
if errorlevel 8 goto failed

echo Copying SDK project files...
robocopy "!SDK!\Assets" "!ROOT!\assets\U3-SDK\Assets" /S /XF !CODE! !FLAGS! >nul
if errorlevel 8 goto failed
robocopy "!SDK!\ProjectSettings" "!ROOT!\assets\U3-SDK\ProjectSettings" /S !FLAGS! >nul
if errorlevel 8 goto failed
robocopy "!SDK!\Packages" "!ROOT!\assets\U3-SDK\Packages" /S !FLAGS! >nul
if errorlevel 8 goto failed
robocopy "!SDK!" "!ROOT!\assets\U3-SDK" LICENSE.txt THIRDPARTYNOTICES.txt !FLAGS! >nul
if errorlevel 8 goto failed

echo Copying game assets...
robocopy "!GAME!" "!ROOT!\assets" /S !FLAGS! /XD "!GAME!\BattlEye" "!GAME!\MonoBleedingEdge" "!GAME!\Logs" "!GAME!\Cloud" "!GAME!\Worlds" "!GAME!\Modules" "!GAME!\Sandbox" "!GAME!\Servers" "!GAME!\Unturned_Data\Managed" "!GAME!\Unturned_Data\Plugins" /XF "!GAME!\Unturned.exe" "!GAME!\Unturned_BE.exe" "!GAME!\UnityCrashHandler64.exe" "!GAME!\UnityPlayer.dll" "!GAME!\Preferences.json" "!GAME!\ExampleServer.bat" "!GAME!\ServerHelper.bat" "!GAME!\install.vdf" "!GAME!\steam_appid.txt" "!GAME!\Unity AppData.lnk" "!GAME!\Unity Temp.lnk" >nul
if errorlevel 8 goto failed

echo Done. Files that already existed were left unchanged.
exit /b 0

:failed
echo Copying failed with robocopy error !errorlevel!.
exit /b 1
