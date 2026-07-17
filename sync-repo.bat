@echo off
REM ===========================================================================
REM Klima-Sparbuch - Sync-Skript
REM Immer ausfuehren, nachdem du im lokalen Verzeichnis Dateien ersetzt hast.
REM
REM Ablauf:
REM   1. Holt den aktuellen Stand von GitHub (git pull)
REM   2. Zeigt Aenderungen, fragt nach Bestaetigung
REM   3. Committet und pusht die Dateien
REM   4. Ermittelt die letzte Versionsnummer (Format vX.Y) und erhoeht sie:
REM        - normalerweise die HINTERE Zahl (Y), z.B. v1.3 -> v1.4
REM        - bei Antwort "j" auf die Finale-Release-Frage die VORDERE Zahl (X),
REM          die hintere wird dabei auf 0 zurueckgesetzt, z.B. v1.4 -> v2.0
REM   5. Erstellt dafuer einen Git-Tag UND ein echtes GitHub-Release
REM      (ein reiner Tag reicht HACS nicht als neue Version aus!)
REM
REM Benoetigt fuer Schritt 5 die GitHub CLI ("gh"). Falls nicht installiert,
REM wird stattdessen ein Link zum manuellen Anlegen des Release ausgegeben.
REM Installation: https://cli.github.com  (einmalig danach: gh auth login)
REM ===========================================================================

setlocal enabledelayedexpansion

REM ---- Muss zum Pfad aus setup-once.bat passen -----------------------------
set REPO_DIR=C:\Users\%USERNAME%\Music\klima-sparbuch
set DEFAULT_START_TAG=v1.0
REM ---------------------------------------------------------------------------

if not exist "%REPO_DIR%\.git" (
  echo Kein Git-Repository gefunden unter: %REPO_DIR%
  echo Bitte zuerst setup-once.bat ausfuehren.
  exit /b 1
)

cd /d "%REPO_DIR%"

echo.
echo === Hole aktuellen Stand von GitHub ===
git pull

echo.
echo === Aktueller Status ===
git status --short

echo.
git diff --quiet && git diff --cached --quiet
if %errorlevel%==0 (
  echo Keine Aenderungen gefunden. Nichts zu tun.
  exit /b 0
)

set /p CONFIRM=Aenderungen committen und zu GitHub pushen? (j/n): 
if /i not "%CONFIRM%"=="j" (
  echo Abgebrochen, es wurde nichts gepusht.
  exit /b 0
)

set /p COMMITMSG=Kurze Beschreibung der Aenderung (Enter fuer Standardtext): 
if "%COMMITMSG%"=="" set COMMITMSG=Update Klima-Sparbuch Card

git add -A
git commit -m "%COMMITMSG%"
git push

if errorlevel 1 (
  echo.
  echo Push fehlgeschlagen. Haeufigste Ursache: Zugangsdaten/Personal Access Token
  echo fehlt oder ist abgelaufen. Neu erstellen unter:
  echo https://github.com/settings/tokens
  exit /b 1
)

echo.
echo === Aenderungen sind auf GitHub. Jetzt Version bestimmen. ===

REM ---- Letzten Tag im Format vX.Y ermitteln --------------------------------
set LATEST_TAG=
for /f "delims=" %%i in ('git tag --list "v*.*" --sort=-v:refname 2^>nul') do (
  if not defined LATEST_TAG set LATEST_TAG=%%i
)

if not defined LATEST_TAG (
  echo Kein bestehender Versions-Tag gefunden. Starte bei %DEFAULT_START_TAG%.
  set NEW_TAG=%DEFAULT_START_TAG%
  goto :havetag
)

echo Letzte Version: %LATEST_TAG%

set VER=%LATEST_TAG:v=%
for /f "tokens=1,2 delims=." %%a in ("%VER%") do (
  set MAJOR=%%a
  set MINOR=%%b
)

set /p FINALE=Ist dies ein abschliessendes Release - vordere Nummer hochzaehlen? (j/n): 
if /i "%FINALE%"=="j" (
  set /a MAJOR=MAJOR+1
  set MINOR=0
) else (
  set /a MINOR=MINOR+1
)
set NEW_TAG=v%MAJOR%.%MINOR%

:havetag
echo.
echo === Neue Version: %NEW_TAG% ===

git tag -a %NEW_TAG% -m "%COMMITMSG%"
git push origin %NEW_TAG%

where gh >nul 2>nul
if errorlevel 1 (
  echo.
  echo GitHub CLI "gh" nicht gefunden. Ein Tag wurde gepusht, aber HACS
  echo braucht ein echtes GitHub-Release, keinen reinen Tag.
  echo Bitte manuell anlegen unter:
  echo https://github.com/peppko14/klima-sparbuch/releases/new?tag=%NEW_TAG%
) else (
  gh release create %NEW_TAG% --title "%NEW_TAG%" --notes "%COMMITMSG%"
  if errorlevel 1 (
    echo.
    echo Release-Erstellung ueber "gh" fehlgeschlagen. Bitte manuell anlegen:
    echo https://github.com/peppko14/klima-sparbuch/releases/new?tag=%NEW_TAG%
  ) else (
    echo.
    echo === Release %NEW_TAG% wurde veroeffentlicht. ===
  )
)

echo.
echo === Fertig! ===
echo HACS zeigt das Update spaetestens beim naechsten automatischen Check an,
echo oder sofort ueber HACS - Klima-Sparbuch Card - Neu laden / Update pruefen.

endlocal
