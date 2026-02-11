@echo off
cls
echo ========================================
echo   MEU MANAGER - DEPLOY HOSTING
echo ========================================
echo.

cd /d "C:\Users\55119\OneDrive\Área de Trabalho\meumanager"

echo Pasta atual:
cd
echo.

if not exist firebase.json (
  echo ❌ ERRO: firebase.json nao encontrado nesta pasta.
  echo Abra este .bat e corrija o caminho do cd /d acima.
  pause
  exit /b 1
)

echo ✅ firebase.json encontrado.
echo.

firebase deploy --only hosting

if %errorlevel% neq 0 (
  echo.
  echo ❌ ERRO NO DEPLOY
  pause
  exit /b 1
)

echo.
echo ✅ DEPLOY CONCLUIDO COM SUCESSO
pause
