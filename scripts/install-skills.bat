@echo off
setlocal enabledelayedexpansion
REM ============================================================
REM  Install QoderWork Skills from this repository
REM  Usage: scripts\install-skills.bat  (from project root)
REM ============================================================

REM %~dp0 = directory of this script (scripts\)
REM Go up one level to project root
set "SCRIPT_DIR=%~dp0"
set "REPO_ROOT=%SCRIPT_DIR%.."
set "SKILLS_SRC=%REPO_ROOT%\.qoderwork\skills"
set "SKILLS_DST=%USERPROFILE%\.qoderwork\skills"

echo QoderWork Skills Installer
echo ==========================
echo.

if not exist "%SKILLS_SRC%\" (
    echo ERROR: No skills found at %SKILLS_SRC%
    echo Make sure the .qoderwork\skills directory exists in the project root.
    exit /b 1
)

set "INSTALLED=0"

for /d %%S in ("%SKILLS_SRC%\*") do (
    set "SKILL_NAME=%%~nxS"

    echo Installing skill: !SKILL_NAME! ...

    if not exist "%SKILLS_DST%\!SKILL_NAME!\" (
        mkdir "%SKILLS_DST%\!SKILL_NAME!"
    )

    xcopy /E /I /Y /Q "%%S\*" "%SKILLS_DST%\!SKILL_NAME!\" >nul 2>&1

    if !errorlevel! equ 0 (
        echo   [OK] !SKILL_NAME! installed to %SKILLS_DST%\!SKILL_NAME!
        set /a INSTALLED+=1
    ) else (
        echo   [FAIL] Could not install !SKILL_NAME!
    )
)

echo.
echo Done. %INSTALLED% skill^(s^) installed to %SKILLS_DST%
echo Restart QoderWork to activate new skills.

endlocal
