@echo off
cd /d "%~dp0"

echo Suche neueste ZIP...

:: Neueste ZIP im selben Ordner finden
for /f "delims=" %%f in ('dir /b /o-d *.zip 2^>nul') do (
    set "ZIP=%%f"
    goto :found
)

echo Keine ZIP Datei gefunden!
pause
exit

:found
echo Gefunden: %ZIP%
echo Entpacke...

:: Entpacken (ueberschreiben)
powershell -command "Expand-Archive -Path '%ZIP%' -DestinationPath '.' -Force"

echo Committe und pushe...
git add .
git commit -m "update"
git push origin master

echo.
echo Fertig! Code ist auf GitHub.
pause