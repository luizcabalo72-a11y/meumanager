@echo off
REM ========================================================
REM SCRIPT: Refatorar todos os HTMLs para componentes modulares
REM Autor: GitHub Copilot
REM ========================================================

SETLOCAL ENABLEDELAYEDEXPANSION

set "workdir=c:\Users\55119\OneDrive\Área de Trabalho\meumanager"
cd /d "!workdir!"

echo.
echo ========================================================
echo Iniciando refatoração de HTMLs...
echo ========================================================
echo.

REM Array de arquivos a processar (exceto os já feitos)
set "htmlfiles=clientes.html compras.html estoque.html financeiro.html relatorios.html configuracoes.html fornecedores.html simulacao.html curva-abc.html empresas.html"

for %%f in (%htmlfiles%) do (
    if exist "%%f" (
        echo [1/3] Processando: %%f
        
        REM Usar PowerShell para fazer as substituições
        powershell -ExecutionPolicy Bypass -Command ^
            "$content = Get-Content '%%f' -Raw; " ^
            "$content = $content -replace '<header class=\"header\">[\s\S]*?</header>\s*<!-- ================= SIDEBAR ================= -->\s*<aside class=\"sidebar\" id=\"sidebar\">[\s\S]*?</aside>', '<div id=\"header-container\"></div><div id=\"sidebar-container\"></div>'; " ^
            "$content = $content -replace '</body>', '<script type=\"module\">import { initializeLayout } from `'./components/layout.js`';initializeLayout();</script></body>'; " ^
            "Set-Content '%%f' $content"
        
        echo [✓] %%f atualizado com sucesso
    ) else (
        echo [✗] %%f não encontrado - pulando...
    )
    echo.
)

echo ========================================================
echo Refatoração concluída!
echo ========================================================
echo.
echo Próximos passos:
echo 1. Verificar os HTMLs foram atualizados
echo 2. Testar no navegador
echo 3. Executar: npm run build
echo.

pause
