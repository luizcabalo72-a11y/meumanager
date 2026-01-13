@echo off
echo.
echo ========================================
echo   MEU MANAGER - DEPLOY RAPIDO
echo ========================================
echo.
echo Fazendo deploy para Firebase...
echo.

firebase deploy --only hosting

echo.
echo ========================================
echo   DEPLOY CONCLUIDO!
echo ========================================
echo.
echo Acesse: https://meumanager-b02b0.web.app
echo.
pause