@echo off
REM Servidor HTTP Simples para Meu Manager
REM Use Python ou Node.js para servir os arquivos

echo.
echo ================================
echo  Servidor HTTP para Meu Manager
echo ================================
echo.

REM Verifica se Python está instalado
python --version >nul 2>&1
if %errorlevel% == 0 (
    echo ✅ Iniciando servidor com Python...
    echo 📱 Acesse: http://localhost:8000
    echo.
    python -m http.server 8000
    goto :eof
)

REM Se não houver Python, tenta Node.js
node --version >nul 2>&1
if %errorlevel% == 0 (
    echo ✅ Iniciando servidor com Node.js...
    echo 📱 Acesse: http://localhost:3000
    echo.
    npx http-server -p 3000
    goto :eof
)

echo ❌ Nenhum servidor disponível
echo Instale Python ou Node.js primeiro!
pause
