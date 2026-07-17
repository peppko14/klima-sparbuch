@echo off
REM ===========================================================================
REM Klima-Sparbuch - einmaliges Setup
REM Klont das GitHub-Repo in ein lokales Verzeichnis.
REM Danach nur noch sync-repo.bat verwenden.
REM ===========================================================================

setlocal

REM ---- Hier ggf. anpassen: wo soll der lokale Ordner liegen? --------------
set PARENT_DIR=C:\Users\%USERNAME%\Music
set REPO_NAME=klima-sparbuch
set REPO_URL=https://github.com/peppko14/klima-sparbuch.git
REM ---------------------------------------------------------------------------

where git >nul 2>nul
if errorlevel 1 (
  echo Git wurde nicht gefunden. Bitte zuerst Git for Windows installieren:
  echo https://git-scm.com/download/win
  exit /b 1
)

if exist "%PARENT_DIR%\%REPO_NAME%" (
  echo Verzeichnis "%PARENT_DIR%\%REPO_NAME%" existiert bereits.
  echo Falls du neu klonen willst, loesche es vorher oder passe REPO_NAME an.
  exit /b 1
)

cd /d "%PARENT_DIR%"
echo.
echo === Klone %REPO_URL% nach %PARENT_DIR%\%REPO_NAME% ===
git clone "%REPO_URL%" "%REPO_NAME%"

if errorlevel 1 (
  echo.
  echo Klonen fehlgeschlagen. Falls nach Zugangsdaten gefragt wurde:
  echo GitHub verlangt statt eines Passworts einen Personal Access Token.
  echo Erstellen unter: https://github.com/settings/tokens
  exit /b 1
)

echo.
echo Fertig! Lokales Verzeichnis: %PARENT_DIR%\%REPO_NAME%
echo Lege dort ab jetzt die von Claude bereitgestellten Dateien ab
echo (klima-sparbuch.js, configuration-snippet.yaml, hacs.json,
echo  dashboard-example.yaml, README.md) und fuehre danach sync-repo.bat aus.

endlocal
